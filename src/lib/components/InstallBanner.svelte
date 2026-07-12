<script lang="ts">
  import { t } from "svelte-i18n";
  import { browser } from "$app/environment";

  // Dismissed permanently (per install), so it doesn't nag every visit. It also
  // disappears on its own once the PWA is installed (standalone display mode).
  const STORAGE_KEY = "ww_install_dismissed";

  let dismissed = $state(
    browser && localStorage.getItem(STORAGE_KEY) === "1",
  );

  const isInstalled = $derived(
    browser && window.matchMedia("(display-mode: standalone)").matches,
  );

  const show = $derived(browser && !isInstalled && !dismissed);

  function dismiss() {
    dismissed = true;
    if (browser) localStorage.setItem(STORAGE_KEY, "1");
  }
</script>

{#if show}
  <div
    class="mx-auto max-w-lg w-full flex items-start gap-3 rounded-xl px-3 py-2.5 pointer-events-auto"
    style="
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      box-shadow: var(--glass-shadow);
      backdrop-filter: blur(44px) saturate(220%);
      -webkit-backdrop-filter: blur(44px) saturate(220%);
    "
  >
    <svg
      class="w-[18px] h-[18px] flex-shrink-0 mt-0.5"
      style="color: var(--app-accent)"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <rect width="14" height="20" x="5" y="2" rx="2" />
      <path d="M12 7v6" />
      <path d="m9 11 3 3 3-3" />
    </svg>

    <div class="flex-1 min-w-0">
      <p class="text-xs font-medium leading-tight" style="color: var(--app-fg)">
        {$t("sync.pwa_title")}
      </p>
      <p class="text-[11px] leading-snug mt-0.5" style="color: var(--app-muted)">
        {@html $t("sync.pwa_body")}
      </p>
    </div>

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
