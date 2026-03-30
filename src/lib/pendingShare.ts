import { openDB } from 'idb';

interface PendingFile {
	name: string;
	content: string;
	timestamp: number;
}

async function getPendingDB() {
	return openDB('worldwide-pending', 1, {
		upgrade(db) {
			db.createObjectStore('files', { autoIncrement: true });
		}
	});
}

export async function consumePendingFiles(): Promise<File[]> {
	const db = await getPendingDB();
	const tx = db.transaction('files', 'readwrite');
	const all = (await tx.store.getAll()) as PendingFile[];
	await tx.store.clear();
	await tx.done;

	return all.map(
		(f) => new File([f.content], f.name, { type: 'application/json' })
	);
}

export async function hasPendingFiles(): Promise<boolean> {
	const db = await getPendingDB();
	return (await db.count('files')) > 0;
}
