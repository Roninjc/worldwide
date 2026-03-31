<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { browser } from "$app/environment";
  import { entriesStore } from "$lib/entriesStore.svelte";
  import { consumePendingFiles } from "$lib/pendingShare";

  let isDragging = $state(false);
  let importing = $state(false);
  let result = $state<{ imported: number; total: number } | null>(null);
  let error = $state<string | null>(null);

  const isInstalled = $derived(
    browser && window.matchMedia("(display-mode: standalone)").matches,
  );

  onMount(async () => {
    if ($page.url.searchParams.get("shared") === "1") {
      const files = await consumePendingFiles();
      if (files.length > 0) await handleFiles(files);
    }
  });

  async function handleFiles(files: File[] | FileList) {
    const jsonFiles = Array.from(files).filter((f) => f.name.endsWith(".json"));
    if (jsonFiles.length === 0) {
      error = "Ningún archivo .json encontrado";
      return;
    }

    importing = true;
    error = null;
    result = null;

    try {
      result = await entriesStore.importFiles(jsonFiles);
    } catch {
      error =
        "Error al procesar los archivos. Comprueba que son JSONs válidos.";
    } finally {
      importing = false;
    }
  }

  function onFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files) handleFiles(input.files);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    if (e.dataTransfer?.files) handleFiles(e.dataTransfer.files);
  }
</script>

<div
  class="flex-1 overflow-y-auto"
  style="padding-bottom: var(--nav-clearance)"
>
  <div class="max-w-lg mx-auto px-4 py-8 space-y-8">
    <div>
      <h1 class="text-2xl font-bold" style="color: var(--app-fg)">
        Sincronizar datos
      </h1>
      <p class="text-sm mt-1" style="color: var(--app-muted)">
        Importa tus archivos JSON de Scriptable
      </p>
    </div>

    {#if !isInstalled}
      <div
        class="rounded-xl p-4 space-y-2"
        style="background: var(--ok-bg); border: 1px solid var(--ok-border)"
      >
        <p class="font-medium text-sm" style="color: var(--ok-title)">
          Instala la app para sincronización automática
        </p>
        <p class="text-xs" style="color: var(--ok-body)">
          En Safari, toca <strong>Compartir →</strong>
          <strong>"Añadir a pantalla de inicio"</strong>. Una vez instalada,
          puedes compartir los JSON directamente desde Scriptable sin pasos
          extra.
        </p>
      </div>
    {/if}

    {#if importing}
      <div class="text-center py-8" style="color: var(--app-muted)">
        <p class="text-2xl mb-2">⏳</p>
        Importando…
      </div>
    {:else}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        role="button"
        tabindex="0"
        class="rounded-xl p-10 text-center transition-all cursor-pointer"
        style="
				border: 2px dashed {isDragging ? 'var(--app-accent)' : 'var(--app-border)'};
				background: {isDragging ? 'var(--app-accent-subtle)' : 'transparent'};
			"
        ondragover={(e) => {
          e.preventDefault();
          isDragging = true;
        }}
        ondragleave={() => {
          isDragging = false;
        }}
        ondrop={onDrop}
        onclick={() => document.getElementById("file-input")?.click()}
        onkeydown={(e) =>
          e.key === "Enter" && document.getElementById("file-input")?.click()}
      >
        <p class="text-4xl mb-3">📂</p>
        <p class="font-medium" style="color: var(--app-fg)">
          Arrastra tus archivos JSON aquí
        </p>
        <p class="text-sm mt-1" style="color: var(--app-muted)">
          o toca para seleccionar
        </p>
        <p class="text-xs mt-3" style="color: var(--app-muted); opacity: 0.5">
          locationsStore2023.json, locationsStore2024.json…
        </p>
      </div>

      <input
        id="file-input"
        type="file"
        accept=".json,application/json"
        multiple
        class="hidden"
        onchange={onFileInput}
      />
    {/if}

    {#if result}
      <div
        class="rounded-xl p-4"
        style="background: var(--ok-bg); border: 1px solid var(--ok-border)"
      >
        <p class="font-medium" style="color: var(--ok-title)">
          Importación completada
        </p>
        <p class="text-sm mt-1" style="color: var(--ok-body)">
          {result.imported} entradas nuevas de {result.total} totales
        </p>
      </div>
    {/if}

    {#if error}
      <div
        class="rounded-xl p-4"
        style="background: var(--err-bg); border: 1px solid var(--err-border)"
      >
        <p class="text-sm" style="color: var(--err-text)">{error}</p>
      </div>
    {/if}

    {#if entriesStore.totalDays > 0}
      <div
        class="rounded-xl p-4 space-y-3"
        style="border: 1px solid var(--app-border)"
      >
        <p
          class="text-xs uppercase tracking-wider"
          style="color: var(--app-muted)"
        >
          Datos almacenados
        </p>
        <div class="flex justify-between text-sm">
          <span style="color: var(--app-fg)">Entradas totales</span>
          <span class="font-mono" style="color: var(--app-fg)"
            >{entriesStore.totalDays}</span
          >
        </div>
        <div class="flex justify-between text-sm">
          <span style="color: var(--app-fg)">Países distintos</span>
          <span class="font-mono" style="color: var(--app-fg)"
            >{entriesStore.totalCountries}</span
          >
        </div>
        <div class="flex justify-between text-sm">
          <span style="color: var(--app-fg)">Años</span>
          <span class="font-mono" style="color: var(--app-fg)"
            >{entriesStore.years.join(", ")}</span
          >
        </div>
      </div>
    {/if}
  </div>
</div>
