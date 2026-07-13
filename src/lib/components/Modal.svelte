<script lang="ts">
  import { fade, scale } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import type { Snippet } from "svelte";

  let {
    open = $bindable(false),
    children,
  }: {
    open?: boolean;
    children?: Snippet;
  } = $props();

  function close() {
    open = false;
  }
  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
  <div
    class="fixed inset-x-0 top-0 z-50 grid place-items-center p-6"
    style="height: 100dvh"
  >
    <button
      class="absolute inset-0 cursor-default"
      style="background: rgba(0,0,0,0.5); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px)"
      aria-label="Close"
      onclick={close}
      transition:fade={{ duration: 200 }}
    ></button>

    <div
      class="relative"
      transition:scale={{ start: 0.9, opacity: 0, duration: 260, easing: cubicOut }}
    >
      {@render children?.()}
    </div>
  </div>
{/if}
