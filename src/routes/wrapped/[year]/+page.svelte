<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { entriesStore } from "$lib/entriesStore.svelte";
  import { t, locale } from "svelte-i18n";
  import { getCountryName } from "$lib/countryName";
  import {
    computeCountryStats,
    getMostTraveledMonth,
    countUniqueDays,
  } from "$lib/stats";
  import { computeStays } from "$lib/stays";
  import { flagEmoji } from "$lib/flag";
  import type { CountryStat } from "$lib/types";

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

  const yearIndex = $derived(entriesStore.years.indexOf(year));
  const prevYear = $derived(
    entriesStore.years[yearIndex + 1] as number | undefined,
  );
  const nextYear = $derived(
    entriesStore.years[yearIndex - 1] as number | undefined,
  );

  function formatMonth(key: string) {
    if (!key) return "";
    const [y, m] = key.split("-");
    return new Date(Number(y), Number(m) - 1).toLocaleDateString($locale ?? "en", {
      month: "long",
    });
  }

  function formatDate(ms: number) {
    return new Date(ms).toLocaleDateString($locale ?? "en", {
      day: "numeric",
      month: "short",
    });
  }
</script>

<div
  class="flex-1 overflow-y-auto"
  style="padding-bottom: var(--nav-clearance)"
>
  <div class="max-w-lg mx-auto px-4 py-6 space-y-6">
    <!-- Year navigation -->
    <div class="flex items-center justify-between">
      <button
        class="text-sm px-2 py-1 transition-opacity hover:opacity-60 disabled:opacity-20 disabled:pointer-events-none"
        style="color: var(--app-muted)"
        disabled={!prevYear}
        onclick={() => prevYear && goto(`/wrapped/${prevYear}`)}
      >
        ← {prevYear ?? ""}
      </button>

      <h1
        class="text-3xl font-black tracking-tight"
        style="color: var(--app-fg)"
      >
        {year}
      </h1>

      <button
        class="text-sm px-2 py-1 transition-opacity hover:opacity-60 disabled:opacity-20 disabled:pointer-events-none"
        style="color: var(--app-muted)"
        disabled={!nextYear}
        onclick={() => nextYear && goto(`/wrapped/${nextYear}`)}
      >
        {nextYear ?? ""} →
      </button>
    </div>

    {#if yearEntries.length === 0}
      <p class="text-center py-10" style="color: var(--app-muted)">
        {$t("wrapped.no_data", { values: { year } })}
      </p>
    {:else}
      <!-- Hero -->
      <div
        class="rounded-2xl p-6 text-center"
        style="background: var(--hero-gradient); border: 1px solid var(--hero-border)"
      >
        <p class="text-sm mb-3" style="color: var(--app-muted)">
          {$t("wrapped.subtitle", { values: { year } })}
        </p>
        <div class="flex items-center justify-center gap-8">
          <div>
            <p class="text-5xl font-black" style="color: var(--app-fg)">
              {totalCountries}
            </p>
            <p class="text-xs mt-1" style="color: var(--app-muted)">
              {$t("wrapped.countries")}
            </p>
          </div>
          <div class="w-px h-12" style="background: var(--app-border)"></div>
          <div>
            <p class="text-5xl font-black" style="color: var(--app-fg)">
              {totalDays}
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
          <div
            class="rounded-xl p-4 space-y-1"
            style="background: var(--app-surface)"
          >
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
          <div
            class="rounded-xl p-4 space-y-1"
            style="background: var(--app-surface)"
          >
            <p class="text-xs" style="color: var(--app-muted)">
              {$t("wrapped.longest_stay")}
            </p>
            <p class="text-2xl">{flagEmoji(longestStay.isoCountryCode)}</p>
            <p class="font-semibold text-sm" style="color: var(--app-fg)">
              {getCountryName(longestStay.isoCountryCode, $locale)}
            </p>
            <p class="text-xs font-mono" style="color: var(--app-accent)">
              {$t("wrapped.days_straight", {
                values: { count: longestStay.days },
              })}
            </p>
          </div>
        {/if}

        {#if mostTraveledMonth.month}
          <div
            class="rounded-xl p-4 space-y-1"
            style="background: var(--app-surface)"
          >
            <p class="text-xs" style="color: var(--app-muted)">
              {$t("wrapped.most_traveled_month")}
            </p>
            <p
              class="text-xl font-bold capitalize mt-1"
              style="color: var(--app-fg)"
            >
              {formatMonth(mostTraveledMonth.month)}
            </p>
            <p class="text-xs font-mono" style="color: var(--app-accent)">
              {$t("wrapped.distinct_countries", {
                values: { count: mostTraveledMonth.countries },
              })}
            </p>
          </div>
        {/if}

        {#if newCountries.length > 0}
          <div
            class="rounded-xl p-4 space-y-1"
            style="background: var(--app-surface)"
          >
            <p class="text-xs" style="color: var(--app-muted)">
              {$t("wrapped.new_countries")}
            </p>
            <p class="text-3xl font-black mt-1" style="color: var(--app-fg)">
              {newCountries.length}
            </p>
            <p class="text-xs" style="color: var(--app-muted)">
              {$t("wrapped.for_first_time")}
            </p>
          </div>
        {:else if beforeEntries.length === 0}
          <!-- First year of data -->
        {:else}
          <div
            class="rounded-xl p-4 space-y-1"
            style="background: var(--app-surface)"
          >
            <p class="text-xs" style="color: var(--app-muted)">
              {$t("wrapped.new_countries")}
            </p>
            <p
              class="text-3xl font-black mt-1"
              style="color: var(--app-muted); opacity: 0.4"
            >
              0
            </p>
            <p class="text-xs" style="color: var(--app-muted); opacity: 0.5">
              {$t("wrapped.none_new")}
            </p>
          </div>
        {/if}
      </div>

      <!-- New countries detail -->
      {#if newCountries.length > 0}
        <div class="space-y-2">
          <p
            class="text-xs uppercase tracking-wider"
            style="color: var(--app-muted)"
          >
            {$t("wrapped.new_this_year")}
          </p>
          <div class="flex flex-wrap gap-2">
            {#each newCountries as stat}
              <span
                class="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
                style="background: var(--app-accent-subtle); border: 1px solid var(--app-accent); color: var(--app-accent); opacity: 0.9"
              >
                {flagEmoji(stat.isoCountryCode)}
                {getCountryName(stat.isoCountryCode, $locale)}
              </span>
            {/each}
          </div>
        </div>
      {/if}

      <!-- All countries this year -->
      <div class="space-y-2">
        <p
          class="text-xs uppercase tracking-wider"
          style="color: var(--app-muted)"
        >
          {$t("wrapped.all_countries")}
        </p>
        <div class="space-y-2">
          {#each yearStats as stat}
            {@const isNew = newCountries.some(
              (n) => n.isoCountryCode === stat.isoCountryCode,
            )}
            {@const pct = Math.round((stat.days / yearStats[0].days) * 100)}
            <div class="flex items-center gap-3">
              <span class="text-lg leading-none w-7 text-center"
                >{flagEmoji(stat.isoCountryCode)}</span
              >
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5 mb-1">
                  <span class="text-sm truncate" style="color: var(--app-fg)"
                    >{getCountryName(stat.isoCountryCode, $locale)}</span
                  >
                  {#if isNew && beforeEntries.length > 0}
                    <span
                      class="text-[10px] px-1.5 py-0.5 rounded-full leading-none"
                      style="background: var(--app-accent-subtle); color: var(--app-accent)"
                      >{$t("wrapped.new")}</span
                    >
                  {/if}
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
              <span
                class="text-xs font-mono w-10 text-right"
                style="color: var(--app-muted)">{stat.days}d</span
              >
            </div>
          {/each}
        </div>
      </div>

      <!-- Stays detail -->
      {#if yearStays.length > 0}
        <div class="space-y-2">
          <p
            class="text-xs uppercase tracking-wider"
            style="color: var(--app-muted)"
          >
            {$t("wrapped.stays")}
          </p>
          <div class="space-y-1">
            {#each yearStays as stay}
              <div
                class="flex items-center gap-3 text-sm py-1.5 border-b last:border-0"
                style="border-color: var(--app-border)"
              >
                <span class="text-base leading-none"
                  >{flagEmoji(stay.isoCountryCode)}</span
                >
                <span class="flex-1 truncate" style="color: var(--app-fg)"
                  >{getCountryName(stay.isoCountryCode, $locale)}</span
                >
                <span class="text-xs" style="color: var(--app-muted)">
                  {formatDate(stay.startDate)}
                  {#if stay.days > 1}→ {formatDate(stay.endDate)}{/if}
                </span>
                <span
                  class="text-xs font-mono w-8 text-right"
                  style="color: var(--app-muted)">{stay.days}d</span
                >
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>
