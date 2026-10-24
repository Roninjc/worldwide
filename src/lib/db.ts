import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { LocationEntry } from './types';

// Records are stored with an `id` (the object store's keyPath), added on import.
type StoredEntry = LocationEntry & { id: string };

interface WorldwideDB extends DBSchema {
	entries: {
		key: string; // `${isoCountryCode}_${date}`
		value: StoredEntry;
		indexes: {
			by_date: number;
			by_country: string;
		};
	};
}

let dbPromise: Promise<IDBPDatabase<WorldwideDB>> | null = null;

function getDB() {
	if (!dbPromise) {
		dbPromise = openDB<WorldwideDB>('worldwide', 1, {
			upgrade(db) {
				const store = db.createObjectStore('entries', { keyPath: 'id' });
				store.createIndex('by_date', 'date');
				store.createIndex('by_country', 'isoCountryCode');
			}
		});
	}
	return dbPromise;
}

function entryId(entry: LocationEntry): string {
	return `${entry.isoCountryCode}_${entry.date}`;
}

export async function importEntries(entries: LocationEntry[]): Promise<number> {
	const db = await getDB();
	const tx = db.transaction('entries', 'readwrite');
	let imported = 0;

	for (const entry of entries) {
		const id = entryId(entry);
		const existing = await tx.store.get(id);
		if (!existing) {
			await tx.store.put({ ...entry, id });
			imported++;
		}

		// Same timestamp, different country: the source JSON was edited, so the old
		// real entry is superseded. Filled days are app-managed and never replaced here.
		if (!entry.filled) {
			const sameMoment = await tx.store.index('by_date').getAll(entry.date);
			for (const old of sameMoment) {
				if (old.isoCountryCode !== entry.isoCountryCode && !old.filled) {
					await tx.store.delete(old.id);
					imported++;
				}
			}
		}
	}

	await tx.done;
	return imported;
}

export async function deleteEntry(entry: LocationEntry): Promise<void> {
	const db = await getDB();
	await db.delete('entries', entryId(entry));
}

export async function getAllEntries(): Promise<LocationEntry[]> {
	const db = await getDB();
	const all = await db.getAllFromIndex('entries', 'by_date');
	return all.map(({ id: _id, ...entry }) => entry as LocationEntry);
}

export async function getEntryCount(): Promise<number> {
	const db = await getDB();
	return db.count('entries');
}

export async function clearAllEntries(): Promise<void> {
	const db = await getDB();
	await db.clear('entries');
}
