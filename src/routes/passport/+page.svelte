<script lang="ts">
  import { entriesStore } from "$lib/entriesStore.svelte";
  import { t } from "svelte-i18n";
  import { flagEmoji } from "$lib/flag";
  import {
    getContinent,
    CONTINENT_LABELS,
    CONTINENT_TOTALS,
    type Continent,
  } from "$lib/continents";
  import type { CountryStat } from "$lib/types";

  const CONTINENT_ORDER: Continent[] = [
    "Europe",
    "Asia",
    "Africa",
    "America",
    "Oceania",
    "Antarctica",
  ];

  const byContinent = $derived(() => {
    const map = new Map<Continent, CountryStat[]>();
    for (const stat of entriesStore.countryStats) {
      const c = getContinent(stat.isoCountryCode);
      if (!c) continue;
      if (!map.has(c)) map.set(c, []);
      map.get(c)!.push(stat);
    }
    return map;
  });

  const totalCountriesInWorld = 195;
  const coveragePct = $derived(
    Math.round((entriesStore.totalCountries / totalCountriesInWorld) * 100),
  );

  function firstVisitYear(stat: CountryStat) {
    return new Date(stat.firstVisit).getFullYear();
  }

  let expanded = $state<Set<Continent>>(new Set(CONTINENT_ORDER));

  function toggle(c: Continent) {
    const next = new Set(expanded);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    expanded = next;
  }
</script>

<div
  class="flex-1 overflow-y-auto"
  style="padding-bottom: var(--nav-clearance)"
>
  <div class="px-4 py-6 max-w-2xl mx-auto space-y-6">
    <div class="flex items-start justify-between">
      <div>
        <h1 class="text-2xl font-bold" style="color: var(--app-fg)">
          {$t("passport.title")}
        </h1>
        <p class="text-sm mt-1" style="color: var(--app-muted)">
          {$t("passport.subtitle")}
        </p>
      </div>
      <a
        href="/sync"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium mt-1 transition-opacity hover:opacity-70"
        style="background: var(--app-surface); color: var(--app-muted); border: 1px solid var(--app-border)"
      >
        <svg
          class="w-3.5 h-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
          <path d="M8 16H3v5" />
        </svg>
        {$t("passport.import")}
      </a>
    </div>

    {#if entriesStore.totalDays === 0}
      <p class="text-sm" style="color: var(--app-muted)">
        {$t("passport.no_data")}
        <a href="/sync" class="underline" style="color: var(--app-accent)"
          >{$t("passport.import_json")}</a
        >.
      </p>
    {:else}
      <!-- Global progress -->
      <div
        class="rounded-2xl p-5 space-y-3"
        style="background: var(--app-surface)"
      >
        <div class="flex items-end justify-between">
          <div>
            <p class="text-4xl font-bold" style="color: var(--app-fg)">
              {entriesStore.totalCountries}
            </p>
            <p class="text-sm" style="color: var(--app-muted)">
              {$t("passport.of_countries", {
                values: { total: totalCountriesInWorld },
              })}
            </p>
          </div>
          <p
            class="text-5xl font-black"
            style="color: var(--app-fg); opacity: 0.15"
          >
            {coveragePct}%
          </p>
        </div>
        <div
          class="h-2 rounded-full overflow-hidden"
          style="background: var(--app-track)"
        >
          <div
            class="h-full rounded-full transition-all"
            style="width: {coveragePct}%; background: var(--app-accent)"
          ></div>
        </div>
        <p class="text-xs" style="color: var(--app-muted)">
          {$t("passport.countries_left", {
            values: {
              left: totalCountriesInWorld - entriesStore.totalCountries,
            },
          })}
        </p>
      </div>

      <!-- By continent -->
      <div class="space-y-2">
        {#each CONTINENT_ORDER as continent}
          {@const countries = byContinent().get(continent) ?? []}
          {@const total = CONTINENT_TOTALS[continent]}
          {@const visited = countries.length}
          {@const pct = Math.round((visited / total) * 100)}
          {@const isExpanded = expanded.has(continent)}

          <div
            class="rounded-xl overflow-hidden"
            style="background: var(--app-surface)"
          >
            <!-- Continent header -->
            <button
              class="w-full flex items-center gap-3 px-4 py-3 text-left transition-opacity hover:opacity-75"
              onclick={() => toggle(continent)}
            >
              <div class="flex-1 min-w-0">
                <div class="flex items-baseline gap-2">
                  <span
                    class="font-medium text-sm"
                    style="color: var(--app-fg)"
                  >
                    {CONTINENT_LABELS[continent]}
                  </span>
                  <span class="text-xs" style="color: var(--app-muted)"
                    >{visited}/{total}</span
                  >
                </div>
                <div
                  class="h-1 rounded-full mt-1.5 overflow-hidden"
                  style="background: var(--app-track)"
                >
                  <div
                    class="h-full rounded-full transition-all"
                    style="width: {Math.max(
                      pct,
                      pct > 0 ? 2 : 0,
                    )}%; background: var(--app-accent); opacity: {pct > 50
                      ? 1
                      : pct > 25
                        ? 0.75
                        : pct > 0
                          ? 0.5
                          : 0}"
                  ></div>
                </div>
              </div>
              <span
                class="text-xs font-mono w-8 text-right"
                style="color: var(--app-muted)">{pct}%</span
              >
              <span
                class="text-xs ml-1"
                style="color: var(--app-muted); opacity: 0.5"
                >{isExpanded ? "▲" : "▼"}</span
              >
            </button>

            <!-- Country list -->
            {#if isExpanded && visited > 0}
              <div class="border-t" style="border-color: var(--app-border)">
                {#each countries as stat, i}
                  <div
                    class="flex items-center gap-3 px-4 py-2.5 text-sm"
                    style={i < countries.length - 1
                      ? `border-bottom: 1px solid var(--app-border)`
                      : ""}
                  >
                    <span class="text-lg leading-none"
                      >{flagEmoji(stat.isoCountryCode)}</span
                    >
                    <span class="flex-1 truncate" style="color: var(--app-fg)"
                      >{stat.country}</span
                    >
                    <span class="text-xs" style="color: var(--app-muted)"
                      >{firstVisitYear(stat)}</span
                    >
                    <span
                      class="font-mono text-xs w-16 text-right"
                      style="color: var(--app-muted)">{stat.days}d</span
                    >
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
