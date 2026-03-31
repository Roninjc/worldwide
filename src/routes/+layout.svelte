<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { entriesStore } from '$lib/entriesStore.svelte';
	import { themeStore } from '$lib/themeStore.svelte';

	let { children } = $props();

	onMount(() => {
		entriesStore.load();
		themeStore.init();
	});

	const navItems = [
		{ href: '/', label: 'Mapa' },
		{ href: '/passport', label: 'Passport' },
		{ href: '/wrapped', label: 'Wrapped' },
		{ href: '/sync', label: 'Sync' }
	];
</script>

<div
	class="h-dvh flex flex-col overflow-hidden"
	data-theme={themeStore.current}
	style="background: var(--app-bg); color: var(--app-fg);"
>
	<main class="flex-1 min-h-0 flex flex-col overflow-hidden" style="padding-bottom: var(--nav-clearance)">
		{@render children()}
	</main>

	<!-- Floating glass nav pill -->
	<nav
		class="fixed left-1/2 z-30 flex items-center gap-0.5 px-2 py-1.5 rounded-full"
		style="
			bottom: var(--nav-bottom);
			transform: translateX(-50%);
			background: var(--glass-bg);
			border: 1px solid var(--glass-border);
			box-shadow: var(--glass-shadow);
			backdrop-filter: blur(24px) saturate(180%);
			-webkit-backdrop-filter: blur(24px) saturate(180%);
		"
	>
		{#each navItems as item}
			{@const active = $page.url.pathname === item.href}
			<a
				href={item.href}
				class="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-full transition-all duration-150"
				style="
					background: {active ? 'rgba(128,128,128,0.18)' : 'transparent'};
					color: {active ? 'var(--app-fg)' : 'var(--app-muted)'};
				"
			>
				{#if item.href === '/'}
					<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="12" r="10"/>
						<path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>
						<path d="M2 12h20"/>
					</svg>
				{:else if item.href === '/passport'}
					<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
						<rect width="20" height="14" x="2" y="5" rx="2"/>
						<circle cx="9" cy="12" r="2"/>
						<path d="M15 9h2M15 13h2M9 16h6"/>
					</svg>
				{:else if item.href === '/wrapped'}
					<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
						<path d="M12 3 14.5 9.5 21 10.5l-5 4.5 1.5 6.5L12 18l-5.5 3.5L8 15 3 10.5l6.5-1z"/>
						<path d="M5 3v3M3 5h3M19 15v3M17 17h3"/>
					</svg>
				{:else}
					<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
						<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
						<path d="M21 3v5h-5"/>
						<path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
						<path d="M8 16H3v5"/>
					</svg>
				{/if}
				<span class="text-[10px] leading-none font-medium">{item.label}</span>
			</a>
		{/each}

		<div class="w-px h-6 mx-1 rounded-full" style="background: var(--app-border)"></div>

		<button
			onclick={() => themeStore.toggle()}
			class="w-10 h-10 flex items-center justify-center rounded-full transition-all duration-150"
			style="color: var(--app-muted);"
			title="Cambiar tema"
		>
			{#if themeStore.current === 'dark'}
				<svg class="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="12" r="4"/>
					<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
				</svg>
			{:else}
				<svg class="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
					<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
				</svg>
			{/if}
		</button>
	</nav>
</div>
