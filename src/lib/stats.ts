import type { LocationEntry, CountryStat, YearSummary } from './types';

export function computeCountryStats(entries: LocationEntry[]): CountryStat[] {
	const map = new Map<string, CountryStat>();

	for (const entry of entries) {
		const existing = map.get(entry.isoCountryCode);
		if (existing) {
			existing.days++;
			if (entry.date < existing.firstVisit) existing.firstVisit = entry.date;
			if (entry.date > existing.lastVisit) existing.lastVisit = entry.date;
		} else {
			map.set(entry.isoCountryCode, {
				country: entry.country,
				isoCountryCode: entry.isoCountryCode,
				days: 1,
				firstVisit: entry.date,
				lastVisit: entry.date
			});
		}
	}

	return Array.from(map.values()).sort((a, b) => b.days - a.days);
}

export function computeYearSummary(entries: LocationEntry[], year: number): YearSummary {
	const yearEntries = entries.filter((e) => new Date(e.date).getFullYear() === year);
	const stats = computeCountryStats(yearEntries);

	return {
		year,
		countries: stats,
		totalDays: yearEntries.length,
		totalCountries: stats.length
	};
}

export function getAvailableYears(entries: LocationEntry[]): number[] {
	const years = new Set(entries.map((e) => new Date(e.date).getFullYear()));
	return Array.from(years).sort((a, b) => b - a);
}

export function getLongestStreak(entries: LocationEntry[]): { country: string; days: number } {
	if (entries.length === 0) return { country: '', days: 0 };

	const sorted = [...entries].sort((a, b) => a.date - b.date);
	let best = { country: sorted[0].country, days: 1 };
	let current = { country: sorted[0].country, days: 1 };

	for (let i = 1; i < sorted.length; i++) {
		const prev = sorted[i - 1];
		const curr = sorted[i];
		const diffDays = Math.round((curr.date - prev.date) / 86400000);

		if (curr.isoCountryCode === prev.isoCountryCode && diffDays <= 1) {
			current.days++;
		} else {
			current = { country: curr.country, days: 1 };
		}

		if (current.days > best.days) best = { ...current };
	}

	return best;
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
		if (countries.size > best.countries) {
			best = { month, countries: countries.size };
		}
	}

	return best;
}
