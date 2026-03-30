<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { entriesStore } from '$lib/entriesStore.svelte';
	import { computeCountryStats, getMostTraveledMonth, countUniqueDays } from '$lib/stats';
	import { computeStays } from '$lib/stays';
	import { flagEmoji } from '$lib/flag';
	import type { CountryStat } from '$lib/types';

	const year = $derived(Number($page.params.year));

	const yearEntries = $derived(
		entriesStore.entries.filter((e) => new Date(e.date).getFullYear() === year)
	);

	const beforeEntries = $derived(
		entriesStore.entries.filter((e) => new Date(e.date).getFullYear() < year)
	);

	const yearStats = $derived(computeCountryStats(yearEntries));
	const yearStays = $derived(computeStays(yearEntries));

	const totalDays = $derived(countUniqueDays(yearEntries));
	const totalCountries = $derived(yearStats.length);

	const topCountry = $derived(yearStats[0] as CountryStat | undefined);

	const longestStay = $derived(
		yearStays.reduce(
			(best, s) => (s.days > best.days ? s : best),
			{ days: 0, country: '', isoCountryCode: '' }
		)
	);

	const newCountries = $derived.by(() => {
		const prevIsos = new Set(beforeEntries.map((e) => e.isoCountryCode));
		return yearStats.filter((s) => !prevIsos.has(s.isoCountryCode));
	});

	const mostTraveledMonth = $derived(getMostTraveledMonth(yearEntries));

	// Year nav — years sorted desc
	const yearIndex = $derived(entriesStore.years.indexOf(year));
	const prevYear = $derived(entriesStore.years[yearIndex + 1] as number | undefined);
	const nextYear = $derived(entriesStore.years[yearIndex - 1] as number | undefined);

	function formatMonth(key: string) {
		if (!key) return '';
		const [y, m] = key.split('-');
		return new Date(Number(y), Number(m) - 1).toLocaleDateString('es-ES', { month: 'long' });
	}

	function formatDate(ms: number) {
		return new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
	}
</script>

