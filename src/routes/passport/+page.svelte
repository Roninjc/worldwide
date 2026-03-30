<script lang="ts">
	import { entriesStore } from '$lib/entriesStore.svelte';
</script>

<div class="flex items-center justify-center h-full text-slate-500 py-20">
	Passport — próximamente 🛂
	{#if entriesStore.totalCountries > 0}
		<span class="ml-2">({entriesStore.totalCountries} países listos)</span>
	{/if}
</div>
