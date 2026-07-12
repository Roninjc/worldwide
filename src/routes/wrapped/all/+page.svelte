<script lang="ts">
  import { goto } from "$app/navigation";
  import { entriesStore } from "$lib/entriesStore.svelte";
  import { t, locale } from "svelte-i18n";
  import { getCountryName } from "$lib/countryName";
  import { flagEmoji } from "$lib/flag";
  import NoData from "$lib/components/NoData.svelte";
  import FlightMap from "$lib/components/FlightMap.svelte";
  import SegmentedControl from "$lib/components/SegmentedControl.svelte";
  import {
    computeCountryStats,
    getMostTraveledMonth,
    getLongestStreak,
    computeYearSummary,
  } from "$lib/stats";
  import { flagColor } from "$lib/flagColor";

  interface Stop {
    code: string;
    color: string;
    label: string;
    date: number;
    countriesSoFar: number;
    daysSoFar: number;
  }

  const allEntries = $derived(entriesStore.entries);
  const allStats = $derived(computeCountryStats(allEntries));
  const topCountry = $derived(allStats[0]);
  const longestStay = $derived(getLongestStreak(allEntries));
  const mostTraveledMonth = $derived(getMostTraveledMonth(allEntries));

  const yearSummaries = $derived(
    entriesStore.years.map((y) => computeYearSummary(allEntries, y)),
  );
  const busiestYear = $derived(
    yearSummaries.reduce(
      (best, s) =>
        s.totalCountries > best.totalCountries ||
        (s.totalCountries === best.totalCountries && s.totalDays > best.totalDays)
          ? s
          : best,
      { year: 0, totalCountries: 0, totalDays: 0, countries: [] },
    ),
  );
  const maxYearDays = $derived(yearSummaries.reduce((m, s) => Math.max(m, s.totalDays), 0));

  const recentYear = $derived(entriesStore.years[0]);

  function dayKey(ms: number) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  const stops = $derived.by<Stop[]>(() => {
    const sorted = [...allEntries].sort((a, b) => a.date - b.date);
    const codes = new Set<string>();
    const days = new Set<string>();
    const out: Stop[] = [];
    let last = "";
    for (const e of sorted) {
      days.add(dayKey(e.date));
      codes.add(e.isoCountryCode);
      if (e.isoCountryCode !== last) {
        out.push({
          code: e.isoCountryCode,
          color: flagColor(e.isoCountryCode),
          label: e.isoCountryCode,
          date: e.date,
          countriesSoFar: codes.size,
          daysSoFar: days.size,
        });
        last = e.isoCountryCode;
      }
    }
    return out;
  });

  function accent(iso: string | undefined) {
    return iso ? flagColor(iso) : "var(--app-accent)";
  }
  function fmtMonthYear(key: string) {
    if (!key) return "";
    const [y, m] = key.split("-");
    return new Date(Number(y), Number(m) - 1).toLocaleDateString($locale ?? "en", {
      month: "long",
      year: "numeric",
    });
  }

  let segMode = $state("total");
  function onSeg(v: string) {
    if (v === "year" && recentYear) goto(`/wrapped/${recentYear}`);
  }
</script>

