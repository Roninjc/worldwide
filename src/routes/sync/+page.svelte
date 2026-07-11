<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { browser } from "$app/environment";
  import { entriesStore } from "$lib/entriesStore.svelte";
  import { syncStore, type SyncMode } from "$lib/syncStore.svelte";
  import { relativeTime } from "$lib/time";
  import { generateRelayId, generatePassphrase } from "$lib/crypto";
  import { syncFromRelay, deleteFromRelay } from "$lib/sync";
  import { t, locale } from "svelte-i18n";
  import { consumePendingFiles } from "$lib/pendingShare";
  import { flagEmoji } from "$lib/flag";
  import { getCountryName, getAllCountryNames } from "$lib/countryName";
  import type { LocationEntry } from "$lib/types";

  // ── Gaps / manual fills ──────────────────────────────────────────────
  const allCountries = $derived(getAllCountryNames($locale));

  function gapDate(ms: number) {
    return new Date(ms).toLocaleDateString($locale ?? "en", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function changeCountry(entry: LocationEntry, code: string) {
    if (!code || code === entry.isoCountryCode) return;
    entriesStore.changeEntryCountry(entry, code, getCountryName(code, $locale));
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

  function setMode(mode: SyncMode) {
    syncStore.mode = mode;
    relayMsg = null;
  }

  // Same-device handoff: opening this URL switches to Scriptable, which writes
  // or clears the relay keys in its Keychain. No manual entry on that side.
  function openScriptableConfig(
    action: "set" | "clear",
    params: Record<string, string> = {},
  ) {
    const qs = new URLSearchParams({ action, ...params }).toString();
    window.location.href = `scriptable:///run/${SCRIPT_NAME}?${qs}`;
  }

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

  const isInstalled = $derived(
    browser && window.matchMedia("(display-mode: standalone)").matches,
  );

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

    {#if !isInstalled}
      <div
        class="rounded-xl p-4 space-y-2"
        style="background: var(--ok-bg); border: 1px solid var(--ok-border)"
      >
        <p class="font-medium text-sm" style="color: var(--ok-title)">
          {$t("sync.pwa_title")}
        </p>
        <p class="text-xs" style="color: var(--ok-body)">
          {$t("sync.pwa_body")}
        </p>
      </div>
    {/if}

    {#if importing}
      <div class="text-center py-8" style="color: var(--app-muted)">
        <p class="text-2xl mb-2">⏳</p>
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
        <p class="text-4xl mb-3">📂</p>
        <p class="font-medium" style="color: var(--app-fg)">
          {$t("sync.drag_files")}
        </p>
        <p class="text-sm mt-1" style="color: var(--app-muted)">
          {$t("sync.tap_to_select")}
        </p>
        <p class="text-xs mt-3" style="color: var(--app-muted); opacity: 0.5">
          locationsStore2023.json, locationsStore2024.json…
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
      <div
        class="rounded-xl p-4 space-y-3"
        style="border: 1px solid var(--app-border)"
      >
        <p
          class="text-xs uppercase tracking-wider"
          style="color: var(--app-muted)"
        >
          {$t("sync.stored_data")}
        </p>
        <div class="flex justify-between text-sm">
          <span style="color: var(--app-fg)">{$t("sync.total_entries")}</span>
          <span class="font-mono" style="color: var(--app-fg)"
            >{entriesStore.totalDays}</span
          >
        </div>
        <div class="flex justify-between text-sm">
          <span style="color: var(--app-fg)"
            >{$t("sync.distinct_countries")}</span
          >
          <span class="font-mono" style="color: var(--app-fg)"
            >{entriesStore.totalCountries}</span
          >
        </div>
        <div class="flex justify-between text-sm">
          <span style="color: var(--app-fg)">{$t("sync.years")}</span>
          <span class="font-mono" style="color: var(--app-fg)"
            >{entriesStore.years.join(", ")}</span
          >
        </div>
        {#if syncStore.lastImport}
          <div class="flex justify-between text-sm">
            <span style="color: var(--app-fg)">{$t("sync.last_import")}</span>
            <span style="color: var(--app-muted)"
              >{relativeTime(syncStore.lastImport, $locale)}</span
            >
          </div>
        {/if}
      </div>
    {/if}

    <!-- ── Gaps in the data ───────────────────────────────────────────── -->
    {#if entriesStore.gaps.length > 0}
      <div
        class="rounded-xl p-4 space-y-3"
        style="border: 1px solid var(--app-border)"
      >
        <div class="flex items-center justify-between gap-2">
          <p
            class="text-xs uppercase tracking-wider"
            style="color: var(--app-muted)"
          >
            {$t("sync.gaps_title")}
          </p>
          <span class="text-xs font-mono" style="color: var(--app-accent)"
            >{entriesStore.gaps.length}</span
          >
        </div>
        <p class="text-xs" style="color: var(--app-muted)">
          {$t("sync.gaps_desc")}
        </p>

        <div class="space-y-2">
          {#each entriesStore.gaps as gap (gap.isoCountryCode + "_" + gap.prevDate)}
            <div class="flex items-center gap-3 text-sm">
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
                onclick={() => entriesStore.fillGap(gap)}
                class="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                style="background: var(--app-accent); color: #ffffff"
                >{$t("sync.gaps_fill")}</button
              >
            </div>
          {/each}
        </div>

        {#if entriesStore.gaps.length > 1}
          <button
            onclick={() => entriesStore.fillAllGaps()}
            class="w-full py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
            style="background: var(--app-surface-2); color: var(--app-fg); border: 1px solid var(--app-border)"
            >{$t("sync.gaps_fill_all")}</button
          >
        {/if}
      </div>
    {/if}

    <!-- ── Manually filled days ───────────────────────────────────────── -->
    {#if entriesStore.filledEntries.length > 0}
      <div
        class="rounded-xl p-4 space-y-3"
        style="border: 1px solid var(--app-border)"
      >
        <p
          class="text-xs uppercase tracking-wider"
          style="color: var(--app-muted)"
        >
          {$t("sync.filled_title")}
        </p>
        <p class="text-xs" style="color: var(--app-muted)">
          {$t("sync.filled_desc")}
        </p>

        <div class="space-y-2">
          {#each entriesStore.filledEntries as entry (entry.isoCountryCode + "_" + entry.date)}
            <div class="flex items-center gap-2 text-sm">
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
                style="background: var(--app-surface); color: var(--app-fg); border: 1px solid var(--app-border)"
              >
                {#each allCountries as c}
                  <option value={c.code}>{c.name}</option>
                {/each}
              </select>
              <button
                onclick={() => entriesStore.removeEntry(entry)}
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
    {/if}

    <!-- ── Sync mode ──────────────────────────────────────────────────── -->
    <div
      class="rounded-xl p-4 space-y-4"
      style="border: 1px solid var(--app-border)"
    >
      <p
        class="text-xs uppercase tracking-wider"
        style="color: var(--app-muted)"
      >
        {$t("sync.mode_title")}
      </p>

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
            onclick={() => setMode(value as SyncMode)}>{label}</button
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

          <button
            onclick={deactivateRelay}
            class="text-xs transition-opacity hover:opacity-70"
            style="color: var(--err-text)">{$t("sync.relay_disable")}</button
          >
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
    </div>

    <p
      class="text-center text-[11px] pt-2"
      style="color: var(--app-muted); opacity: 0.6"
    >
      worldwide · {__APP_VERSION__}
    </p>
  </div>
</div>
