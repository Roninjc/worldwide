<script lang="ts">
	import { entriesStore } from '$lib/entriesStore.svelte';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	onMount(() => {
		if (entriesStore.loaded && entriesStore.totalDays === 0) {
			goto('/sync');
		}
	});
</script>

{#if !entriesStore.loaded}
	<div class="flex items-center justify-center h-full text-slate-500 py-20">Cargando…</div>
{:else if entriesStore.totalDays === 0}
	<div class="flex flex-col items-center justify-center h-full gap-4 py-20 px-6 text-center">
		<p class="text-5xl">🌍</p>
		<h2 class="text-xl font-bold">Sin datos todavía</h2>
		<p class="text-slate-400 text-sm">Importa tus archivos JSON de Scriptable para empezar.</p>
		<a href="/sync" class="mt-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors">
			Ir a Sync
		</a>
	</div>
{:else}
	<!-- Mapa — próxima iteración -->
	<div class="flex items-center justify-center h-full text-slate-500 py-20">
		Mapa en construcción 🗺️
	</div>
{/if}
