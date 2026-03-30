<script lang="ts">
	import { entriesStore } from '$lib/entriesStore.svelte';
</script>

<div class="flex items-center justify-center h-full text-slate-500 py-20">
	Timeline — próximamente 📅
	{#if entriesStore.totalDays > 0}
		<span class="ml-2">({entriesStore.totalDays} entradas listas)</span>
	{/if}
</div>
