// Relay-mode sync: fetch the encrypted blob, decrypt it, and merge into the local DB.
// The existing dedup in `importEntries` makes this idempotent — re-fetching the full
// dataset only ever adds genuinely new days.

import { syncStore, type RelayConfig } from './syncStore.svelte';
import { decryptEntries, encryptEntries } from './crypto';
import { importEntries } from './db';
import type { LocationEntry } from './types';

export type RelaySyncResult =
	| { ok: true; imported: number; empty?: boolean }
	| { ok: false; reason: 'not-configured' | 'network' | 'decrypt' | 'unknown'; status?: number };

function endpoint(cfg: RelayConfig): string {
	return `${cfg.url.replace(/\/+$/, '')}/${cfg.id}`;
}

/** Separate blob holding the PWA's gap repairs, for Scriptable to merge back into the JSON. */
function patchesEndpoint(cfg: RelayConfig): string {
	return `${cfg.url.replace(/\/+$/, '')}/${cfg.id}_patches`;
}

/** Fetch + decrypt + import from the relay. Safe to call on every launch in relay mode. */
export async function syncFromRelay(cfg = syncStore.relay): Promise<RelaySyncResult> {
	if (!cfg) return { ok: false, reason: 'not-configured' };

	let res: Response;
	try {
		res = await fetch(endpoint(cfg), { cache: 'no-store' });
	} catch {
		return { ok: false, reason: 'network' };
	}

	// Nothing published yet — not an error, just empty.
	if (res.status === 404) {
		syncStore.markSynced();
		return { ok: true, imported: 0, empty: true };
	}
	if (!res.ok) return { ok: false, reason: 'network', status: res.status };

	const blob = (await res.text()).trim();
	if (!blob) {
		syncStore.markSynced();
		return { ok: true, imported: 0, empty: true };
	}

	let entries;
	try {
		entries = await decryptEntries(blob, cfg.pass);
	} catch {
		return { ok: false, reason: 'decrypt' };
	}

	try {
		const imported = await importEntries(entries);
		syncStore.markSynced();
		return { ok: true, imported };
	} catch {
		return { ok: false, reason: 'unknown' };
	}
}

/**
 * Publish the current set of gap repairs (the full `filled` set) to the patches
 * mailbox, encrypted. Scriptable merges them into the yearly JSON files on its
 * next run. Idempotent by design: it always writes the full set, so re-applying
 * is a no-op on the device (dedup by country + calendar day).
 */
export async function pushPatchesToRelay(
	filled: LocationEntry[],
	cfg = syncStore.relay
): Promise<boolean> {
	if (!cfg) return false;
	try {
		const blob = await encryptEntries(filled, cfg.pass);
		const res = await fetch(patchesEndpoint(cfg), {
			method: 'PUT',
			headers: { 'Content-Type': 'text/plain' },
			body: blob
		});
		return res.ok;
	} catch {
		return false;
	}
}

/** Delete both the main blob and the patches mailbox (used when disabling sync). Best effort. */
export async function deleteFromRelay(cfg = syncStore.relay): Promise<boolean> {
	if (!cfg) return false;
	try {
		const [main] = await Promise.all([
			fetch(endpoint(cfg), { method: 'DELETE' }),
			fetch(patchesEndpoint(cfg), { method: 'DELETE' }).catch(() => undefined)
		]);
		return main.ok;
	} catch {
		return false;
	}
}
