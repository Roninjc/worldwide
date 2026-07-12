<script lang="ts">
  import { goto } from "$app/navigation";
  import { t } from "svelte-i18n";
  import { entriesStore } from "$lib/entriesStore.svelte";

  let { mode }: { mode: "year" | "total" } = $props();

  // "By year" returns to the most recent year's recap.
  const recentYear = $derived(entriesStore.years[0]);
</script>

<div
  class="flex rounded-lg overflow-hidden text-sm mx-auto max-w-[260px]"
  style="border: 1px solid var(--app-border)"
>
  {#each [["year", $t("wrapped.by_year"), `/wrapped/${recentYear}`], ["total", $t("wrapped.total"), "/wrapped/all"]] as [value, label, href]}
    {@const active = mode === value}
    <button
      class="flex-1 py-1.5 transition-colors"
      style="background: {active
        ? 'var(--app-accent)'
        : 'var(--app-surface-2)'}; color: {active ? '#ffffff' : 'var(--app-muted)'}"
      onclick={() => !active && goto(href)}>{label}</button
    >
  {/each}
</div>
