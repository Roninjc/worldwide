<script lang="ts">
  import { t } from "svelte-i18n";
</script>

<!-- Shared empty state shown across all routes when there is no imported data yet. -->
<div
  class="w-full min-h-[70vh] flex flex-col items-center justify-center gap-4 px-6 text-center"
>
  <p class="text-5xl">🌍</p>
  <h2 class="text-xl font-bold" style="color: var(--app-fg)">
    {$t("empty.no_data")}
  </h2>
  <p class="text-sm max-w-xs" style="color: var(--app-muted)">
    {$t("empty.import_json")}
  </p>
  <a
    href="/sync"
    class="mt-2 px-5 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
    style="background: var(--app-accent); color: #ffffff"
  >
    {$t("empty.go_to_sync")}
  </a>
</div>
