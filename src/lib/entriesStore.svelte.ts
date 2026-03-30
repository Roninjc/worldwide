import { getAllEntries, importEntries, getEntryCount } from './db';
import { computeCountryStats, getAvailableYears, countUniqueDays } from './stats';
import type { LocationEntry, CountryStat } from './types';

function createEntriesStore() {
	let entries = $state<LocationEntry[]>([]);
	let loaded = $state(false);

	const countryStats = $derived(computeCountryStats(entries));
	const years = $derived(getAvailableYears(entries));
	const totalDays = $derived(countUniqueDays(entries));
	const totalCountries = $derived(countryStats.length);

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
		return { imported, total };
	}

	return {
		get entries() { return entries; },
		get loaded() { return loaded; },
		get countryStats() { return countryStats; },
		get years() { return years; },
		get totalDays() { return totalDays; },
		get totalCountries() { return totalCountries; },
		load,
		importFiles
	};
}

export const entriesStore = createEntriesStore();
