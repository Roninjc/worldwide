<script lang="ts">
  import { flagEmoji } from "$lib/flag";

  // A country flag bleeding in from the left edge, oversized so it overflows
  // the container (clip it with `overflow-hidden` + `relative` on the parent)
  // and faded toward the centre. A recognisable motif for country rows.
  let {
    code,
    size = "9rem",
    opacity = 0.55,
    width = "56%",
    fade = 48,
  }: {
    code: string;
    size?: string;
    opacity?: number;
    /** Width of the bleed band as a CSS length/percentage. */
    width?: string;
    /** Where the fade reaches full transparency, in %. */
    fade?: number;
  } = $props();
</script>

<div
  class="absolute inset-y-0 left-0 flex items-center pointer-events-none"
  aria-hidden="true"
  style="width: {width}; opacity: {opacity}; transition: opacity 0.12s ease;
    -webkit-mask-image: linear-gradient(to right, #000 0%, transparent {fade}%);
    mask-image: linear-gradient(to right, #000 0%, transparent {fade}%)"
>
  <span class="leading-none" style="font-size: {size}; margin-left: -1.6rem">
    {flagEmoji(code)}
  </span>
</div>
