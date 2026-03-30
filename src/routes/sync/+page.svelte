<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { entriesStore } from '$lib/entriesStore.svelte';
	import { consumePendingFiles } from '$lib/pendingShare';

	let isDragging = $state(false);
	let importing = $state(false);
	let result = $state<{ imported: number; total: number } | null>(null);
	let error = $state<string | null>(null);

	const isInstalled = $derived(
		browser && window.matchMedia('(display-mode: standalone)').matches
	);

	onMount(async () => {
		// Auto-import when coming from Web Share Target
		if ($page.url.searchParams.get('shared') === '1') {
			const files = await consumePendingFiles();
			if (files.length > 0) await handleFiles(files);
		}
	});

	async function handleFiles(files: File[] | FileList) {
		const jsonFiles = Array.from(files).filter((f) => f.name.endsWith('.json'));
		if (jsonFiles.length === 0) {
			error = 'Ningún archivo .json encontrado';
			return;
		}

		importing = true;
		error = null;
		result = null;

		try {
			result = await entriesStore.importFiles(jsonFiles);
		} catch {
			error = 'Error al procesar los archivos. Comprueba que son JSONs válidos.';
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

<div class="max-w-lg mx-auto px-4 py-8 space-y-8">
	<div>
		<h1 class="text-2xl font-bold">Sincronizar datos</h1>
		<p class="text-slate-400 text-sm mt-1">Importa tus archivos JSON de Scriptable</p>
	</div>

	{#if !isInstalled}
		<div class="bg-amber-900/40 border border-amber-700 rounded-xl p-4 space-y-2">
			<p class="font-medium text-amber-300 text-sm">Instala la app para sincronización automática</p>
			<p class="text-amber-200/70 text-xs">
				En Safari, toca <strong>Compartir →</strong>
				<strong>"Añadir a pantalla de inicio"</strong>. Una vez instalada, puedes compartir
				los JSON directamente desde Scriptable sin pasos extra.
			</p>
		</div>
	{/if}

	{#if importing}
		<div class="text-center text-slate-400 py-8">
			<p class="text-2xl mb-2">⏳</p>
			Importando…
		</div>
	{:else}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			role="button"
			tabindex="0"
			class="border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer
				{isDragging ? 'border-blue-400 bg-blue-900/20' : 'border-slate-700 hover:border-slate-500'}"
			ondragover={(e) => { e.preventDefault(); isDragging = true; }}
			ondragleave={() => { isDragging = false; }}
			ondrop={onDrop}
			onclick={() => document.getElementById('file-input')?.click()}
			onkeydown={(e) => e.key === 'Enter' && document.getElementById('file-input')?.click()}
		>
			<p class="text-4xl mb-3">📂</p>
			<p class="text-slate-300 font-medium">Arrastra tus archivos JSON aquí</p>
			<p class="text-slate-500 text-sm mt-1">o toca para seleccionar</p>
			<p class="text-slate-600 text-xs mt-3">locationsStore2023.json, locationsStore2024.json…</p>
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
		<div class="bg-green-900/40 border border-green-700 rounded-xl p-4">
			<p class="font-medium text-green-300">Importación completada</p>
			<p class="text-green-200/70 text-sm mt-1">
				{result.imported} entradas nuevas de {result.total} totales
			</p>
		</div>
	{/if}

	{#if error}
		<div class="bg-red-900/40 border border-red-700 rounded-xl p-4">
			<p class="text-red-300 text-sm">{error}</p>
		</div>
	{/if}

	{#if entriesStore.totalDays > 0}
		<div class="border border-slate-800 rounded-xl p-4 space-y-3">
			<p class="text-slate-400 text-xs uppercase tracking-wider">Datos almacenados</p>
			<div class="flex justify-between text-sm">
				<span class="text-slate-300">Entradas totales</span>
				<span class="font-mono text-white">{entriesStore.totalDays}</span>
			</div>
			<div class="flex justify-between text-sm">
				<span class="text-slate-300">Países distintos</span>
				<span class="font-mono text-white">{entriesStore.totalCountries}</span>
			</div>
			<div class="flex justify-between text-sm">
				<span class="text-slate-300">Años</span>
				<span class="font-mono text-white">{entriesStore.years.join(', ')}</span>
			</div>
		</div>
	{/if}
</div>
