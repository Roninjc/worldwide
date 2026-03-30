export function flagEmoji(isoAlpha2: string): string {
	if (!isoAlpha2 || isoAlpha2.length !== 2) return '🏳️';
	return [...isoAlpha2.toUpperCase()]
		.map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
		.join('');
}
