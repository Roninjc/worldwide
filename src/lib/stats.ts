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

export function getLongestStreak(entries: LocationEntry[]): { country: string; days: number } {
	const stays = computeStays(entries);
	if (stays.length === 0) return { country: '', days: 0 };
	return stays.reduce(
		(best, stay) => (stay.days > best.days ? { country: stay.country, days: stay.days } : best),
		{ country: '', days: 0 }
	);
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
