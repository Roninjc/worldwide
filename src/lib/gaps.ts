import type { LocationEntry } from './types';
import { toDateKey } from './stats';

export interface Gap {
	isoCountryCode: string;
	country: string;
	/** Synthetic timestamps (local noon) for each missing calendar day, ascending */
	missing: number[];
	/** Entry timestamp immediately before the gap */
	prevDate: number;
	/** Entry timestamp immediately after the gap */
	nextDate: number;
}

/**
 * Max number of missing days a gap between two same-country entries can span
 * to be offered as a suggestion. Larger gaps likely represent a real absence
 * (left and returned), so we don't presume the country.
 */
export const GAP_MAX_MISSING_DAYS = 3;

/** Local noon of a date, so `toDateKey` maps it back to the intended calendar day. */
function noon(y: number, m: number, d: number): number {
	return new Date(y, m, d, 12, 0, 0, 0).getTime();
}

/** Missing calendar days strictly between two timestamps (same-country assumed). */
function missingDaysBetween(prevMs: number, nextMs: number): number[] {
	const out: number[] = [];
	const prev = new Date(prevMs);
	const cursor = new Date(prev.getFullYear(), prev.getMonth(), prev.getDate());
	cursor.setDate(cursor.getDate() + 1);
	const nextKey = toDateKey(nextMs);
	// Iterate calendar days until we reach the next entry's day.
	while (toDateKey(cursor.getTime()) !== nextKey) {
		out.push(noon(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()));
		cursor.setDate(cursor.getDate() + 1);
		if (out.length > 400) break; // safety valve against pathological input
	}
	return out;
}

/**
 * Detect fillable gaps: calendar days with no data framed by same-country
 * entries before and after. Only unambiguous gaps are considered (same country
 * on both sides) and bounded in size.
 */
export function computeGaps(entries: LocationEntry[]): Gap[] {
	if (entries.length < 2) return [];
	const sorted = [...entries].sort((a, b) => a.date - b.date);
	const gaps: Gap[] = [];

	for (let i = 1; i < sorted.length; i++) {
		const prev = sorted[i - 1];
		const cur = sorted[i];
		if (prev.isoCountryCode !== cur.isoCountryCode) continue;
		if (toDateKey(prev.date) === toDateKey(cur.date)) continue;
		const missing = missingDaysBetween(prev.date, cur.date);
		if (missing.length === 0 || missing.length > GAP_MAX_MISSING_DAYS) continue;
		gaps.push({
			isoCountryCode: cur.isoCountryCode,
			country: cur.country,
			missing,
			prevDate: prev.date,
			nextDate: cur.date
		});
	}

	return gaps;
}

/** Build the entry rows that fill a gap, flagged as manually filled. */
export function gapFillEntries(gap: Gap): LocationEntry[] {
	return gap.missing.map((date) => ({
		country: gap.country,
		isoCountryCode: gap.isoCountryCode,
		date,
		filled: true
	}));
}
