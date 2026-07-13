<script lang="ts">
  import { fly, fade } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import type { Snippet } from "svelte";

  let {
    open = $bindable(false),
    header,
    children,
  }: {
    open?: boolean;
    header?: Snippet;
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
  <!-- Height pinned to 100dvh (viewport-relative) rather than inset-0, so the
       sheet always reaches the true bottom even when rendered inside a nested
       scroll container (where the fixed containing block can fall short). -->
  <div
    class="fixed inset-x-0 top-0 z-50 flex flex-col justify-end"
    style="height: 100dvh"
  >
    <button
      class="absolute inset-0 cursor-default"
      style="background: rgba(0,0,0,0.5)"
      aria-label="Close"
      onclick={close}
      transition:fade={{ duration: 200 }}
    ></button>

    <div
      class="relative w-full max-w-lg mx-auto rounded-t-3xl overflow-hidden"
      style="background: var(--app-surface-2); border-top: 1px solid var(--app-border); max-height: 85vh; padding-bottom: max(env(safe-area-inset-bottom), 16px)"
      transition:fly={{ y: 420, duration: 340, easing: cubicOut }}
    >
      <!-- Grabber -->
      <div class="flex justify-center pt-2.5 pb-1.5">
        <div
          class="w-9 h-1 rounded-full"
          style="background: var(--app-muted); opacity: 0.4"
        ></div>
      </div>

      {#if header}
        <div class="px-5 pt-1 pb-3">
          {@render header()}
        </div>
      {/if}

      <div class="overflow-y-auto px-5 pb-2" style="max-height: calc(85vh - 76px)">
        {@render children?.()}
      </div>
    </div>
  </div>
{/if}
