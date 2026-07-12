<script lang="ts">
  import { tweened } from "svelte/motion";
  import { cubicOut } from "svelte/easing";
  import { onMount } from "svelte";
  import type { Snippet } from "svelte";

  interface Segment {
    value: number;
    color: string;
  }

  let {
    size = 200,
    stroke = 14,
    segments = [],
    total,
    trackColor = "var(--app-track)",
    gap = 4,
    duration = 950,
    children,
  }: {
    size?: number;
    stroke?: number;
    segments?: Segment[];
    /** Denominator the ring represents (filled arc = sum(segments)/total). */
    total: number;
    trackColor?: string;
    gap?: number;
    duration?: number;
    children?: Snippet;
  } = $props();

  const r = $derived((size - stroke) / 2);
  const circ = $derived(2 * Math.PI * r);

  // Honour reduced-motion: skip the draw-in and paint the final ring at once.
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const progress = tweened(0, {
    duration: reduce ? 0 : duration,
    easing: cubicOut,
  });
  onMount(() => progress.set(1));

  // Cumulative start (in value units) so each arc is anchored to its real slot;
  // the gap is taken from the tail of each arc, never shifting the next one.
  const arcs = $derived.by(() => {
    let acc = 0;
    return segments.map((s) => {
      const start = acc;
      acc += s.value;
      return { value: s.value, color: s.color, start };
    });
  });
</script>

<div
  class="relative inline-grid place-items-center"
  style="width: {size}px; height: {size}px"
>
  <svg
    width={size}
    height={size}
    viewBox="0 0 {size} {size}"
    style="transform: rotate(-90deg)"
  >
    <circle
      cx={size / 2}
      cy={size / 2}
      {r}
      fill="none"
      stroke={trackColor}
      stroke-width={stroke}
    />
    {#each arcs as arc (arc.color + "_" + arc.start)}
      {@const len = total > 0 ? (arc.value / total) * circ * $progress : 0}
      {@const off = total > 0 ? (arc.start / total) * circ * $progress : 0}
      {@const drawn = len <= gap ? len : len - gap}
      {#if drawn > 0}
        <circle
          cx={size / 2}
          cy={size / 2}
          {r}
          fill="none"
          stroke={arc.color}
          stroke-width={stroke}
          stroke-linecap="round"
          stroke-dasharray="{drawn} {circ - drawn}"
          stroke-dashoffset={-off}
        />
      {/if}
    {/each}
  </svg>

  {#if children}
    <div class="absolute inset-0 grid place-items-center text-center leading-none">
      {@render children()}
    </div>
  {/if}
</div>
