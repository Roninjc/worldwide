<script lang="ts">
  import { tick } from "svelte";
  import { tweened } from "svelte/motion";
  import { cubicOut } from "svelte/easing";
  import { fade } from "svelte/transition";
  import { entriesStore } from "$lib/entriesStore.svelte";
  import { t, locale } from "svelte-i18n";
  import { getCountryName } from "$lib/countryName";
  import WorldMap from "$lib/components/WorldMap.svelte";
  import NoData from "$lib/components/NoData.svelte";
  import { flagEmoji } from "$lib/flag";
  import {
    getLongestStreak,
    computeCountryStats,
    countUniqueDays,
  } from "$lib/stats";
  import { computeStays, type Stay } from "$lib/stays";
  import { flagColor } from "$lib/flagColor";
  import BottomSheet from "$lib/components/BottomSheet.svelte";
  import FlagBleed from "$lib/components/FlagBleed.svelte";

  // ── Timeline data ──────────────────────────────────────────────────────
  const stays = $derived(computeStays(entriesStore.entries));

  // Starts at the first recorded day (not Jan 1 of that year), so the "all"
  // preset fits the data flush to the left edge with no empty months.
  const timelineStart = $derived.by(() => {
    if (!entriesStore.entries.length) return Date.now();
    const min = entriesStore.entries.reduce(
      (m, e) => Math.min(m, e.date),
      Infinity,
    );
    const d = new Date(min);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  });

  // Ends the day after the last recorded one, mirroring timelineStart.
  const timelineEnd = $derived.by(() => {
    if (!entriesStore.entries.length) return Date.now();
    const max = entriesStore.entries.reduce(
      (m, e) => Math.max(m, e.date),
      -Infinity,
    );
    const d = new Date(max);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  });

  const totalCalendarDays = $derived(
    (timelineEnd - timelineStart) / 86_400_000,
  );

  // ── Zoom / scroll state ────────────────────────────────────────────────
  let scrollEl = $state<HTMLDivElement | undefined>();
  let containerWidth = $state(0);
  let pxPerDay = $state(1);
  let scrollLeft = $state(0);

  // ── Stats scroll fades ────────────────────────────────────────────────
  let statsEl = $state<HTMLDivElement | undefined>();
  let showTopFade = $state(false);
  let showBottomFade = $state(false);
  // Measured height of the fixed timeline, so the scroll area can pad past it.
  let timelineHeight = $state(0);

  function updateFades() {
    if (!statsEl) return;
    showTopFade = statsEl.scrollTop > 4;
    showBottomFade =
      statsEl.scrollTop + statsEl.clientHeight < statsEl.scrollHeight - 4;
  }

  $effect(() => {
    if (!statsEl) return;
    updateFades();
    const ro = new ResizeObserver(updateFades);
    ro.observe(statsEl);
    return () => ro.disconnect();
  });

  const MIN_PPD = 0.3;
  const MAX_PPD = 80;

  const totalWidth = $derived(
    Math.max(Math.round(totalCalendarDays * pxPerDay), containerWidth),
  );

  // ── Timeline markers ───────────────────────────────────────────────────
  const monthLabels = $derived.by(() => {
    const currentLocale = $locale ?? "en";
    return Array.from({ length: 12 }, (_, i) =>
      new Date(2000, i, 1).toLocaleDateString(currentLocale, { month: "short" })
    );
  });

  // Year boundary gridlines (labels live in yearSegments below).
  const yearMarkers = $derived.by(() => {
    const out: { year: number; left: number }[] = [];
    const y0 = new Date(timelineStart).getFullYear();
    const y1 = new Date(timelineEnd).getFullYear();
    for (let y = y0; y <= y1; y++) {
      const ms = new Date(y, 0, 1).getTime();
      if (ms <= timelineStart || ms >= timelineEnd) continue;
      out.push({
        year: y,
        left: Math.round(((ms - timelineStart) / 86_400_000) * pxPerDay),
      });
    }
    return out;
  });

  // One segment per year, sized to its span within the timeline range. Each
  // holds a sticky year label that the next segment pushes out on scroll.
  const yearSegments = $derived.by(() => {
    const out: { year: number; width: number }[] = [];
    const y0 = new Date(timelineStart).getFullYear();
    const y1 = new Date(timelineEnd - 1).getFullYear();
    for (let y = y0; y <= y1; y++) {
      const startMs = Math.max(new Date(y, 0, 1).getTime(), timelineStart);
      const endMs = Math.min(new Date(y + 1, 0, 1).getTime(), timelineEnd);
      out.push({ year: y, width: ((endMs - startMs) / 86_400_000) * pxPerDay });
    }
    return out;
  });

  const monthMarkers = $derived.by(() => {
    if (pxPerDay < 1.2) return [];
    const out: { label: string; left: number }[] = [];
    const y0 = new Date(timelineStart).getFullYear();
    const y1 = new Date(timelineEnd).getFullYear();
    for (let y = y0; y <= y1; y++) {
      for (let m = 0; m < 12; m++) {
        const ms = new Date(y, m, 1).getTime();
        if (ms <= timelineStart || ms >= timelineEnd) continue;
        out.push({
          label: monthLabels[m],
          left: Math.round(((ms - timelineStart) / 86_400_000) * pxPerDay),
        });
      }
    }
    return out;
  });

  // Month counterpart of yearSegments, shown only when zoomed in enough.
  const monthSegments = $derived.by(() => {
    if (pxPerDay < 5) return [];
    const out: { key: string; label: string; width: number }[] = [];
    let y = new Date(timelineStart).getFullYear();
    let m = new Date(timelineStart).getMonth();
    while (new Date(y, m, 1).getTime() < timelineEnd) {
      const startMs = Math.max(new Date(y, m, 1).getTime(), timelineStart);
      const endMs = Math.min(new Date(y, m + 1, 1).getTime(), timelineEnd);
      out.push({
        key: `${y}-${m}`,
        label: monthLabels[m],
        width: ((endMs - startMs) / 86_400_000) * pxPerDay,
      });
      m++;
      if (m === 12) {
        m = 0;
        y++;
      }
    }
    return out;
  });

  function stayLeft(stay: Stay) {
    return Math.round(
      ((stay.startDate - timelineStart) / 86_400_000) * pxPerDay,
    );
  }
  function stayWidth(stay: Stay) {
    return Math.max(2, Math.round(stay.days * pxPerDay));
  }

  // ── Zoom ──────────────────────────────────────────────────────────────
  async function zoom(factor: number, pivotX = containerWidth / 2) {
    if (!scrollEl) return;
    const dayAtPivot = (scrollEl.scrollLeft + pivotX) / pxPerDay;
    pxPerDay = Math.max(MIN_PPD, Math.min(MAX_PPD, pxPerDay * factor));
    await tick();
    scrollEl.scrollLeft = dayAtPivot * pxPerDay - pivotX;
  }

  async function setPreset(days: number) {
    if (!scrollEl) return;
    const w = scrollEl.clientWidth;
    containerWidth = w;
    if (days <= 0) {
      pxPerDay = Math.max(MIN_PPD, w / totalCalendarDays);
      await tick();
      scrollEl.scrollLeft = 0;
    } else {
      const centerScroll = scrollEl.scrollLeft + w / 2;
      const dayAtCenter = centerScroll / pxPerDay;
      pxPerDay = w / days;
      await tick();
      scrollEl.scrollLeft = Math.max(0, dayAtCenter * pxPerDay - w / 2);
    }
  }

  function scrollToYear(year: number) {
    if (!scrollEl) return;
    const ms = new Date(year, 0, 1).getTime();
    scrollEl.scrollLeft = Math.max(
      0,
      ((ms - timelineStart) / 86_400_000) * pxPerDay,
    );
  }

  function onWheel(e: WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const rect = scrollEl!.getBoundingClientRect();
    zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - rect.left);
  }

  let pinchDist0 = 0;
  let dragX0 = 0;
  let dragScroll0 = 0;
  function getPinchDist(t: TouchList) {
    return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  }
  function onTouchStart(e: TouchEvent) {
    if (!scrollEl) return;
    if (e.touches.length === 2) {
      pinchDist0 = getPinchDist(e.touches);
    } else if (e.touches.length === 1) {
      dragX0 = e.touches[0].clientX;
      dragScroll0 = scrollEl.scrollLeft;
    }
  }
  function onTouchMove(e: TouchEvent) {
    if (!scrollEl) return;
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = getPinchDist(e.touches);
      const cx =
        (e.touches[0].clientX + e.touches[1].clientX) / 2 -
        scrollEl.getBoundingClientRect().left;
      zoom(dist / pinchDist0, cx);
      pinchDist0 = dist;
    } else if (e.touches.length === 1) {
      e.preventDefault();
      const dx = e.touches[0].clientX - dragX0;
      scrollEl.scrollLeft = dragScroll0 - dx;
    }
  }
  function onTouchEnd(e: TouchEvent) {
    if (!scrollEl) return;
    if (e.touches.length === 2) {
      pinchDist0 = getPinchDist(e.touches);
    } else if (e.touches.length === 1) {
      dragX0 = e.touches[0].clientX;
      dragScroll0 = scrollEl.scrollLeft;
    }
  }

  // ── Timeline tooltip ───────────────────────────────────────────────────
  let timelineTooltip = $state<{
    stay: Stay;
    x: number;
    y: number;
  } | null>(null);

  function onStayEnter(e: MouseEvent, stay: Stay) {
    timelineTooltip = { stay, x: e.clientX, y: e.clientY };
  }
  function onStayMove(e: MouseEvent) {
    if (timelineTooltip)
      timelineTooltip = { ...timelineTooltip, x: e.clientX, y: e.clientY };
  }

  function formatDate(ms: number) {
    return new Date(ms).toLocaleDateString($locale ?? "es-ES", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  // ── ResizeObserver ─────────────────────────────────────────────────────
  $effect(() => {
    if (!scrollEl) return;
    containerWidth = scrollEl.clientWidth;
    const ro = new ResizeObserver(() => {
      containerWidth = scrollEl!.clientWidth;
    });
    ro.observe(scrollEl);
    return () => ro.disconnect();
  });

  // ── Initial zoom + scroll ──────────────────────────────────────────────
  let initialScrollDone = false;
  $effect(() => {
    if (
      !entriesStore.loaded ||
      initialScrollDone ||
      !scrollEl ||
      containerWidth === 0
    )
      return;
    const _start = timelineStart;
    initialScrollDone = true;
    pxPerDay = containerWidth / 365;
    tick().then(() =>
      requestAnimationFrame(() => scrollToYear(new Date().getFullYear())),
    );
  });

  // ── Debounced visible window ───────────────────────────────────────────
  let visibleStartMs = $state(0);
  let visibleEndMs = $state(Number.MAX_SAFE_INTEGER);

  $effect(() => {
    const sl = scrollLeft;
    const cw = containerWidth;
    const ppd = pxPerDay;
    const ts = timelineStart;
    if (cw === 0 || ppd === 0) return;
    const start = ts + (sl / ppd) * 86_400_000;
    const end = ts + ((sl + cw) / ppd) * 86_400_000;
    const timer = setTimeout(() => {
      visibleStartMs = start;
      visibleEndMs = end;
    }, 150);
    return () => clearTimeout(timer);
  });

  // ── Filtered entries + derived stats ───────────────────────────────────
  const filteredEntries = $derived(
    entriesStore.entries.filter(
      (e) => e.date >= visibleStartMs && e.date <= visibleEndMs,
    ),
  );

  const filteredCountryStats = $derived(computeCountryStats(filteredEntries));
  const filteredDaysByCountry = $derived(
    new Map(filteredCountryStats.map((s) => [s.isoCountryCode, s.days])),
  );
  const filteredTotalDays = $derived(countUniqueDays(filteredEntries));
  const filteredTotalCountries = $derived(filteredCountryStats.length);
  const topCountries = $derived(filteredCountryStats.slice(0, 5));
  const coveragePercent = $derived(
    Math.round((filteredTotalCountries / 195) * 100),
  );
  const longestStreak = $derived(
    filteredEntries.length > 0 ? getLongestStreak(filteredEntries) : null,
  );

  // ── Chronological stays list (follows the visible window) ─────────────
  const filteredStays = $derived(
    stays.filter(
      (s) => s.startDate <= visibleEndMs && s.endDate >= visibleStartMs,
    ),
  );

  // Grouped by start year, in chronological order.
  const staysByYear = $derived.by(() => {
    const groups: { year: number; stays: Stay[] }[] = [];
    for (const stay of filteredStays) {
      const year = new Date(stay.startDate).getFullYear();
      const last = groups[groups.length - 1];
      if (last && last.year === year) last.stays.push(stay);
      else groups.push({ year, stays: [stay] });
    }
    return groups;
  });

  // ── Period label (shown when not viewing full range) ───────────────────
  const periodLabel = $derived.by(() => {
    if (visibleEndMs === Number.MAX_SAFE_INTEGER) return null;
    const almostStart =
      Math.abs(visibleStartMs - timelineStart) < 86_400_000 * 2;
    const almostEnd = Math.abs(visibleEndMs - timelineEnd) < 86_400_000 * 2;
    if (almostStart && almostEnd) return null;
    const y1 = new Date(visibleStartMs).getFullYear();
    const y2 = new Date(
      Math.min(visibleEndMs, timelineEnd - 86_400_000),
    ).getFullYear();
    return y1 === y2 ? `${y1}` : `${y1} – ${y2}`;
  });

  // ── Tweened stat numbers ───────────────────────────────────────────────
  const tweenedDays = tweened(0, { duration: 400, easing: cubicOut });
  const tweenedCountries = tweened(0, { duration: 400, easing: cubicOut });
  const tweenedCoverage = tweened(0, { duration: 400, easing: cubicOut });

  $effect(() => {
    tweenedDays.set(filteredTotalDays);
  });
  $effect(() => {
    tweenedCountries.set(filteredTotalCountries);
  });
  $effect(() => {
    tweenedCoverage.set(coveragePercent);
  });

  // ── Country selection ──────────────────────────────────────────────────
  let selectedCountry = $state<string | null>(null);
  let sheetOpen = $state(false);

  function openCountry(iso: string) {
    selectedCountry = iso;
    sheetOpen = true;
  }

  // ── Bottom sheet data ──────────────────────────────────────────────────
  const selectedStat = $derived(
    selectedCountry
      ? (filteredCountryStats.find(
          (s) => s.isoCountryCode === selectedCountry,
        ) ?? null)
      : null,
  );

  const selectedAllTimeStat = $derived(
    selectedCountry
      ? (entriesStore.countryStats.find(
          (s) => s.isoCountryCode === selectedCountry,
        ) ?? null)
      : null,
  );

  const selectedStays = $derived.by(() => {
    if (!selectedCountry) return [];
    return computeStays(
      filteredEntries.filter((e) => e.isoCountryCode === selectedCountry),
    );
  });

  function formatShortDate(ms: number) {
    return new Date(ms).toLocaleDateString($locale ?? "es-ES", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  // No year — the stays list group header already provides it.
  function formatDayMonth(ms: number) {
    return new Date(ms).toLocaleDateString($locale ?? "es-ES", {
      day: "numeric",
      month: "short",
    });
  }
</script>

<!-- Timeline tooltip (fixed so it's never clipped) -->
{#if timelineTooltip}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed z-50 pointer-events-none px-3 py-2 rounded-lg text-xs shadow-2xl whitespace-nowrap"
    style="
			left: {Math.min(timelineTooltip.x + 12, window.innerWidth - 210)}px;
			top: {timelineTooltip.y - 64}px;
			background: var(--glass-bg);
			border: 1px solid var(--glass-border);
			color: var(--app-fg);
			backdrop-filter: blur(16px);
			-webkit-backdrop-filter: blur(16px);
		"
  >
    <p class="font-semibold">
      {flagEmoji(timelineTooltip.stay.isoCountryCode)}
      {getCountryName(timelineTooltip.stay.isoCountryCode, $locale)}
    </p>
    <p class="mt-0.5" style="color: var(--app-muted)">
      {formatDate(timelineTooltip.stay.startDate)} → {formatDate(
        timelineTooltip.stay.endDate,
      )}
    </p>
    <p class="font-mono mt-0.5" style="color: var(--app-fg)">
      {$t("stats.day_count", {
        values: { count: timelineTooltip.stay.days },
      })}
    </p>
  </div>
{/if}

<div class="flex-1 flex flex-col overflow-hidden relative">
  {#if !entriesStore.loaded}
    <div
      class="flex-1 flex items-center justify-center text-sm"
      style="color: var(--app-muted)"
    >
      {$t("loading")}
    </div>
  {:else if entriesStore.totalDays === 0}
    <NoData />
  {:else}
    <!-- ── Scroll area: map + stats (timeline is fixed below) ─────────── -->
    <div
      class="flex-1 overflow-y-auto"
      bind:this={statsEl}
      onscroll={updateFades}
      style="padding-bottom: {timelineHeight}px"
    >
      <!-- Map (sized by SVG aspect ratio). The safe-area padding lives here,
           on the ocean background, so the notch area reads as map -->
      <div
        class="overflow-hidden relative"
        style="background: var(--map-bg); padding-top: env(safe-area-inset-top, 0px)"
      >
        <WorldMap daysByCountry={filteredDaysByCountry} />
        {#if periodLabel}
          <div
            class="absolute left-2 px-2.5 py-1.5 rounded-lg text-xs font-mono shadow-lg pointer-events-none"
            style="top: calc(env(safe-area-inset-top, 0px) + 0.5rem); background: var(--glass-bg); border: 1px solid var(--glass-border); color: var(--app-muted); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);"
            transition:fade={{ duration: 150 }}
          >
            {periodLabel}
          </div>
        {/if}
      </div>

      <!-- Legend strip -->
        <div
          class="flex items-center gap-2 px-4 pt-2.5 pb-1.5 flex-wrap border-b"
          style="border-color: var(--app-border)"
        >
          <span class="text-xs" style="color: var(--app-muted)"
            >{$t("legend.days")}</span
          >
          {#each [[$t("legend.never"), "no"], [$t("legend.low"), "low"], [$t("legend.mid"), "mid"], [$t("legend.high"), "high"], [$t("legend.top"), "top"]] as [label, level]}
            {@const color =
              level === "no"
                ? "var(--app-track)"
                : level === "low"
                  ? "rgba(186,230,253,0.8)"
                  : level === "mid"
                    ? "#7dd3fc"
                    : level === "high"
                      ? "#0284c7"
                      : "var(--app-accent)"}
            <span
              class="flex items-center gap-1 text-xs"
              style="color: var(--app-muted)"
            >
              <span
                class="inline-block w-3 h-3 rounded-sm"
                style="background:{color}"
              ></span>
              {label}
            </span>
          {/each}
        </div>

        <!-- Stats grid -->
        <div class="px-4 pt-3 pb-2">
          <div class="grid grid-cols-3 gap-3">
            <div
              class="rounded-xl p-3 text-center"
              style="background: var(--app-surface)"
            >
              <p
                class="text-2xl font-bold tabular-nums"
                style="color: var(--app-fg)"
              >
                {Math.round($tweenedCountries)}
              </p>
              <p class="text-xs mt-1" style="color: var(--app-muted)">
                {$t("stats.countries")}
              </p>
            </div>
            <div
              class="rounded-xl p-3 text-center"
              style="background: var(--app-surface)"
            >
              <p
                class="text-2xl font-bold tabular-nums"
                style="color: var(--app-fg)"
              >
                {Math.round($tweenedDays)}
              </p>
              <p class="text-xs mt-1" style="color: var(--app-muted)">
                {$t("stats.days")}
              </p>
            </div>
            <div
              class="rounded-xl p-3 text-center"
              style="background: var(--app-surface)"
            >
              <p
                class="text-2xl font-bold tabular-nums"
                style="color: var(--app-fg)"
              >
                {Math.round($tweenedCoverage)}%
              </p>
              <p class="text-xs mt-1" style="color: var(--app-muted)">
                {$t("stats.world_coverage")}
              </p>
            </div>
          </div>
        </div>

        {#if longestStreak && longestStreak.days > 1}
          <div
            class="mx-4 mb-3 rounded-xl px-4 py-3 flex items-center justify-between"
            style="background: var(--app-surface)"
          >
            <span class="text-sm" style="color: var(--app-muted)"
              >{$t("stats.longest_streak")}</span
            >
            <span class="font-medium text-sm" style="color: var(--app-fg)"
              >{$t("stats.streak_days", {
                values: {
                  days: longestStreak.days,
                  country: getCountryName(longestStreak.isoCountryCode, $locale),
                },
              })}</span
            >
          </div>
        {/if}

        <!-- Top countries -->
        <div class="px-4 pb-5">
          <p
            class="text-xs uppercase tracking-wider mb-3"
            style="color: var(--app-muted)"
          >
            {$t("stats.top_countries")}
          </p>
          <div class="space-y-2">
            {#each topCountries as stat (stat.isoCountryCode)}
              <button
                class="relative overflow-hidden w-full flex items-center rounded-xl px-3 py-2.5 text-left transition-opacity active:opacity-60"
                style="background: var(--app-surface)"
                transition:fade={{ duration: 200 }}
                onclick={() => openCountry(stat.isoCountryCode)}
              >
                <FlagBleed code={stat.isoCountryCode} opacity={0.4} width="35%" size="6rem" />
                <div class="relative flex-1 min-w-0 flex items-center gap-3 pl-10">
                  <span
                    class="flex-1 min-w-0 text-sm truncate"
                    style="color: var(--app-fg)">{getCountryName(stat.isoCountryCode, $locale)}</span
                  >
                  <span class="text-sm font-mono flex-shrink-0" style="color: var(--app-muted)"
                    >{stat.days}d</span
                  >
                  <div
                    class="w-16 h-1.5 rounded-full overflow-hidden flex-shrink-0"
                    style="background: var(--app-track)"
                  >
                    <div
                      class="h-full rounded-full transition-[width] duration-300"
                      style="width: {Math.round(
                        (stat.days / topCountries[0].days) * 100,
                      )}%; background: {flagColor(stat.isoCountryCode)}"
                    ></div>
                  </div>
                </div>
              </button>
            {/each}
          </div>

          {#if entriesStore.totalCountries > 5}
            <a
              href="/passport"
              class="block mt-4 text-center text-xs transition-opacity hover:opacity-60"
              style="color: var(--app-muted)"
            >
              {$t("stats.see_all_countries", {
                values: { count: entriesStore.totalCountries },
              })}
            </a>
          {/if}
        </div>

        <!-- Stays list -->
        {#if filteredStays.length > 0}
          <div class="px-4 pb-5">
            <p
              class="text-xs uppercase tracking-wider mb-3"
              style="color: var(--app-muted)"
            >
              {$t("stats.stays")}
            </p>
            <div class="space-y-4">
              {#each staysByYear as group (group.year)}
                <div>
                  <p
                    class="text-xs font-mono mb-1"
                    style="color: var(--app-muted); opacity: 0.7"
                  >
                    {group.year}
                  </p>
                  {#each group.stays as stay (stay.isoCountryCode + stay.startDate)}
                    <button
                      class="w-full flex items-center gap-3 py-2 border-b last:border-0 text-left transition-opacity active:opacity-60"
                      style="border-color: var(--app-border)"
                      onclick={() => openCountry(stay.isoCountryCode)}
                    >
                      <span class="text-lg leading-none flex-shrink-0"
                        >{flagEmoji(stay.isoCountryCode)}</span
                      >
                      <span
                        class="flex-1 min-w-0 text-sm truncate"
                        style="color: var(--app-fg)"
                        >{getCountryName(stay.isoCountryCode, $locale)}</span
                      >
                      <span
                        class="text-xs font-mono flex-shrink-0"
                        style="color: var(--app-muted)"
                        >{formatDayMonth(stay.startDate)}{stay.days > 1
                          ? ` → ${formatDayMonth(stay.endDate)}`
                          : ""}</span
                      >
                      <span
                        class="text-sm font-mono flex-shrink-0 w-9 text-right"
                        style="color: var(--app-muted)"
                        >{stay.days}d</span
                      >
                    </button>
                  {/each}
                </div>
              {/each}
            </div>
          </div>
        {/if}
    </div>
    <!-- end scroll area -->

    <!-- Scroll fades -->
    <div
      class="absolute inset-x-0 top-0 z-10 pointer-events-none h-8"
      style="background: linear-gradient(to bottom, var(--app-bg) 0%, transparent 100%); opacity: {showTopFade ? 1 : 0}; transition: opacity 0.3s ease;"
    ></div>
    <div
      class="absolute inset-x-0 z-10 pointer-events-none h-12"
      style="bottom: {timelineHeight}px; background: linear-gradient(to top, var(--app-bg) 0%, transparent 100%); opacity: {showBottomFade ? 1 : 0}; transition: opacity 0.3s ease;"
    ></div>

    <!-- ── Timeline zone: fixed just above the nav ────────────────────── -->
    <div
      class="fixed inset-x-0 bottom-0 z-20 border-t"
      bind:clientHeight={timelineHeight}
      style="border-color: var(--app-border); background: var(--app-bg); padding-bottom: var(--nav-clearance)"
    >
      <!-- Controls row: presets left, zoom right -->
      <div class="px-3 pt-2.5 pb-1 flex items-center justify-between gap-2">
        <div
          class="flex items-center rounded-lg overflow-hidden text-xs"
          style="border: 1px solid var(--app-border)"
        >
          {#each [[$t("timeline.preset_all"), -1], [$t("timeline.preset_1y"), 365], [$t("timeline.preset_6m"), 182], [$t("timeline.preset_1m"), 30]] as [label, days]}
            <button
              class="px-3.5 min-h-11 transition hover:opacity-70 active:opacity-60 border-r last:border-0"
              style="background: var(--app-surface-2); color: var(--app-muted); border-color: var(--app-border)"
              onclick={() => setPreset(Number(days))}>{label}</button
            >
          {/each}
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <button
            class="w-11 h-11 flex items-center justify-center rounded-xl text-lg leading-none transition hover:opacity-70 active:scale-95"
            style="background: var(--app-surface-2); border: 1px solid var(--app-border); color: var(--app-muted)"
            onclick={() => zoom(1 / 1.3)}>−</button
          >
          <button
            class="w-11 h-11 flex items-center justify-center rounded-xl text-lg leading-none transition hover:opacity-70 active:scale-95"
            style="background: var(--app-surface-2); border: 1px solid var(--app-border); color: var(--app-muted)"
            onclick={() => zoom(1.3)}>+</button
          >
        </div>
      </div>

      <!-- Scrollable timeline track -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="overflow-x-auto overflow-y-hidden select-none cursor-grab active:cursor-grabbing pb-2"
        bind:this={scrollEl}
        onscroll={() => {
          scrollLeft = scrollEl?.scrollLeft ?? 0;
        }}
        onwheel={onWheel}
        ontouchstart={onTouchStart}
        ontouchmove={onTouchMove}
        ontouchend={onTouchEnd}
        ontouchcancel={onTouchEnd}
        onmouseleave={() => {
          timelineTooltip = null;
        }}
        style="touch-action: none;"
      >
        <div class="relative" style="width: {totalWidth}px; height: 72px;">
          <!-- Year boundaries -->
          {#each yearMarkers as { year, left } (year)}
            <div
              class="absolute top-0 bottom-0 border-l"
              style="left: {left}px; border-color: var(--app-border); opacity: 0.8"
            ></div>
          {/each}

          <!-- Sticky year labels: pinned to the left edge while their year is
               in view, pushed out by the next year's segment -->
          <div class="absolute inset-x-0 top-0 flex pointer-events-none">
            {#each yearSegments as seg (seg.year)}
              <!-- Horizontal padding keeps a gap between the outgoing label
                   and the incoming one during the push -->
              <div
                class="flex-none"
                style="width: {seg.width}px; padding-left: 6px; padding-right: 14px"
              >
                {#if seg.width >= 48}
                  <span
                    class="sticky inline-block pt-1 text-xs font-bold select-none"
                    style="left: 6px; color: var(--app-muted)">{seg.year}</span
                  >
                {/if}
              </div>
            {/each}
          </div>

          <!-- Month gridlines -->
          {#each monthMarkers as { left }}
            <div
              class="absolute border-l pointer-events-none"
              style="left: {left}px; top: 18px; bottom: 12px; border-color: var(--app-border); opacity: 0.6"
            ></div>
          {/each}

          <!-- Sticky month labels, same push effect as the years -->
          {#if monthSegments.length}
            <div class="absolute inset-x-0 bottom-0 flex pointer-events-none">
              {#each monthSegments as seg (seg.key)}
                <div
                  class="flex-none"
                  style="width: {seg.width}px; padding-left: 6px; padding-right: 14px"
                >
                  {#if seg.width >= 36}
                    <span
                      class="sticky inline-block pb-0.5 text-[9px] select-none"
                      style="left: 6px; color: var(--app-muted); opacity: 0.6"
                      >{seg.label}</span
                    >
                  {/if}
                </div>
              {/each}
            </div>
          {/if}

          <!-- Stays track -->
          <div class="absolute left-0 right-0" style="top: 20px; height: 36px;">
            {#each stays as stay}
              {@const color = flagColor(stay.isoCountryCode)}
              {@const w = stayWidth(stay)}
              {@const l = stayLeft(stay)}
              <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
              <div
                class="absolute top-0 h-full flex items-center overflow-hidden
									hover:brightness-125 transition-[filter] cursor-pointer"
                style="left: {l}px; width: {w}px;
									background-color: {color}20; border-left: 2px solid {color};"
                onclick={() => openCountry(stay.isoCountryCode)}
                onmouseenter={(e) => onStayEnter(e, stay)}
                onmousemove={onStayMove}
                onmouseleave={() => {
                  timelineTooltip = null;
                }}
              >
                {#if w > 24}
                  <span
                    class="pl-1 text-[10px] leading-none truncate"
                    style="color: {color}"
                  >
                    {flagEmoji(
                      stay.isoCountryCode,
                    )}{#if w > 56}&nbsp;{getCountryName(stay.isoCountryCode, $locale)}{/if}
                  </span>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>

    <!-- ── Country bottom sheet ───────────────────────────────────────── -->
    <BottomSheet bind:open={sheetOpen}>
      {#snippet header()}
        {#if selectedStat}
          <div class="relative overflow-hidden -mx-5 px-5 py-1">
            <FlagBleed
              code={selectedStat.isoCountryCode}
              opacity={0.45}
              width="35%"
              size="7rem"
            />
            <div class="relative pl-10">
              <h2
                class="font-bold text-lg leading-tight truncate"
                style="color: var(--app-fg)"
              >
                {getCountryName(selectedStat.isoCountryCode, $locale)}
              </h2>
              {#if periodLabel}
                <p
                  class="text-xs font-mono mt-0.5"
                  style="color: var(--app-muted)"
                >
                  {periodLabel}
                </p>
              {/if}
            </div>
          </div>
        {/if}
      {/snippet}

      {#if selectedStat}
        <!-- Stats row -->
        <div class="flex gap-3 pb-4">
          <div
            class="flex-1 rounded-xl p-3 text-center"
            style="background: var(--app-surface)"
          >
            <p
              class="text-3xl font-black tabular-nums"
              style="color: var(--app-fg)"
            >
              {selectedStat.days}
            </p>
            <p class="text-xs mt-0.5" style="color: var(--app-muted)">
              {periodLabel
                ? $t("stats.days_in_period", { values: { period: periodLabel } })
                : $t("stats.days")}
            </p>
          </div>
          <div
            class="flex-1 rounded-xl p-3 text-center"
            style="background: var(--app-surface)"
          >
            <p
              class="text-3xl font-black tabular-nums"
              style="color: var(--app-fg)"
            >
              {selectedStays.length}
            </p>
            <p class="text-xs mt-0.5" style="color: var(--app-muted)">
              {$t("stats.stay_count", {
                values: { count: selectedStays.length },
              })}
            </p>
          </div>
          {#if periodLabel && selectedAllTimeStat && selectedAllTimeStat.days !== selectedStat.days}
            <div
              class="flex-1 rounded-xl p-3 text-center"
              style="background: var(--app-surface); border: 1px solid var(--app-border)"
            >
              <p
                class="text-3xl font-black tabular-nums"
                style="color: var(--app-muted)"
              >
                {selectedAllTimeStat.days}
              </p>
              <p class="text-xs mt-0.5" style="color: var(--app-muted)">
                {$t("stats.days_total")}
              </p>
            </div>
          {/if}
        </div>

        {#if selectedStays.length > 0}
          <p
            class="text-xs uppercase tracking-wider mb-2"
            style="color: var(--app-muted)"
          >
            {$t("stats.stays")}
          </p>
          <div class="space-y-1.5 pb-2">
            {#each selectedStays as stay}
              <div
                class="flex items-center gap-3 py-2 border-b last:border-0"
                style="border-color: var(--app-border)"
              >
                <div class="flex-1 min-w-0">
                  <p class="text-sm" style="color: var(--app-fg)">
                    {formatShortDate(stay.startDate)}
                    {#if stay.days > 1}
                      <span class="mx-1" style="color: var(--app-muted)"
                        >→</span
                      >
                      {formatShortDate(stay.endDate)}
                    {/if}
                  </p>
                </div>
                <span
                  class="text-sm font-mono flex-shrink-0"
                  style="color: color-mix(in srgb, {flagColor(
                    selectedStat.isoCountryCode,
                  )} 45%, var(--app-fg))"
                  >{stay.days}d</span
                >
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </BottomSheet>
  {/if}
</div>
