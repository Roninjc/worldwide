<script lang="ts">
  import { t, locale } from "svelte-i18n";
  import { goto } from "$app/navigation";
  import { entriesStore } from "$lib/entriesStore.svelte";
  import {
    daysSinceNewestEntry,
    newestEntryDate,
    STALE_THRESHOLD_DAYS,
  } from "$lib/stats";
  import { relativeTime } from "$lib/time";

  const newest = $derived(newestEntryDate(entriesStore.entries));
  const daysSince = $derived(daysSinceNewestEntry(entriesStore.entries));
  const isStale = $derived(daysSince !== null && daysSince > STALE_THRESHOLD_DAYS);

  // Dismissed per newest-entry value, persisted for the session so it can
  // reappear once fresher data arrives (newest changes).
  let dismissedFor = $state<number | null>(
    typeof sessionStorage !== "undefined"
      ? Number(sessionStorage.getItem("ww_stale_dismissed")) || null
      : null,
  );

  const show = $derived(
    entriesStore.loaded && isStale && newest !== null && dismissedFor !== newest,
  );

  function dismiss() {
    dismissedFor = newest;
    if (typeof sessionStorage !== "undefined" && newest !== null)
      sessionStorage.setItem("ww_stale_dismissed", String(newest));
  }

  function formatDate(ms: number) {
    return new Date(ms).toLocaleDateString($locale ?? "en", {
      day: "numeric",
      month: "short",
    });
  }
</script>

{#if show && newest !== null && daysSince !== null}
  <div
    class="mx-auto max-w-lg w-full flex items-center gap-3 rounded-xl px-3 py-2.5 pointer-events-auto"
    style="
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      box-shadow: var(--glass-shadow);
      backdrop-filter: blur(44px) saturate(220%);
      -webkit-backdrop-filter: blur(44px) saturate(220%);
    "
  >
      <svg
        class="w-5 h-5 flex-shrink-0"
        style="color: var(--app-accent)"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>

      <div class="flex-1 min-w-0">
        <p class="text-xs font-medium leading-tight" style="color: var(--app-fg)">
          {$t("sync.stale_title")}
        </p>
        <p class="text-[11px] leading-tight mt-0.5" style="color: var(--app-muted)">
          {$t("sync.stale_body", {
            values: {
              date: formatDate(newest),
              relative: relativeTime(newest, $locale),
            },
          })}
        </p>
      </div>

      <button
        class="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
        style="background: var(--app-accent); color: #ffffff"
        onclick={() => goto("/sync")}
      >
        {$t("sync.stale_action")}
      </button>

      <button
        class="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full transition-opacity hover:opacity-60"
        style="color: var(--app-muted)"
        aria-label="Dismiss"
        onclick={dismiss}
      >
        <svg
          class="w-3.5 h-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
  </div>
{/if}
