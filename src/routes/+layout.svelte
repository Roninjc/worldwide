<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { entriesStore } from '$lib/entriesStore.svelte';

	let { children } = $props();

	onMount(() => {
		entriesStore.load();
	});

	const navItems = [
		{ href: '/', label: 'Mapa', icon: '🌍' },
		{ href: '/passport', label: 'Passport', icon: '🛂' },
		{ href: '/wrapped', label: 'Wrapped', icon: '✨' },
		{ href: '/sync', label: 'Sync', icon: '🔄' }
	];
</script>

<div class="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
	<header class="border-b border-slate-800 px-4 py-3 flex items-center justify-between flex-shrink-0">
		<a href="/" class="text-lg font-bold tracking-tight">worldwide</a>
		{#if entriesStore.loaded && entriesStore.totalDays > 0}
			<span class="text-xs text-slate-400">
				{entriesStore.totalDays} días · {entriesStore.totalCountries} países
			</span>
		{/if}
	</header>

	<main class="flex-1 flex flex-col overflow-hidden">
		{@render children()}
	</main>

	<nav class="border-t border-slate-800 flex flex-shrink-0">
		{#each navItems as item}
			<a
				href={item.href}
				class="flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors
					{$page.url.pathname === item.href
						? 'text-white'
						: 'text-slate-500 hover:text-slate-300'}"
			>
				<span class="text-lg leading-none">{item.icon}</span>
				{item.label}
			</a>
		{/each}
	</nav>
</div>
