<script lang="ts">
	import { tick } from 'svelte';
	import { entriesStore } from '$lib/entriesStore.svelte';
	import { flagEmoji } from '$lib/flag';
	import { computeStays, buildColorMap, type Stay } from '$lib/stays';

	// ── Data ──────────────────────────────────────────────────────────────────
	const stays = $derived(computeStays(entriesStore.entries));
	const colorMap = $derived(buildColorMap(entriesStore.entries));

	const timelineStart = $derived.by(() => {
		if (!entriesStore.entries.length) return Date.now();
		const min = entriesStore.entries.reduce((m, e) => Math.min(m, e.date), Infinity);
		return new Date(new Date(min).getFullYear(), 0, 1).getTime();
	});

	const timelineEnd = $derived.by(() => {
		if (!entriesStore.entries.length) return Date.now();
		const max = entriesStore.entries.reduce((m, e) => Math.max(m, e.date), -Infinity);
		const lastDataYear = new Date(max).getFullYear();
		const currentYear = new Date().getFullYear();
		// Show through Dec 31 of last data year, capped at current year (never show next year)
		const endYear = Math.min(lastDataYear, currentYear);
		return new Date(endYear + 1, 0, 1).getTime();
	});

	const totalCalendarDays = $derived((timelineEnd - timelineStart) / 86_400_000);

	// ── Zoom state ────────────────────────────────────────────────────────────
	let scrollEl = $state<HTMLDivElement | undefined>();
	let containerWidth = $state(0);
	let pxPerDay = $state(1);

	const MIN_PPD = 0.3;
	const MAX_PPD = 80;

	const totalWidth = $derived(Math.max(Math.round(totalCalendarDays * pxPerDay), containerWidth));

	// ── Markers ───────────────────────────────────────────────────────────────
	const MONTH_LABELS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

	const yearMarkers = $derived.by(() => {
		const out: { year: number; left: number }[] = [];
		const y0 = new Date(timelineStart).getFullYear();
		const y1 = new Date(timelineEnd).getFullYear();
		for (let y = y0; y < y1; y++) {
			out.push({ year: y, left: Math.round((new Date(y, 0, 1).getTime() - timelineStart) / 86_400_000 * pxPerDay) });
		}
		return out;
	});

	const monthMarkers = $derived.by(() => {
		if (pxPerDay < 1.2) return [];
		const out: { label: string; left: number }[] = [];
		const y0 = new Date(timelineStart).getFullYear();
		const y1 = new Date(timelineEnd).getFullYear();
		for (let y = y0; y <= y1; y++) {
			for (let m = 0; m < 12; m++) {
				const ms = new Date(y, m, 1).getTime();
				if (ms <= timelineStart || ms >= timelineEnd) continue;
				out.push({ label: MONTH_LABELS[m], left: Math.round((ms - timelineStart) / 86_400_000 * pxPerDay) });
			}
		}
		return out;
	});

	function stayLeft(stay: Stay) {
		return Math.round((stay.startDate - timelineStart) / 86_400_000 * pxPerDay);
	}
	function stayWidth(stay: Stay) {
		return Math.max(2, Math.round(stay.days * pxPerDay));
	}

	// ── Zoom ─────────────────────────────────────────────────────────────────
	async function zoom(factor: number, pivotX = containerWidth / 2) {
		if (!scrollEl) return;
		const dayAtPivot = (scrollEl.scrollLeft + pivotX) / pxPerDay;
		pxPerDay = Math.max(MIN_PPD, Math.min(MAX_PPD, pxPerDay * factor));
		await tick();
		scrollEl.scrollLeft = dayAtPivot * pxPerDay - pivotX;
	}

	async function setPreset(days: number) {
		if (!scrollEl) return;
		const w = scrollEl.clientWidth;
		containerWidth = w;
		if (days <= 0) {
			// "Todo" — fit entire timeline and scroll to start
			pxPerDay = Math.max(MIN_PPD, w / totalCalendarDays);
			await tick();
			scrollEl.scrollLeft = 0;
		} else {
			const centerScroll = scrollEl.scrollLeft + w / 2;
			const dayAtCenter = centerScroll / pxPerDay;
			pxPerDay = w / days;
			await tick();
			scrollEl.scrollLeft = Math.max(0, dayAtCenter * pxPerDay - w / 2);
		}
	}

	function scrollToYear(year: number) {
		if (!scrollEl) return;
		const ms = new Date(year, 0, 1).getTime();
		scrollEl.scrollLeft = Math.max(0, (ms - timelineStart) / 86_400_000 * pxPerDay);
	}

	// Ctrl/Cmd + wheel → zoom
	function onWheel(e: WheelEvent) {
		if (!e.ctrlKey && !e.metaKey) return;
		e.preventDefault();
		const rect = scrollEl!.getBoundingClientRect();
		zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - rect.left);
	}

	// Pinch zoom
	let pinchDist0 = 0;
	function getPinchDist(t: TouchList) {
		return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
	}
	function onTouchStart(e: TouchEvent) {
		if (e.touches.length === 2) pinchDist0 = getPinchDist(e.touches);
	}
	function onTouchMove(e: TouchEvent) {
		if (e.touches.length !== 2) return;
		e.preventDefault();
		const dist = getPinchDist(e.touches);
		const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - scrollEl!.getBoundingClientRect().left;
		zoom(dist / pinchDist0, cx);
		pinchDist0 = dist;
	}

	// ── Tooltip (fixed so it's never clipped) ─────────────────────────────────
	let tooltip = $state<{ stay: Stay; color: string; x: number; y: number } | null>(null);

	function onStayEnter(e: MouseEvent, stay: Stay) {
		tooltip = { stay, color: colorMap.get(stay.isoCountryCode) ?? '#64748b', x: e.clientX, y: e.clientY };
	}
	function onStayMove(e: MouseEvent) {
		if (tooltip) tooltip = { ...tooltip, x: e.clientX, y: e.clientY };
	}

	function formatDate(ms: number) {
		return new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
	}

	// ── Mount ─────────────────────────────────────────────────────────────────
	// ResizeObserver: se re-ejecuta cuando scrollEl aparece en el DOM (puede ser
	// después de que los datos carguen, porque el {#if} lo oculta hasta entonces)
	$effect(() => {
		if (!scrollEl) return;
		containerWidth = scrollEl.clientWidth;
		const ro = new ResizeObserver(() => { containerWidth = scrollEl!.clientWidth; });
		ro.observe(scrollEl);
		return () => ro.disconnect();
	});

	// Inicializar zoom y scroll una sola vez, cuando los datos estén listos
	let initialScrollDone = false;
	$effect(() => {
		if (!entriesStore.loaded || initialScrollDone || !scrollEl || containerWidth === 0) return;
		// Leer timelineStart para que el efecto se re-ejecute si cambia antes de estar listos
		const _start = timelineStart;
		initialScrollDone = true;
		pxPerDay = containerWidth / 365;
		tick().then(() => requestAnimationFrame(() => scrollToYear(new Date().getFullYear())));
	});

	// Current visible year label (based on scroll position)
	let scrollLeft = $state(0);
	const visibleYear = $derived.by(() => {
		const ms = timelineStart + (scrollLeft + containerWidth / 2) / pxPerDay * 86_400_000;
		return new Date(ms).getFullYear();
	});
