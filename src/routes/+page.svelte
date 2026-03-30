<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { entriesStore } from '$lib/entriesStore.svelte';
	import WorldMap from '$lib/components/WorldMap.svelte';
	import { flagEmoji } from '$lib/flag';
	import { getLongestStreak } from '$lib/stats';

	const daysByCountry = $derived(
		new Map(entriesStore.countryStats.map((s) => [s.isoCountryCode, s.days]))
	);

	const topCountries = $derived(entriesStore.countryStats.slice(0, 5));

	const longestStreak = $derived(
		entriesStore.entries.length > 0 ? getLongestStreak(entriesStore.entries) : null
	);

	const totalCountriesInWorld = 195;
	const coveragePercent = $derived(
		Math.round((entriesStore.totalCountries / totalCountriesInWorld) * 100)
	);

	onMount(() => {
		if (entriesStore.loaded && entriesStore.totalDays === 0) {
			goto('/sync');
		}
	});
</script>

{#if !entriesStore.loaded}
	<div class="flex items-center justify-center py-20 text-slate-500">Cargando…</div>
{:else if entriesStore.totalDays === 0}
	<div class="flex flex-col items-center justify-center gap-4 py-20 px-6 text-center">
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
	<div class="flex flex-col">
		<!-- Map -->
		<div class="bg-slate-950 px-0 pt-2">
			<WorldMap {daysByCountry} />
		</div>

		<!-- Map legend -->
		<div class="flex items-center gap-2 px-4 pt-2 pb-1">
			<span class="text-slate-500 text-xs">Días:</span>
			{#each [['Sin visitar', '#1e293b'], ['1–7', '#164e63'], ['8–29', '#0c6a8a'], ['30–89', '#0284c7'], ['90+', '#38bdf8']] as [label, color]}
				<span class="flex items-center gap-1 text-xs text-slate-400">
					<span class="inline-block w-3 h-3 rounded-sm" style="background:{color}"></span>
					{label}
				</span>
			{/each}
		</div>

		<!-- Stats grid -->
		<div class="grid grid-cols-3 gap-3 px-4 py-4">
			<div class="bg-slate-800/60 rounded-xl p-3 text-center">
				<p class="text-2xl font-bold text-white">{entriesStore.totalCountries}</p>
				<p class="text-slate-400 text-xs mt-1">países</p>
			</div>
			<div class="bg-slate-800/60 rounded-xl p-3 text-center">
				<p class="text-2xl font-bold text-white">{entriesStore.totalDays}</p>
				<p class="text-slate-400 text-xs mt-1">días</p>
			</div>
			<div class="bg-slate-800/60 rounded-xl p-3 text-center">
				<p class="text-2xl font-bold text-white">{coveragePercent}%</p>
				<p class="text-slate-400 text-xs mt-1">del mundo</p>
			</div>
		</div>

		{#if longestStreak && longestStreak.days > 1}
			<div class="mx-4 mb-4 bg-slate-800/60 rounded-xl px-4 py-3 flex items-center justify-between">
				<span class="text-slate-400 text-sm">Racha más larga</span>
				<span class="font-medium text-white text-sm">{longestStreak.days} días en {longestStreak.country}</span>
			</div>
		{/if}

		<!-- Top countries -->
		<div class="px-4 pb-6">
			<p class="text-slate-500 text-xs uppercase tracking-wider mb-3">Top países</p>
			<div class="space-y-2">
				{#each topCountries as stat, i}
					<div class="flex items-center gap-3">
						<span class="text-slate-600 text-xs w-4 text-right">{i + 1}</span>
						<span class="text-xl leading-none">{flagEmoji(stat.isoCountryCode)}</span>
						<span class="flex-1 text-sm text-slate-200 truncate">{stat.country}</span>
						<span class="text-sm font-mono text-slate-300">{stat.days}d</span>
						<!-- Bar -->
						<div class="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
							<div
								class="h-full bg-sky-500 rounded-full"
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
{/if}
