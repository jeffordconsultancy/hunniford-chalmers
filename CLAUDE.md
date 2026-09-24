# CLAUDE.md — Hunniford Chalmers

Pub birthday game as a static website. Read `README.md` first; it has the rules and the file map.

## Non-negotiables

- No API keys, no backend, no accounts, no paid services, no build step for the site itself.
- No framework, no bundler, no npm dependencies. Vanilla HTML/CSS/JS. Must run from `file://`.
- Runtime network calls: Commons photo loads, and the player-triggered Wikidata lookup for names not on the list (public API, `origin=*`, no key). Bulk data is build-time only (`scripts/build-data.mjs`).
- The year always counts. Boundaries are exclusive. The list is the oracle; unknown names cost nothing.
- Ladder is `WINDOWS`/`LABELS` at the top of `app.js`: three years down to ten days.
- High scores are per-device (`localStorage`) behind `scoreStore` in `app.js`; a shared board replaces that object only.
- Look: editorial (off-white page, ink type, hairline rules, cobalt accent; Instrument Serif display + Archivo UI, self-hosted in `fonts/`). Both colour schemes are first-class; every colour is a token on `:root`. Don't reintroduce rounded cards or a dark-green pub theme.
- The name is spelt "Hunniford Chalmers". The About page keeps the not-affiliated line.

## Working on it

- `python3 -m http.server 8080` then open `http://localhost:8080` — or just open `index.html`.
- `window.HC` exposes the game state for debugging in the console (`HC.run`, `HC.search("hunn")`, `HC.pairs(10)`).
- After changing the data script, regenerate with `node scripts/build-data.mjs` (~15 min) and commit both `data/` files.
- `node scripts/build-single.mjs` produces `dist/index.html` for single-file distribution. `dist/` is generated; don't edit it.
- `og.png` is the link-preview image (1200×630), rendered from `scripts/og-template.html` by `node scripts/build-og.mjs` (needs Playwright; set `PLAYWRIGHT_PATH` if it isn't resolvable). Re-render it if the look changes; commit the PNG.

## Git

Jefford Deployment Standard applies. Work on a branch (`feature/…`, `fix/…`), PR into `main`, squash-merge. `main` is what GitHub Pages serves at hunnifordchalmers.com, so it is production. Tag releases (`v0.2.0`…). Don't push generated `dist/` or `data/years/`.