</script>

<!-- Fixed tooltip -->
{#if tooltip}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed z-50 pointer-events-none px-3 py-2 rounded-lg text-xs
			bg-slate-900 border border-slate-600 shadow-2xl whitespace-nowrap"
		style="left: {Math.min(tooltip.x + 12, window.innerWidth - 210)}px; top: {tooltip.y - 64}px"
	>
		<p class="font-semibold text-white">{flagEmoji(tooltip.stay.isoCountryCode)} {tooltip.stay.country}</p>
		<p class="text-slate-400 mt-0.5">{formatDate(tooltip.stay.startDate)} → {formatDate(tooltip.stay.endDate)}</p>
		<p class="text-slate-300 font-mono mt-0.5">{tooltip.stay.days} día{tooltip.stay.days === 1 ? '' : 's'}</p>
	</div>
{/if}

<div class="flex flex-col h-full w-full sm:max-w-4xl sm:mx-auto">
	<!-- Header -->
	<div class="px-4 pt-5 pb-3 flex items-center justify-between gap-4 flex-shrink-0">
		<div>
			<h1 class="text-2xl font-bold leading-none">Timeline</h1>
			<p class="text-slate-500 text-xs mt-1 hidden sm:block">Ctrl+scroll o pellizca para hacer zoom</p>
		</div>

		<!-- Controls -->
		<div class="flex items-center gap-1.5 flex-shrink-0">
			<!-- Preset buttons -->
			<div class="flex items-center rounded-lg overflow-hidden border border-slate-700 text-xs">
				{#each [['Todo', -1], ['1a', 365], ['6m', 182], ['1m', 30]] as [label, days]}
					<button
						class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 transition-colors text-slate-300 border-r border-slate-700 last:border-0"
						onclick={() => setPreset(Number(days))}
					>{label}</button>
				{/each}
			</div>

			<!-- Zoom +/- -->
			<button
				class="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700
					border border-slate-700 text-slate-300 text-lg leading-none transition-colors"
				onclick={() => zoom(1 / 1.3)}
			>−</button>
			<button
				class="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700
					border border-slate-700 text-slate-300 text-lg leading-none transition-colors"
				onclick={() => zoom(1.3)}
			>+</button>
		</div>
	</div>

	{#if entriesStore.totalDays === 0}
		<p class="px-4 text-slate-500 text-sm">Sin datos. <a href="/sync" class="underline">Importa tus JSONs</a>.</p>
	{:else}
		<!-- Year indicator -->
		<div class="px-4 pb-1 flex-shrink-0">
			<span class="text-slate-500 text-xs font-mono">{visibleYear}</span>
		</div>

		<!-- Scrollable timeline -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="flex-1 overflow-x-auto overflow-y-hidden select-none cursor-grab active:cursor-grabbing"
			bind:this={scrollEl}
			onscroll={() => { scrollLeft = scrollEl?.scrollLeft ?? 0; }}
			onwheel={onWheel}
			ontouchstart={onTouchStart}
			ontouchmove={onTouchMove}
			onmouseleave={() => { tooltip = null; }}
		>
			<div class="relative" style="width: {totalWidth}px; height: 88px;">

				<!-- Year boundaries -->
				{#each yearMarkers as { year, left }}
					<div class="absolute top-0 bottom-0 border-l border-slate-600/60" style="left: {left}px">
						<span class="absolute top-1 left-1.5 text-slate-400 text-xs font-bold select-none">{year}</span>
					</div>
				{/each}

				<!-- Month gridlines -->
				{#each monthMarkers as { label, left }}
					<div class="absolute border-l border-slate-700/50 pointer-events-none" style="left: {left}px; top: 20px; bottom: 16px;">
					</div>
					{#if pxPerDay >= 5}
						<span class="absolute text-[9px] text-slate-600 select-none" style="left: {left + 2}px; bottom: 2px">{label}</span>
					{/if}
				{/each}

				<!-- Stays track -->
				<div class="absolute left-0 right-0" style="top: 22px; height: 44px;">
					{#each stays as stay}
						{@const color = colorMap.get(stay.isoCountryCode) ?? '#64748b'}
						{@const w = stayWidth(stay)}
						{@const l = stayLeft(stay)}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="absolute top-0 h-full flex items-center overflow-hidden
								hover:brightness-125 transition-[filter] cursor-default"
							style="left: {l}px; width: {w}px;
								background-color: {color}20; border-left: 2px solid {color};"
							onmouseenter={(e) => onStayEnter(e, stay)}
							onmousemove={onStayMove}
							onmouseleave={() => { tooltip = null; }}
						>
							{#if w > 28}
								<span class="pl-1 text-xs leading-none truncate" style="color: {color}">
									{flagEmoji(stay.isoCountryCode)}{#if w > 60}&nbsp;{stay.country}{/if}
								</span>
							{/if}
						</div>
					{/each}
				</div>

			</div>
		</div>

		<!-- Legend -->
		<div class="px-4 py-4 flex-shrink-0 border-t border-slate-800">
			<div class="flex flex-wrap gap-2">
				{#each entriesStore.countryStats as stat}
					{@const color = colorMap.get(stat.isoCountryCode) ?? '#64748b'}
					<span class="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-slate-800">
						<span class="w-2 h-2 rounded-full flex-shrink-0" style="background:{color}"></span>
						<span class="text-slate-300">{flagEmoji(stat.isoCountryCode)} {stat.country}</span>
						<span class="text-slate-500">{stat.days}d</span>
					</span>
				{/each}
			</div>
		</div>
	{/if}
</div>
