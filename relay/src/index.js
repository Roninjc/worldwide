// Worldwide sync relay — a zero-knowledge blob store.
//
// It only ever stores/serves an opaque, client-side-encrypted blob per user id.
// The relay CANNOT read locations: the payload is AES/secretbox ciphertext whose
// key is derived from a passphrase that never leaves the user's devices.
//
//   PUT    /{id}   body = base64 ciphertext → stores it       (Scriptable publishes)
//   GET    /{id}                            → returns ciphertext (PWA fetches on launch)
//   DELETE /{id}                            → removes it        (PWA disables sync)
//
// The `id` is a 128–256 bit random hex token that acts as a capability: knowing it
// is required to read or overwrite. Guessing it is infeasible, and even if leaked,
// the contents stay encrypted.

// A 128–256 bit hex capability token, optionally namespaced with `_patches`
// for the PWA's gap-repair mailbox (same capability, separate blob).
const ID_RE = /^[a-f0-9]{32,64}(?:_patches)?$/;
const MAX_BYTES = 2_000_000; // ~2 MB: generous for many years of daily entries

function corsHeaders() {
	return {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET,PUT,DELETE,OPTIONS',
		'Access-Control-Allow-Headers': 'content-type',
		'Access-Control-Max-Age': '86400'
	};
}

function text(body, status, extra) {
	return new Response(body, {
		status,
		headers: { 'content-type': 'text/plain; charset=utf-8', ...corsHeaders(), ...extra }
	});
}

export default {
	/**
	 * @param {Request} request
	 * @param {{ BLOBS: KVNamespace }} env
	 */
	async fetch(request, env) {
		const { pathname } = new URL(request.url);

		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: corsHeaders() });
		}

		// Health check
		if (pathname === '/' || pathname === '') {
			return text('worldwide-relay', 200);
		}

		const id = pathname.slice(1);
		if (!ID_RE.test(id)) return text('bad id', 400);

		if (request.method === 'PUT') {
			const body = await request.text();
			// Byte length, not char length (base64 is ASCII so they match, but be safe).
			if (new TextEncoder().encode(body).length > MAX_BYTES) {
				return text('payload too large', 413);
			}
			await env.BLOBS.put(id, body);
			return text('ok', 200);
		}

		if (request.method === 'GET') {
			const value = await env.BLOBS.get(id);
			if (value == null) return text('not found', 404);
			return text(value, 200);
		}

		if (request.method === 'DELETE') {
			await env.BLOBS.delete(id);
			return text('ok', 200);
		}

		return text('method not allowed', 405, { Allow: 'GET, PUT, DELETE, OPTIONS' });
	}
};
