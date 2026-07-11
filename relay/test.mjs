// Round-trip test for the relay handler using a Map-backed KV stub.
// Verifies PUT/GET/DELETE, CORS, 404, id validation, method handling and the size cap.
// Run with: node test.mjs   (Node 20+ provides global Request/Response/URL)

import worker from './src/index.js';

function makeEnv() {
	const store = new Map();
	return {
		store,
		BLOBS: {
			get: async (k) => (store.has(k) ? store.get(k) : null),
			put: async (k, v) => void store.set(k, v),
			delete: async (k) => void store.delete(k)
		}
	};
}

const BASE = 'https://relay.example.com';
const ID = 'a'.repeat(32); // valid 128-bit hex id

let passed = 0;
let failed = 0;
function check(name, cond) {
	if (cond) {
		passed++;
		console.log(`  ✓ ${name}`);
	} else {
		failed++;
		console.error(`  ✗ ${name}`);
	}
}

async function run() {
	const env = makeEnv();

	// GET missing → 404
	let res = await worker.fetch(new Request(`${BASE}/${ID}`), env);
	check('GET unknown id → 404', res.status === 404);
	check('404 has CORS', res.headers.get('access-control-allow-origin') === '*');

	// PUT stores
	const blob = 'ZW5jcnlwdGVkLWJsb2ItYmFzZTY0'; // opaque base64
	res = await worker.fetch(new Request(`${BASE}/${ID}`, { method: 'PUT', body: blob }), env);
	check('PUT → 200', res.status === 200);
	check('PUT persisted to KV', env.store.get(ID) === blob);

	// GET returns the exact bytes
	res = await worker.fetch(new Request(`${BASE}/${ID}`), env);
	check('GET → 200', res.status === 200);
	check('GET round-trips ciphertext', (await res.text()) === blob);
	check('GET has CORS', res.headers.get('access-control-allow-origin') === '*');

	// Overwrite (same id)
	const blob2 = 'dXBkYXRlZC1ibG9i';
	await worker.fetch(new Request(`${BASE}/${ID}`, { method: 'PUT', body: blob2 }), env);
	res = await worker.fetch(new Request(`${BASE}/${ID}`), env);
	check('overwrite updates blob', (await res.text()) === blob2);

	// OPTIONS preflight
	res = await worker.fetch(new Request(`${BASE}/${ID}`, { method: 'OPTIONS' }), env);
	check('OPTIONS → 204', res.status === 204);
	check('OPTIONS advertises methods', /PUT/.test(res.headers.get('access-control-allow-methods') ?? ''));

	// Patches mailbox key (hex id + _patches suffix)
	const PID = `${ID}_patches`;
	await worker.fetch(new Request(`${BASE}/${PID}`, { method: 'PUT', body: blob }), env);
	res = await worker.fetch(new Request(`${BASE}/${PID}`), env);
	check('patches key round-trips', (await res.text()) === blob);
	check('patches key is separate from main blob', env.store.has(PID) && PID !== ID);

	// Bad id
	res = await worker.fetch(new Request(`${BASE}/not-hex!`), env);
	check('invalid id → 400', res.status === 400);
	res = await worker.fetch(new Request(`${BASE}/${ID}_other`), env);
	check('unknown suffix → 400', res.status === 400);
	res = await worker.fetch(new Request(`${BASE}/${'a'.repeat(20)}`), env);
	check('too-short id → 400', res.status === 400);

	// Health
	res = await worker.fetch(new Request(`${BASE}/`), env);
	check('health / → 200', res.status === 200);

	// DELETE removes the blob
	await worker.fetch(new Request(`${BASE}/${ID}`, { method: 'PUT', body: blob }), env);
	res = await worker.fetch(new Request(`${BASE}/${ID}`, { method: 'DELETE' }), env);
	check('DELETE → 200', res.status === 200);
	check('DELETE removes from KV', !env.store.has(ID));
	res = await worker.fetch(new Request(`${BASE}/${ID}`), env);
	check('GET after DELETE → 404', res.status === 404);

	// Method not allowed
	res = await worker.fetch(new Request(`${BASE}/${ID}`, { method: 'PATCH' }), env);
	check('PATCH → 405', res.status === 405);

	// Size cap
	const huge = 'x'.repeat(2_000_001);
	res = await worker.fetch(new Request(`${BASE}/${ID}`, { method: 'PUT', body: huge }), env);
	check('oversized PUT → 413', res.status === 413);

	console.log(`\n${passed} passed, ${failed} failed`);
	if (failed > 0) process.exit(1);
}

run();
