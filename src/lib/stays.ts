import type { LocationEntry } from './types';
import { toDateKey } from './stats';

export interface Stay {
	country: string;
	isoCountryCode: string;
	startDate: number;
	endDate: number;
	days: number;
}

const PALETTE = [
	'#0ea5e9', '#f59e0b', '#10b981', '#f97316', '#8b5cf6',
	'#ec4899', '#06b6d4', '#84cc16', '#ef4444', '#a78bfa',
	'#fbbf24', '#34d399', '#fb923c', '#60a5fa', '#f472b6',
	'#4ade80', '#fb7185', '#a3e635', '#38bdf8', '#c084fc'
];

/** Assign a consistent color to each country (sorted alphabetically by ISO code) */
export function buildColorMap(entries: LocationEntry[]): Map<string, string> {
	const isos = [...new Set(entries.map((e) => e.isoCountryCode))].sort();
	return new Map(isos.map((iso, i) => [iso, PALETTE[i % PALETTE.length]]));
}

/** Whether `curMs` falls on the same or the next calendar day as `prevMs`. */
function isSameOrNextDay(prevMs: number, curMs: number): boolean {
	const curKey = toDateKey(curMs);
	if (toDateKey(prevMs) === curKey) return true;
	const prev = new Date(prevMs);
	const next = new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1);
	return toDateKey(next.getTime()) === curKey;
}

/** Group sorted day-entries into continuous stays (same country, no missing calendar days) */
export function computeStays(entries: LocationEntry[]): Stay[] {
	if (entries.length === 0) return [];

	const sorted = [...entries].sort((a, b) => a.date - b.date);
	const stays: Stay[] = [];

	// Track unique date keys per stay to avoid double-counting border-crossing days
	let currentDates = new Set<string>([toDateKey(sorted[0].date)]);
	let current: Omit<Stay, 'days'> = {
		country: sorted[0].country,
		isoCountryCode: sorted[0].isoCountryCode,
		startDate: sorted[0].date,
		endDate: sorted[0].date
	};

	for (let i = 1; i < sorted.length; i++) {
		const entry = sorted[i];

		// A stay only continues while there are no missing calendar days: same
		// country and same-or-next day. Any missing day splits the stay, leaving
		// a visible gap the user can patch from /sync (see gaps.ts).
		if (
			entry.isoCountryCode === current.isoCountryCode &&
			isSameOrNextDay(sorted[i - 1].date, entry.date)
		) {
			currentDates.add(toDateKey(entry.date));
			current.endDate = entry.date;
		} else {
			stays.push({ ...current, days: currentDates.size });
			currentDates = new Set([toDateKey(entry.date)]);
			current = {
				country: entry.country,
				isoCountryCode: entry.isoCountryCode,
				startDate: entry.date,
				endDate: entry.date
			};
		}
	}
	stays.push({ ...current, days: currentDates.size });

	return stays;
}

export function getDaysInYear(year: number): number {
	return (new Date(year + 1, 0, 1).getTime() - new Date(year, 0, 1).getTime()) / 86_400_000;
}

/** Offset of a stay from Jan 1 of the given year, as a percentage of the year */
export function stayOffsetPct(stay: Stay, year: number): number {
	const yearStart = new Date(year, 0, 1).getTime();
	const yearDays = getDaysInYear(year);
	const offset = Math.max(0, (stay.startDate - yearStart) / 86_400_000);
	return Math.min((offset / yearDays) * 100, 100);
}

/** Width of a stay within a given year, as a percentage (capped at year boundary) */
export function stayWidthPct(stay: Stay, year: number): number {
	const yearStart = new Date(year, 0, 1).getTime();
	const yearEnd = new Date(year + 1, 0, 1).getTime();
	const yearDays = getDaysInYear(year);
	const start = Math.max(stay.startDate, yearStart);
	const end = Math.min(stay.endDate + 86_400_000, yearEnd);
	const visible = Math.max(0, (end - start) / 86_400_000);
	return (visible / yearDays) * 100;
}

/** Month boundary offsets (0–100%) for a given year */
export function monthMarkers(year: number): { label: string; pct: number }[] {
	const yearStart = new Date(year, 0, 1).getTime();
	const yearDays = getDaysInYear(year);
	const labels = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

	return Array.from({ length: 12 }, (_, m) => ({
		label: labels[m],
		pct: ((new Date(year, m, 1).getTime() - yearStart) / 86_400_000 / yearDays) * 100
	}));
}
