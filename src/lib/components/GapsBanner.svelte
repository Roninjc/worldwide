<script lang="ts">
  import { t } from "svelte-i18n";
  import { goto } from "$app/navigation";
  import { entriesStore } from "$lib/entriesStore.svelte";

  const gaps = $derived(entriesStore.gaps);

  // A stable fingerprint of the current gap set. Dismissal is remembered against
  // this value, so the banner reappears whenever the gaps change (e.g. a repair
  // is undone and opens a new hole).
  const signature = $derived(
    gaps
      .map((g) => g.isoCountryCode + ":" + g.missing.join(","))
      .join("|"),
  );

  // Dismissed per signature, persisted for the session so a fresh set of gaps
  // surfaces the banner again.
  let dismissedFor = $state<string | null>(
    typeof sessionStorage !== "undefined"
      ? sessionStorage.getItem("ww_gaps_dismissed")
      : null,
  );

  const show = $derived(
    entriesStore.loaded && gaps.length > 0 && dismissedFor !== signature,
  );

  function dismiss() {
    dismissedFor = signature;
    if (typeof sessionStorage !== "undefined")
      sessionStorage.setItem("ww_gaps_dismissed", signature);
  }
</script>

{#if show}
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
      <path
        d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
      />
    </svg>

    <div class="flex-1 min-w-0">
      <p class="text-xs font-medium leading-tight" style="color: var(--app-fg)">
        {$t("sync.gaps_title")}
      </p>
      <p class="text-[11px] leading-tight mt-0.5" style="color: var(--app-muted)">
        {$t("sync.gaps_banner_body", { values: { count: gaps.length } })}
      </p>
    </div>

    <button
      class="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
      style="background: var(--app-accent); color: #ffffff"
      onclick={() => goto("/sync")}
    >
      {$t("sync.gaps_fill")}
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
