export type Continent = 'Europe' | 'Asia' | 'Africa' | 'Americas' | 'Oceania' | 'Antarctica';

export const CONTINENT_LABELS: Record<Continent, string> = {
	Europe: 'Europa',
	Asia: 'Asia',
	Africa: 'África',
	Americas: 'América',
	Oceania: 'Oceanía',
	Antarctica: 'Antártida'
};

// ISO alpha-2 → continent
const MAP: Record<string, Continent> = {
	// Europe
	AD: 'Europe', AL: 'Europe', AT: 'Europe', BA: 'Europe', BE: 'Europe',
	BG: 'Europe', BY: 'Europe', CH: 'Europe', CY: 'Europe', CZ: 'Europe',
	DE: 'Europe', DK: 'Europe', EE: 'Europe', ES: 'Europe', FI: 'Europe',
	FO: 'Europe', FR: 'Europe', GB: 'Europe', GI: 'Europe', GR: 'Europe',
	HR: 'Europe', HU: 'Europe', IE: 'Europe', IS: 'Europe', IT: 'Europe',
	LI: 'Europe', LT: 'Europe', LU: 'Europe', LV: 'Europe', MC: 'Europe',
	MD: 'Europe', ME: 'Europe', MK: 'Europe', MT: 'Europe', NL: 'Europe',
	NO: 'Europe', PL: 'Europe', PT: 'Europe', RO: 'Europe', RS: 'Europe',
	RU: 'Europe', SE: 'Europe', SI: 'Europe', SK: 'Europe', SM: 'Europe',
	UA: 'Europe', VA: 'Europe', XK: 'Europe',
	// Asia
	AE: 'Asia', AF: 'Asia', AM: 'Asia', AZ: 'Asia', BD: 'Asia',
	BH: 'Asia', BN: 'Asia', BT: 'Asia', CN: 'Asia', GE: 'Asia',
	HK: 'Asia', ID: 'Asia', IL: 'Asia', IN: 'Asia', IQ: 'Asia',
	IR: 'Asia', JO: 'Asia', JP: 'Asia', KG: 'Asia', KH: 'Asia',
	KP: 'Asia', KR: 'Asia', KW: 'Asia', KZ: 'Asia', LA: 'Asia',
	LB: 'Asia', LK: 'Asia', MM: 'Asia', MN: 'Asia', MO: 'Asia',
	MV: 'Asia', MY: 'Asia', NP: 'Asia', OM: 'Asia', PH: 'Asia',
	PK: 'Asia', PS: 'Asia', QA: 'Asia', SA: 'Asia', SG: 'Asia',
	SY: 'Asia', TH: 'Asia', TJ: 'Asia', TL: 'Asia', TM: 'Asia',
	TR: 'Asia', TW: 'Asia', UZ: 'Asia', VN: 'Asia', YE: 'Asia',
	// Africa
	AO: 'Africa', BF: 'Africa', BI: 'Africa', BJ: 'Africa', BW: 'Africa',
	CD: 'Africa', CF: 'Africa', CG: 'Africa', CI: 'Africa', CM: 'Africa',
	CV: 'Africa', DJ: 'Africa', DZ: 'Africa', EG: 'Africa', ER: 'Africa',
	ET: 'Africa', GA: 'Africa', GH: 'Africa', GM: 'Africa', GN: 'Africa',
	GQ: 'Africa', GW: 'Africa', KE: 'Africa', KM: 'Africa', LR: 'Africa',
	LS: 'Africa', LY: 'Africa', MA: 'Africa', MG: 'Africa', ML: 'Africa',
	MR: 'Africa', MU: 'Africa', MW: 'Africa', MZ: 'Africa', NA: 'Africa',
	NE: 'Africa', NG: 'Africa', RW: 'Africa', SC: 'Africa', SD: 'Africa',
	SL: 'Africa', SN: 'Africa', SO: 'Africa', SS: 'Africa', ST: 'Africa',
	SZ: 'Africa', TD: 'Africa', TG: 'Africa', TN: 'Africa', TZ: 'Africa',
	UG: 'Africa', ZA: 'Africa', ZM: 'Africa', ZW: 'Africa',
	// Americas (North + South + Caribbean)
	AG: 'Americas', AR: 'Americas', BB: 'Americas', BL: 'Americas', BM: 'Americas',
	BO: 'Americas', BR: 'Americas', BS: 'Americas', BZ: 'Americas', CA: 'Americas',
	CL: 'Americas', CO: 'Americas', CR: 'Americas', CU: 'Americas', DM: 'Americas',
	DO: 'Americas', EC: 'Americas', FK: 'Americas', GD: 'Americas', GF: 'Americas',
	GL: 'Americas', GP: 'Americas', GT: 'Americas', GY: 'Americas', HN: 'Americas',
	HT: 'Americas', JM: 'Americas', KN: 'Americas', KY: 'Americas', LC: 'Americas',
	MF: 'Americas', MQ: 'Americas', MS: 'Americas', MX: 'Americas', NI: 'Americas',
	PA: 'Americas', PE: 'Americas', PM: 'Americas', PR: 'Americas', PY: 'Americas',
	SR: 'Americas', SV: 'Americas', TC: 'Americas', TT: 'Americas', US: 'Americas',
	UY: 'Americas', VC: 'Americas', VE: 'Americas', VG: 'Americas', VI: 'Americas',
	// Oceania
	AU: 'Oceania', CK: 'Oceania', FJ: 'Oceania', FM: 'Oceania', GU: 'Oceania',
	KI: 'Oceania', MH: 'Oceania', MP: 'Oceania', NC: 'Oceania', NR: 'Oceania',
	NU: 'Oceania', NZ: 'Oceania', PF: 'Oceania', PG: 'Oceania', PW: 'Oceania',
	SB: 'Oceania', TK: 'Oceania', TO: 'Oceania', TV: 'Oceania', VU: 'Oceania',
	WF: 'Oceania', WS: 'Oceania',
	// Antarctica
	AQ: 'Antarctica'
};

export const CONTINENT_TOTALS: Record<Continent, number> = {
	Europe: 50,
	Asia: 49,
	Africa: 54,
	Americas: 35,
	Oceania: 14,
	Antarctica: 1
};

export function getContinent(isoAlpha2: string): Continent | null {
	return MAP[isoAlpha2] ?? null;
}
