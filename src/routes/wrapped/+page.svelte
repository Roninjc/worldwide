<script lang="ts">
	import { entriesStore } from '$lib/entriesStore.svelte';
	import { goto } from '$app/navigation';

	$effect(() => {
		if (entriesStore.loaded && entriesStore.years.length > 0) {
			goto(`/wrapped/${entriesStore.years[0]}`);
		}
	});
</script>

<div class="flex items-center justify-center h-full py-20" style="color: var(--app-muted)">
	Redirigiendo…
</div>
