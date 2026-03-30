<script lang="ts">
	import { entriesStore } from '$lib/entriesStore.svelte';
	import { goto } from '$app/navigation';

	$effect(() => {
		if (entriesStore.loaded && entriesStore.years.length > 0) {
			goto(`/wrapped/${entriesStore.years[0]}`);
		}
	});
</script>

<div class="flex items-center justify-center h-full text-slate-500 py-20">
	Redirigiendo…
</div>
