import type { LocationEntry } from './types';

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

/** Group sorted day-entries into continuous stays (same country, no gap > 1 day) */
export function computeStays(entries: LocationEntry[]): Stay[] {
	if (entries.length === 0) return [];

	const sorted = [...entries].sort((a, b) => a.date - b.date);
	const stays: Stay[] = [];

	let current: Stay = {
		country: sorted[0].country,
		isoCountryCode: sorted[0].isoCountryCode,
		startDate: sorted[0].date,
		endDate: sorted[0].date,
		days: 1
	};

	for (let i = 1; i < sorted.length; i++) {
		const entry = sorted[i];
		const gap = Math.round((entry.date - sorted[i - 1].date) / 86_400_000);

		// TODO: gaps > 2 días en el mismo país se parten en stays distintos.
		// Opciones futuras:
		//   A) Avisar al usuario en el timeline de los días sin datos (mostrar bloque gris)
		//   B) Permitir rellenar huecos manualmente desde /sync (añadir entrada con país + fecha)
		//   C) Hacer la tolerancia configurable por el usuario en ajustes
		// Por ahora se usa una tolerancia de 2 días como heurística razonable.
		if (entry.isoCountryCode === current.isoCountryCode && gap <= 2) {
			current.endDate = entry.date;
			current.days++;
		} else {
			stays.push(current);
			current = {
				country: entry.country,
				isoCountryCode: entry.isoCountryCode,
				startDate: entry.date,
				endDate: entry.date,
				days: 1
			};
		}
	}
	stays.push(current);

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
