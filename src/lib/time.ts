/**
 * Localized relative time (e.g. "hace 2 días", "2 days ago", "il y a 3 heures").
 * Picks the largest sensible unit. `ms` is an absolute timestamp in the past or future.
 */
export function relativeTime(ms: number, locale: string | null | undefined, now: number = Date.now()): string {
	const rtf = new Intl.RelativeTimeFormat((locale ?? 'en').split('-')[0], { numeric: 'auto' });
	const diff = ms - now; // negative = past
	const abs = Math.abs(diff);
	const MIN = 60_000;
	const HOUR = 3_600_000;
	const DAY = 86_400_000;

	if (abs < MIN) return rtf.format(0, 'second');
	if (abs < HOUR) return rtf.format(Math.round(diff / MIN), 'minute');
	if (abs < DAY) return rtf.format(Math.round(diff / HOUR), 'hour');
	return rtf.format(Math.round(diff / DAY), 'day');
}
