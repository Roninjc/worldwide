import type { LocationEntry, CountryStat, YearSummary } from './types';
import { computeStays } from './stays';

/** Normalize a timestamp to a YYYY-M-D string for unique-day comparisons */
export function toDateKey(ms: number): string {
	const d = new Date(ms);
	return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Count unique calendar days across all entries (≤ 365 per year) */
export function countUniqueDays(entries: LocationEntry[]): number {
	return new Set(entries.map((e) => toDateKey(e.date))).size;
}

export function computeCountryStats(entries: LocationEntry[]): CountryStat[] {
	const map = new Map<string, { stat: CountryStat; dates: Set<string> }>();

	for (const entry of entries) {
		const dateKey = toDateKey(entry.date);
		const existing = map.get(entry.isoCountryCode);
		if (existing) {
			existing.dates.add(dateKey);
			if (entry.date < existing.stat.firstVisit) existing.stat.firstVisit = entry.date;
			if (entry.date > existing.stat.lastVisit) existing.stat.lastVisit = entry.date;
		} else {
			map.set(entry.isoCountryCode, {
				stat: {
					country: entry.country,
					isoCountryCode: entry.isoCountryCode,
					days: 0,
					firstVisit: entry.date,
					lastVisit: entry.date
				},
				dates: new Set([dateKey])
			});
		}
	}

	return Array.from(map.values())
		.map(({ stat, dates }) => ({ ...stat, days: dates.size }))
		.sort((a, b) => b.days - a.days);
}

export function computeYearSummary(entries: LocationEntry[], year: number): YearSummary {
	const yearEntries = entries.filter((e) => new Date(e.date).getFullYear() === year);
	const stats = computeCountryStats(yearEntries);
	return {
		year,
		countries: stats,
		totalDays: countUniqueDays(yearEntries),
		totalCountries: stats.length
	};
}

export function getAvailableYears(entries: LocationEntry[]): number[] {
	const years = new Set(entries.map((e) => new Date(e.date).getFullYear()));
	return Array.from(years).sort((a, b) => b - a);
}

export function getLongestStreak(
	entries: LocationEntry[]
): { country: string; isoCountryCode: string; days: number } {
	const stays = computeStays(entries);
	const initial = { country: '', isoCountryCode: '', days: 0 };
	if (stays.length === 0) return initial;
	return stays.reduce(
		(best, stay) =>
			stay.days > best.days
				? { country: stay.country, isoCountryCode: stay.isoCountryCode, days: stay.days }
				: best,
		initial
	);
}

/** Days after which locally stored data is considered potentially out of date */
export const STALE_THRESHOLD_DAYS = 2;

/** Timestamp of the most recent entry, or null when there are no entries */
export function newestEntryDate(entries: LocationEntry[]): number | null {
	if (entries.length === 0) return null;
	return entries.reduce((max, e) => Math.max(max, e.date), -Infinity);
}

/** Whole days elapsed since the most recent entry, or null when there are no entries */
export function daysSinceNewestEntry(
	entries: LocationEntry[],
	now: number = Date.now()
): number | null {
	const newest = newestEntryDate(entries);
	if (newest === null) return null;
	return Math.floor((now - newest) / 86_400_000);
}

export function getMostTraveledMonth(entries: LocationEntry[]): { month: string; countries: number } {
	const monthMap = new Map<string, Set<string>>();
	for (const entry of entries) {
		const d = new Date(entry.date);
		const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
		if (!monthMap.has(key)) monthMap.set(key, new Set());
		monthMap.get(key)!.add(entry.isoCountryCode);
	}
	let best = { month: '', countries: 0 };
	for (const [month, countries] of monthMap) {
		if (countries.size > best.countries) best = { month, countries: countries.size };
	}
	return best;
}
