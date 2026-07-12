<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import * as d3 from "d3";
  import { feature } from "topojson-client";
  import type { Topology } from "topojson-specification";
  import { numericToAlpha2 } from "i18n-iso-countries";
  import { flagEmoji } from "$lib/flag";
  import { themeStore } from "$lib/themeStore.svelte";

  export interface FlightStop {
    code: string;
    color: string;
    label: string;
    date: number;
    countriesSoFar: number;
    daysSoFar: number;
  }

  let {
    stops,
    playable = true,
    autoplay = true,
    countriesLabel = "",
    daysLabel = "",
  }: {
    stops: FlightStop[];
    playable?: boolean;
    autoplay?: boolean;
    countriesLabel?: string;
    daysLabel?: string;
  } = $props();

  let container = $state<HTMLDivElement>();
  let width = $state(0);
  let worldData = $state<Topology | null>(null);

  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  function alpha2(d: any): string {
    return numericToAlpha2(String(d.id).padStart(3, "0")) ?? "";
  }

  const highlight = $derived(new Map(stops.map((s) => [s.code, s.color])));

  const featByCode = $derived.by(() => {
    const m = new Map<string, any>();
    if (!worldData) return m;
    const fs = (feature(worldData as any, (worldData as any).objects.countries) as any).features;
    for (const f of fs) {
      const c = alpha2(f);
      if (c && !m.has(c)) m.set(c, f);
    }
    return m;
  });

  // ── Geometry ──────────────────────────────────────────────────────────
  const layout = $derived.by(() => {
    void themeStore.current;
    if (!worldData || !width || featByCode.size === 0) return null;
    const height = Math.round(width * 0.66);
    const pad = 40;

    // Frame the visited countries by their real geometry (not just centroids),
    // so no visited country gets cropped, and never zoom in too hard.
    const visitedFeatures = [...new Set(stops.map((s) => s.code))]
      .map((c) => featByCode.get(c))
      .filter(Boolean);

    const projection = d3.geoNaturalEarth1();
    if (visitedFeatures.length > 0) {
      const fc = { type: "FeatureCollection", features: visitedFeatures } as any;
      projection.fitExtent([[pad, pad], [width - pad, height - pad]], fc);
      const kMax = (width / 6.4) * 4.2; // cap zoom → gentle, roomy framing
      if (projection.scale() > kMax) {
        projection.scale(kMax);
        const c = d3.geoCentroid(fc);
        projection.translate([width / 2, height / 2]);
        const p = projection(c);
        if (p) projection.translate([width - p[0], height - p[1]]);
      }
    } else {
      projection.scale(width / 6.4).translate([width / 2, height / 2]);
    }

    const pathGen = d3.geoPath(projection);
    const isLight = themeStore.current === "light";
    const landBase = isLight ? "#cbd5e1" : "#1e293b";
    const landStroke = isLight ? "#94a3b8" : "#0f172a";

    const allFeatures = (feature(worldData as any, (worldData as any).objects.countries) as any).features;
    const land = allFeatures.map((f: any) => {
      const hl = highlight.get(alpha2(f));
      return { d: pathGen(f) ?? "", fill: hl ? `${hl}59` : landBase, stroke: landStroke };
    });

    const coords = stops.map((s) => {
      const f = featByCode.get(s.code);
      return f ? (d3.geoCentroid(f) as [number, number]) : null;
    });
    const pts = stops
      .map((s, i) => {
        const c = coords[i];
        const xy = c ? projection(c) : null;
        return xy ? { ...s, x: xy[0], y: xy[1] } : null;
      })
      .filter((p): p is FlightStop & { x: number; y: number } => !!p);

    const arcs = [];
    let totalLen = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const lift = Math.min(dist * 0.3, 90);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2 - lift;
      totalLen += dist;
      arcs.push({
        d: `M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`,
        ax: a.x, ay: a.y, bx: b.x, by: b.y, cx, cy, len: dist,
      });
    }

    return { width, height, land, pts, arcs, totalLen };
  });

  // ── Playback state ───────────────────────────────────────────────────────
  type Mode = "idle" | "playing" | "paused" | "done";
  let mode = $state<Mode>("idle");
  let legIndex = $state(0);
  let legT = $state(0);

  const arcCount = $derived(layout?.arcs.length ?? 0);
  const progress = $derived(arcCount ? (legIndex + legT) / arcCount : 0);

  // Constant map-space speed → longer hops take proportionally longer.
  function legDur(i: number) {
    if (!layout || layout.totalLen === 0) return 700;
    const target = Math.max(3000, Math.min(11000, arcCount * 780));
    return Math.max(160, (layout.arcs[i].len / layout.totalLen) * target);
  }

  function planeAt(li: number, t: number) {
    if (!layout) return null;
    const arc = layout.arcs[li];
    if (!arc) return null;
    const mt = 1 - t;
    const x = mt * mt * arc.ax + 2 * mt * t * arc.cx + t * t * arc.bx;
    const y = mt * mt * arc.ay + 2 * mt * t * arc.cy + t * t * arc.by;
    const dx = 2 * mt * (arc.cx - arc.ax) + 2 * t * (arc.bx - arc.cx);
    const dy = 2 * mt * (arc.cy - arc.ay) + 2 * t * (arc.by - arc.cy);
    return { x, y, angle: (Math.atan2(dy, dx) * 180) / Math.PI };
  }

  const plane = $derived(mode === "playing" ? planeAt(legIndex, legT) : null);

  // Running totals, interpolated across the current leg so they count up
  // smoothly instead of snapping at each arrival.
  const counters = $derived.by(() => {
    const pts = layout?.pts;
    if (!pts || pts.length === 0) return { c: 0, d: 0 };
    if (mode === "playing" || mode === "paused") {
      const from = pts[Math.min(legIndex, pts.length - 1)];
      const to = pts[Math.min(legIndex + 1, pts.length - 1)];
      return {
        c: Math.round(from.countriesSoFar + (to.countriesSoFar - from.countriesSoFar) * legT),
        d: Math.round(from.daysSoFar + (to.daysSoFar - from.daysSoFar) * legT),
      };
    }
    const last = pts[pts.length - 1];
    return { c: last.countriesSoFar, d: last.daysSoFar };
  });
  const leg = $derived.by(() => {
    if (!layout || mode !== "playing") return null;
    const from = layout.pts[legIndex];
    const to = layout.pts[legIndex + 1];
    return from && to ? { from, to } : null;
  });

  // ── Camera (viewBox) that follows the plane, zooms out when idle/done ─────
  let cam = $state({ x: 0, y: 0, w: 0, h: 0 });
  const vs = $derived(layout && cam.w > 0 ? cam.w / layout.width : 1);

  function camTargetRect() {
    if (!layout) return { x: 0, y: 0, w: 0, h: 0 };
    const W = layout.width, H = layout.height;
    const follow = mode === "playing" || mode === "paused";
    const pl = follow ? planeAt(legIndex, legT) : null;
    if (follow && pl) {
      const k = 2.3;
      const w = W / k, h = H / k;
      let x = pl.x - w / 2;
      let y = pl.y - h / 2;
      x = Math.max(-w * 0.15, Math.min(W - w * 0.85, x));
      y = Math.max(-h * 0.15, Math.min(H - h * 0.85, y));
      return { x, y, w, h };
    }
    return { x: 0, y: 0, w: W, h: H };
  }

  let raf = 0;
  let last: number | null = null;
  let looping = false;

  function loop(ts: number) {
    if (last == null) last = ts;
    const dt = Math.min(48, ts - last);
    last = ts;

    if (mode === "playing") {
      legT += dt / legDur(legIndex);
      while (legT >= 1) {
        legT -= 1;
        legIndex += 1;
        if (legIndex >= arcCount) {
          legIndex = Math.max(0, arcCount - 1);
          legT = 1;
          mode = "done";
          break;
        }
      }
    }

    const target = camTargetRect();
    if (target.w > 0) {
      const a = 1 - Math.pow(1 - 0.16, dt / 16.67);
      cam = {
        x: cam.x + (target.x - cam.x) * a,
        y: cam.y + (target.y - cam.y) * a,
        w: cam.w + (target.w - cam.w) * a,
        h: cam.h + (target.h - cam.h) * a,
      };
    }
    const settled =
      Math.abs(cam.x - target.x) < 0.5 &&
      Math.abs(cam.w - target.w) < 0.5 &&
      Math.abs(cam.y - target.y) < 0.5;

    if (mode === "playing" || !settled) {
      raf = requestAnimationFrame(loop);
    } else {
      looping = false;
    }
  }
  function ensureLoop() {
    if (looping) return;
    looping = true;
    last = null;
    raf = requestAnimationFrame(loop);
  }

  function play() {
    if (arcCount === 0) {
      mode = "done";
      return;
    }
    legIndex = 0;
    legT = 0;
    mode = "playing";
    ensureLoop();
  }

  // Tap the map: pause while playing, resume when paused, replay when finished.
  function mapTap() {
    if (!playable || arcCount === 0) return;
    if (mode === "playing") mode = "paused";
    else if (mode === "done") play();
    else {
      mode = "playing";
      ensureLoop();
    }
  }

  // Bottom bar acts as a scrubber (tap or drag to seek).
  let scrubbing = false;
  function seekAt(clientX: number, el: HTMLElement) {
    if (arcCount === 0) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(0.999, (clientX - rect.left) / rect.width));
    const total = frac * arcCount;
    legIndex = Math.min(arcCount - 1, Math.floor(total));
    legT = total - legIndex;
  }
  function barDown(e: PointerEvent) {
    e.stopPropagation();
    if (arcCount === 0) return;
    scrubbing = true;
    mode = "paused";
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    seekAt(e.clientX, e.currentTarget as HTMLElement);
    ensureLoop();
  }
  function barMove(e: PointerEvent) {
    if (!scrubbing) return;
    e.stopPropagation();
    seekAt(e.clientX, e.currentTarget as HTMLElement);
  }
  function barUp(e: PointerEvent) {
    e.stopPropagation();
    scrubbing = false;
  }

  let started = false;
  $effect(() => {
    if (!layout) return;
    if (cam.w === 0) cam = { x: 0, y: 0, w: layout.width, h: layout.height };
    if (started) return;
    started = true;
    if (playable && autoplay && !reduce && arcCount > 0) play();
    else mode = "done";
  });

  onMount(() => {
    let rafResize = 0;
    let ro: ResizeObserver | null = null;
    (async () => {
      const raw = await import("world-atlas/countries-110m.json");
      worldData = raw.default as unknown as Topology;
      ro = new ResizeObserver(() => {
        cancelAnimationFrame(rafResize);
        rafResize = requestAnimationFrame(() => {
          if (container) width = container.clientWidth;
        });
      });
      if (container) {
        ro.observe(container);
        width = container.clientWidth;
      }
    })();
    return () => {
      if (ro) ro.disconnect();
      cancelAnimationFrame(rafResize);
    };
  });

  onDestroy(() => cancelAnimationFrame(raf));

  function arcDashoffset(i: number) {
    if (mode === "done" || mode === "idle") return 0;
    if (i < legIndex) return 0;
    if (i === legIndex) return 1 - legT;
    return 1;
  }
  function stopVisible(i: number) {
    return mode === "done" || mode === "idle" || i <= legIndex;
  }
