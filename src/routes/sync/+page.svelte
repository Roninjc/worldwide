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
  import { flagEmoji } from "$lib/flag";
  import { getCountryName, getAllCountryNames } from "$lib/countryName";
  import QRCode from "qrcode";
  import type { LocationEntry } from "$lib/types";
  import type { Gap } from "$lib/gaps";

  // ── Gaps / manual fills ──────────────────────────────────────────────
  const allCountries = $derived(getAllCountryNames($locale));

  function gapDate(ms: number) {
    return new Date(ms).toLocaleDateString($locale ?? "en", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  // After any change to the filled set, publish it to the relay's patches
  // mailbox so Scriptable can merge it back into the yearly JSON (relay mode only).
  async function syncPatches() {
    if (syncStore.mode === "relay" && syncStore.relay) {
      patchesBusy = true;
      await pushPatchesToRelay(entriesStore.filledEntries);
      patchesDirty = true;
      // Give Cloudflare KV a moment to propagate before "apply" is allowed,
      // otherwise Scriptable may read a stale blob (transient decrypt error).
      await new Promise((r) => setTimeout(r, 1500));
      patchesBusy = false;
    }
  }

  // Force Scriptable to reconcile the repairs into the JSON now (relay mode).
  function applyOnDevice() {
    patchesDirty = false;
    openScriptableConfig("apply");
  }

  async function fillGap(gap: Gap) {
    await entriesStore.fillGap(gap);
    await syncPatches();
  }

  async function fillAllGaps() {
    await entriesStore.fillAllGaps();
    await syncPatches();
  }

  async function removeFilled(entry: LocationEntry) {
    await entriesStore.removeEntry(entry);
    await syncPatches();
  }

  async function changeCountry(entry: LocationEntry, code: string) {
    if (!code || code === entry.isoCountryCode) return;
    await entriesStore.changeEntryCountry(
      entry,
      code,
      getCountryName(code, $locale),
    );
    await syncPatches();
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
  // True when repairs changed but haven't been applied on the iPhone yet.
  let patchesDirty = $state(false);
  // True while pushing patches + waiting for KV to settle (blocks "apply").
  let patchesBusy = $state(false);
  // Confirmation gate before the destructive relay→manual switch.
  let confirmDisable = $state(false);

  function requestMode(mode: SyncMode) {
    if (mode === syncStore.mode) return;
    // Switching relay → manual tears down the relay: confirm first.
    if (mode === "manual" && syncStore.relay) {
      confirmDisable = true;
      return;
    }
    syncStore.mode = mode;
    relayMsg = null;
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

      <!-- Segmented control -->
      <div
        class="flex rounded-lg overflow-hidden text-sm"
        style="border: 1px solid var(--app-border)"
      >
        {#each [["manual", $t("sync.mode_manual")], ["relay", $t("sync.mode_relay")]] as [value, label]}
          {@const active = syncStore.mode === value}
          <button
            class="flex-1 py-2 transition-colors"
            style="background: {active
              ? 'var(--app-accent)'
              : 'var(--app-surface-2)'}; color: {active
              ? '#ffffff'
              : 'var(--app-muted)'}"
            onclick={() => requestMode(value as SyncMode)}>{label}</button
          >
        {/each}
      </div>

      {#if syncStore.mode === "manual"}
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

          <!-- Restore from a previously saved backup config -->
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

          <!-- Backup: the only copy of the passphrase the user can keep -->
          <div
            class="rounded-lg p-3 space-y-2"
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
              class="w-full py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
              style="background: var(--app-accent); color: #ffffff"
              >{copied
                ? $t("sync.copied")
                : $t("sync.relay_backup_copy")}</button
            >
          </div>

          <div class="flex gap-2">
            <button
              onclick={syncNow}
              disabled={syncing}
              class="flex-1 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
              style="background: var(--app-surface-2); color: var(--app-fg); border: 1px solid var(--app-border)"
              >{syncing
                ? $t("sync.importing")
                : $t("sync.relay_sync_now")}</button
            >
            <button
              onclick={reconfigureScriptable}
              class="flex-1 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
              style="background: var(--app-surface-2); color: var(--app-fg); border: 1px solid var(--app-border)"
              >{$t("sync.relay_reconfigure")}</button
            >
          </div>

          <!-- Apply repairs to the iPhone JSON. Always available here (even at
               zero repairs) so a "delete all" can be committed too. Disabled
               while a patch push is still settling on the relay. -->
          <button
            onclick={applyOnDevice}
            disabled={patchesBusy}
            class="w-full py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-60"
            style="background: {patchesDirty && !patchesBusy
              ? 'var(--app-accent)'
              : 'var(--app-surface-2)'}; color: {patchesDirty && !patchesBusy
              ? '#ffffff'
              : 'var(--app-fg)'}; border: 1px solid {patchesDirty && !patchesBusy
              ? 'var(--app-accent)'
              : 'var(--app-border)'}"
            >{patchesBusy
              ? $t("sync.patches_preparing")
              : $t("sync.patches_apply")}</button
          >
          <p class="text-[11px]" style="color: var(--app-muted); opacity: 0.7">
            {patchesBusy
              ? $t("sync.patches_preparing_hint")
              : patchesDirty
                ? $t("sync.patches_unsaved")
                : $t("sync.patches_apply_hint")}
          </p>
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

    <!-- ── Data repairs: gaps + manual fills, unified ─────────────────── -->
    {#if entriesStore.gaps.length > 0 || entriesStore.filledEntries.length > 0}
      <section
        class="rounded-2xl p-5 space-y-5"
        style="background: var(--app-surface)"
        transition:slide={{ duration: 260, easing: cubicOut }}
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
            <path
              d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
            />
          </svg>
          <h2 class="text-sm font-semibold" style="color: var(--app-fg)">
            {$t("sync.repairs_title")}
          </h2>
        </div>

        <!-- Gaps to fill -->
        {#if entriesStore.gaps.length > 0}
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
                  class="flex items-center gap-3 text-sm rounded-xl px-3 py-2"
                  style="background: var(--app-surface-2)"
                  animate:flip={{ duration: 250 }}
                  transition:slide={{ duration: 200, easing: cubicOut }}
                >
                  <span class="text-lg leading-none"
                    >{flagEmoji(gap.isoCountryCode)}</span
                  >
                  <div class="flex-1 min-w-0">
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

        <!-- Repairs made (collapsible) -->
        {#if entriesStore.filledEntries.length > 0}
          <div class="space-y-3" transition:slide={{ duration: 240, easing: cubicOut }}>
            {#if entriesStore.gaps.length > 0}
              <div class="border-t" style="border-color: var(--app-border)"></div>
            {/if}

            <details>
              <summary
                class="flex items-center gap-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden"
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
                  style="color: var(--app-muted); opacity: 0.6">▾</span
                >
              </summary>

              <div class="pt-3 space-y-3">
                <p class="text-xs" style="color: var(--app-muted)">
                  {$t("sync.filled_desc")}
                </p>
                <div class="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {#each entriesStore.filledEntries as entry (entry.isoCountryCode + "_" + entry.date)}
                    <div
                      class="flex items-center gap-2 text-sm"
                      animate:flip={{ duration: 250 }}
                      transition:slide={{ duration: 200, easing: cubicOut }}
                    >
                      <span class="text-lg leading-none"
                        >{flagEmoji(entry.isoCountryCode)}</span
                      >
                      <span
                        class="text-xs w-24 flex-shrink-0"
                        style="color: var(--app-muted)">{gapDate(entry.date)}</span
                      >
                      <select
                        value={entry.isoCountryCode}
                        onchange={(e) => changeCountry(entry, e.currentTarget.value)}
                        class="flex-1 min-w-0 rounded-lg px-2 py-1.5 text-xs"
                        style="background: var(--app-surface-2); color: var(--app-fg); border: 1px solid var(--app-border)"
                      >
                        {#each allCountries as c}
                          <option value={c.code}>{c.name}</option>
                        {/each}
                      </select>
                      <button
                        onclick={() => removeFilled(entry)}
                        aria-label={$t("sync.filled_remove")}
                        class="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-opacity hover:opacity-70"
                        style="background: var(--app-surface-2); color: var(--err-text); border: 1px solid var(--app-border)"
                      >
                        <svg
                          class="w-4 h-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        >
                          <path d="M3 6h18" />
                          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <path d="M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6" />
                        </svg>
                      </button>
                    </div>
                  {/each}
                </div>
              </div>
            </details>

            {#if syncStore.mode === "manual"}
              <!-- Server-less apply (4a): tap on this device, or QR for another one -->
              <div
                class="pt-3 space-y-3 border-t"
                style="border-color: var(--app-border)"
              >
                <p class="text-xs" style="color: var(--app-muted)">
                  {$t("sync.patches_local_hint")}
                </p>
                <div class="flex gap-2">
                  <button
                    onclick={applyPatchesInline}
                    class="flex-1 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                    style="background: var(--app-accent); color: #ffffff"
                    >{$t("sync.patches_apply")}</button
                  >
                  <button
                    onclick={() => (showQr = !showQr)}
                    class="flex-1 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                    style="background: var(--app-surface-2); color: var(--app-fg); border: 1px solid var(--app-border)"
                    >{showQr
                      ? $t("sync.patches_qr_hide")
                      : $t("sync.patches_qr_show")}</button
                  >
                </div>

                {#if showQr}
                  {#if qrError}
                    <p
                      class="text-xs"
                      style="color: var(--err-text)"
                      transition:slide={{ duration: 200 }}
                    >
                      {$t("sync.patches_qr_toobig")}
                    </p>
                  {:else}
                    <div
                      class="flex flex-col items-center gap-2 py-1"
                      transition:slide={{ duration: 200 }}
                    >
                      <div class="rounded-xl bg-white p-2">
                        <img src={qrDataUrl} alt="QR" class="w-44 h-44 block" />
                      </div>
                      <p
                        class="text-[11px] text-center max-w-xs"
                        style="color: var(--app-muted)"
                      >
                        {$t("sync.patches_qr_hint")}
                      </p>
                    </div>
                  {/if}
                {/if}
              </div>
            {/if}
          </div>
        {/if}
      </section>
    {/if}

    <p
      class="text-center text-[11px] pt-2"
      style="color: var(--app-muted); opacity: 0.6"
    >
      worldwide · {__APP_VERSION__}
    </p>
  </div>
</div>

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
