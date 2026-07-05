// Relay-mode sync: fetch the encrypted blob, decrypt it, and merge into the local DB.
// The existing dedup in `importEntries` makes this idempotent — re-fetching the full
// dataset only ever adds genuinely new days.

import { syncStore, type RelayConfig } from './syncStore.svelte';
import { decryptEntries } from './crypto';
import { importEntries } from './db';

export type RelaySyncResult =
	| { ok: true; imported: number; empty?: boolean }
	| { ok: false; reason: 'not-configured' | 'network' | 'decrypt' | 'unknown'; status?: number };

function endpoint(cfg: RelayConfig): string {
	return `${cfg.url.replace(/\/+$/, '')}/${cfg.id}`;
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
