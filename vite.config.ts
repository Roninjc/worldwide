import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		SvelteKitPWA({
			strategies: 'injectManifest',
			srcDir: 'src',
			filename: 'service-worker.ts',
			registerType: 'autoUpdate',
			manifest: {
				name: 'Worldwide',
				short_name: 'Worldwide',
				description: 'Tu historial de países visitados',
				theme_color: '#0f172a',
				background_color: '#0f172a',
				display: 'standalone',
				scope: '/',
				start_url: '/',
				icons: [
					{
						src: 'icons/icon-192.png',
						sizes: '192x192',
						type: 'image/png'
					},
					{
						src: 'icons/icon-512.png',
						sizes: '512x512',
						type: 'image/png'
					}
				],
				share_target: {
					action: '/sync',
					method: 'POST',
					enctype: 'multipart/form-data',
					params: {
						files: [
							{
								name: 'json',
								accept: ['application/json', '.json']
							}
						]
					}
				}
			},
			workbox: {
				globPatterns: ['**/*.{js,css,html,svg,png,ico}']
			}
		})
	]
});
