<script lang="ts">
	import { page } from '$app/stores';
	import { entriesStore } from '$lib/entriesStore.svelte';

	const year = $derived(Number($page.params.year));
</script>

<div class="flex items-center justify-center h-full text-slate-500 py-20">
	Wrapped {year} — próximamente ✨
	{#if entriesStore.years.includes(year)}
		<span class="ml-2">(datos disponibles)</span>
	{/if}
</div>
