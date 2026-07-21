<script lang="ts">
  import { entriesStore } from "$lib/entriesStore.svelte";
  import { themeStore } from "$lib/themeStore.svelte";
  import { t, locale } from "svelte-i18n";
  import { tweened } from "svelte/motion";
  import { cubicOut } from "svelte/easing";
  import { fly } from "svelte/transition";
  import { flagEmoji } from "$lib/flag";
  import { getCountryName } from "$lib/countryName";
  import NoData from "$lib/components/NoData.svelte";
  import ProgressRing from "$lib/components/ProgressRing.svelte";
  import BottomSheet from "$lib/components/BottomSheet.svelte";
  import Stamp from "$lib/components/Stamp.svelte";
  import {
    getContinent,
    CONTINENT_TOTALS,
    type Continent,
  } from "$lib/continents";
  import type { CountryStat } from "$lib/types";

  const CONTINENT_KEYS: Record<Continent, string> = {
    Europe: "continent.europe",
    Asia: "continent.asia",
    Africa: "continent.africa",
    America: "continent.america",
    Oceania: "continent.oceania",
    Antarctica: "continent.antarctica",
  };

  // A stable, distinct hue per continent — each section owns its colour, and
  // the same hue drives the hero ring segment, the stamp ink and the day chips.
  // Deeper shades in light mode so the ink stays legible on the light surface.
  const COLORS_DARK: Record<Continent, string> = {
    Europe: "#38bdf8",
    Asia: "#a78bfa",
    Africa: "#fbbf24",
    America: "#34d399",
    Oceania: "#fb7185",
    Antarctica: "#94a3b8",
  };
  const COLORS_LIGHT: Record<Continent, string> = {
    Europe: "#0284c7",
    Asia: "#7c3aed",
    Africa: "#d97706",
    America: "#059669",
    Oceania: "#e11d48",
    Antarctica: "#64748b",
  };
  const CONTINENT_COLOR = $derived(
    themeStore.current === "light" ? COLORS_LIGHT : COLORS_DARK,
  );

  interface ContinentDatum {
    continent: Continent;
    color: string;
    countries: CountryStat[];
    total: number;
    visited: number;
    pct: number;
  }

  const totalCountriesInWorld = 195;
  const coveragePct = $derived(
    Math.round((entriesStore.totalCountries / totalCountriesInWorld) * 100),
  );
  // Years arrive sorted most-recent first, so the earliest is the tail.
  const sinceYear = $derived(entriesStore.years.at(-1) ?? "");

  // Machine-readable zone — decorative, deterministic from the real stats.
  function mrzPad(s: string, n: number) {
    return (s + "<".repeat(n)).slice(0, n);
  }
  const mrzLine1 = $derived(mrzPad("P<WLD<PASSPORT<<WORLDWIDE", 30));
  const mrzLine2 = $derived(
    mrzPad(
      `${sinceYear}<${entriesStore.totalCountries}OF195<${coveragePct}PCT<${entriesStore.totalDays}D`,
      30,
    ),
  );

  // Per-continent breakdown, richest-first so the map of exploration reads
  // from most- to least-travelled.
  const continentData = $derived.by<ContinentDatum[]>(() => {
    const map = new Map<Continent, CountryStat[]>();
    for (const stat of entriesStore.countryStats) {
      const c = getContinent(stat.isoCountryCode);
      if (!c) continue;
      if (!map.has(c)) map.set(c, []);
      map.get(c)!.push(stat);
    }
    return (Object.keys(CONTINENT_KEYS) as Continent[])
      .map((c) => {
        const countries = (map.get(c) ?? []).sort((a, b) => b.days - a.days);
        const total = CONTINENT_TOTALS[c];
        return {
          continent: c,
          color: CONTINENT_COLOR[c],
          countries,
          total,
          visited: countries.length,
          pct: Math.round((countries.length / total) * 100),
        };
      })
      .sort((a, b) => b.visited - a.visited);
  });

  // Hero ring: one coloured arc per continent, sized by countries visited.
  const heroSegments = $derived(
    continentData
      .filter((d) => d.visited > 0)
      .map((d) => ({ value: d.visited, color: d.color })),
  );

  // The whole hero glows in the most-travelled continent's hue.
  const dominantColor = $derived(continentData[0]?.color ?? "var(--app-accent)");

  // Count-up for the headline number.
  const tweenCountries = tweened(0, { duration: 900, easing: cubicOut });
  $effect(() => {
    tweenCountries.set(entriesStore.totalCountries);
  });

  function fmtDate(ms: number) {
    return new Date(ms).toLocaleDateString($locale ?? "en", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  // Slight hand-applied tilt, deterministic per country (−7°…+7°).
  function tilt(code: string) {
    const h = [...code].reduce((a, c) => a + c.charCodeAt(0), 0);
    return ((h % 15) - 7) * 0.95;
  }

  // Drill-down bottom sheet for a single stamped country. Keep the data
  // through the exit transition so the sheet doesn't blank while closing.
  let sheetStat = $state<CountryStat | null>(null);
  let sheetColor = $state("var(--app-accent)");
  let sheetOpen = $state(false);

  function openStamp(stat: CountryStat, color: string) {
    sheetStat = stat;
    sheetColor = color;
    sheetOpen = true;
  }
</script>

<div
  class="flex-1 overflow-y-auto"
  style="padding-top: env(safe-area-inset-top, 0px); padding-bottom: var(--nav-clearance)"
>
  {#if !entriesStore.loaded}
    <div
      class="w-full min-h-[70vh] flex items-center justify-center text-sm"
      style="color: var(--app-muted)"
    >
      {$t("loading")}
    </div>
  {:else if entriesStore.totalDays === 0}
    <NoData />
  {:else}
    <div class="max-w-lg mx-auto">
      <!-- Header -->
      <div class="flex items-start justify-between gap-3 px-4 pt-6">
        <div>
          <h1 class="text-2xl font-bold tracking-tight" style="color: var(--app-fg)">
            {$t("passport.title")}
          </h1>
          <p class="text-sm mt-0.5" style="color: var(--app-muted)">
            {$t("passport.subtitle")}
          </p>
        </div>
      </div>

      <!-- Hero: passport data page -->
      <div class="px-4 pt-4 pb-6">
        <div
          class="relative overflow-hidden rounded-2xl"
          style="background: var(--hero-gradient); border: 1px solid var(--hero-border)"
        >
          <!-- Glows in the dominant continent's hue -->
          <div
            class="absolute inset-x-0 top-0 h-56 pointer-events-none"
            style="background: radial-gradient(ellipse 80% 70% at 50% 12%, {dominantColor}2b, transparent 72%)"
          ></div>
          <!-- Inner printed-page frame -->
          <div
            class="absolute inset-2.5 rounded-xl pointer-events-none"
            style="border: 1px solid var(--app-border)"
          ></div>

          <div class="relative p-5">
            <!-- Document eyebrow -->
            <div class="flex items-center justify-between">
              <span
                class="text-[11px] font-semibold tracking-[0.22em]"
                style="color: var(--app-muted); font-family: ui-monospace, monospace"
              >
                PASSPORT · WORLDWIDE
              </span>
              <svg
                class="w-4 h-4"
                style="color: var(--app-muted)"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                <path d="M2 12h20" />
              </svg>
            </div>

            <div class="h-px mt-3" style="background: var(--app-border)"></div>

            <!-- Seal: the coverage ring -->
            <div class="flex justify-center py-4">
              <ProgressRing size={196} stroke={16} total={totalCountriesInWorld} segments={heroSegments}>
                <div class="flex flex-col items-center">
                  <span
                    class="text-[3rem] font-black tabular-nums leading-none"
                    style="color: var(--app-fg)"
                  >
                    {Math.round($tweenCountries)}
                  </span>
                  <span class="text-[11px] mt-1.5" style="color: var(--app-muted)">
                    {$t("passport.of_countries", { values: { total: totalCountriesInWorld } })}
                  </span>
                </div>
              </ProgressRing>
            </div>

            <!-- Data fields -->
            <div class="grid grid-cols-2 gap-x-4 gap-y-3">
              {#each [ [$t("passport.f_countries"), entriesStore.totalCountries], [$t("passport.f_coverage"), coveragePct + "%"], [$t("passport.f_since"), sinceYear], [$t("passport.days"), entriesStore.totalDays] ] as [label, value]}
                <div>
                  <p
                    class="text-[9px] uppercase tracking-[0.18em]"
                    style="color: var(--app-muted); font-family: ui-monospace, monospace"
                  >
                    {label}
                  </p>
                  <p class="text-lg font-bold tabular-nums leading-tight" style="color: var(--app-fg)">
                    {value}
                  </p>
                </div>
              {/each}
            </div>
          </div>

          <!-- MRZ band -->
          <div
            class="relative px-5 py-3 mt-1 space-y-0.5"
            style="background: var(--app-surface-2); border-top: 1px solid var(--app-border)"
          >
            {#each [mrzLine1, mrzLine2] as line}
              <p
                class="text-[11px] tracking-[0.12em] whitespace-nowrap overflow-hidden"
                style="color: var(--app-muted); font-family: ui-monospace, monospace"
              >
                {line}
              </p>
            {/each}
          </div>
        </div>
      </div>

      <!-- The stamp book: one page per continent -->
      <div class="px-4 pb-4 space-y-7">
        {#each continentData.filter((d) => d.visited > 0) as data, p (data.continent)}
          <section in:fly={{ y: 16, duration: 360, delay: 80 + p * 70, easing: cubicOut }}>
            <!-- Page header: continent · dotted leader · count -->
            <div class="flex items-center gap-2 mb-3 px-0.5">
              <span
                class="text-[11px] font-bold uppercase tracking-[0.18em]"
                style="color: {data.color}"
              >
                {$t(CONTINENT_KEYS[data.continent])}
              </span>
              <span
                class="flex-1 border-b border-dotted self-center"
                style="border-color: var(--app-border)"
              ></span>
              <span class="text-[11px] font-mono tabular-nums" style="color: var(--app-muted)">
                {data.visited}/{data.total}
              </span>
            </div>

            <!-- Stamps -->
            <div class="flex flex-wrap justify-center gap-x-1 gap-y-2">
              {#each data.countries as stat, i (stat.isoCountryCode)}
                <button
                  class="transition-transform active:scale-90 focus:outline-none"
                  style="transform: rotate({tilt(stat.isoCountryCode)}deg); margin-top: {i % 2 ? 6 : 0}px"
                  onclick={() => openStamp(stat, data.color)}
                  aria-label={getCountryName(stat.isoCountryCode, $locale)}
                >
                  <Stamp
                    code={stat.isoCountryCode}
                    name={getCountryName(stat.isoCountryCode, $locale)}
                    dateMs={stat.firstVisit}
                    days={stat.days}
                    color={data.color}
                    size={100}
                    locale={$locale ?? "en"}
                  />
                </button>
              {/each}
            </div>
          </section>
        {/each}
      </div>
    </div>
  {/if}
</div>

<!-- Country stamp detail -->
<BottomSheet bind:open={sheetOpen}>
  {#if sheetStat}
    <div class="flex flex-col items-center text-center pb-4 pt-1">
      <div style="transform: rotate({tilt(sheetStat.isoCountryCode)}deg)">
        <Stamp
          code={sheetStat.isoCountryCode}
          name={getCountryName(sheetStat.isoCountryCode, $locale)}
          dateMs={sheetStat.firstVisit}
          days={sheetStat.days}
          color={sheetColor}
          size={168}
          locale={$locale ?? "en"}
        />
      </div>

      <h2 class="text-xl font-bold mt-4 flex items-center gap-2" style="color: var(--app-fg)">
        <span class="text-2xl leading-none">{flagEmoji(sheetStat.isoCountryCode)}</span>
        {getCountryName(sheetStat.isoCountryCode, $locale)}
      </h2>

      <div class="grid grid-cols-3 gap-2 w-full max-w-xs mt-5">
        {#each [ [sheetStat.days + "d", $t("passport.days")], [new Date(sheetStat.firstVisit).getFullYear(), ""], [new Date(sheetStat.lastVisit).getFullYear(), ""] ] as [value, label], idx}
          <div
            class="rounded-xl py-3"
            style="background: var(--app-surface)"
          >
            <p class="text-lg font-bold tabular-nums" style="color: var(--app-fg)">{value}</p>
            <p class="text-[10px] uppercase tracking-wide mt-0.5" style="color: var(--app-muted)">
              {label || (idx === 1 ? $t("passport.first_visit") : $t("passport.last_visit"))}
            </p>
          </div>
        {/each}
      </div>

      <p class="text-xs mt-4" style="color: var(--app-muted)">
        {fmtDate(sheetStat.firstVisit)}
      </p>
    </div>
  {/if}
</BottomSheet>
