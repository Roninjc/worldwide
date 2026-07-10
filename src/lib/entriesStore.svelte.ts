import { getAllEntries, importEntries, deleteEntry, getEntryCount } from './db';
import { computeCountryStats, getAvailableYears, countUniqueDays } from './stats';
import { computeGaps, gapFillEntries, type Gap } from './gaps';
import { syncStore } from './syncStore.svelte';
import type { LocationEntry, CountryStat } from './types';

function createEntriesStore() {
	let entries = $state<LocationEntry[]>([]);
	let loaded = $state(false);

	const countryStats = $derived(computeCountryStats(entries));
	const years = $derived(getAvailableYears(entries));
	const totalDays = $derived(countUniqueDays(entries));
	const totalCountries = $derived(countryStats.length);
	const gaps = $derived(computeGaps(entries));
	const filledEntries = $derived(
		entries.filter((e) => e.filled).sort((a, b) => a.date - b.date)
	);

	async function load() {
		entries = await getAllEntries();
		loaded = true;
	}

	async function importFiles(files: File[]): Promise<{ imported: number; total: number }> {
		let total = 0;
		let imported = 0;

		for (const file of files) {
			const text = await file.text();
			const parsed: LocationEntry[] = JSON.parse(text);
			total += parsed.length;
			imported += await importEntries(parsed);
		}

		await load();
		syncStore.markImported();
		return { imported, total };
	}

	/** Fill a gap by adding one day per missing date (flagged `filled`). */
	async function fillGap(gap: Gap) {
		await importEntries(gapFillEntries(gap));
		await load();
	}

	/** Fill every detected gap at once. */
	async function fillAllGaps() {
		const rows = gaps.flatMap(gapFillEntries);
		if (rows.length === 0) return;
		await importEntries(rows);
		await load();
	}

	/** Remove an entry (undo a day filled by mistake). */
	async function removeEntry(entry: LocationEntry) {
		await deleteEntry(entry);
		await load();
	}

	/** Change the country of a filled day, keeping the same date. */
	async function changeEntryCountry(
		entry: LocationEntry,
		isoCountryCode: string,
		country: string
	) {
		await deleteEntry(entry);
		await importEntries([{ country, isoCountryCode, date: entry.date, filled: true }]);
		await load();
	}

	return {
		get entries() { return entries; },
		get loaded() { return loaded; },
		get countryStats() { return countryStats; },
		get years() { return years; },
		get totalDays() { return totalDays; },
		get totalCountries() { return totalCountries; },
		get gaps() { return gaps; },
		get filledEntries() { return filledEntries; },
		load,
		importFiles,
		fillGap,
		fillAllGaps,
		removeEntry,
		changeEntryCountry
	};
}

export const entriesStore = createEntriesStore();
