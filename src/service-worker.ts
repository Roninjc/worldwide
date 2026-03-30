/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';
import { precacheAndRoute } from 'workbox-precaching';
import { openDB } from 'idb';

declare const self: ServiceWorkerGlobalScope;

// Precache all assets
precacheAndRoute(self.__WB_MANIFEST);

// ─── Web Share Target handler ───────────────────────────────────────────────
// When Scriptable shares a JSON file to this PWA, iOS sends a POST to /sync.
// The service worker intercepts it, stores the file content in IndexedDB,
// and redirects to /sync?shared=1 so the page can pick it up.

async function getPendingDB() {
	return openDB('worldwide-pending', 1, {
		upgrade(db) {
			db.createObjectStore('files', { autoIncrement: true });
		}
	});
}

self.addEventListener('fetch', (event: FetchEvent) => {
	const url = new URL(event.request.url);

	if (url.pathname === '/sync' && event.request.method === 'POST') {
		event.respondWith(handleShareTarget(event.request));
		return;
	}
});

async function handleShareTarget(request: Request): Promise<Response> {
	const formData = await request.formData();
	const files = formData.getAll('json') as File[];

	if (files.length > 0) {
		const db = await getPendingDB();
		const tx = db.transaction('files', 'readwrite');
		for (const file of files) {
			const text = await file.text();
			await tx.store.put({ name: file.name, content: text, timestamp: Date.now() });
		}
		await tx.done;
	}

	return Response.redirect('/sync?shared=1', 303);
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event: ExtendableEvent) => {
	event.waitUntil(self.clients.claim());
});