</script>

<div
  bind:this={container}
  class="relative w-full overflow-hidden rounded-2xl select-none"
  class:cursor-pointer={playable && arcCount > 0}
  style="background: var(--map-bg); border: 1px solid var(--app-border)"
  role="button"
  tabindex={playable ? 0 : -1}
  aria-label="Flight map"
  onclick={mapTap}
  onkeydown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      mapTap();
    }
  }}
>
  {#if layout}
    <svg width="100%" viewBox="{cam.x} {cam.y} {cam.w} {cam.h}" style="display: block">
      <g>
        {#each layout.land as c}
          <path d={c.d} fill={c.fill} stroke={c.stroke} stroke-width={0.4 * vs} />
        {/each}
      </g>

      <g fill="none" stroke="var(--app-accent)" stroke-linecap="round" stroke-width={1.6 * vs}>
        {#each layout.arcs as arc, i}
          <path
            d={arc.d}
            pathLength="1"
            stroke-dasharray="1"
            stroke-dashoffset={arcDashoffset(i)}
            opacity={mode === "playing" && i > legIndex ? 0 : 0.9}
          />
        {/each}
      </g>

      <g>
        {#each layout.pts as p, i}
          {#if stopVisible(i)}
            <g>
              <circle cx={p.x} cy={p.y} r={3.6 * vs} fill={p.color} opacity="0.3" />
              <circle cx={p.x} cy={p.y} r={2 * vs} fill={p.color} stroke="var(--map-bg)" stroke-width={0.6 * vs} />
            </g>
          {/if}
        {/each}
      </g>

      {#if plane}
        <g transform="translate({plane.x} {plane.y}) rotate({plane.angle}) scale({vs})">
          <circle r="7" fill="var(--app-accent)" opacity="0.18" />
          <path d="M8 0 L-6 5 L-2 0 L-6 -5 Z" fill="var(--app-fg)" stroke="var(--map-bg)" stroke-width="0.6" />
        </g>
      {/if}
    </svg>

    <!-- Running counters -->
    <div class="absolute top-2 inset-x-2 flex justify-between pointer-events-none">
      <div class="px-2.5 py-1 rounded-lg text-xs font-semibold tabular-nums" style="background: var(--glass-bg); border: 1px solid var(--glass-border); color: var(--app-fg); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px)">
        {counters.c}
        <span style="color: var(--app-muted); font-weight: 400">{countriesLabel}</span>
      </div>
      <div class="px-2.5 py-1 rounded-lg text-xs font-semibold tabular-nums" style="background: var(--glass-bg); border: 1px solid var(--glass-border); color: var(--app-fg); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px)">
        {counters.d}
        <span style="color: var(--app-muted); font-weight: 400">{daysLabel}</span>
      </div>
    </div>

    <!-- Boarding-pass caption -->
    {#if leg}
      <div class="absolute left-2 right-2 bottom-11 flex justify-center pointer-events-none">
        <div class="px-3 py-1.5 rounded-lg text-sm font-mono tabular-nums flex items-center gap-1.5" style="background: var(--glass-bg); border: 1px solid var(--glass-border); color: var(--app-fg); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px)">
          <span>{flagEmoji(leg.from.code)} {leg.from.label}</span>
          <span style="color: var(--app-muted)">→</span>
          <span>{flagEmoji(leg.to.code)} {leg.to.label}</span>
        </div>
      </div>
    {/if}

    <!-- Centred play affordance while stopped -->
    {#if playable && arcCount > 0 && mode !== "playing"}
      <div class="absolute inset-0 grid place-items-center pointer-events-none">
        <div
          class="w-14 h-14 grid place-items-center rounded-full"
          style="background: var(--glass-bg); border: 1px solid var(--glass-border); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px)"
        >
          <svg class="w-6 h-6" style="color: var(--app-fg)" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </div>
      </div>
    {/if}

    <!-- Scrubber bar (tap or drag to seek) -->
    {#if playable && arcCount > 0}
      <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
      <div
        class="absolute inset-x-2 bottom-2 py-2 cursor-pointer"
        onpointerdown={barDown}
        onpointermove={barMove}
        onpointerup={barUp}
        onclick={(e) => e.stopPropagation()}
      >
        <div class="h-1.5 rounded-full overflow-hidden" style="background: var(--app-track)">
          <div class="h-full rounded-full" style="width: {progress * 100}%; background: var(--app-accent)"></div>
        </div>
      </div>
    {/if}
  {:else}
    <div class="flex items-center justify-center" style="height: {Math.round((width || 320) * 0.66)}px; color: var(--app-muted)">
      <svg class="w-6 h-6 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
    </div>
  {/if}
</div>
