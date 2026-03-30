<script lang="ts">
	import { onMount } from 'svelte';
	import * as d3 from 'd3';
	import { feature } from 'topojson-client';
	import type { Topology } from 'topojson-specification';
	import { numericToAlpha2, getName } from 'i18n-iso-countries';

	interface Props {
		daysByCountry: Map<string, number>;
	}

	let { daysByCountry }: Props = $props();

	let container: HTMLDivElement | undefined = $state();
	let svgEl: SVGSVGElement | undefined = $state();
	let tooltip = $state<{ name: string; days: number; x: number; y: number } | null>(null);
	let worldData = $state<Topology | null>(null);

	// ── Setup: load data + ResizeObserver (runs once) ───────────────────────
	onMount(async () => {
		const raw = await import('world-atlas/countries-110m.json');
		worldData = raw.default as unknown as Topology;

		let rafId: number;
		const ro = new ResizeObserver(() => {
			cancelAnimationFrame(rafId);
			rafId = requestAnimationFrame(renderMap);
		});
		if (container) ro.observe(container);

		return () => {
			ro.disconnect();
			cancelAnimationFrame(rafId);
		};
	});

	// ── Re-render when data changes ─────────────────────────────────────────
	$effect(() => {
		// Read prop here so Svelte tracks it as a dependency
		const data = daysByCountry;
		if (!svgEl || !worldData || !container) return;
		renderMap();
	});

	// ── Helpers ─────────────────────────────────────────────────────────────
	function alpha2FromFeature(d: any): string {
		return numericToAlpha2(String(d.id).padStart(3, '0')) ?? '';
	}

	function countryColor(alpha2: string): string {
		const days = daysByCountry.get(alpha2) ?? 0;
		if (days === 0) return '#1e293b';
		if (days < 8) return '#164e63';
		if (days < 30) return '#0c6a8a';
		if (days < 90) return '#0284c7';
		return '#38bdf8';
	}

	// ── Render ───────────────────────────────────────────────────────────────
	function renderMap() {
		if (!svgEl || !worldData || !container) return;

		const width = container.clientWidth;
		if (width === 0) return;
		const height = Math.round(width * 0.52);

		const svg = d3.select(svgEl)
			.attr('viewBox', `0 0 ${width} ${height}`)
			.attr('height', height);

		svg.selectAll('*').remove();

		const projection = d3.geoNaturalEarth1()
			.scale(width / 6.4)
			.translate([width / 2, height / 2]);

		const path = d3.geoPath(projection);

		const countries = feature(worldData as any, (worldData as any).objects.countries);

		svg
			.append('g')
			.selectAll('path')
			.data((countries as any).features)
			.join('path')
			.attr('d', path as any)
			.attr('fill', (d: any) => countryColor(alpha2FromFeature(d)))
			.attr('stroke', '#0f172a')
			.attr('stroke-width', 0.4)
			.on('mousemove', (event: MouseEvent, d: any) => {
				const alpha2 = alpha2FromFeature(d);
				const rect = container!.getBoundingClientRect();
				tooltip = {
					name: getName(alpha2, 'en') ?? 'Unknown',
					days: daysByCountry.get(alpha2) ?? 0,
					x: event.clientX - rect.left,
					y: event.clientY - rect.top
				};
			})
			.on('mouseleave', () => { tooltip = null; })
			.on('touchstart', (event: TouchEvent, d: any) => {
				event.preventDefault();
				const alpha2 = alpha2FromFeature(d);
				const touch = event.touches[0];
				const rect = container!.getBoundingClientRect();
				tooltip = {
					name: getName(alpha2, 'en') ?? 'Unknown',
					days: daysByCountry.get(alpha2) ?? 0,
					x: touch.clientX - rect.left,
					y: touch.clientY - rect.top
				};
			});
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="relative w-full select-none"
	bind:this={container}
	ontouchend={() => { tooltip = null; }}
>
	{#if !worldData}
		<div class="flex items-center justify-center h-48 text-slate-600 text-sm">Cargando mapa…</div>
	{:else}
		<svg bind:this={svgEl} class="w-full" aria-label="Mapa mundial"></svg>
	{/if}

	{#if tooltip}
		<div
			class="pointer-events-none absolute z-10 px-3 py-2 bg-slate-800 border border-slate-700
				rounded-lg text-sm shadow-xl"
			style="left: {Math.min(tooltip.x + 12, (container?.clientWidth ?? 300) - 160)}px;
				top: {Math.max(tooltip.y - 56, 4)}px"
		>
			<p class="font-medium text-white">{tooltip.name}</p>
			<p class="text-slate-400 text-xs">
				{tooltip.days > 0 ? `${tooltip.days} día${tooltip.days === 1 ? '' : 's'}` : 'Sin visitar'}
			</p>
		</div>
	{/if}
</div>