<div class="max-w-lg mx-auto px-4 py-6 space-y-6">

	<!-- Year navigation -->
	<div class="flex items-center justify-between">
		<button
			class="text-slate-500 hover:text-white transition-colors disabled:opacity-20 disabled:pointer-events-none text-sm px-2 py-1"
			disabled={!prevYear}
			onclick={() => prevYear && goto(`/wrapped/${prevYear}`)}
		>
			← {prevYear ?? ''}
		</button>

		<h1 class="text-3xl font-black tracking-tight">{year}</h1>

		<button
			class="text-slate-500 hover:text-white transition-colors disabled:opacity-20 disabled:pointer-events-none text-sm px-2 py-1"
			disabled={!nextYear}
			onclick={() => nextYear && goto(`/wrapped/${nextYear}`)}
		>
			{nextYear ?? ''} →
		</button>
	</div>

	{#if yearEntries.length === 0}
		<p class="text-slate-500 text-center py-10">Sin datos para {year}.</p>
	{:else}
		<!-- Hero -->
		<div class="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 text-center border border-slate-700/50">
			<p class="text-slate-400 text-sm mb-3">Tu {year} en el mundo</p>
			<div class="flex items-center justify-center gap-8">
				<div>
					<p class="text-5xl font-black text-white">{totalCountries}</p>
					<p class="text-slate-400 text-xs mt-1">países</p>
				</div>
				<div class="w-px h-12 bg-slate-700"></div>
				<div>
					<p class="text-5xl font-black text-white">{totalDays}</p>
					<p class="text-slate-400 text-xs mt-1">días</p>
				</div>
			</div>
		</div>

		<!-- Stat cards 2x2 -->
		<div class="grid grid-cols-2 gap-3">
			<!-- Most visited -->
			{#if topCountry}
				<div class="bg-slate-800/60 rounded-xl p-4 space-y-1">
					<p class="text-slate-500 text-xs">País más visitado</p>
					<p class="text-2xl">{flagEmoji(topCountry.isoCountryCode)}</p>
					<p class="font-semibold text-white text-sm">{topCountry.country}</p>
					<p class="text-sky-400 text-xs font-mono">{topCountry.days} días</p>
				</div>
			{/if}

			<!-- Longest stay -->
			{#if longestStay.days > 0}
				<div class="bg-slate-800/60 rounded-xl p-4 space-y-1">
					<p class="text-slate-500 text-xs">Estancia más larga</p>
					<p class="text-2xl">{flagEmoji(longestStay.isoCountryCode)}</p>
					<p class="font-semibold text-white text-sm">{longestStay.country}</p>
					<p class="text-sky-400 text-xs font-mono">{longestStay.days} días seguidos</p>
				</div>
			{/if}

			<!-- Most traveled month -->
			{#if mostTraveledMonth.month}
				<div class="bg-slate-800/60 rounded-xl p-4 space-y-1">
					<p class="text-slate-500 text-xs">Mes más viajado</p>
					<p class="text-xl font-bold text-white capitalize mt-1">
						{formatMonth(mostTraveledMonth.month)}
					</p>
					<p class="text-sky-400 text-xs font-mono">
						{mostTraveledMonth.countries} países distintos
					</p>
				</div>
			{/if}

			<!-- New countries -->
			{#if newCountries.length > 0}
				<div class="bg-slate-800/60 rounded-xl p-4 space-y-1">
					<p class="text-slate-500 text-xs">Países nuevos</p>
					<p class="text-3xl font-black text-white mt-1">{newCountries.length}</p>
					<p class="text-slate-400 text-xs">por primera vez</p>
				</div>
			{:else if beforeEntries.length === 0}
				<!-- First year of data, can't compute new countries -->
			{:else}
				<div class="bg-slate-800/60 rounded-xl p-4 space-y-1">
					<p class="text-slate-500 text-xs">Países nuevos</p>
					<p class="text-3xl font-black text-slate-600 mt-1">0</p>
					<p class="text-slate-600 text-xs">ninguno nuevo</p>
				</div>
			{/if}
		</div>

		<!-- New countries detail -->
		{#if newCountries.length > 0}
			<div class="space-y-2">
				<p class="text-slate-500 text-xs uppercase tracking-wider">Nuevos este año</p>
				<div class="flex flex-wrap gap-2">
					{#each newCountries as stat}
						<span class="flex items-center gap-1.5 bg-sky-900/40 border border-sky-700/50
							text-sky-300 text-xs px-3 py-1.5 rounded-full">
							{flagEmoji(stat.isoCountryCode)} {stat.country}
						</span>
					{/each}
				</div>
			</div>
		{/if}

		<!-- All countries this year -->
		<div class="space-y-2">
			<p class="text-slate-500 text-xs uppercase tracking-wider">Todos los países</p>
			<div class="space-y-2">
				{#each yearStats as stat}
					{@const isNew = newCountries.some((n) => n.isoCountryCode === stat.isoCountryCode)}
					{@const pct = Math.round((stat.days / yearStats[0].days) * 100)}
					<div class="flex items-center gap-3">
						<span class="text-lg leading-none w-7 text-center">{flagEmoji(stat.isoCountryCode)}</span>
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-1.5 mb-1">
								<span class="text-sm text-slate-200 truncate">{stat.country}</span>
								{#if isNew && beforeEntries.length > 0}
									<span class="text-[10px] px-1.5 py-0.5 bg-sky-900/60 text-sky-400 rounded-full leading-none">nuevo</span>
								{/if}
							</div>
							<div class="h-1 bg-slate-800 rounded-full overflow-hidden">
								<div class="h-full bg-sky-500 rounded-full" style="width: {pct}%"></div>
							</div>
						</div>
						<span class="text-xs font-mono text-slate-400 w-10 text-right">{stat.days}d</span>
					</div>
				{/each}
			</div>
		</div>

		<!-- Stays detail -->
		{#if yearStays.length > 0}
			<div class="space-y-2">
				<p class="text-slate-500 text-xs uppercase tracking-wider">Estancias</p>
				<div class="space-y-1">
					{#each yearStays as stay}
						<div class="flex items-center gap-3 text-sm py-1.5 border-b border-slate-800/60 last:border-0">
							<span class="text-base leading-none">{flagEmoji(stay.isoCountryCode)}</span>
							<span class="flex-1 text-slate-300 truncate">{stay.country}</span>
							<span class="text-slate-500 text-xs">
								{formatDate(stay.startDate)}
								{#if stay.days > 1}→ {formatDate(stay.endDate)}{/if}
							</span>
							<span class="text-slate-400 text-xs font-mono w-8 text-right">{stay.days}d</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>