<div class="flex-1 overflow-y-auto" style="padding-bottom: var(--nav-clearance)">
  {#if !entriesStore.loaded}
    <div class="w-full min-h-[70vh] flex items-center justify-center text-sm" style="color: var(--app-muted)">
      {$t("loading")}
    </div>
  {:else if entriesStore.totalDays === 0}
    <NoData />
  {:else}
    <div class="max-w-lg mx-auto px-4 py-6 space-y-5">
      <!-- Header -->
      <div class="flex flex-col items-center gap-3">
        <div class="w-full max-w-[240px]">
          <SegmentedControl
            options={[{ value: "year", label: $t("wrapped.by_year") }, { value: "total", label: $t("wrapped.total") }]}
            bind:value={segMode}
            onchange={onSeg}
          />
        </div>
        <h1 class="text-3xl font-black tracking-tight" style="color: var(--app-fg)">
          {$t("wrapped.total")}
        </h1>
      </div>

      <!-- Flight map (whole journey, static) -->
      <FlightMap
        {stops}
        playable={false}
        autoplay={false}
        countriesLabel={$t("wrapped.countries")}
        daysLabel={$t("wrapped.days")}
      />
      <p class="text-center text-sm" style="color: var(--app-muted)">
        {$t("wrapped.countries_count", { values: { count: entriesStore.totalCountries } })} ·
        {$t("wrapped.days_count", { values: { count: entriesStore.totalDays } })}
      </p>

      <!-- Highlights -->
      <div class="grid grid-cols-2 gap-3">
        {#if topCountry}
          <div class="rounded-2xl p-4 space-y-1" style="background: var(--app-surface)">
            <p class="text-xs" style="color: var(--app-muted)">{$t("wrapped.top_country")}</p>
            <p class="text-2xl">{flagEmoji(topCountry.isoCountryCode)}</p>
            <p class="font-semibold text-sm" style="color: var(--app-fg)">
              {getCountryName(topCountry.isoCountryCode, $locale)}
            </p>
            <p class="text-xs font-semibold" style="color: {accent(topCountry.isoCountryCode)}">
              {$t("wrapped.days_count", { values: { count: topCountry.days } })}
            </p>
          </div>
        {/if}

        {#if longestStay.days > 0}
          <div class="rounded-2xl p-4 space-y-1" style="background: var(--app-surface)">
            <p class="text-xs" style="color: var(--app-muted)">{$t("wrapped.longest_stay")}</p>
            <p class="text-2xl">{flagEmoji(longestStay.isoCountryCode)}</p>
            <p class="font-semibold text-sm" style="color: var(--app-fg)">
              {getCountryName(longestStay.isoCountryCode, $locale)}
            </p>
            <p class="text-xs font-semibold" style="color: {accent(longestStay.isoCountryCode)}">
              {$t("wrapped.days_straight", { values: { count: longestStay.days } })}
            </p>
          </div>
        {/if}

        {#if busiestYear.year > 0}
          <button
            class="rounded-2xl p-4 space-y-1 text-left transition-transform active:scale-[0.98]"
            style="background: var(--app-surface)"
            onclick={() => goto(`/wrapped/${busiestYear.year}`)}
          >
            <p class="text-xs" style="color: var(--app-muted)">{$t("wrapped.busiest_year")}</p>
            <p class="text-3xl font-black mt-1" style="color: var(--app-fg)">{busiestYear.year}</p>
            <p class="text-xs font-semibold" style="color: var(--app-accent)">
              {$t("wrapped.countries_count", { values: { count: busiestYear.totalCountries } })}
            </p>
          </button>
        {/if}

        {#if mostTraveledMonth.month}
          <div class="rounded-2xl p-4 space-y-1" style="background: var(--app-surface)">
            <p class="text-xs" style="color: var(--app-muted)">{$t("wrapped.most_traveled_month")}</p>
            <p class="text-lg font-bold capitalize mt-1" style="color: var(--app-fg)">
              {fmtMonthYear(mostTraveledMonth.month)}
            </p>
            <p class="text-xs font-semibold" style="color: var(--app-accent)">
              {$t("wrapped.distinct_countries", { values: { count: mostTraveledMonth.countries } })}
            </p>
          </div>
        {/if}
      </div>

      <!-- Year by year -->
      <div class="space-y-2">
        <p class="text-xs uppercase tracking-wider px-1" style="color: var(--app-muted)">
          {$t("wrapped.year_by_year")}
        </p>
        <div class="space-y-2">
          {#each yearSummaries as summary (summary.year)}
            {@const pct = maxYearDays ? Math.round((summary.totalDays / maxYearDays) * 100) : 0}
            <button
              class="w-full flex items-center gap-3 text-left transition-opacity active:opacity-60"
              onclick={() => goto(`/wrapped/${summary.year}`)}
            >
              <span class="text-sm font-bold w-10 tabular-nums" style="color: var(--app-fg)">{summary.year}</span>
              <div class="flex-1 min-w-0">
                <div class="h-1.5 rounded-full overflow-hidden" style="background: var(--app-track)">
                  <div class="h-full rounded-full" style="width: {pct}%; background: var(--app-accent)"></div>
                </div>
              </div>
              <span class="text-xs font-mono tabular-nums w-24 text-right" style="color: var(--app-muted)">
                {$t("wrapped.countries_count", { values: { count: summary.totalCountries } })} · {summary.totalDays}d
              </span>
            </button>
          {/each}
        </div>
      </div>

      <!-- All countries -->
      <div class="space-y-2">
        <p class="text-xs uppercase tracking-wider px-1" style="color: var(--app-muted)">
          {$t("wrapped.all_countries")}
        </p>
        <div class="space-y-2">
          {#each allStats as stat (stat.isoCountryCode)}
            {@const pct = Math.round((stat.days / allStats[0].days) * 100)}
            <div class="flex items-center gap-3">
              <span class="text-lg leading-none w-7 text-center">{flagEmoji(stat.isoCountryCode)}</span>
              <div class="flex-1 min-w-0">
                <p class="text-sm truncate mb-1" style="color: var(--app-fg)">
                  {getCountryName(stat.isoCountryCode, $locale)}
                </p>
                <div class="h-1.5 rounded-full overflow-hidden" style="background: var(--app-track)">
                  <div class="h-full rounded-full" style="width: {pct}%; background: {accent(stat.isoCountryCode)}"></div>
                </div>
              </div>
              <span class="text-xs font-mono tabular-nums w-10 text-right" style="color: var(--app-muted)">{stat.days}d</span>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>
