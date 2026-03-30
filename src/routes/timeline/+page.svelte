<script lang="ts">
	import { entriesStore } from '$lib/entriesStore.svelte';
	import { flagEmoji } from '$lib/flag';
	import { countUniqueDays } from '$lib/stats';
	import {
		computeStays,
		buildColorMap,
		stayOffsetPct,
		stayWidthPct,
		monthMarkers,
		getDaysInYear,
		type Stay
	} from '$lib/stays';

	const stays = $derived(computeStays(entriesStore.entries));
	const colorMap = $derived(buildColorMap(entriesStore.entries));

	const yearData = $derived(
		entriesStore.years.map((year) => {
			const yearStart = new Date(year, 0, 1).getTime();
			const yearEnd = new Date(year + 1, 0, 1).getTime();
			const yearStays = stays.filter((s) => s.startDate < yearEnd && s.endDate >= yearStart);
			const countriesThisYear = new Set(yearStays.map((s) => s.isoCountryCode)).size;
			const daysThisYear = countUniqueDays(
				entriesStore.entries.filter((e) => new Date(e.date).getFullYear() === year)
			);
			return { year, stays: yearStays, countriesThisYear, daysThisYear };
		})
	);

	const legendEntries = $derived(
		entriesStore.countryStats.map((s) => ({
			...s,
			color: colorMap.get(s.isoCountryCode) ?? '#64748b'
		}))
	);

	// Tooltip state — positioned relative to each bar wrapper
	let hoveredStay = $state<(Stay & { color: string }) | null>(null);
	let tooltipX = $state(0);

	function formatDate(ms: number) {
		return new Date(ms).toLocaleDateString('es-ES', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	function onStayMouseEnter(e: MouseEvent, stay: Stay, barEl: HTMLElement) {
		hoveredStay = { ...stay, color: colorMap.get(stay.isoCountryCode) ?? '#64748b' };
		const barRect = barEl.getBoundingClientRect();
		// Clamp so tooltip doesn't overflow to the right
		tooltipX = Math.min(e.clientX - barRect.left, barRect.width - 200);
	}
</script>

<div class="px-4 py-6 max-w-3xl mx-auto space-y-8">
	<div>
		<h1 class="text-2xl font-bold">Timeline</h1>
		<p class="text-slate-400 text-sm mt-1">
			Cada bloque es una estancia continua en un país. Bloques del mismo color separados = viaje
			diferente.
		</p>
	</div>

	{#if entriesStore.totalDays === 0}
		<p class="text-slate-500 text-sm">
			Sin datos. <a href="/sync" class="underline">Importa tus JSONs</a>.
		</p>
	{:else}
		{#each yearData as { year, stays: yearStays, countriesThisYear, daysThisYear }}
			{@const months = monthMarkers(year)}

			<div>
				<!-- Year header -->
				<div class="flex items-baseline gap-3 mb-2">
					<a
						href="/wrapped/{year}"
						class="text-lg font-bold text-white hover:text-sky-400 transition-colors"
					>
						{year}
					</a>
					<span class="text-slate-500 text-xs">{daysThisYear} días · {countriesThisYear} países</span>
				</div>

				<!-- Bar wrapper: position:relative here so tooltip escapes overflow-hidden -->
				{#snippet barSection()}
					{(null)}
				{/snippet}
				<div
					class="relative"
					onmouseleave={() => { hoveredStay = null; }}
					role="group"
				>
					<!-- Tooltip lives here, outside overflow-hidden -->
					{#if hoveredStay}
						<div
							class="absolute z-30 pointer-events-none px-3 py-2 rounded-lg text-xs
								bg-slate-900 border border-slate-600 shadow-2xl whitespace-nowrap"
							style="left: {tooltipX}px; bottom: calc(100% + 8px);"
						>
							<p class="font-semibold text-white">
								{flagEmoji(hoveredStay.isoCountryCode)}
								{hoveredStay.country}
							</p>
							<p class="text-slate-400 mt-0.5">
								{formatDate(hoveredStay.startDate)} → {formatDate(hoveredStay.endDate)}
							</p>
							<p class="text-slate-300 font-mono mt-0.5">
								{hoveredStay.days} día{hoveredStay.days === 1 ? '' : 's'}
							</p>
						</div>
					{/if}

					<!-- Timeline bar (overflow-hidden only here) -->
					<div class="h-9 bg-slate-800 rounded-lg overflow-hidden flex" id="bar-{year}">
						{#each yearStays as stay}
							{@const left = stayOffsetPct(stay, year)}
							{@const width = stayWidthPct(stay, year)}
							{@const color = colorMap.get(stay.isoCountryCode) ?? '#64748b'}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="absolute top-0 h-9 flex items-center overflow-hidden cursor-default
									hover:brightness-125 transition-[filter]"
								style="left: {left}%; width: {width}%; background-color: {color}18;
									border-left: 2px solid {color};"
								onmouseenter={(e) => {
									const bar = document.getElementById(`bar-${year}`);
									if (bar) onStayMouseEnter(e, stay, bar.parentElement!);
								}}
							>
								{#if width > 4}
									<span class="pl-1 text-xs leading-none truncate" style="color: {color}">
										{#if width > 7}{flagEmoji(stay.isoCountryCode)}{/if}
										{#if width > 15}{stay.country}{/if}
									</span>
								{/if}
							</div>
						{/each}

						<!-- Month grid lines -->
						{#each months.slice(1) as { pct }}
							<div
								class="absolute top-0 h-9 border-l border-slate-700/50 pointer-events-none"
								style="left: {pct}%"
							></div>
						{/each}
					</div>

					<!-- Month labels -->
					<div class="relative h-4 mt-0.5">
						{#each months as { label, pct }}
							<span class="absolute text-slate-600 text-[10px]" style="left: {pct}%"
								>{label}</span
							>
						{/each}
					</div>
				</div>
			</div>
		{/each}

		<!-- Legend -->
		<div>
			<p class="text-slate-500 text-xs uppercase tracking-wider mb-3">Países</p>
			<div class="flex flex-wrap gap-2">
				{#each legendEntries as entry}
					<span class="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-slate-800">
						<span
							class="w-2 h-2 rounded-full flex-shrink-0"
							style="background: {entry.color}"
						></span>
						<span class="text-slate-300"
							>{flagEmoji(entry.isoCountryCode)} {entry.country}</span
						>
						<span class="text-slate-500">{entry.days}d</span>
					</span>
				{/each}
			</div>
		</div>
	{/if}
</div>
