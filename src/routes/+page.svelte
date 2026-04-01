<script lang="ts">
  import { tick } from "svelte";
  import { tweened } from "svelte/motion";
  import { cubicOut } from "svelte/easing";
  import { fade, fly } from "svelte/transition";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { entriesStore } from "$lib/entriesStore.svelte";
  import { t } from "svelte-i18n";
  import WorldMap from "$lib/components/WorldMap.svelte";
  import { flagEmoji } from "$lib/flag";
  import {
    getLongestStreak,
    computeCountryStats,
    countUniqueDays,
  } from "$lib/stats";
  import { computeStays, buildColorMap, type Stay } from "$lib/stays";

  onMount(() => {
    if (entriesStore.loaded && entriesStore.totalDays === 0) {
      goto("/sync");
    }
  });

  // ── Timeline data ──────────────────────────────────────────────────────
  const stays = $derived(computeStays(entriesStore.entries));
  const colorMap = $derived(buildColorMap(entriesStore.entries));

  const timelineStart = $derived.by(() => {
    if (!entriesStore.entries.length) return Date.now();
    const min = entriesStore.entries.reduce(
      (m, e) => Math.min(m, e.date),
      Infinity,
    );
    return new Date(new Date(min).getFullYear(), 0, 1).getTime();
  });

  const timelineEnd = $derived.by(() => {
    if (!entriesStore.entries.length) return Date.now();
    const max = entriesStore.entries.reduce(
      (m, e) => Math.max(m, e.date),
      -Infinity,
    );
    const lastDataYear = new Date(max).getFullYear();
    const currentYear = new Date().getFullYear();
    const endYear = Math.min(lastDataYear, currentYear);
    return new Date(endYear + 1, 0, 1).getTime();
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
  const MONTH_LABELS = [
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
  ];

  const yearMarkers = $derived.by(() => {
    const out: { year: number; left: number }[] = [];
    const y0 = new Date(timelineStart).getFullYear();
    const y1 = new Date(timelineEnd).getFullYear();
    for (let y = y0; y < y1; y++) {
      out.push({
        year: y,
        left: Math.round(
          ((new Date(y, 0, 1).getTime() - timelineStart) / 86_400_000) *
            pxPerDay,
        ),
      });
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
          label: MONTH_LABELS[m],
          left: Math.round(((ms - timelineStart) / 86_400_000) * pxPerDay),
        });
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

  // ── Timeline tooltip ───────────────────────────────────────────────────
  let timelineTooltip = $state<{
    stay: Stay;
    color: string;
    x: number;
    y: number;
  } | null>(null);

  function onStayEnter(e: MouseEvent, stay: Stay) {
    timelineTooltip = {
      stay,
      color: colorMap.get(stay.isoCountryCode) ?? "#64748b",
      x: e.clientX,
      y: e.clientY,
    };
  }
  function onStayMove(e: MouseEvent) {
    if (timelineTooltip)
      timelineTooltip = { ...timelineTooltip, x: e.clientX, y: e.clientY };
  }

  function formatDate(ms: number) {
    return new Date(ms).toLocaleDateString("es-ES", {
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

  // ── Visible year label ─────────────────────────────────────────────────
  const visibleYear = $derived.by(() => {
    const ms =
      timelineStart +
      ((scrollLeft + containerWidth / 2) / pxPerDay) * 86_400_000;
    return new Date(ms).getFullYear();
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

  // ── Map API + country selection ────────────────────────────────────────
  let mapApi = $state<{
    zoomToVisited: () => void;
    resetZoom: () => void;
  } | null>(null);
  let selectedCountry = $state<string | null>(null);

  function onCountryClick(alpha2: string) {
    selectedCountry = alpha2 || null;
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

  // ── Swipe to dismiss ───────────────────────────────────────────────────
  let swipeStartY = 0;

  function onSheetTouchStart(e: TouchEvent) {
    swipeStartY = e.touches[0].clientY;
  }
  function onSheetTouchEnd(e: TouchEvent) {
    if (e.changedTouches[0].clientY - swipeStartY > 80) selectedCountry = null;
  }

  function formatShortDate(ms: number) {
    return new Date(ms).toLocaleDateString("es-ES", {
      day: "numeric",
      month: "short",
      year: "numeric",
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
      {timelineTooltip.stay.country}
    </p>
    <p class="mt-0.5" style="color: var(--app-muted)">
      {formatDate(timelineTooltip.stay.startDate)} → {formatDate(
        timelineTooltip.stay.endDate,
      )}
    </p>
    <p class="font-mono mt-0.5" style="color: var(--app-fg)">
      {timelineTooltip.stay.days} día{timelineTooltip.stay.days === 1
        ? ""
        : "s"}
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
    <div
      class="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <p class="text-5xl">🌍</p>
      <h2 class="text-xl font-bold" style="color: var(--app-fg)">
        {$t("empty.no_data")}
      </h2>
      <p class="text-sm" style="color: var(--app-muted)">
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
  {:else}
    <!-- ── Map zone (sized by SVG aspect ratio) ───────────────────────── -->
    <div
      class="flex-shrink-0 overflow-hidden relative"
      style="background: var(--map-bg)"
    >
      <WorldMap
        daysByCountry={filteredDaysByCountry}
        {onCountryClick}
        bind:api={mapApi}
      />
    </div>

    <!-- ── Stats zone (scrollable) ────────────────────────────────────── -->
    <div class="flex-1 min-h-0 relative">
      <!-- Top fade — visible when scrolled down -->
      <div
        class="absolute inset-x-0 top-0 z-10 pointer-events-none h-8"
        style="
          background: linear-gradient(to bottom, var(--app-bg) 0%, transparent 100%);
          opacity: {showTopFade ? 1 : 0};
          transition: opacity 0.3s ease;
        "
      ></div>

      <!-- Bottom fade — visible when more content below -->
      <div
        class="absolute inset-x-0 bottom-0 z-10 pointer-events-none h-12"
        style="
          background: linear-gradient(to top, var(--app-bg) 0%, transparent 100%);
          opacity: {showBottomFade ? 1 : 0};
          transition: opacity 0.3s ease;
        "
      ></div>

      <div
        class="absolute inset-0 overflow-y-auto"
        bind:this={statsEl}
        onscroll={updateFades}
      >
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
          {#if periodLabel}
            <p
              class="text-xs mb-2 font-mono tracking-wide"
              style="color: var(--app-accent); opacity: 0.75"
            >
              {periodLabel}
            </p>
          {/if}
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
                  country: longestStreak.country,
                },
              })}</span
            >
          </div>
        {/if}

        <!-- Top países -->
        <div class="px-4 pb-5">
          <p
            class="text-xs uppercase tracking-wider mb-3"
            style="color: var(--app-muted)"
          >
            {$t("stats.top_countries")}
          </p>
          <div class="space-y-2">
            {#each topCountries as stat, i (stat.isoCountryCode)}
              <div
                class="flex items-center gap-3"
                transition:fade={{ duration: 200 }}
              >
                <span
                  class="text-xs w-4 text-right"
                  style="color: var(--app-muted); opacity: 0.6">{i + 1}</span
                >
                <span class="text-xl leading-none"
                  >{flagEmoji(stat.isoCountryCode)}</span
                >
                <span
                  class="flex-1 text-sm truncate"
                  style="color: var(--app-fg)">{stat.country}</span
                >
                <span class="text-sm font-mono" style="color: var(--app-muted)"
                  >{stat.days}d</span
                >
                <div
                  class="w-16 h-1.5 rounded-full overflow-hidden"
                  style="background: var(--app-track)"
                >
                  <div
                    class="h-full rounded-full transition-[width] duration-300"
                    style="width: {Math.round(
                      (stat.days / topCountries[0].days) * 100,
                    )}%; background: var(--app-accent)"
                  ></div>
                </div>
              </div>
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
      </div>
      <!-- end inner scroll -->
    </div>
    <!-- end stats zone -->

    <!-- ── Timeline zone (always visible) ─────────────────────────────── -->
    <div
      class="flex-shrink-0 border-t"
      style="border-color: var(--app-border); background: var(--app-bg); padding-bottom: var(--nav-clearance)"
    >
      <!-- Controls row -->
      <div class="px-3 pt-2.5 pb-1 flex items-center justify-between gap-2">
        <!-- Year + period indicator -->
        <div class="flex items-center gap-1.5 min-w-0 text-xs">
          <span class="font-mono" style="color: var(--app-muted)"
            >{visibleYear}</span
          >
          {#if periodLabel}
            <span style="color: var(--app-accent); opacity: 0.5">·</span>
            <span
              class="font-mono truncate"
              style="color: var(--app-accent); opacity: 0.65"
              >{periodLabel}</span
            >
          {/if}
        </div>

        <!-- Preset + zoom buttons -->
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <div
            class="flex items-center rounded-lg overflow-hidden text-xs"
            style="border: 1px solid var(--app-border)"
          >
            {#each [["Todo", -1], ["1a", 365], ["6m", 182], ["1m", 30]] as [label, days]}
              <button
                class="px-2.5 py-1.5 transition-opacity hover:opacity-70 border-r last:border-0"
                style="background: var(--app-surface-2); color: var(--app-muted); border-color: var(--app-border)"
                onclick={() => setPreset(Number(days))}>{label}</button
              >
            {/each}
          </div>
          <button
            class="w-8 h-8 flex items-center justify-center rounded-lg text-lg leading-none transition-opacity hover:opacity-70"
            style="background: var(--app-surface-2); border: 1px solid var(--app-border); color: var(--app-muted)"
            onclick={() => zoom(1 / 1.3)}>−</button
          >
          <button
            class="w-8 h-8 flex items-center justify-center rounded-lg text-lg leading-none transition-opacity hover:opacity-70"
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
        onmouseleave={() => {
          timelineTooltip = null;
        }}
        style="touch-action: none;"
      >
        <div class="relative" style="width: {totalWidth}px; height: 72px;">
          <!-- Year boundaries -->
          {#each yearMarkers as { year, left }}
            <div
              class="absolute top-0 bottom-0 border-l"
              style="left: {left}px; border-color: var(--app-border); opacity: 0.8"
            >
              <span
                class="absolute top-1 left-1.5 text-xs font-bold select-none"
                style="color: var(--app-muted)">{year}</span
              >
            </div>
          {/each}

          <!-- Month gridlines -->
          {#each monthMarkers as { label, left }}
            <div
              class="absolute border-l pointer-events-none"
              style="left: {left}px; top: 18px; bottom: 12px; border-color: var(--app-border); opacity: 0.6"
            ></div>
            {#if pxPerDay >= 5}
              <span
                class="absolute text-[9px] select-none"
                style="left: {left +
                  2}px; bottom: 2px; color: var(--app-muted); opacity: 0.6"
                >{label}</span
              >
            {/if}
          {/each}

          <!-- Stays track -->
          <div class="absolute left-0 right-0" style="top: 20px; height: 36px;">
            {#each stays as stay}
              {@const color = colorMap.get(stay.isoCountryCode) ?? "#64748b"}
              {@const w = stayWidth(stay)}
              {@const l = stayLeft(stay)}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="absolute top-0 h-full flex items-center overflow-hidden
									hover:brightness-125 transition-[filter] cursor-default"
                style="left: {l}px; width: {w}px;
									background-color: {color}20; border-left: 2px solid {color};"
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
                    )}{#if w > 56}&nbsp;{stay.country}{/if}
                  </span>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>

    <!-- ── Country bottom sheet ───────────────────────────────────────── -->
    {#if selectedCountry && selectedStat}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl shadow-2xl"
        style="
					max-height: 70%;
					background: var(--app-bg);
					border-top: 1px solid var(--app-border);
				"
        in:fly={{ y: 420, duration: 320, easing: cubicOut }}
        out:fly={{ y: 420, duration: 220 }}
        ontouchstart={onSheetTouchStart}
        ontouchend={onSheetTouchEnd}
      >
        <!-- Drag handle -->
        <button
          type="button"
          class="flex justify-center pt-2.5 pb-1 flex-shrink-0 cursor-pointer"
          aria-label="Close country details"
          onclick={() => {
            selectedCountry = null;
          }}
        >
          <div
            class="w-9 h-1 rounded-full"
            style="background: var(--app-muted); opacity: 0.4"
          ></div>
        </button>

        <!-- Header -->
        <div class="flex items-center gap-3 px-4 pb-3 flex-shrink-0">
          <span class="text-3xl leading-none"
            >{flagEmoji(selectedStat.isoCountryCode)}</span
          >
          <div class="flex-1 min-w-0">
            <h2
              class="font-bold text-lg leading-tight truncate"
              style="color: var(--app-fg)"
            >
              {selectedStat.country}
            </h2>
            {#if periodLabel}
              <p
                class="text-xs font-mono mt-0.5"
                style="color: var(--app-accent); opacity: 0.7"
              >
                {periodLabel}
              </p>
            {/if}
          </div>
          <button
            class="w-8 h-8 flex items-center justify-center rounded-full transition-opacity hover:opacity-60 flex-shrink-0"
            style="background: var(--app-surface); color: var(--app-muted)"
            onclick={() => {
              selectedCountry = null;
            }}
            aria-label="Close country details"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Stats row -->
        <div class="flex gap-3 px-4 pb-4 flex-shrink-0">
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
              días{periodLabel ? ` en ${periodLabel}` : ""}
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
              estanci{selectedStays.length === 1 ? "a" : "as"}
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
                días totales
              </p>
            </div>
          {/if}
        </div>

        <!-- Stays list (scrollable) -->
        {#if selectedStays.length > 0}
          <div class="flex-1 overflow-y-auto px-4 pb-4 min-h-0">
            <p
              class="text-xs uppercase tracking-wider mb-2"
              style="color: var(--app-muted)"
            >
              Estancias
            </p>
            <div class="space-y-1.5">
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
                    style="color: var(--app-accent)">{stay.days}d</span
                  >
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  {/if}
</div>
