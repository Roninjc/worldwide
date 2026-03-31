<script lang="ts">
	import { tick } from 'svelte';
	import { tweened } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { fade, fly } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { entriesStore } from '$lib/entriesStore.svelte';
	import WorldMap from '$lib/components/WorldMap.svelte';
	import { flagEmoji } from '$lib/flag';
	import { getLongestStreak, computeCountryStats, countUniqueDays } from '$lib/stats';
	import { computeStays, buildColorMap, type Stay } from '$lib/stays';

	onMount(() => {
		if (entriesStore.loaded && entriesStore.totalDays === 0) {
			goto('/sync');
		}
	});

	// ── Timeline data ──────────────────────────────────────────────────────
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
		const endYear = Math.min(lastDataYear, currentYear);
		return new Date(endYear + 1, 0, 1).getTime();
	});

	const totalCalendarDays = $derived((timelineEnd - timelineStart) / 86_400_000);

	// ── Zoom / scroll state ────────────────────────────────────────────────
	let scrollEl = $state<HTMLDivElement | undefined>();
	let containerWidth = $state(0);
	let pxPerDay = $state(1);
	let scrollLeft = $state(0);

	const MIN_PPD = 0.3;
	const MAX_PPD = 80;

	const totalWidth = $derived(Math.max(Math.round(totalCalendarDays * pxPerDay), containerWidth));

	// ── Timeline markers ───────────────────────────────────────────────────
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

	// ── Zoom ──────────────────────────────────────────────────────────────
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

	function onWheel(e: WheelEvent) {
		if (!e.ctrlKey && !e.metaKey) return;
		e.preventDefault();
		const rect = scrollEl!.getBoundingClientRect();
		zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - rect.left);
	}

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

	// ── Timeline tooltip ───────────────────────────────────────────────────
	let timelineTooltip = $state<{ stay: Stay; color: string; x: number; y: number } | null>(null);

	function onStayEnter(e: MouseEvent, stay: Stay) {
		timelineTooltip = { stay, color: colorMap.get(stay.isoCountryCode) ?? '#64748b', x: e.clientX, y: e.clientY };
	}
	function onStayMove(e: MouseEvent) {
		if (timelineTooltip) timelineTooltip = { ...timelineTooltip, x: e.clientX, y: e.clientY };
	}

	function formatDate(ms: number) {
		return new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
	}

	// ── ResizeObserver ─────────────────────────────────────────────────────
	$effect(() => {
		if (!scrollEl) return;
		containerWidth = scrollEl.clientWidth;
		const ro = new ResizeObserver(() => { containerWidth = scrollEl!.clientWidth; });
		ro.observe(scrollEl);
		return () => ro.disconnect();
	});

	// ── Initial zoom + scroll ──────────────────────────────────────────────
	let initialScrollDone = false;
	$effect(() => {
		if (!entriesStore.loaded || initialScrollDone || !scrollEl || containerWidth === 0) return;
		const _start = timelineStart;
		initialScrollDone = true;
		pxPerDay = containerWidth / 365;
		tick().then(() => requestAnimationFrame(() => scrollToYear(new Date().getFullYear())));
	});

	// ── Visible year label ─────────────────────────────────────────────────
	const visibleYear = $derived.by(() => {
		const ms = timelineStart + (scrollLeft + containerWidth / 2) / pxPerDay * 86_400_000;
		return new Date(ms).getFullYear();
	});

	// ── Debounced visible window ───────────────────────────────────────────
	let visibleStartMs = $state(0);
	let visibleEndMs = $state(Number.MAX_SAFE_INTEGER);

	$effect(() => {
		const sl = scrollLeft;
		const cw = containerWidth;
		const ppd = pxPerDay;
		const ts = timelineStart;
		if (cw === 0 || ppd === 0) return;
		const start = ts + (sl / ppd) * 86_400_000;
		const end = ts + ((sl + cw) / ppd) * 86_400_000;
		const timer = setTimeout(() => {
			visibleStartMs = start;
			visibleEndMs = end;
		}, 150);
		return () => clearTimeout(timer);
	});

	// ── Filtered entries + derived stats ───────────────────────────────────
	const filteredEntries = $derived(
		entriesStore.entries.filter((e) => e.date >= visibleStartMs && e.date <= visibleEndMs)
	);

	const filteredCountryStats = $derived(computeCountryStats(filteredEntries));
	const filteredDaysByCountry = $derived(
		new Map(filteredCountryStats.map((s) => [s.isoCountryCode, s.days]))
	);
	const filteredTotalDays = $derived(countUniqueDays(filteredEntries));
	const filteredTotalCountries = $derived(filteredCountryStats.length);
	const topCountries = $derived(filteredCountryStats.slice(0, 5));
	const coveragePercent = $derived(Math.round((filteredTotalCountries / 195) * 100));
	const longestStreak = $derived(
		filteredEntries.length > 0 ? getLongestStreak(filteredEntries) : null
	);

	// ── Period label (shown when not viewing full range) ───────────────────
	const periodLabel = $derived.by(() => {
		if (visibleEndMs === Number.MAX_SAFE_INTEGER) return null;
		const almostStart = Math.abs(visibleStartMs - timelineStart) < 86_400_000 * 2;
		const almostEnd = Math.abs(visibleEndMs - timelineEnd) < 86_400_000 * 2;
		if (almostStart && almostEnd) return null;
		const y1 = new Date(visibleStartMs).getFullYear();
		const y2 = new Date(Math.min(visibleEndMs, timelineEnd - 86_400_000)).getFullYear();
		return y1 === y2 ? `${y1}` : `${y1} – ${y2}`;
	});

	// ── Tweened stat numbers ───────────────────────────────────────────────
	const tweenedDays = tweened(0, { duration: 400, easing: cubicOut });
	const tweenedCountries = tweened(0, { duration: 400, easing: cubicOut });
	const tweenedCoverage = tweened(0, { duration: 400, easing: cubicOut });

	$effect(() => { tweenedDays.set(filteredTotalDays); });
	$effect(() => { tweenedCountries.set(filteredTotalCountries); });
	$effect(() => { tweenedCoverage.set(coveragePercent); });

	// ── Map API + country selection ────────────────────────────────────────
	let mapApi = $state<{ zoomToVisited: () => void; resetZoom: () => void } | null>(null);
	let selectedCountry = $state<string | null>(null);

	function onCountryClick(alpha2: string) {
		selectedCountry = alpha2 || null;
	}

	// ── Bottom sheet data ──────────────────────────────────────────────────
	const selectedStat = $derived(
		selectedCountry
			? filteredCountryStats.find((s) => s.isoCountryCode === selectedCountry) ?? null
			: null
	);

	const selectedAllTimeStat = $derived(
		selectedCountry
			? entriesStore.countryStats.find((s) => s.isoCountryCode === selectedCountry) ?? null
			: null
	);

	const selectedStays = $derived.by(() => {
		if (!selectedCountry) return [];
		return computeStays(filteredEntries.filter((e) => e.isoCountryCode === selectedCountry));
	});

	// ── Swipe to dismiss ───────────────────────────────────────────────────
	let swipeStartY = 0;

	function onSheetTouchStart(e: TouchEvent) {
		swipeStartY = e.touches[0].clientY;
	}
	function onSheetTouchEnd(e: TouchEvent) {
		if (e.changedTouches[0].clientY - swipeStartY > 80) selectedCountry = null;
	}

	function formatShortDate(ms: number) {
		return new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
	}
