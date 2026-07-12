<script lang="ts">
  // A passport-style ink stamp rendered entirely in SVG: double ring, country
  // name curved along the top arc, first-visit date along the bottom, ISO code
  // and day-count in the centre. Inked in a single colour with a rubber-stamp
  // wobble (turbulence + displacement) so it reads as hand-applied, never flat.

  let {
    code,
    name,
    dateMs,
    days,
    color,
    size = 104,
    locale = "en",
  }: {
    code: string;
    name: string;
    dateMs: number;
    days: number;
    color: string;
    size?: number;
    locale?: string;
  } = $props();

  // Deterministic per-country seed → each stamp wobbles differently.
  const seed = $derived(
    [...code].reduce((a, c) => a + c.charCodeAt(0), 0) % 100,
  );
  const uid = $derived(`stamp-${code}-${Math.round(size)}`);

  const label = $derived(name.toUpperCase());
  // Longer names shrink so they always sit within the arc.
  const nameSize = $derived(label.length > 13 ? 5.1 : label.length > 10 ? 5.9 : 6.6);

  const dateLabel = $derived(
    new Date(dateMs)
      .toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" })
      .toUpperCase()
      .replace(/\./g, ""),
  );

  // Geometry (viewBox is 100×100). Text baseline sits between the two rings.
  const R_OUT = 47;
  const R_TXT = 40.5;
  const R_IN = 32;
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 100 100"
  style="color: {color}; display: block; overflow: visible"
  aria-label="{name} {dateLabel}"
>
  <defs>
    <!-- Rubber-stamp roughening: gentle wobble on every edge -->
    <filter id={uid} x="-15%" y="-15%" width="130%" height="130%">
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.052"
        numOctaves="2"
        seed={seed}
        result="noise"
      />
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.7" />
    </filter>
    <!-- Top arc: west→north→east, glyphs upright above centre -->
    <path id="{uid}-top" fill="none" d="M {50 - R_TXT} 50 A {R_TXT} {R_TXT} 0 0 1 {50 + R_TXT} 50" />
    <!-- Bottom arc: west→south→east, glyphs upright below centre -->
    <path id="{uid}-bot" fill="none" d="M {50 - R_TXT} 50 A {R_TXT} {R_TXT} 0 0 0 {50 + R_TXT} 50" />
  </defs>

  <g
    fill="currentColor"
    stroke="currentColor"
    style="filter: url(#{uid}); opacity: 0.86"
  >
    <!-- Rings -->
    <circle cx="50" cy="50" r={R_OUT} fill="none" stroke-width="2.4" />
    <circle cx="50" cy="50" r={R_IN} fill="none" stroke-width="1.1" />

    <!-- Curved name / date -->
    <text
      font-size={nameSize}
      font-weight="700"
      letter-spacing="0.7"
      text-anchor="middle"
      style="font-family: ui-sans-serif, system-ui, sans-serif"
    >
      <textPath href="#{uid}-top" startOffset="50%">{label}</textPath>
    </text>
    <text
      font-size="5.4"
      letter-spacing="1.1"
      text-anchor="middle"
      style="font-family: ui-monospace, monospace"
    >
      <textPath href="#{uid}-bot" startOffset="50%">{dateLabel}</textPath>
    </text>

    <!-- Side separators -->
    <circle cx={50 - R_TXT} cy="50" r="1.1" />
    <circle cx={50 + R_TXT} cy="50" r="1.1" />

    <!-- Centre: ISO code + days -->
    <text
      x="50"
      y="51.5"
      font-size="17"
      font-weight="800"
      text-anchor="middle"
      style="font-family: ui-monospace, monospace"
    >{code}</text>
    <text
      x="50"
      y="61.5"
      font-size="5.6"
      letter-spacing="0.6"
      text-anchor="middle"
      style="font-family: ui-monospace, monospace; opacity: 0.85"
    >{days}d</text>
  </g>
</svg>
