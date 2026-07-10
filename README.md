# Worldwide 🌍

A client-side PWA that turns a personal history of country visits into an
interactive world map, a zoomable timeline of "stays", a passport-style stats
page, and a Spotify-Wrapped-style yearly recap.

**There is no backend.** All travel data lives in the browser's IndexedDB and
is imported by the user. Your location history stays on your device.

## Features

- **World map** — D3 choropleth colored by how many days you've spent in each country.
- **Timeline** — a zoomable, scrollable timeline of continuous stays.
- **Passport** — coverage by continent, per-country day counts and first-visit years.
- **Wrapped** — a per-year recap (top country, longest stay, new countries, …).
- **Two sync modes** you choose between — see [Syncing your data](#syncing-your-data).
- **Gap patching** — detects missing days framed by the same country and lets you fill them in one tap.
- **Offline-first PWA** — installable, works offline, and accepts shared files on iOS.
- **5 languages** — English, Spanish, French, German, Norwegian.
- **Light / dark theme.**

## Data format

Data is a JSON array of `LocationEntry`:

```json
[
  { "country": "Spain", "isoCountryCode": "ES", "date": 1704067200000 }
]
```

`date` is a Unix timestamp in **milliseconds**. Entries are deduped by
`isoCountryCode_date`, and days are counted as unique **calendar days** so that
border-crossing days are never double-counted.

## Syncing your data

The pain point on iOS is that re-sharing the same files every time is tedious.
Worldwide offers two modes, and the user picks one in `/sync`:

1. **Manual (Web Share Target)** — share your `locationsStore*.json` files to the
   installed PWA. iOS POSTs them to `/sync`, the service worker buffers them, and
   the app imports them. The home screen shows a banner when your data looks stale.

2. **Automatic (encrypted relay)** — privacy comes from *encryption*, not from
   avoiding servers. Data is encrypted **on your device** (XSalsa20-Poly1305 with
   a scrypt-derived key from your passphrase) before it ever leaves it. The relay
   is zero-knowledge: it only ever stores ciphertext keyed by a random capability
   id. Nobody but you — not even the relay operator — can read it. This lets a
   single shared relay serve many users while each one's data stays private.

   A [Scriptable](https://scriptable.app/) helper on the phone encrypts the latest
   data and pushes it to the relay whenever a new record is written; the PWA pulls
   and decrypts it on open.

The relay lives in [`relay/`](relay/) — a Cloudflare Worker backed by KV.

## Filling gaps

Data sometimes has a missing day framed by the same country before and after
(e.g. Spain on the 3rd, Spain on the 5th, nothing on the 4th). `/sync` detects
these unambiguous gaps and offers a one-tap fill. Filled days are treated as
normal data everywhere, but are flagged so you can change the country or undo
them from `/sync` if you made a mistake. Filling only writes to your local
database; it does not modify the source JSON.

## Tech stack

- **SvelteKit 2 + Svelte 5** (runes), TypeScript (strict).
- **Tailwind CSS v4** + CSS custom properties for theming.
- **D3 + topojson** for the map, **idb** for IndexedDB, **svelte-i18n** for locales.
- **tweetnacl + scrypt-js** for the end-to-end encrypted relay.
- **adapter-static** — fully static, SPA fallback, `ssr = false`, `prerender = true`.

## Getting started

Node 20+ is required.

```sh
npm install
npm run dev              # dev server (exposed on LAN for mobile testing)
npm run dev -- --open    # dev server + open browser
npm run build            # production build → build/
npm run preview          # preview the production build
npm run check            # svelte-kit sync + svelte-check (the only static check)
```

There is no test runner or linter; `npm run check` is the static verification.

## Project structure

```
src/
  lib/
    db.ts                  IndexedDB wrapper
    entriesStore.svelte.ts single source of truth (runes store)
    stats.ts               country/year stats, unique-day counting
    stays.ts               grouping entries into continuous stays + timeline geometry
    gaps.ts                missing-day detection for gap patching
    crypto.ts / sync.ts    end-to-end encryption + relay pull
    syncStore.svelte.ts    sync config (mode, relay, last import/sync)
    i18n.ts, countryName.ts, flag.ts, continents.ts
    components/            WorldMap, StaleBanner, NoData, …
  routes/
    /                      map + timeline
    /passport              stats
    /wrapped, /wrapped/[year]  yearly recap
    /sync                  import & manage data, sync mode, gap patching
  service-worker.ts        hand-written SW: precache + Web Share Target
relay/                     Cloudflare Worker (zero-knowledge encrypted relay)
```

## Deployment

`Dockerfile` builds the static site and serves it with nginx (SPA fallback to
`index.html`). The build version is injected at build time and shown at the
bottom of `/sync`. The relay is deployed separately with `wrangler` (see
[`relay/README.md`](relay/README.md)).
