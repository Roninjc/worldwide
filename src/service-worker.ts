/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';
import { openDB } from 'idb';

declare const self: ServiceWorkerGlobalScope;

// ── Precache ─────────────────────────────────────────────────────────────────
const CACHE = `cache-${version}`;
const ASSETS = [...build, ...files];

self.addEventListener('install', (e) => {
	e.waitUntil(
		caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (e) => {
	e.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', (e: FetchEvent) => {
	const url = new URL(e.request.url);

	// ── Web Share Target ──────────────────────────────────────────────────────
	// iOS sends a POST to /sync when the user shares JSON files to this PWA.
	// Store the file content in IndexedDB so the sync page can import it.
	if (url.pathname === '/sync' && e.request.method === 'POST') {
		e.respondWith(handleShareTarget(e.request));
		return;
	}

	// ── Cache-first for precached assets ─────────────────────────────────────
	if (e.request.method !== 'GET') return;

	e.respondWith(
		caches.match(e.request).then((cached) => cached ?? fetch(e.request))
	);
});

async function handleShareTarget(request: Request): Promise<Response> {
	const formData = await request.formData();
	const files = formData.getAll('json') as File[];

	if (files.length > 0) {
		const db = await openDB('worldwide-pending', 1, {
			upgrade(db) {
				db.createObjectStore('files', { autoIncrement: true });
			}
		});
		const tx = db.transaction('files', 'readwrite');
		for (const file of files) {
			await tx.store.put({ name: file.name, content: await file.text(), timestamp: Date.now() });
		}
		await tx.done;
	}

	return Response.redirect('/sync?shared=1', 303);
}
