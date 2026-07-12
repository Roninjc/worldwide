import { flagEmoji } from './flag';

// Representative colour for a country, sampled from the dominant hue of its
// flag emoji (rendered once to an offscreen canvas and cached). Falls back to
// a deterministic palette when the platform can't render flag emoji to pixels
// (e.g. some desktop browsers) or the flag is essentially monochrome.

const cache = new Map<string, string>();

const FALLBACK = [
	'#0ea5e9', '#f59e0b', '#10b981', '#f97316', '#8b5cf6',
	'#ec4899', '#06b6d4', '#84cc16', '#ef4444', '#a78bfa'
];

let ctx: CanvasRenderingContext2D | null = null;
let ctxTried = false;

function getCtx(): CanvasRenderingContext2D | null {
	if (ctxTried) return ctx;
	ctxTried = true;
	if (typeof document === 'undefined') return null;
	const cv = document.createElement('canvas');
	cv.width = 24;
	cv.height = 24;
	ctx = cv.getContext('2d', { willReadFrequently: true });
	return ctx;
}

function fallback(iso: string): string {
	const h = [...iso].reduce((a, c) => a + c.charCodeAt(0), 0);
	return FALLBACK[h % FALLBACK.length];
}

function sample(iso: string): string | null {
	const c = getCtx();
	const emoji = flagEmoji(iso);
	if (!c || !emoji) return null;

	const S = 24;
	c.clearRect(0, 0, S, S);
	c.font = '22px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
	c.textBaseline = 'top';
	c.fillText(emoji, 0, -1);

	let data: Uint8ClampedArray;
	try {
		data = c.getImageData(0, 0, S, S).data;
	} catch {
		return null;
	}

	// Bucket pixels by coarse colour, skipping transparent / near-white /
	// near-black / grey, then pick the bucket that best combines frequency and
	// saturation so the result reads as the flag's signature colour.
	const buckets = new Map<string, { n: number; r: number; g: number; b: number; sat: number }>();
	let counted = 0;
	for (let i = 0; i < data.length; i += 4) {
		if (data[i + 3] < 128) continue;
		const r = data[i], g = data[i + 1], b = data[i + 2];
		const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
		if (mx > 232 && mn > 205) continue; // white
		if (mx < 42) continue; // black
		const sat = mx === 0 ? 0 : (mx - mn) / mx;
		if (sat < 0.12 && mx > 90 && mx < 200) continue; // grey
		counted++;
		const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
		const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0, sat: 0 };
		e.n++; e.r += r; e.g += g; e.b += b; e.sat = Math.max(e.sat, sat);
		buckets.set(key, e);
	}
	if (counted === 0) return null;

	let best: { n: number; r: number; g: number; b: number; sat: number } | null = null;
	let bestScore = -1;
	for (const e of buckets.values()) {
		const score = e.n * (0.35 + e.sat);
		if (score > bestScore) { bestScore = score; best = e; }
	}
	if (!best) return null;

	const [r, g, b] = punchUp(
		Math.round(best.r / best.n),
		Math.round(best.g / best.n),
		Math.round(best.b / best.n)
	);
	return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// Normalise to a vivid mid-tone so colours stay legible on both themes.
function punchUp(r: number, g: number, b: number): [number, number, number] {
	let [h, s, l] = rgbToHsl(r, g, b);
	s = Math.max(s, 0.5);
	l = Math.min(0.62, Math.max(0.46, l));
	return hslToRgb(h, s, l);
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
	r /= 255; g /= 255; b /= 255;
	const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
	let h = 0, s = 0;
	const l = (mx + mn) / 2;
	const d = mx - mn;
	if (d) {
		s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
		if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
		else if (mx === g) h = (b - r) / d + 2;
		else h = (r - g) / d + 4;
		h /= 6;
	}
	return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;
	const hue = (t: number) => {
		if (t < 0) t += 1;
		if (t > 1) t -= 1;
		if (t < 1 / 6) return p + (q - p) * 6 * t;
		if (t < 1 / 2) return q;
		if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
		return p;
	};
	return [
		Math.round(hue(h + 1 / 3) * 255),
		Math.round(hue(h) * 255),
		Math.round(hue(h - 1 / 3) * 255)
	];
}

export function flagColor(iso: string): string {
	const key = (iso || '').toUpperCase();
	const hit = cache.get(key);
	if (hit) return hit;
	const color = sample(key) ?? fallback(key);
	cache.set(key, color);
	return color;
}
