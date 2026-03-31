<script lang="ts">
	import { entriesStore } from '$lib/entriesStore.svelte';
	import { flagEmoji } from '$lib/flag';
	import {
		getContinent,
		CONTINENT_LABELS,
		CONTINENT_TOTALS,
		type Continent
	} from '$lib/continents';
	import type { CountryStat } from '$lib/types';

	const CONTINENT_ORDER: Continent[] = [
		'Europe', 'Asia', 'Africa', 'Americas', 'Oceania', 'Antarctica'
	];

	// Group visited countries by continent
	const byContinent = $derived(() => {
		const map = new Map<Continent, CountryStat[]>();
		for (const stat of entriesStore.countryStats) {
			const c = getContinent(stat.isoCountryCode);
			if (!c) continue;
			if (!map.has(c)) map.set(c, []);
			map.get(c)!.push(stat);
		}
		return map;
	});

	const totalCountriesInWorld = 195;
	const coveragePct = $derived(
		Math.round((entriesStore.totalCountries / totalCountriesInWorld) * 100)
	);

	function firstVisitYear(stat: CountryStat) {
		return new Date(stat.firstVisit).getFullYear();
	}

	// Which continents are expanded (all by default if visited)
	let expanded = $state<Set<Continent>>(new Set(CONTINENT_ORDER));

	function toggle(c: Continent) {
		const next = new Set(expanded);
		if (next.has(c)) next.delete(c);
		else next.add(c);
		expanded = next;
	}
</script>

<div class="flex-1 overflow-y-auto">
<div class="px-4 py-6 max-w-2xl mx-auto space-y-6">
	<div>
		<h1 class="text-2xl font-bold">Passport</h1>
		<p class="text-slate-400 text-sm mt-1">Tu progreso por el mundo</p>
	</div>

	{#if entriesStore.totalDays === 0}
		<p class="text-slate-500 text-sm">
			Sin datos. <a href="/sync" class="underline">Importa tus JSONs</a>.
		</p>
	{:else}
		<!-- Global progress -->
		<div class="bg-slate-800/60 rounded-2xl p-5 space-y-3">
			<div class="flex items-end justify-between">
				<div>
					<p class="text-4xl font-bold text-white">{entriesStore.totalCountries}</p>
					<p class="text-slate-400 text-sm">de {totalCountriesInWorld} países</p>
				</div>
				<p class="text-5xl font-black text-slate-700">{coveragePct}%</p>
			</div>
			<div class="h-2 bg-slate-700 rounded-full overflow-hidden">
				<div
					class="h-full bg-gradient-to-r from-sky-500 to-blue-400 rounded-full transition-all"
					style="width: {coveragePct}%"
				></div>
			</div>
			<p class="text-slate-500 text-xs">
				{totalCountriesInWorld - entriesStore.totalCountries} países por descubrir
			</p>
		</div>

		<!-- By continent -->
		<div class="space-y-2">
			{#each CONTINENT_ORDER as continent}
				{@const countries = byContinent().get(continent) ?? []}
				{@const total = CONTINENT_TOTALS[continent]}
				{@const visited = countries.length}
				{@const pct = Math.round((visited / total) * 100)}
				{@const isExpanded = expanded.has(continent)}

				<div class="bg-slate-800/40 rounded-xl overflow-hidden">
					<!-- Continent header -->
					<button
						class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-700/30 transition-colors"
						onclick={() => toggle(continent)}
					>
						<div class="flex-1 min-w-0">
							<div class="flex items-baseline gap-2">
								<span class="font-medium text-slate-200 text-sm">
									{CONTINENT_LABELS[continent]}
								</span>
								<span class="text-slate-500 text-xs">{visited}/{total}</span>
							</div>
							<!-- Mini progress bar -->
							<div class="h-1 bg-slate-700 rounded-full mt-1.5 overflow-hidden">
								<div
									class="h-full rounded-full transition-all"
									class:bg-sky-500={pct > 50}
									class:bg-blue-400={pct > 25 && pct <= 50}
									class:bg-slate-500={pct <= 25 && pct > 0}
									class:bg-slate-700={pct === 0}
									style="width: {Math.max(pct, pct > 0 ? 2 : 0)}%"
								></div>
							</div>
						</div>
						<span class="text-slate-600 text-xs font-mono w-8 text-right">{pct}%</span>
						<span class="text-slate-600 text-xs ml-1">{isExpanded ? '▲' : '▼'}</span>
					</button>

					<!-- Country list -->
					{#if isExpanded && visited > 0}
						<div class="border-t border-slate-700/50">
							{#each countries as stat, i}
								<div
									class="flex items-center gap-3 px-4 py-2.5 text-sm
										{i < countries.length - 1 ? 'border-b border-slate-700/30' : ''}"
								>
									<span class="text-lg leading-none">{flagEmoji(stat.isoCountryCode)}</span>
									<span class="flex-1 text-slate-300 truncate">{stat.country}</span>
									<span class="text-slate-500 text-xs">{firstVisitYear(stat)}</span>
									<div class="flex items-center gap-1.5 text-slate-400 text-xs w-16 justify-end">
										<span class="font-mono">{stat.days}d</span>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
</div>
