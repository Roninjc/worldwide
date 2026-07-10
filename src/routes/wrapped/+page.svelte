<script lang="ts">
	import { entriesStore } from '$lib/entriesStore.svelte';
	import { goto } from '$app/navigation';
	import { t } from 'svelte-i18n';
	import NoData from '$lib/components/NoData.svelte';

	// Functional redirect to the most recent year — only when there IS data.
	$effect(() => {
		if (entriesStore.loaded && entriesStore.years.length > 0) {
			goto(`/wrapped/${entriesStore.years[0]}`);
		}
	});
</script>

{#if !entriesStore.loaded}
	<div class="flex items-center justify-center h-full py-20" style="color: var(--app-muted)">
		{$t('loading')}
	</div>
{:else if entriesStore.years.length === 0}
	<NoData />
{:else}
	<div class="flex items-center justify-center h-full py-20" style="color: var(--app-muted)">
		{$t('loading')}
	</div>
{/if}
