<script lang="ts">
  interface Option {
    value: string;
    label: string;
  }

  let {
    options,
    value = $bindable(),
    onchange,
  }: {
    options: Option[];
    value: string;
    onchange?: (v: string) => void;
  } = $props();

  const index = $derived(Math.max(0, options.findIndex((o) => o.value === value)));

  function select(o: Option) {
    if (o.value === value) return;
    value = o.value;
    onchange?.(o.value);
  }
</script>

<div
  class="relative flex p-1 rounded-full"
  style="background: var(--app-surface-2); border: 1px solid var(--app-border)"
>
  <!-- Sliding pill -->
  <div
    class="absolute top-1 bottom-1 rounded-full"
    style="left: 4px; width: calc((100% - 8px) / {options.length}); transform: translateX({index * 100}%); background: var(--app-accent); transition: transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)"
  ></div>

  {#each options as o}
    {@const active = o.value === value}
    <button
      class="relative flex-1 py-1.5 text-sm font-medium rounded-full transition-colors"
      style="color: {active ? '#fff' : 'var(--app-muted)'}; z-index: 1"
      onclick={() => select(o)}
    >
      {o.label}
    </button>
  {/each}
</div>
