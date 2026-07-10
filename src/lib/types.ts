export interface LocationEntry {
	country: string;
	isoCountryCode: string;
	date: number; // milliseconds
	/**
	 * True when the day was added by the user from within the app to patch a
	 * gap (it was not present in the imported JSON). Optional, so imported
	 * entries simply omit it. Used only to manage/undo these days in /sync;
	 * it does not change how the day is rendered anywhere else.
	 */
	filled?: boolean;
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
