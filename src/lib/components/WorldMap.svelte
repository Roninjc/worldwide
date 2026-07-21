<script lang="ts">
  import { onMount } from "svelte";
  import * as d3 from "d3";
  import { feature } from "topojson-client";
  import type { Topology } from "topojson-specification";
  import { numericToAlpha2 } from "i18n-iso-countries";
  import { t, locale } from "svelte-i18n";
  import { getCountryName } from "$lib/countryName";
  import { themeStore } from "$lib/themeStore.svelte";

  interface MapAPI {
    zoomToVisited: () => void;
    resetZoom: () => void;
  }

  interface Props {
    daysByCountry: Map<string, number>;
    onCountryClick?: (alpha2: string) => void;
    api?: MapAPI | null;
  }

  let {
    daysByCountry,
    onCountryClick,
    api = $bindable(null),
  }: Props = $props();

  let container: HTMLDivElement | undefined = $state();
  let svgEl: SVGSVGElement | undefined = $state();
  let tooltip = $state<{
    name: string;
    days: number;
    x: number;
    y: number;
  } | null>(null);
  let worldData = $state<Topology | null>(null);
  let zoomScale = $state(1);

  // D3 internals (not reactive state)
  let g: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;
  let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;
  let currentTransform = d3.zoomIdentity;

  // Tap detection (pointerdown → pointerup, bypassing D3 zoom capture)
  let tapAlpha2: string | null = null;
  let tapX = 0;
  let tapY = 0;

  // ── Helpers ──────────────────────────────────────────────────────────
  function alpha2FromFeature(d: any): string {
    return numericToAlpha2(String(d.id).padStart(3, "0")) ?? "";
  }

  function countryColor(alpha2: string): string {
    const days = daysByCountry.get(alpha2) ?? 0;
    if (themeStore.current === "light") {
      if (days === 0) return "#cbd5e1";
      if (days < 8) return "#bae6fd";
      if (days < 30) return "#7dd3fc";
      if (days < 90) return "#0284c7";
      return "#0369a1";
    }
    if (days === 0) return "#1e293b";
    if (days < 8) return "#164e63";
    if (days < 30) return "#0c6a8a";
    if (days < 90) return "#0284c7";
    return "#38bdf8";
  }

  const MAP_ASPECT = 0.62;

  // ── Build all paths (initial + resize) ──────────────────────────────
  function buildPaths() {
    if (!svgEl || !worldData || !container) return;
    const width = container.clientWidth;
    if (width === 0) return;
    const height = Math.round(width * MAP_ASPECT);

    const svg = d3
      .select(svgEl)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("height", height);

    svg.selectAll("*").remove();

    const projection = d3
      .geoNaturalEarth1()
      .scale(width / 5.7)
      .translate([width / 2, height / 2]);
    const pathGen = d3.geoPath(projection);
    const countries = feature(
      worldData as any,
      (worldData as any).objects.countries,
    );

    g = svg.append("g");
    g.selectAll("path")
      .data((countries as any).features)
      .join("path")
      .attr("d", pathGen as any)
      .attr("fill", (d: any) => countryColor(alpha2FromFeature(d)))
      .attr("stroke", themeStore.current === "light" ? "#94a3b8" : "#0f172a")
      .attr("stroke-width", 0.4 / currentTransform.k)
      .on("mousemove", (event: MouseEvent, d: any) => {
        const alpha2 = alpha2FromFeature(d);
        const rect = container!.getBoundingClientRect();
        tooltip = {
          name: getCountryName(alpha2, $locale),
          days: daysByCountry.get(alpha2) ?? 0,
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        };
      })
      .on("mouseleave", () => {
        tooltip = null;
      })
      .on("pointerdown", (event: PointerEvent, d: any) => {
        // Record tap candidate BEFORE D3 zoom calls setPointerCapture on the SVG.
        // pointerdown bubbles path→svg, so this fires before D3's svg handler.
        const alpha2 = alpha2FromFeature(d);
        tapAlpha2 = (daysByCountry.get(alpha2) ?? 0) > 0 ? alpha2 : null;
        tapX = event.clientX;
        tapY = event.clientY;
      });

    // ── Zoom behavior ─────────────────────────────────────────────────
    if (!zoomBehavior) {
      zoomBehavior = d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([1, 12])
        .on("zoom", (event) => {
          currentTransform = event.transform;
          zoomScale = event.transform.k;
          if (g) {
            g.attr("transform", event.transform);
            g.selectAll("path").attr("stroke-width", 0.4 / event.transform.k);
          }
        });
    }

    // Re-apply zoom behavior and restore current transform
    svg.call(zoomBehavior);
    svg.call(zoomBehavior.transform, currentTransform);

    // Tap detection on `click`, not `pointerup`: on iOS the tap's emulated
    // click fires AFTER pointerup, so opening a sheet on pointerup lets that
    // ghost click land on the sheet's backdrop and close it instantly.
    // Acting on the click itself consumes it. The click still reaches the SVG
    // when D3 zoom captures the pointer, and we measure movement since
    // pointerdown — small movement = tap, not drag.
    // Using a D3 namespace so repeated buildPaths() calls replace rather than stack.
    svg.on("click.tap", (event: MouseEvent) => {
      const moved = Math.hypot(event.clientX - tapX, event.clientY - tapY);
      if (moved < 8) {
        if (tapAlpha2) {
          onCountryClick?.(tapAlpha2);
        } else {
          onCountryClick?.(""); // tapped background → deselect
        }
      }
      tapAlpha2 = null;
    });
  }

  // ── Update only fill colors ──────────────────────────────────────────
  function updateColors(duration: number) {
    if (!g) return;
    const stroke = themeStore.current === "light" ? "#94a3b8" : "#0f172a";
    g.selectAll<SVGPathElement, any>("path")
      .transition()
      .duration(duration)
      .attr("fill", (d: any) => countryColor(alpha2FromFeature(d)))
      .attr("stroke", stroke);
  }

  // ── Zoom to visited countries ────────────────────────────────────────
  function zoomToVisited() {
    if (!svgEl || !g || !container || !zoomBehavior) return;

    const visitedPaths = g
      .selectAll<SVGPathElement, any>("path")
      .filter((d) => {
        return (daysByCountry.get(alpha2FromFeature(d)) ?? 0) > 0;
      });
    if (visitedPaths.empty()) return;

    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    visitedPaths.each(function () {
      const b = this.getBBox();
      if (b.width === 0 && b.height === 0) return;
      x0 = Math.min(x0, b.x);
      y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.width);
      y1 = Math.max(y1, b.y + b.height);
    });
    if (!isFinite(x0)) return;

    const width = container.clientWidth;
    const height = Math.round(width * MAP_ASPECT);
    const pad = 32;
    const scale = Math.min(
      (width - pad * 2) / (x1 - x0),
      (height - pad * 2) / (y1 - y0),
      10,
    );
    const tx = width / 2 - scale * ((x0 + x1) / 2);
    const ty = height / 2 - scale * ((y0 + y1) / 2);

    d3.select(svgEl)
      .transition()
      .duration(750)
      .call(
        zoomBehavior.transform,
        d3.zoomIdentity.translate(tx, ty).scale(scale),
      );
  }

  // ── Reset to world view ──────────────────────────────────────────────
  function resetZoom() {
    if (!svgEl || !zoomBehavior) return;
    d3.select(svgEl)
      .transition()
      .duration(500)
      .call(zoomBehavior.transform, d3.zoomIdentity);
  }

  // ── Expose API to parent ─────────────────────────────────────────────
  $effect(() => {
    api = { zoomToVisited, resetZoom };
  });

  // ── Load data + ResizeObserver ───────────────────────────────────────
  onMount(() => {
    let rafId: number;
    let ro: ResizeObserver | null = null;

    (async () => {
      const raw = await import("world-atlas/countries-110m.json");
      worldData = raw.default as unknown as Topology;

      ro = new ResizeObserver(() => {
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(buildPaths);
      });
      if (container) ro.observe(container);
    })();

    return () => {
      if (ro) ro.disconnect();
      cancelAnimationFrame(rafId);
    };
  });

  // ── Animate colors on data/theme change, build paths on first render ──
  $effect(() => {
    const _data = daysByCountry;
    const _theme = themeStore.current; // track as reactive dependency
    if (!svgEl || !worldData || !container) return;
    if (!g) {
      buildPaths();
    } else {
      updateColors(350);
    }
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="relative w-full select-none"
  bind:this={container}
  ontouchend={() => {
    tooltip = null;
  }}
>
  {#if !worldData}
    <div class="flex items-center justify-center h-48 text-slate-600 text-sm">
      {$t("map.loading")}
    </div>
  {:else}
    <svg
      bind:this={svgEl}
      class="w-full cursor-grab active:cursor-grabbing"
      aria-label="Mapa mundial"
    ></svg>

    {#if daysByCountry.size > 0}
      {@const zoomed = zoomScale > 1.05}
      <button
        class="absolute top-2 right-2 w-10 h-10 flex items-center justify-center rounded-lg shadow-lg transition hover:opacity-70 active:scale-95"
        style="background: var(--glass-bg); border: 1px solid var(--glass-border); color: var(--app-fg); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);"
        title={zoomed ? "Vista global" : "Zoom a países visitados"}
        onclick={() => (zoomed ? resetZoom() : zoomToVisited())}
      >
        {#if zoomed}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0" />
            <path d="M3.6 9h16.8M3.6 15h16.8" />
            <path d="M11.5 3a17 17 0 0 0 0 18M12.5 3a17 17 0 0 1 0 18" />
          </svg>
        {:else}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            <path d="M11 8v6M8 11h6" />
          </svg>
        {/if}
      </button>
    {/if}
  {/if}

  {#if tooltip}
    <div
      class="pointer-events-none absolute z-10 px-3 py-2 rounded-lg text-sm shadow-xl"
      style="
				left: {Math.min(tooltip.x + 12, (container?.clientWidth ?? 300) - 160)}px;
				top: {Math.max(tooltip.y - 56, 4)}px;
				background: var(--glass-bg);
				border: 1px solid var(--glass-border);
				color: var(--app-fg);
				backdrop-filter: blur(12px);
				-webkit-backdrop-filter: blur(12px);
			"
    >
      <p class="font-medium">{tooltip.name}</p>
      <p class="text-xs" style="color: var(--app-muted)">
        {tooltip.days > 0
          ? `${tooltip.days} día${tooltip.days === 1 ? "" : "s"}`
          : "Sin visitar"}
      </p>
    </div>
  {/if}
</div>
