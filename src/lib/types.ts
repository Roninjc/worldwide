export interface LocationEntry {
	country: string;
	isoCountryCode: string;
	date: number; // milliseconds
}

export interface CountryStat {
	country: string;
	isoCountryCode: string;
	days: number;
	firstVisit: number;
	lastVisit: number;
}

export interface YearSummary {
	year: number;
	countries: CountryStat[];
	totalDays: number;
	totalCountries: number;
}
