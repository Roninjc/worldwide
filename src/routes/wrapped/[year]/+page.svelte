<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { entriesStore } from "$lib/entriesStore.svelte";
  import { t, locale } from "svelte-i18n";
  import { getCountryName } from "$lib/countryName";
  import { flagEmoji } from "$lib/flag";
  import NoData from "$lib/components/NoData.svelte";
  import FlightMap from "$lib/components/FlightMap.svelte";
  import SegmentedControl from "$lib/components/SegmentedControl.svelte";
  import { flagColor } from "$lib/flagColor";
  import { computeCountryStats, getMostTraveledMonth, countUniqueDays } from "$lib/stats";
  import { computeStays } from "$lib/stays";
  import type { CountryStat } from "$lib/types";

  interface Stop {
    code: string;
    color: string;
    label: string;
    date: number;
    countriesSoFar: number;
    daysSoFar: number;
  }

  const year = $derived(Number($page.params.year));

  const yearEntries = $derived(
    entriesStore.entries.filter((e) => new Date(e.date).getFullYear() === year),
  );
  const beforeEntries = $derived(
    entriesStore.entries.filter((e) => new Date(e.date).getFullYear() < year),
  );

  const yearStats = $derived(computeCountryStats(yearEntries));
  const yearStays = $derived(computeStays(yearEntries));

  const totalDays = $derived(countUniqueDays(yearEntries));
  const totalCountries = $derived(yearStats.length);
  const topCountry = $derived(yearStats[0] as CountryStat | undefined);

  const longestStay = $derived(
    yearStays.reduce((best, s) => (s.days > best.days ? s : best), {
      days: 0,
      country: "",
      isoCountryCode: "",
    }),
  );

  const newCountries = $derived.by(() => {
    const prevIsos = new Set(beforeEntries.map((e) => e.isoCountryCode));
    return yearStats.filter((s) => !prevIsos.has(s.isoCountryCode));
  });

  const mostTraveledMonth = $derived(getMostTraveledMonth(yearEntries));

  function dayKey(ms: number) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  // Chronological flight plan with running totals for the map HUD.
  const stops = $derived.by<Stop[]>(() => {
    const sorted = [...yearEntries].sort((a, b) => a.date - b.date);
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

  const yearIndex = $derived(entriesStore.years.indexOf(year));
  const prevYear = $derived(entriesStore.years[yearIndex + 1] as number | undefined);
  const nextYear = $derived(entriesStore.years[yearIndex - 1] as number | undefined);

  function accent(iso: string | undefined) {
    return iso ? flagColor(iso) : "var(--app-accent)";
  }
  function fmtMonth(key: string) {
    if (!key) return "";
    const [y, m] = key.split("-");
    return new Date(Number(y), Number(m) - 1).toLocaleDateString($locale ?? "en", { month: "long" });
  }

  let segMode = $state("year");
  function onSeg(v: string) {
    if (v === "total") goto("/wrapped/all");
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
        <div class="flex items-center gap-5">
          <button
            class="text-xl transition-opacity disabled:opacity-20 disabled:pointer-events-none active:opacity-50"
            style="color: var(--app-muted)"
            disabled={!prevYear}
            onclick={() => prevYear && goto(`/wrapped/${prevYear}`)}
            aria-label="Previous year">‹</button
          >
          <h1 class="text-4xl font-black tracking-tight tabular-nums" style="color: var(--app-fg)">
            {year}
          </h1>
          <button
            class="text-xl transition-opacity disabled:opacity-20 disabled:pointer-events-none active:opacity-50"
            style="color: var(--app-muted)"
            disabled={!nextYear}
            onclick={() => nextYear && goto(`/wrapped/${nextYear}`)}
            aria-label="Next year">›</button
          >
        </div>
      </div>

      {#if yearEntries.length === 0}
        <p class="text-center py-16" style="color: var(--app-muted)">
          {$t("wrapped.no_data", { values: { year } })}
        </p>
      {:else}
        <!-- Flight map -->
        {#key year}
          <FlightMap
            {stops}
            countriesLabel={$t("wrapped.countries")}
            daysLabel={$t("wrapped.days")}
          />
        {/key}
        <p class="text-center text-sm" style="color: var(--app-muted)">
          {$t("wrapped.countries_count", { values: { count: totalCountries } })} ·
          {$t("wrapped.days_count", { values: { count: totalDays } })}
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

          {#if mostTraveledMonth.month}
            <div class="rounded-2xl p-4 space-y-1" style="background: var(--app-surface)">
              <p class="text-xs" style="color: var(--app-muted)">{$t("wrapped.most_traveled_month")}</p>
              <p class="text-lg font-bold capitalize mt-1" style="color: var(--app-fg)">
                {fmtMonth(mostTraveledMonth.month)}
              </p>
              <p class="text-xs font-semibold" style="color: var(--app-accent)">
                {$t("wrapped.distinct_countries", { values: { count: mostTraveledMonth.countries } })}
              </p>
            </div>
          {/if}

          {#if newCountries.length > 0}
            <div class="rounded-2xl p-4 space-y-1" style="background: var(--app-surface)">
              <p class="text-xs" style="color: var(--app-muted)">{$t("wrapped.new_countries")}</p>
              <p class="text-3xl font-black mt-1" style="color: var(--app-fg)">{newCountries.length}</p>
              <p class="text-xs" style="color: var(--app-muted)">{$t("wrapped.for_first_time")}</p>
            </div>
          {/if}
        </div>

        <!-- New countries: chips -->
        {#if newCountries.length > 0}
          <div class="space-y-2">
            <p class="text-xs uppercase tracking-wider px-1" style="color: var(--app-muted)">
              {$t("wrapped.new_this_year")}
            </p>
            <div class="flex flex-wrap gap-2">
              {#each newCountries as stat, i (stat.isoCountryCode)}
                {@const c = accent(stat.isoCountryCode)}
                <span
                  class="chip flex items-center gap-1.5 text-sm pl-2 pr-3 py-1.5 rounded-full font-medium"
                  style="--i: {i}; background: {c}1f; border: 1px solid {c}66; color: var(--app-fg)"
                >
                  <span class="text-base leading-none">{flagEmoji(stat.isoCountryCode)}</span>
                  {getCountryName(stat.isoCountryCode, $locale)}
                </span>
              {/each}
            </div>
          </div>
        {/if}

        <!-- All countries this year -->
        <div class="space-y-2">
          <p class="text-xs uppercase tracking-wider px-1" style="color: var(--app-muted)">
            {$t("wrapped.all_countries")}
          </p>
          <div class="space-y-2">
            {#each yearStats as stat (stat.isoCountryCode)}
              {@const pct = Math.round((stat.days / yearStats[0].days) * 100)}
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
      {/if}
    </div>
  {/if}
</div>

<style>
  .chip {
    opacity: 0;
    animation: chip-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    animation-delay: calc(var(--i) * 0.05s);
  }
  @keyframes chip-in {
    from {
      opacity: 0;
      transform: translateY(6px) scale(0.9);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .chip {
      opacity: 1;
      animation: none;
    }
  }
</style>
