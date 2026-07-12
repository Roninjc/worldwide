<script lang="ts">
  import { goto } from "$app/navigation";
  import { entriesStore } from "$lib/entriesStore.svelte";
  import { t, locale } from "svelte-i18n";
  import { getCountryName } from "$lib/countryName";
  import NoData from "$lib/components/NoData.svelte";
  import {
    computeCountryStats,
    getMostTraveledMonth,
    getLongestStreak,
    computeYearSummary,
  } from "$lib/stats";
  import { computeStays } from "$lib/stays";
  import { flagEmoji } from "$lib/flag";
  import WrappedTabs from "$lib/components/WrappedTabs.svelte";

  const allEntries = $derived(entriesStore.entries);
  const allStats = $derived(computeCountryStats(allEntries));
  const topCountry = $derived(allStats[0]);
  const longestStay = $derived(getLongestStreak(allEntries));
  const mostTraveledMonth = $derived(getMostTraveledMonth(allEntries));

  // Per-year summaries (years are sorted most-recent first).
  const yearSummaries = $derived(
    entriesStore.years.map((y) => computeYearSummary(allEntries, y)),
  );

  // Busiest year = most countries visited, tie-broken by days.
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

  const maxYearDays = $derived(
    yearSummaries.reduce((m, s) => Math.max(m, s.totalDays), 0),
  );

  // All-time longest stays (top 10) rather than the full timeline.
  const topStays = $derived(
    [...computeStays(allEntries)].sort((a, b) => b.days - a.days).slice(0, 10),
  );

  function formatMonthYear(key: string) {
    if (!key) return "";
    const [y, m] = key.split("-");
    return new Date(Number(y), Number(m) - 1).toLocaleDateString($locale ?? "en", {
      month: "long",
      year: "numeric",
    });
  }

  function formatDate(ms: number) {
    return new Date(ms).toLocaleDateString($locale ?? "en", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
</script>

<div class="flex-1 overflow-y-auto" style="padding-bottom: var(--nav-clearance)">
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
    <div class="max-w-lg mx-auto px-4 py-6 space-y-6">
      <WrappedTabs mode="total" />

      <div class="text-center">
        <h1 class="text-3xl font-black tracking-tight" style="color: var(--app-fg)">
          {$t("wrapped.total")}
        </h1>
      </div>

      <!-- Hero -->
      <div
        class="rounded-2xl p-6 text-center"
        style="background: var(--hero-gradient); border: 1px solid var(--hero-border)"
      >
        <p class="text-sm mb-3" style="color: var(--app-muted)">
          {$t("wrapped.total_subtitle")}
        </p>
        <div class="flex items-center justify-center gap-8">
          <div>
            <p class="text-5xl font-black" style="color: var(--app-fg)">
              {entriesStore.totalCountries}
            </p>
            <p class="text-xs mt-1" style="color: var(--app-muted)">
              {$t("wrapped.countries")}
            </p>
          </div>
          <div class="w-px h-12" style="background: var(--app-border)"></div>
          <div>
            <p class="text-5xl font-black" style="color: var(--app-fg)">
              {entriesStore.totalDays}
            </p>
            <p class="text-xs mt-1" style="color: var(--app-muted)">
              {$t("wrapped.days")}
            </p>
          </div>
        </div>
      </div>

      <!-- Stat cards 2x2 -->
      <div class="grid grid-cols-2 gap-3">
        {#if topCountry}
          <div class="rounded-xl p-4 space-y-1" style="background: var(--app-surface)">
            <p class="text-xs" style="color: var(--app-muted)">
              {$t("wrapped.top_country")}
            </p>
            <p class="text-2xl">{flagEmoji(topCountry.isoCountryCode)}</p>
            <p class="font-semibold text-sm" style="color: var(--app-fg)">
              {getCountryName(topCountry.isoCountryCode, $locale)}
            </p>
            <p class="text-xs font-mono" style="color: var(--app-accent)">
              {$t("wrapped.days_count", { values: { count: topCountry.days } })}
            </p>
          </div>
        {/if}

        {#if longestStay.days > 0}
          <div class="rounded-xl p-4 space-y-1" style="background: var(--app-surface)">
            <p class="text-xs" style="color: var(--app-muted)">
              {$t("wrapped.longest_stay")}
            </p>
            <p class="text-2xl">{flagEmoji(longestStay.isoCountryCode)}</p>
            <p class="font-semibold text-sm" style="color: var(--app-fg)">
              {getCountryName(longestStay.isoCountryCode, $locale)}
            </p>
            <p class="text-xs font-mono" style="color: var(--app-accent)">
              {$t("wrapped.days_straight", { values: { count: longestStay.days } })}
            </p>
          </div>
        {/if}

        {#if busiestYear.year > 0}
          <div class="rounded-xl p-4 space-y-1" style="background: var(--app-surface)">
            <p class="text-xs" style="color: var(--app-muted)">
              {$t("wrapped.busiest_year")}
            </p>
            <p class="text-3xl font-black mt-1" style="color: var(--app-fg)">
              {busiestYear.year}
            </p>
            <p class="text-xs font-mono" style="color: var(--app-accent)">
              {$t("wrapped.countries_count", {
                values: { count: busiestYear.totalCountries },
              })}
            </p>
          </div>
        {/if}

        {#if mostTraveledMonth.month}
          <div class="rounded-xl p-4 space-y-1" style="background: var(--app-surface)">
            <p class="text-xs" style="color: var(--app-muted)">
              {$t("wrapped.most_traveled_month")}
            </p>
            <p class="text-lg font-bold capitalize mt-1" style="color: var(--app-fg)">
              {formatMonthYear(mostTraveledMonth.month)}
            </p>
            <p class="text-xs font-mono" style="color: var(--app-accent)">
              {$t("wrapped.distinct_countries", {
                values: { count: mostTraveledMonth.countries },
              })}
            </p>
          </div>
        {/if}
      </div>

      <!-- Year by year -->
      <div class="space-y-2">
        <p class="text-xs uppercase tracking-wider" style="color: var(--app-muted)">
          {$t("wrapped.year_by_year")}
        </p>
        <div class="space-y-2">
          {#each yearSummaries as summary}
            {@const pct = maxYearDays ? Math.round((summary.totalDays / maxYearDays) * 100) : 0}
            <button
              class="w-full flex items-center gap-3 text-left transition-opacity hover:opacity-70"
              onclick={() => goto(`/wrapped/${summary.year}`)}
            >
              <span class="text-sm font-bold w-10" style="color: var(--app-fg)"
                >{summary.year}</span
              >
              <div class="flex-1 min-w-0">
                <div
                  class="h-1.5 rounded-full overflow-hidden"
                  style="background: var(--app-track)"
                >
                  <div
                    class="h-full rounded-full"
                    style="width: {pct}%; background: var(--app-accent)"
                  ></div>
                </div>
              </div>
              <span class="text-xs font-mono w-24 text-right" style="color: var(--app-muted)">
                {$t("wrapped.countries_count", { values: { count: summary.totalCountries } })}
                · {summary.totalDays}d
              </span>
            </button>
          {/each}
        </div>
      </div>

      <!-- All countries (all-time) -->
      <div class="space-y-2">
        <p class="text-xs uppercase tracking-wider" style="color: var(--app-muted)">
          {$t("wrapped.all_countries")}
        </p>
        <div class="space-y-2">
          {#each allStats as stat}
            {@const pct = Math.round((stat.days / allStats[0].days) * 100)}
            <div class="flex items-center gap-3">
              <span class="text-lg leading-none w-7 text-center"
                >{flagEmoji(stat.isoCountryCode)}</span
              >
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5 mb-1">
                  <span class="text-sm truncate" style="color: var(--app-fg)"
                    >{getCountryName(stat.isoCountryCode, $locale)}</span
                  >
                </div>
                <div
                  class="h-1 rounded-full overflow-hidden"
                  style="background: var(--app-track)"
                >
                  <div
                    class="h-full rounded-full"
                    style="width: {pct}%; background: var(--app-accent)"
                  ></div>
                </div>
              </div>
              <span class="text-xs font-mono w-10 text-right" style="color: var(--app-muted)"
                >{stat.days}d</span
              >
            </div>
          {/each}
        </div>
      </div>

      <!-- Longest stays (top 10) -->
      {#if topStays.length > 0}
        <div class="space-y-2">
          <p class="text-xs uppercase tracking-wider" style="color: var(--app-muted)">
            {$t("wrapped.top_stays")}
          </p>
          <div class="space-y-1">
            {#each topStays as stay}
              <div
                class="flex items-center gap-3 text-sm py-1.5 border-b last:border-0"
                style="border-color: var(--app-border)"
              >
                <span class="text-base leading-none">{flagEmoji(stay.isoCountryCode)}</span>
                <span class="flex-1 truncate" style="color: var(--app-fg)"
                  >{getCountryName(stay.isoCountryCode, $locale)}</span
                >
                <span class="text-xs" style="color: var(--app-muted)">
                  {formatDate(stay.startDate)}
                  {#if stay.days > 1}→ {formatDate(stay.endDate)}{/if}
                </span>
                <span class="text-xs font-mono w-8 text-right" style="color: var(--app-muted)"
                  >{stay.days}d</span
                >
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>