</script>

<!-- Timeline tooltip (fixed so it's never clipped) -->
{#if timelineTooltip}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed z-50 pointer-events-none px-3 py-2 rounded-lg text-xs
			bg-slate-900 border border-slate-600 shadow-2xl whitespace-nowrap"
		style="left: {Math.min(timelineTooltip.x + 12, window.innerWidth - 210)}px; top: {timelineTooltip.y - 64}px"
	>
		<p class="font-semibold text-white">{flagEmoji(timelineTooltip.stay.isoCountryCode)} {timelineTooltip.stay.country}</p>
		<p class="text-slate-400 mt-0.5">{formatDate(timelineTooltip.stay.startDate)} → {formatDate(timelineTooltip.stay.endDate)}</p>
		<p class="text-slate-300 font-mono mt-0.5">{timelineTooltip.stay.days} día{timelineTooltip.stay.days === 1 ? '' : 's'}</p>
	</div>
{/if}

<div class="flex-1 flex flex-col overflow-hidden relative">
	{#if !entriesStore.loaded}
		<div class="flex-1 flex items-center justify-center text-slate-500">Cargando…</div>

	{:else if entriesStore.totalDays === 0}
		<div class="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
			<p class="text-5xl">🌍</p>
			<h2 class="text-xl font-bold">Sin datos todavía</h2>
			<p class="text-slate-400 text-sm">Importa tus archivos JSON de Scriptable para empezar.</p>
			<a
				href="/sync"
				class="mt-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors"
			>
				Ir a Sync
			</a>
		</div>

	{:else}
		<!-- ── Top: scrollable map + stats ─────────────────────────────────── -->
		<div class="flex-1 overflow-y-auto">
			<!-- Map -->
			<div class="bg-slate-950 px-0 pt-2">
				<WorldMap
					daysByCountry={filteredDaysByCountry}
					{onCountryClick}
					bind:api={mapApi}
				/>
			</div>

			<!-- Map legend -->
			<div class="flex items-center gap-2 px-4 pt-2 pb-1 flex-wrap">
				<span class="text-slate-500 text-xs">Días:</span>
				{#each [['Sin visitar', '#1e293b'], ['1–7', '#164e63'], ['8–29', '#0c6a8a'], ['30–89', '#0284c7'], ['90+', '#38bdf8']] as [label, color]}
					<span class="flex items-center gap-1 text-xs text-slate-400">
						<span class="inline-block w-3 h-3 rounded-sm" style="background:{color}"></span>
						{label}
					</span>
				{/each}
			</div>

			<!-- Stats grid -->
			<div class="px-4 pt-3 pb-2">
				{#if periodLabel}
					<p class="text-xs text-sky-400/70 mb-2 font-mono tracking-wide">{periodLabel}</p>
				{/if}
				<div class="grid grid-cols-3 gap-3">
					<div class="bg-slate-800/60 rounded-xl p-3 text-center">
						<p class="text-2xl font-bold text-white tabular-nums">{Math.round($tweenedCountries)}</p>
						<p class="text-slate-400 text-xs mt-1">países</p>
					</div>
					<div class="bg-slate-800/60 rounded-xl p-3 text-center">
						<p class="text-2xl font-bold text-white tabular-nums">{Math.round($tweenedDays)}</p>
						<p class="text-slate-400 text-xs mt-1">días</p>
					</div>
					<div class="bg-slate-800/60 rounded-xl p-3 text-center">
						<p class="text-2xl font-bold text-white tabular-nums">{Math.round($tweenedCoverage)}%</p>
						<p class="text-slate-400 text-xs mt-1">del mundo</p>
					</div>
				</div>
			</div>

			{#if longestStreak && longestStreak.days > 1}
				<div class="mx-4 mb-3 bg-slate-800/60 rounded-xl px-4 py-3 flex items-center justify-between">
					<span class="text-slate-400 text-sm">Racha más larga</span>
					<span class="font-medium text-white text-sm">{longestStreak.days} días en {longestStreak.country}</span>
				</div>
			{/if}

			<!-- Top países -->
			<div class="px-4 pb-5">
				<p class="text-slate-500 text-xs uppercase tracking-wider mb-3">Top países</p>
				<div class="space-y-2">
					{#each topCountries as stat, i (stat.isoCountryCode)}
						<div class="flex items-center gap-3" transition:fade={{ duration: 200 }}>
							<span class="text-slate-600 text-xs w-4 text-right">{i + 1}</span>
							<span class="text-xl leading-none">{flagEmoji(stat.isoCountryCode)}</span>
							<span class="flex-1 text-sm text-slate-200 truncate">{stat.country}</span>
							<span class="text-sm font-mono text-slate-300">{stat.days}d</span>
							<div class="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
								<div
									class="h-full bg-sky-500 rounded-full transition-[width] duration-300"
									style="width: {Math.round((stat.days / topCountries[0].days) * 100)}%"
								></div>
							</div>
						</div>
					{/each}
				</div>

				{#if entriesStore.totalCountries > 5}
					<a href="/passport" class="block mt-4 text-center text-xs text-slate-500 hover:text-slate-300 transition-colors">
						Ver todos los {entriesStore.totalCountries} países →
					</a>
				{/if}
			</div>
		</div>

		<!-- ── Bottom: timeline panel ──────────────────────────────────────── -->
		<div class="flex-shrink-0 border-t border-slate-800 bg-slate-900/95">
			<!-- Controls row -->
			<div class="px-3 pt-2.5 pb-1 flex items-center justify-between gap-2">
				<!-- Year + period indicator -->
				<div class="flex items-center gap-1.5 min-w-0 text-xs">
					<span class="font-mono text-slate-400">{visibleYear}</span>
					{#if periodLabel}
						<span class="text-sky-500/50">·</span>
						<span class="text-sky-400/60 font-mono truncate">{periodLabel}</span>
					{/if}
				</div>

				<!-- Preset + zoom buttons -->
				<div class="flex items-center gap-1.5 flex-shrink-0">
					<div class="flex items-center rounded-lg overflow-hidden border border-slate-700 text-xs">
						{#each [['Todo', -1], ['1a', 365], ['6m', 182], ['1m', 30]] as [label, days]}
							<button
								class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 transition-colors text-slate-300 border-r border-slate-700 last:border-0"
								onclick={() => setPreset(Number(days))}
							>{label}</button>
						{/each}
					</div>
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

			<!-- Scrollable timeline track -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="overflow-x-auto overflow-y-hidden select-none cursor-grab active:cursor-grabbing pb-2"
				bind:this={scrollEl}
				onscroll={() => { scrollLeft = scrollEl?.scrollLeft ?? 0; }}
				onwheel={onWheel}
				ontouchstart={onTouchStart}
				ontouchmove={onTouchMove}
				onmouseleave={() => { timelineTooltip = null; }}
			>
				<div class="relative" style="width: {totalWidth}px; height: 72px;">

					<!-- Year boundaries -->
					{#each yearMarkers as { year, left }}
						<div class="absolute top-0 bottom-0 border-l border-slate-600/60" style="left: {left}px">
							<span class="absolute top-1 left-1.5 text-slate-400 text-xs font-bold select-none">{year}</span>
						</div>
					{/each}

					<!-- Month gridlines -->
					{#each monthMarkers as { label, left }}
						<div class="absolute border-l border-slate-700/50 pointer-events-none" style="left: {left}px; top: 18px; bottom: 12px;"></div>
						{#if pxPerDay >= 5}
							<span class="absolute text-[9px] text-slate-600 select-none" style="left: {left + 2}px; bottom: 2px">{label}</span>
						{/if}
					{/each}

					<!-- Stays track -->
					<div class="absolute left-0 right-0" style="top: 20px; height: 36px;">
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
								onmouseleave={() => { timelineTooltip = null; }}
							>
								{#if w > 24}
									<span class="pl-1 text-[10px] leading-none truncate" style="color: {color}">
										{flagEmoji(stay.isoCountryCode)}{#if w > 56}&nbsp;{stay.country}{/if}
									</span>
								{/if}
							</div>
						{/each}
					</div>

				</div>
			</div>
		</div>

		<!-- ── Country bottom sheet ───────────────────────────────────────── -->
		{#if selectedCountry && selectedStat}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="fixed inset-x-0 bottom-0 z-50 flex flex-col
					bg-slate-900 border-t border-slate-700/80 rounded-t-2xl shadow-2xl"
				style="max-height: 70%"
				in:fly={{ y: 420, duration: 320, easing: cubicOut }}
				out:fly={{ y: 420, duration: 220 }}
				ontouchstart={onSheetTouchStart}
				ontouchend={onSheetTouchEnd}
			>
				<!-- Drag handle -->
				<div class="flex justify-center pt-2.5 pb-1 flex-shrink-0 cursor-pointer" onclick={() => { selectedCountry = null; }}>
					<div class="w-9 h-1 bg-slate-600 rounded-full"></div>
				</div>

				<!-- Header -->
				<div class="flex items-center gap-3 px-4 pb-3 flex-shrink-0">
					<span class="text-3xl leading-none">{flagEmoji(selectedStat.isoCountryCode)}</span>
					<div class="flex-1 min-w-0">
						<h2 class="font-bold text-white text-lg leading-tight truncate">{selectedStat.country}</h2>
						{#if periodLabel}
							<p class="text-xs text-sky-400/70 font-mono mt-0.5">{periodLabel}</p>
						{/if}
					</div>
					<button
						class="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800
							hover:bg-slate-700 text-slate-400 hover:text-white transition-colors flex-shrink-0"
						onclick={() => { selectedCountry = null; }}
					>
						<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
							<path d="M18 6 6 18M6 6l12 12"/>
						</svg>
					</button>
				</div>

				<!-- Stats row -->
				<div class="flex gap-3 px-4 pb-4 flex-shrink-0">
					<div class="flex-1 bg-slate-800/70 rounded-xl p-3 text-center">
						<p class="text-3xl font-black text-white tabular-nums">{selectedStat.days}</p>
						<p class="text-slate-400 text-xs mt-0.5">días{periodLabel ? ` en ${periodLabel}` : ''}</p>
					</div>
					<div class="flex-1 bg-slate-800/70 rounded-xl p-3 text-center">
						<p class="text-3xl font-black text-white tabular-nums">{selectedStays.length}</p>
						<p class="text-slate-400 text-xs mt-0.5">estanci{selectedStays.length === 1 ? 'a' : 'as'}</p>
					</div>
					{#if periodLabel && selectedAllTimeStat && selectedAllTimeStat.days !== selectedStat.days}
						<div class="flex-1 bg-slate-800/40 rounded-xl p-3 text-center border border-slate-700/50">
							<p class="text-3xl font-black text-slate-400 tabular-nums">{selectedAllTimeStat.days}</p>
							<p class="text-slate-500 text-xs mt-0.5">días totales</p>
						</div>
					{/if}
				</div>

				<!-- Stays list (scrollable) -->
				{#if selectedStays.length > 0}
					<div class="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
						<p class="text-slate-500 text-xs uppercase tracking-wider mb-2">Estancias</p>
						<div class="space-y-1.5">
							{#each selectedStays as stay}
								<div class="flex items-center gap-3 py-2 border-b border-slate-800/60 last:border-0">
									<div class="flex-1 min-w-0">
										<p class="text-sm text-slate-300">
											{formatShortDate(stay.startDate)}
											{#if stay.days > 1}
												<span class="text-slate-600 mx-1">→</span>
												{formatShortDate(stay.endDate)}
											{/if}
										</p>
									</div>
									<span class="text-sm font-mono text-sky-400 flex-shrink-0">{stay.days}d</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		{/if}
	{/if}
</div>
