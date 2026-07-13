<script lang="ts">
  import { onMount } from "svelte";
  import { slide } from "svelte/transition";
  import { flip } from "svelte/animate";
  import { cubicOut } from "svelte/easing";
  import { page } from "$app/stores";
  import { entriesStore } from "$lib/entriesStore.svelte";
  import { syncStore, type SyncMode } from "$lib/syncStore.svelte";
  import { relativeTime } from "$lib/time";
  import { generateRelayId, generatePassphrase } from "$lib/crypto";
  import { syncFromRelay, deleteFromRelay, pushPatchesToRelay } from "$lib/sync";
  import { t, locale } from "svelte-i18n";
  import { consumePendingFiles } from "$lib/pendingShare";
  import { getCountryName, getAllCountryNames } from "$lib/countryName";
  import QRCode from "qrcode";
  import SegmentedControl from "$lib/components/SegmentedControl.svelte";
  import BottomSheet from "$lib/components/BottomSheet.svelte";
  import Modal from "$lib/components/Modal.svelte";
  import FlagBleed from "$lib/components/FlagBleed.svelte";
  import type { LocationEntry } from "$lib/types";
  import type { Gap } from "$lib/gaps";

  // ── Gaps / manual fills ──────────────────────────────────────────────
  const allCountries = $derived(getAllCountryNames($locale));

  const hasGaps = $derived(entriesStore.gaps.length > 0);
  const hasFilled = $derived(entriesStore.filledEntries.length > 0);
  // Unapplied repair changes (kept visible even at zero repairs so a
  // "delete all" can still be committed to the device).
  const pendingChanges = $derived(syncStore.patchesPending);

  function gapDate(ms: number) {
    return new Date(ms).toLocaleDateString($locale ?? "en", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  // Whether the repair list is expanded. Collapsed by default, but auto-opens
  // right after a fill so the user can review before applying.
  let repairsOpen = $state(false);

  // Called after any repair change (fill / undo / edit). Marks the changes as
  // pending (so the "apply" controls stay visible until committed — even at
  // zero repairs), and in relay mode publishes the set to the patches mailbox.
  async function markRepairChange() {
    syncStore.patchesPending = true;
    if (syncStore.mode === "relay" && syncStore.relay) {
      patchesBusy = true;
      await pushPatchesToRelay(entriesStore.filledEntries);
      // Give Cloudflare KV a moment to propagate before "apply" is allowed,
      // otherwise Scriptable may read a stale blob (transient decrypt error).
      await new Promise((r) => setTimeout(r, 1500));
      patchesBusy = false;
    }
  }

  // Relay mode: force Scriptable to pull + reconcile the patches now.
  function applyOnDevice() {
    syncStore.patchesPending = false;
    openScriptableConfig("apply");
  }

  async function fillGap(gap: Gap) {
    await entriesStore.fillGap(gap);
    repairsOpen = true;
    await markRepairChange();
  }

  async function fillAllGaps() {
    await entriesStore.fillAllGaps();
    repairsOpen = true;
    await markRepairChange();
  }

  async function removeFilled(entry: LocationEntry) {
    await entriesStore.removeEntry(entry);
    await markRepairChange();
  }

  async function changeCountry(entry: LocationEntry, code: string) {
    if (!code || code === entry.isoCountryCode) return;
    await entriesStore.changeEntryCountry(
      entry,
      code,
      getCountryName(code, $locale),
    );
    await markRepairChange();
  }

  let isDragging = $state(false);
  let importing = $state(false);
  let result = $state<{ imported: number; total: number } | null>(null);
  let error = $state<string | null>(null);

  // ── Encrypted relay (automatic mode) ─────────────────────────────────
  const SCRIPT_NAME = "WorldwideConfig";

  let relayUrl = $state(syncStore.relay?.url ?? "");
  let restoreText = $state("");
  let syncing = $state(false);
  let copied = $state(false);
  let relayMsg = $state<{ kind: "ok" | "err"; text: string } | null>(null);
  // True while pushing patches + waiting for KV to settle (blocks "apply").
  let patchesBusy = $state(false);
  // Confirmation gate before the destructive relay→manual switch.
  let confirmDisable = $state(false);

  // Bottom sheets for the denser flows.
  let relaySheetOpen = $state(false);
  let repairsSheetOpen = $state(false);

  // ── Swipe-to-delete for repaired days ────────────────────────────────
  // Only one card is dragged at a time. `touch-action: pan-y` on the card lets
  // vertical scroll through while we own horizontal drags.
  let swipeKey = $state<string | null>(null);
  let swipeDX = $state(0);
  let swiping = $state(false);
  let swStartX = 0;
  let swStartY = 0;
  let swDecided = false;
  let swHorizontal = false;
  let swEntry: LocationEntry | null = null;

  function keyOf(e: LocationEntry) {
    return e.isoCountryCode + "_" + e.date;
  }
  function swipeStart(ev: PointerEvent, entry: LocationEntry) {
    swStartX = ev.clientX;
    swStartY = ev.clientY;
    swDecided = false;
    swHorizontal = false;
    swiping = false;
    swEntry = entry;
    swipeKey = keyOf(entry);
    swipeDX = 0;
  }
  function swipeMove(ev: PointerEvent) {
    if (swipeKey === null) return;
    const dx = ev.clientX - swStartX;
    const dy = ev.clientY - swStartY;
    if (!swDecided) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      swDecided = true;
      swHorizontal = Math.abs(dx) > Math.abs(dy);
      if (!swHorizontal) {
        swipeKey = null;
        return;
      }
      swiping = true;
      (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
    }
    if (swHorizontal) swipeDX = Math.max(-110, Math.min(0, dx));
  }
  function swipeEnd() {
    const entry = swEntry;
    const shouldDelete = swiping && entry && swipeDX < -64;
    swiping = false;
    swipeKey = null;
    swipeDX = 0;
    swEntry = null;
    swDecided = false;
    if (shouldDelete && entry) removeFilled(entry);
  }

  // The segmented control reflects the *intended* mode (`modeSel`). The effective
  // `syncStore.mode` only becomes "relay" once the relay is actually configured —
  // until then the app keeps behaving as manual, so a half-set-up automatic mode
  // never leaves the user without working manual controls.
  let modeSel = $state<SyncMode>(syncStore.relay ? "relay" : "manual");

  function onModeChange(v: string) {
    relayMsg = null;
    if (v === "relay") {
      // Reveal the relay setup. Only switch the effective mode if it's already
      // configured; otherwise stay effectively manual until activation completes.
      if (syncStore.relay) {
        syncStore.mode = "relay";
        markRepairChange();
      }
    } else {
      // Back to manual. Tearing down a configured relay is destructive → confirm.
      if (syncStore.relay) {
        confirmDisable = true;
        modeSel = "relay"; // keep the tab on relay until the user confirms
      } else {
        syncStore.mode = "manual";
      }
    }
  }

  async function confirmDisableRelay() {
    confirmDisable = false;
    await deactivateRelay();
  }

  // Same-device handoff: opening this URL switches to Scriptable, which writes
  // or clears the relay keys in its Keychain. No manual entry on that side.
  function openScriptableConfig(
    action: "set" | "clear" | "apply",
    params: Record<string, string> = {},
  ) {
    const qs = new URLSearchParams({ action, ...params }).toString();
    window.location.href = `scriptable:///run/${SCRIPT_NAME}?${qs}`;
  }

  // ── Server-less apply (4a): the fills travel inline via a scriptable:// deep
  // link — tapped on the same device, or scanned as a QR from another one. ──
  let showQr = $state(false);
  let qrDataUrl = $state("");
  let qrError = $state(false);

  function patchDeepLink(): string {
    const data = JSON.stringify(
      entriesStore.filledEntries.map((e) => ({
        i: e.isoCountryCode,
        d: e.date,
        c: e.country,
      })),
    );
    const qs = new URLSearchParams({ action: "patch", data }).toString();
    return `scriptable:///run/${SCRIPT_NAME}?${qs}`;
  }

  function applyPatchesInline() {
    // Optimistic: assume the deep link applies on this device.
    syncStore.patchesPending = false;
    window.location.href = patchDeepLink();
  }

  // Regenerate the QR whenever it's shown and the repair set changes.
  $effect(() => {
    if (!showQr) return;
    const link = patchDeepLink();
    QRCode.toDataURL(link, {
      margin: 1,
      width: 320,
      errorCorrectionLevel: "L",
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((url) => {
        qrDataUrl = url;
        qrError = false;
      })
      .catch(() => {
        qrDataUrl = "";
        qrError = true;
      });
  });

  async function activateRelay() {
    relayMsg = null;
    const url = relayUrl.trim();
    if (!url) {
      relayMsg = { kind: "err", text: $t("sync.relay_need_url") };
      return;
    }
    // The app owns the credentials: it mints the id + passphrase and hands
    // them to Scriptable via the deep link. The user backs them up (below).
    const id = generateRelayId();
    const pass = generatePassphrase();
    syncStore.setRelay({ url, id, pass });
    syncStore.mode = "relay";
    modeSel = "relay";
    // Seed the new mailbox with any repairs already made, so the first device
    // sync reconciles to what the PWA shows instead of an empty set.
    if (entriesStore.filledEntries.length > 0) {
      await pushPatchesToRelay(entriesStore.filledEntries);
      syncStore.patchesPending = true;
    }
    relayMsg = { kind: "ok", text: $t("sync.relay_activated_hint") };
    openScriptableConfig("set", { url, id, pass });
  }

  function reconfigureScriptable() {
    if (!syncStore.relay) return;
    const { url, id, pass } = syncStore.relay;
    openScriptableConfig("set", { url, id, pass });
  }

  async function syncNow() {
    if (!syncStore.relay) return;
    syncing = true;
    relayMsg = null;
    const r = await syncFromRelay();
    syncing = false;

    if (r.ok) {
      await entriesStore.load();
      if (r.empty) relayMsg = { kind: "ok", text: $t("sync.relay_empty") };
      else if (r.imported > 0)
        relayMsg = {
          kind: "ok",
          text: $t("sync.import_new_days", { values: { imported: r.imported } }),
        };
      else relayMsg = { kind: "ok", text: $t("sync.up_to_date") };
    } else if (r.reason === "decrypt") {
      relayMsg = { kind: "err", text: $t("sync.relay_err_decrypt") };
    } else if (r.reason === "network") {
      relayMsg = { kind: "err", text: $t("sync.relay_err_network") };
    } else if (r.reason !== "not-configured") {
      relayMsg = { kind: "err", text: $t("sync.error_processing") };
    }
  }

  async function deactivateRelay() {
    const cfg = syncStore.relay;
    // Delete the blob first (needs the config), then drop local state, then
    // tell Scriptable to forget its keys (this last step navigates away).
    if (cfg) await deleteFromRelay(cfg);
    syncStore.setRelay(null);
    syncStore.mode = "manual";
    modeSel = "manual";
    relayMsg = null;
    if (cfg) openScriptableConfig("clear");
  }

  async function restoreRelay() {
    relayMsg = null;
    let cfg: { url?: string; id?: string; pass?: string } | null = null;
    try {
      cfg = JSON.parse(restoreText.trim());
    } catch {
      cfg = null;
    }
    if (!cfg || !cfg.url || !cfg.id || !cfg.pass) {
      relayMsg = { kind: "err", text: $t("sync.relay_restore_bad") };
      return;
    }
    syncStore.setRelay({ url: cfg.url, id: cfg.id, pass: cfg.pass });
    syncStore.mode = "relay";
    modeSel = "relay";
    relayUrl = cfg.url;
    restoreText = "";
    await syncNow();
  }

  async function copyBackup() {
    if (!syncStore.relay) return;
    const cfg = JSON.stringify({
      url: syncStore.relay.url,
      id: syncStore.relay.id,
      pass: syncStore.relay.pass,
    });
    try {
      await navigator.clipboard.writeText(cfg);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      /* clipboard blocked; ignore */
    }
  }

  onMount(async () => {
    // Normalise a half-configured state: "relay" selected but never set up →
    // fall back to manual so behaviour stays consistent.
    if (syncStore.mode === "relay" && !syncStore.relay) syncStore.mode = "manual";

    if ($page.url.searchParams.get("shared") === "1") {
      const files = await consumePendingFiles();
      if (files.length > 0) await handleFiles(files);
    }
  });

  async function handleFiles(files: File[] | FileList) {
    const jsonFiles = Array.from(files).filter((f) => f.name.endsWith(".json"));
    if (jsonFiles.length === 0) {
      error = $t("sync.error_no_json");
      return;
    }

    importing = true;
    error = null;
    result = null;

    try {
      result = await entriesStore.importFiles(jsonFiles);
    } catch {
      error = $t("sync.error_processing");
    } finally {
      importing = false;
    }
  }

  function onFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files) handleFiles(input.files);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    if (e.dataTransfer?.files) handleFiles(e.dataTransfer.files);
  }
</script>

<div
  class="flex-1 overflow-y-auto"
  style="padding-bottom: var(--nav-clearance)"
>
  <div class="max-w-lg mx-auto px-4 py-8 space-y-8">
    <div>
      <h1 class="text-2xl font-bold" style="color: var(--app-fg)">
        {$t("sync.title")}
      </h1>
      <p class="text-sm mt-1" style="color: var(--app-muted)">
        {$t("sync.subtitle")}
      </p>
    </div>

    {#if importing}
      <div class="text-center py-8" style="color: var(--app-muted)">
        <svg
          class="w-6 h-6 mx-auto mb-2 animate-spin"
          style="color: var(--app-muted)"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        {$t("sync.importing")}
      </div>
    {:else}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        role="button"
        tabindex="0"
        class="rounded-xl p-10 text-center transition-all cursor-pointer"
        style="
				border: 2px dashed {isDragging ? 'var(--app-accent)' : 'var(--app-border)'};
				background: {isDragging ? 'var(--app-accent-subtle)' : 'transparent'};
			"
        ondragover={(e) => {
          e.preventDefault();
          isDragging = true;
        }}
        ondragleave={() => {
          isDragging = false;
        }}
        ondrop={onDrop}
        onclick={() => document.getElementById("file-input")?.click()}
        onkeydown={(e) =>
          e.key === "Enter" && document.getElementById("file-input")?.click()}
      >
        <svg
          class="w-8 h-8 mx-auto mb-3"
          style="color: {isDragging ? 'var(--app-accent)' : 'var(--app-muted)'}"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 3v12" />
          <path d="m8 11 4 4 4-4" />
          <path d="M20 16.5V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2.5" />
        </svg>
        <p class="font-medium" style="color: var(--app-fg)">
          {$t("sync.tap_to_select")}
        </p>
        <p class="text-sm mt-1" style="color: var(--app-muted)">
          {$t("sync.drag_files")}
        </p>
        <p class="text-xs mt-3" style="color: var(--app-muted); opacity: 0.5">
          locationsStore 2023.json, locationsStore 2024.json…
        </p>
      </div>

      <input
        id="file-input"
        type="file"
        accept=".json,application/json"
        multiple
        class="hidden"
        onchange={onFileInput}
      />
    {/if}

    {#if result}
      <div
        class="rounded-xl p-4"
        style="background: var(--ok-bg); border: 1px solid var(--ok-border)"
      >
        <p class="font-medium" style="color: var(--ok-title)">
          {result.imported > 0
            ? $t("sync.import_done")
            : $t("sync.up_to_date")}
        </p>
        {#if result.imported > 0}
          <p class="text-sm mt-1" style="color: var(--ok-body)">
            {$t("sync.import_new_days", {
              values: { imported: result.imported },
            })}
          </p>
        {/if}
      </div>
    {/if}

    {#if error}
      <div
        class="rounded-xl p-4"
        style="background: var(--err-bg); border: 1px solid var(--err-border)"
      >
        <p class="text-sm" style="color: var(--err-text)">{error}</p>
      </div>
    {/if}

    {#if entriesStore.totalDays > 0}
      <section
        class="rounded-2xl p-5 space-y-4"
        style="background: var(--app-surface)"
      >
        <div class="flex items-center gap-2.5">
          <svg
            class="w-[18px] h-[18px] flex-shrink-0"
            style="color: var(--app-muted)"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <ellipse cx="12" cy="5" rx="9" ry="3" />
            <path d="M3 5v14a9 3 0 0 0 18 0V5" />
            <path d="M3 12a9 3 0 0 0 18 0" />
          </svg>
          <h2 class="text-sm font-semibold" style="color: var(--app-fg)">
            {$t("sync.stored_data")}
          </h2>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div
            class="rounded-xl px-3 py-2.5"
            style="background: var(--app-surface-2)"
          >
            <p class="text-xl font-bold tabular-nums" style="color: var(--app-fg)">
              {entriesStore.entries.length}
            </p>
            <p class="text-[11px] mt-0.5" style="color: var(--app-muted)">
              {$t("sync.total_entries")}
            </p>
          </div>
          <div
            class="rounded-xl px-3 py-2.5"
            style="background: var(--app-surface-2)"
          >
            <p class="text-xl font-bold tabular-nums" style="color: var(--app-fg)">
              {entriesStore.totalDays}
            </p>
            <p class="text-[11px] mt-0.5" style="color: var(--app-muted)">
              {$t("sync.unique_days")}
            </p>
          </div>
        </div>

        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span style="color: var(--app-muted)"
              >{$t("sync.distinct_countries")}</span
            >
            <span class="font-mono" style="color: var(--app-fg)"
              >{entriesStore.totalCountries}</span
            >
          </div>
          <div class="flex justify-between gap-4">
            <span class="flex-shrink-0" style="color: var(--app-muted)"
              >{$t("sync.years")}</span
            >
            <span class="font-mono text-right" style="color: var(--app-fg)"
              >{entriesStore.years.join(", ")}</span
            >
          </div>
          {#if syncStore.lastImport}
            <div class="flex justify-between">
              <span style="color: var(--app-muted)">{$t("sync.last_import")}</span
              >
              <span style="color: var(--app-muted)"
                >{relativeTime(syncStore.lastImport, $locale)}</span
              >
            </div>
          {/if}
        </div>
      </section>
    {/if}

    <!-- ── Sync mode ──────────────────────────────────────────────────── -->
    <section
      class="rounded-2xl p-5 space-y-4"
      style="background: var(--app-surface)"
    >
      <div class="flex items-center gap-2.5">
        <svg
          class="w-[18px] h-[18px] flex-shrink-0"
          style="color: var(--app-muted)"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
          <path d="M8 16H3v5" />
        </svg>
        <h2 class="text-sm font-semibold" style="color: var(--app-fg)">
          {$t("sync.mode_title")}
        </h2>
      </div>

      <SegmentedControl
        options={[
          { value: "manual", label: $t("sync.mode_manual") },
          { value: "relay", label: $t("sync.mode_relay") },
        ]}
        bind:value={modeSel}
        onchange={onModeChange}
      />

      {#if modeSel === "manual"}
        <p class="text-xs" style="color: var(--app-muted)">
          {$t("sync.mode_manual_desc")}
        </p>
      {:else}
        <p class="text-xs" style="color: var(--app-muted)">
          {$t("sync.mode_relay_desc")}
        </p>

        {#if !syncStore.relay}
          <!-- Not configured: enter the relay URL, then hand off to Scriptable -->
          <label class="block space-y-1">
            <span class="text-xs" style="color: var(--app-muted)"
              >{$t("sync.relay_url")}</span
            >
            <input
              type="url"
              bind:value={relayUrl}
              placeholder="https://…workers.dev"
              autocapitalize="off"
              autocomplete="off"
              class="w-full rounded-lg px-3 py-2 text-sm"
              style="background: var(--app-surface); color: var(--app-fg); border: 1px solid var(--app-border)"
            />
          </label>

          <button
            onclick={activateRelay}
            class="w-full py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
            style="background: var(--app-accent); color: #ffffff"
            >{$t("sync.relay_activate")}</button
          >

          <details class="pt-1">
            <summary
              class="text-xs cursor-pointer"
              style="color: var(--app-muted)"
            >
              {$t("sync.relay_restore_title")}
            </summary>
            <div class="space-y-2 pt-2">
              <p
                class="text-[11px]"
                style="color: var(--app-muted); opacity: 0.7"
              >
                {$t("sync.relay_restore_hint")}
              </p>
              <textarea
                bind:value={restoreText}
                rows="2"
                placeholder={'{"url":"…","id":"…","pass":"…"}'}
                autocapitalize="off"
                autocomplete="off"
                class="w-full rounded-lg px-3 py-2 text-xs font-mono"
                style="background: var(--app-surface); color: var(--app-fg); border: 1px solid var(--app-border)"
              ></textarea>
              <button
                onclick={restoreRelay}
                class="w-full py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                style="background: var(--app-surface-2); color: var(--app-fg); border: 1px solid var(--app-border)"
                >{$t("sync.relay_restore_btn")}</button
              >
            </div>
          </details>
        {:else}
          <!-- Configured: id, backup, and management actions -->
          <div
            class="rounded-lg p-3 space-y-2"
            style="background: var(--app-surface)"
          >
            <div class="flex justify-between text-xs gap-2">
              <span class="flex-shrink-0" style="color: var(--app-muted)"
                >{$t("sync.relay_id")}</span
              >
              <span class="font-mono truncate" style="color: var(--app-fg)"
                >{syncStore.relay.id}</span
              >
            </div>
            {#if syncStore.lastSync}
              <div class="flex justify-between text-xs">
                <span style="color: var(--app-muted)"
                  >{$t("sync.last_sync")}</span
                >
                <span style="color: var(--app-muted)"
                  >{relativeTime(syncStore.lastSync, $locale)}</span
                >
              </div>
            {/if}
          </div>

          <div class="flex gap-2">
            <button
              onclick={syncNow}
              disabled={syncing}
              class="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-transform active:scale-95 disabled:opacity-50"
              style="background: var(--app-accent); color: #ffffff"
              >{syncing
                ? $t("sync.importing")
                : $t("sync.relay_sync_now")}</button
            >
            <button
              onclick={() => (relaySheetOpen = true)}
              class="w-11 flex-shrink-0 grid place-items-center rounded-xl transition-transform active:scale-95"
              style="background: var(--app-surface-2); color: var(--app-fg); border: 1px solid var(--app-border)"
              aria-label={$t("sync.relay_reconfigure")}
            >
              <svg class="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 7h-9" /><path d="M14 17H5" /><circle cx="17" cy="17" r="3" /><circle cx="7" cy="7" r="3" />
              </svg>
            </button>
          </div>
        {/if}

        {#if relayMsg}
          <p
            class="text-xs"
            style="color: {relayMsg.kind === 'ok'
              ? 'var(--ok-title)'
              : 'var(--err-text)'}"
          >
            {relayMsg.text}
          </p>
        {/if}
      {/if}
    </section>

    <!-- ── Data repairs: summary card → editor sheet ──────────────────── -->
    {#if hasGaps || hasFilled || pendingChanges}
      <button
        class="w-full flex items-center gap-3 rounded-2xl p-4 text-left transition-transform active:scale-[0.99]"
        style="background: var(--app-surface)"
        onclick={() => (repairsSheetOpen = true)}
        transition:slide={{ duration: 260, easing: cubicOut }}
      >
        <div
          class="w-9 h-9 grid place-items-center rounded-xl flex-shrink-0"
          style="background: var(--app-accent-subtle); color: var(--app-accent)"
        >
          <svg class="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-semibold" style="color: var(--app-fg)">
            {$t("sync.repairs_title")}
          </p>
          <p class="text-xs truncate" style="color: var(--app-muted)">
            {#if hasGaps}{$t("sync.gaps_title")} · {entriesStore.gaps.length}{/if}{#if hasGaps && hasFilled} · {/if}{#if hasFilled}{$t("sync.filled_title")} · {entriesStore.filledEntries.length}{/if}
          </p>
        </div>
        {#if pendingChanges}
          <span class="w-2 h-2 rounded-full flex-shrink-0" style="background: var(--app-accent)"></span>
        {/if}
        <svg class="w-4 h-4 flex-shrink-0" style="color: var(--app-muted); opacity: 0.6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>

      <BottomSheet bind:open={repairsSheetOpen}>
        {#snippet header()}
          <h2 class="text-lg font-bold" style="color: var(--app-fg)">
            {$t("sync.repairs_title")}
          </h2>
        {/snippet}

        <div class="space-y-5 pb-2">

        {#if hasGaps}
          <div class="space-y-3" transition:slide={{ duration: 240, easing: cubicOut }}>
            <div class="flex items-center gap-2">
              <p
                class="text-xs uppercase tracking-wider"
                style="color: var(--app-muted)"
              >
                {$t("sync.gaps_title")}
              </p>
              <span
                class="text-[11px] font-mono px-2 py-0.5 rounded-full"
                style="background: var(--app-accent-subtle); color: var(--app-accent)"
                >{entriesStore.gaps.length}</span
              >
            </div>
            <p class="text-xs" style="color: var(--app-muted)">
              {$t("sync.gaps_desc")}
            </p>

            <div class="space-y-2">
              {#each entriesStore.gaps as gap (gap.isoCountryCode + "_" + gap.prevDate)}
                <div
                  class="relative overflow-hidden flex items-center gap-3 text-sm rounded-xl px-3 py-2"
                  style="background: var(--app-surface-2)"
                  animate:flip={{ duration: 250 }}
                  transition:slide={{ duration: 200, easing: cubicOut }}
                >
                  <FlagBleed code={gap.isoCountryCode} />
                  <div class="relative flex-1 min-w-0 pl-[3.5rem]">
                    <p class="truncate" style="color: var(--app-fg)">
                      {getCountryName(gap.isoCountryCode, $locale)}
                    </p>
                    <p class="text-xs" style="color: var(--app-muted)">
                      {gapDate(gap.missing[0])}{#if gap.missing.length > 1}
                        → {gapDate(gap.missing[gap.missing.length - 1])}{/if}
                      · {gap.missing.length}d
                    </p>
                  </div>
                  <button
                    onclick={() => fillGap(gap)}
                    class="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                    style="background: var(--app-accent); color: #ffffff"
                    >{$t("sync.gaps_fill")}</button
                  >
                </div>
              {/each}
            </div>

            {#if entriesStore.gaps.length > 1}
              <button
                onclick={fillAllGaps}
                class="w-full py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                style="background: var(--app-surface-2); color: var(--app-fg); border: 1px solid var(--app-border)"
                >{$t("sync.gaps_fill_all")}</button
              >
            {/if}
          </div>
        {/if}

        <!-- Repairs area: pending changes (apply controls) above, list below -->
        {#if hasFilled || pendingChanges}
          <div class="space-y-4" transition:slide={{ duration: 240, easing: cubicOut }}>
            {#if hasGaps}
              <div class="border-t" style="border-color: var(--app-border)"></div>
            {/if}

            {#if syncStore.mode === "relay" && syncStore.relay}
              <!-- Relay apply: push already happened on change; this tells the
                   device to pull + reconcile now. Disabled while KV settles. -->
              <div class="space-y-2">
                <button
                  onclick={applyOnDevice}
                  disabled={patchesBusy}
                  class="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-transform active:scale-[0.98] disabled:opacity-60"
                  style="background: {pendingChanges && !patchesBusy
                    ? 'var(--app-accent)'
                    : 'var(--app-surface-2)'}; color: {pendingChanges &&
                  !patchesBusy
                    ? '#ffffff'
                    : 'var(--app-fg)'}; border: 1px solid {pendingChanges &&
                  !patchesBusy
                    ? 'var(--app-accent)'
                    : 'var(--app-border)'}"
                >
                  <svg class="w-[18px] h-[18px] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="5" y="2" width="14" height="20" rx="2.5" /><path d="M12 18h.01" />
                  </svg>
                  {patchesBusy ? $t("sync.patches_preparing") : $t("sync.patches_apply")}
                </button>
                <p
                  class="text-[11px]"
                  style="color: var(--app-muted); opacity: 0.7"
                >
                  {patchesBusy
                    ? $t("sync.patches_preparing_hint")
                    : pendingChanges
                      ? $t("sync.patches_unsaved")
                      : $t("sync.patches_apply_hint")}
                </p>
              </div>
            {:else}
              <!-- Server-less apply (4a): tap on this device, or QR for another.
                   Also the fallback while automatic mode is selected but not yet
                   configured — the app behaves as manual until setup completes. -->
              <div class="space-y-3">
                <p class="text-xs" style="color: var(--app-muted)">
                  {hasFilled
                    ? $t("sync.patches_local_hint")
                    : $t("sync.patches_clear_hint")}
                </p>
                <div class="space-y-2">
                  <button
                    onclick={applyPatchesInline}
                    class="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-transform active:scale-[0.98]"
                    style="background: var(--app-accent); color: #ffffff"
                  >
                    <svg class="w-[18px] h-[18px] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="5" y="2" width="14" height="20" rx="2.5" /><path d="M12 18h.01" />
                    </svg>
                    {$t("sync.patches_apply")}
                  </button>
                  <button
                    onclick={() => (showQr = true)}
                    class="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-transform active:scale-[0.98]"
                    style="background: var(--app-surface-2); color: var(--app-fg); border: 1px solid var(--app-border)"
                  >
                    <svg class="w-[18px] h-[18px] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                    </svg>
                    {$t("sync.patches_qr_show")}
                  </button>
                </div>
              </div>
            {/if}

            {#if hasFilled}
              <div class="space-y-3">
                <button
                  onclick={() => (repairsOpen = !repairsOpen)}
                  class="w-full flex items-center gap-2 transition-opacity hover:opacity-80"
                  aria-expanded={repairsOpen}
                >
                  <p
                    class="text-xs uppercase tracking-wider"
                    style="color: var(--app-muted)"
                  >
                    {$t("sync.filled_title")}
                  </p>
                  <span
                    class="text-[11px] font-mono px-2 py-0.5 rounded-full"
                    style="background: var(--app-surface-2); color: var(--app-muted)"
                    >{entriesStore.filledEntries.length}</span
                  >
                  <span
                    class="ml-auto text-xs"
                    style="color: var(--app-muted); opacity: 0.6; transition: transform 0.25s ease; transform: rotate({repairsOpen
                      ? 180
                      : 0}deg)">▾</span
                  >
                </button>

                {#if repairsOpen}
                  <div
                    class="space-y-3"
                    transition:slide={{ duration: 260, easing: cubicOut }}
                  >
                    <p class="text-xs" style="color: var(--app-muted)">
                      {$t("sync.filled_desc")}
                    </p>
                    <div class="space-y-2 max-h-80 overflow-y-auto pr-0.5">
                      {#each entriesStore.filledEntries as entry (entry.isoCountryCode + "_" + entry.date)}
                        <div
                          class="relative overflow-hidden rounded-xl"
                          animate:flip={{ duration: 250 }}
                          transition:slide={{ duration: 200, easing: cubicOut }}
                        >
                          <!-- Delete backing, revealed on left-swipe -->
                          <div
                            class="absolute inset-0 flex items-center justify-end pr-5 rounded-xl"
                            style="background: var(--err-bg); border: 1px solid var(--err-border); opacity: {swipeKey ===
                            entry.isoCountryCode + '_' + entry.date
                              ? 1
                              : 0}; transition: opacity 0.15s ease"
                          >
                            <svg class="w-5 h-5" style="color: var(--err-text)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                              <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6" />
                            </svg>
                          </div>
                          <!-- svelte-ignore a11y_no_static_element_interactions -->
                          <div
                            class="relative flex items-center gap-3 rounded-xl p-2.5"
                            style="background: var(--app-surface-2); touch-action: pan-y; transform: translateX({swipeKey ===
                            entry.isoCountryCode + '_' + entry.date
                              ? swipeDX
                              : 0}px); transition: {swiping &&
                            swipeKey === entry.isoCountryCode + '_' + entry.date
                              ? 'none'
                              : 'transform 0.28s cubic-bezier(0.34,1.4,0.64,1)'}"
                            onpointerdown={(e) => swipeStart(e, entry)}
                            onpointermove={swipeMove}
                            onpointerup={swipeEnd}
                            onpointercancel={swipeEnd}
                          >
                          <!-- Flag bleeding in from the left; fades as you swipe to cede room to the delete -->
                          <FlagBleed
                            code={entry.isoCountryCode}
                            opacity={0.5 *
                              (1 -
                                (swipeKey === entry.isoCountryCode + "_" + entry.date
                                  ? Math.min(1, Math.abs(swipeDX) / 110)
                                  : 0))}
                          />
                          <div class="relative flex-1 min-w-0 pl-[3.5rem] flex items-center gap-3 max-[360px]:flex-col max-[360px]:items-start max-[360px]:gap-0.5">
                            <!-- Date (fixed column so the country selectors line up) -->
                            <span
                              class="flex-shrink-0 w-[5.25rem] max-[360px]:w-auto text-xs tabular-nums whitespace-nowrap"
                              style="color: var(--app-muted)"
                            >
                              {gapDate(entry.date)}
                            </span>
                            <!-- Country selector: fills the space on the right, native picker overlaid -->
                            <div class="relative flex-1 min-w-0 max-[360px]:w-full flex items-center gap-1">
                              <span
                                class="flex-1 min-w-0 whitespace-nowrap overflow-hidden text-[15px] font-medium"
                                style="color: var(--app-fg); -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 1.4rem), transparent); mask-image: linear-gradient(to right, #000 calc(100% - 1.4rem), transparent)"
                              >
                                {getCountryName(entry.isoCountryCode, $locale)}
                              </span>
                              <svg class="w-3.5 h-3.5 flex-shrink-0" style="color: var(--app-muted)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="m6 9 6 6 6-6" />
                              </svg>
                              <select
                                value={entry.isoCountryCode}
                                onchange={(e) => changeCountry(entry, e.currentTarget.value)}
                                aria-label={getCountryName(entry.isoCountryCode, $locale)}
                                class="absolute inset-0 w-full opacity-0 cursor-pointer"
                              >
                                {#each allCountries as c}
                                  <option value={c.code}>{c.name}</option>
                                {/each}
                              </select>
                            </div>
                          </div>
                          </div>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
        </div>
      </BottomSheet>
    {/if}

    <p
      class="text-center text-[11px] pt-2"
      style="color: var(--app-muted); opacity: 0.6"
    >
      worldwide · {__APP_VERSION__}
    </p>
  </div>
</div>

<!-- ── Relay management sheet ─────────────────────────────────────────── -->
{#if syncStore.relay}
  <BottomSheet bind:open={relaySheetOpen}>
    {#snippet header()}
      <h2 class="text-lg font-bold" style="color: var(--app-fg)">
        {$t("sync.mode_relay")}
      </h2>
    {/snippet}

    <div class="space-y-4 pb-2">
      <div
        class="rounded-xl p-3 flex justify-between items-center text-xs gap-2"
        style="background: var(--app-surface)"
      >
        <span style="color: var(--app-muted)">{$t("sync.relay_id")}</span>
        <span class="font-mono truncate" style="color: var(--app-fg)">{syncStore.relay.id}</span>
      </div>

      <!-- Backup: the only copy of the passphrase the user can keep -->
      <div
        class="rounded-xl p-3 space-y-2"
        style="background: var(--ok-bg); border: 1px solid var(--ok-border)"
      >
        <p class="text-xs font-medium" style="color: var(--ok-title)">
          {$t("sync.relay_backup_title")}
        </p>
        <p class="text-[11px]" style="color: var(--ok-body)">
          {$t("sync.relay_backup_warn")}
        </p>
        <button
          onclick={copyBackup}
          class="w-full py-2 rounded-lg text-xs font-medium transition-transform active:scale-95"
          style="background: var(--app-accent); color: #ffffff"
          >{copied ? $t("sync.copied") : $t("sync.relay_backup_copy")}</button
        >
      </div>

      <button
        onclick={reconfigureScriptable}
        class="w-full py-2.5 rounded-xl text-sm font-medium transition-transform active:scale-95"
        style="background: var(--app-surface-2); color: var(--app-fg); border: 1px solid var(--app-border)"
        >{$t("sync.relay_reconfigure")}</button
      >

      <button
        onclick={() => {
          relaySheetOpen = false;
          onModeChange("manual");
        }}
        class="w-full py-2.5 rounded-xl text-sm font-medium transition-transform active:scale-95"
        style="background: transparent; color: var(--err-text); border: 1px solid var(--err-border)"
        >{$t("sync.relay_disable")}</button
      >
    </div>
  </BottomSheet>
{/if}

<!-- ── QR modal: tap the code to apply here, tap the blurred backdrop to close ── -->
<Modal bind:open={showQr}>
  {#if qrError}
    <div
      class="rounded-2xl p-5 max-w-xs text-center"
      style="background: var(--app-surface-2); border: 1px solid var(--app-border)"
    >
      <p class="text-sm" style="color: var(--err-text)">{$t("sync.patches_qr_toobig")}</p>
    </div>
  {:else}
    <div
      class="rounded-3xl p-5 flex flex-col items-center gap-3"
      style="background: var(--app-surface-2); border: 1px solid var(--app-border)"
    >
      <button
        onclick={applyPatchesInline}
        class="rounded-2xl bg-white p-3 transition-transform active:scale-95"
        aria-label={$t("sync.patches_apply")}
      >
        <img src={qrDataUrl} alt="QR" class="w-60 h-60 block" />
      </button>
      <p class="text-xs text-center max-w-[15rem]" style="color: var(--app-muted)">
        {$t("sync.patches_qr_hint")}
      </p>
    </div>
  {/if}
</Modal>

<!-- ── Confirm disabling automatic sync (destructive) ─────────────────── -->
{#if confirmDisable}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-6">
    <button
      class="absolute inset-0 cursor-default"
      style="background: rgba(0,0,0,0.55)"
      aria-label={$t("sync.cancel")}
      onclick={() => (confirmDisable = false)}
    ></button>
    <div
      class="relative w-full max-w-sm rounded-2xl p-5 space-y-4"
      style="background: var(--app-bg); border: 1px solid var(--app-border)"
    >
      <h3 class="text-base font-bold" style="color: var(--app-fg)">
        {$t("sync.disable_title")}
      </h3>
      <p class="text-sm" style="color: var(--app-muted)">
        {$t("sync.disable_body")}
      </p>
      <div class="flex gap-2 pt-1">
        <button
          onclick={() => (confirmDisable = false)}
          class="flex-1 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
          style="background: var(--app-surface-2); color: var(--app-fg); border: 1px solid var(--app-border)"
          >{$t("sync.cancel")}</button
        >
        <button
          onclick={confirmDisableRelay}
          class="flex-1 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-80"
          style="background: var(--err-text)">{$t("sync.disable_confirm")}</button
        >
      </div>
    </div>
  </div>
{/if}
