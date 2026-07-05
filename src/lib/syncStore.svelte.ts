// Sync configuration shared across the app.
//
// `mode` selects how data reaches the app:
//   - 'manual' (default): the user shares/imports JSON files (Web Share Target). Unchanged.
//   - 'relay':  the app auto-fetches an end-to-end encrypted blob on launch (added in a later phase).
//
// `lastImport` / `lastSync` are timestamps used for the "out of date" feedback.

export type SyncMode = 'manual' | 'relay';

/** Relay connection details. Note: `pass` is stored in localStorage on this device. */
export interface RelayConfig {
	url: string;
	id: string;
	pass: string;
}

const STORAGE_KEY = 'ww_sync';

interface PersistedSync {
	mode: SyncMode;
	lastImport: number | null;
	lastSync: number | null;
	relay: RelayConfig | null;
}

const DEFAULTS: PersistedSync = {
	mode: 'manual',
	lastImport: null,
	lastSync: null,
	relay: null
};

function loadPersisted(): PersistedSync {
	if (typeof localStorage === 'undefined') return { ...DEFAULTS };
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
	} catch {
		// ignore corrupt storage
	}
	return { ...DEFAULTS };
}

function createSyncStore() {
	const initial = loadPersisted();
	let mode = $state<SyncMode>(initial.mode);
	let lastImport = $state<number | null>(initial.lastImport);
	let lastSync = $state<number | null>(initial.lastSync);
	let relay = $state<RelayConfig | null>(initial.relay);

	function persist() {
		if (typeof localStorage === 'undefined') return;
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, lastImport, lastSync, relay }));
	}

	return {
		get mode() {
			return mode;
		},
		set mode(value: SyncMode) {
			mode = value;
			persist();
		},
		get lastImport() {
			return lastImport;
		},
		get lastSync() {
			return lastSync;
		},
		get relay() {
			return relay;
		},
		setRelay(config: RelayConfig | null) {
			relay = config;
			persist();
		},
		/** Call after any manual import completes */
		markImported() {
			lastImport = Date.now();
			persist();
		},
		/** Call after a successful relay fetch (relay mode) */
		markSynced() {
			lastSync = Date.now();
			persist();
		}
	};
}

export const syncStore = createSyncStore();
