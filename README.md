# Hunniford Chalmers

The pub birthday game. Two famous people, two birthdays. Name someone born *between* them. Ten levels; the gap shrinks from three years to ten days.

No backend, no API keys, no accounts, no build step. Open `index.html` or host the folder anywhere static.

## Play

- **Play** — a random run. Three lives, ten levels.
- **Daily** — everyone gets the same ten anchor pairs that day (seeded by the UTC date). Share block copies to the clipboard.

### The ladder

| Level | Gap between the two birthdays |
|---|---|
| 1 | three years (1,095 days) |
| 2 | a year (365) |
| 3 | six months (182) |
| 4 | three months (91) |
| 5 | two months (61) |
| 6 | six weeks (42) |
| 7 | a month (30) |
| 8 | three weeks (21) |
| 9 | a fortnight (14) |
| 10 | ten days (10) |

Anchor B is born exactly that many days after anchor A. Pairs are only used when at least three people on the list are born strictly between them, and both anchors are weighted towards well-known faces. Change `WINDOWS` and `LABELS` at the top of `app.js` to retune it.

### High scores

Arcade rules. Clear at least three levels (or any level while the table has room) and lose, and you're asked for three initials. Top ten, ranked by levels cleared, then lives left, then fewest wrong guesses. The table lives in the browser that played the run — like a cabinet in a pub, it's that machine's board. `scoreStore` in `app.js` is the one place that reads and writes it, so a shared board can be dropped in later without touching the UI.

### The rules, precisely

- **The year counts.** Always.
- **Boundaries are exclusive.** Born on the same day as either anchor doesn't count.
- Guessing one of the anchors, or a name already tried this level, costs nothing.
- A name that isn't on the list costs nothing. You're offered a **Wikidata lookup**: the browser asks Wikidata's public API (no key, no cost to the site — it's rate-limited per player) for that person's birthday and photo, checks them against the window, and remembers them on that device. Nobody with that name and a known birthday → still no penalty.
- A wrong birthday costs a life. Every wrong guess shows the real birthday — that's how you get better.

## Files

```
index.html              markup
styles.css              look — editorial skin: off-white/ink, hairlines, cobalt accent, light and dark
fonts/                  self-hosted Instrument Serif + Archivo (OFL), so the site makes no third-party font calls
app.js                  the game (vanilla JS, no dependencies)
data/people.json        the list (generated)
data/people.js          same list as window.PEOPLE, so the page works from file://
scripts/build-data.mjs  regenerates the list from Wikidata (phase 1)
scripts/enrich-data.mjs adds citizenship flags for anchor weighting (phase 2, called by build-data)
scripts/extras.mjs      adds must-have people from data/extras.txt regardless of the fame threshold (phase 3)
scripts/build-single.mjs  inlines everything into dist/index.html (one file)
scripts/build-og.mjs    renders og.png, the 1200×630 link-preview image, from scripts/og-template.html
og.png                  link-preview image referenced by the Open Graph tags in index.html
```

## Regenerating the list

```
node scripts/build-data.mjs
```

Node 18+, no dependencies. It queries the Wikidata SPARQL endpoint one birth-year at a time (about 12 seconds a year, ~15–20 minutes in all), checkpointing each year to `data/years/` so it can resume if the endpoint drops. It then runs `scripts/enrich-data.mjs`, which adds UK/Ireland and anglosphere citizenship flags (used only to weight which faces appear as anchors — everyone stays a valid answer). Output: `data/people.json` and `data/people.js`. Selection: humans with a day-precision date of birth, a Commons photo, an English Wikipedia article and at least 35 Wikidata sitelinks (a rough fame proxy — raise it for a shorter, more famous list). Names with commas or brackets are dropped.

The bulk list is built once and committed. At runtime the only Wikidata call is the player-triggered lookup for a name that isn't on the list.

## Photos

Loaded at runtime from Wikimedia Commons by filename (`Special:FilePath/<file>?width=240`). No key. If a photo fails to load you get an initials tile instead. Every photo links to its Commons page, which carries the licence for that file.

## Deploy — hunnifordchalmers.com on GitHub Pages

Nothing to build. `main` is what the site serves, so `main` is production: work on a branch and merge through a pull request.

1. Push the repo: `gh repo create hunniford-chalmers --public --source=. --push`
2. GitHub → repo **Settings → Pages**: Source "Deploy from a branch", branch `main`, folder `/ (root)`.
3. Same page, **Custom domain**: `hunnifordchalmers.com`. The `CNAME` file in this repo already says that; GitHub checks DNS from here.
4. At the registrar, add DNS records:
   - `A` records for the apex (`@`) → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `CNAME` `www` → `<your-github-username>.github.io`
5. Once GitHub shows "DNS check successful" (minutes to an hour), tick **Enforce HTTPS**.

Rollback: revert the commit on `main` (`git revert`), or re-run the previous Pages deployment from the Actions tab. Never force-push `main`.

## Attribution

Type: [Instrument Serif](https://github.com/Instrument/instrument-serif) and [Archivo](https://github.com/Omnibus-Type/Archivo), both under the SIL Open Font License, self-hosted in `fonts/` with their licences. Names, birthdays and descriptions from [Wikidata](https://www.wikidata.org) (CC0). Photos from [Wikimedia Commons](https://commons.wikimedia.org); licences vary per file and each card links to the file's page. Not affiliated with, endorsed by or connected to either presenter.

## Known limitations

- **The citizenship enrichment hasn't been run yet** (`scripts/enrich-data.mjs` exists; the endpoint throttled it). Anchor weighting instead uses the Wikidata description ("British actor", "American singer") at load time, which works well enough. Run the enrich script when the endpoint is quiet and the weighting picks it up automatically.
- Hosted as a Claude artifact, photos show as initials tiles and the Wikidata lookup reports it can't reach Wikidata: that host blocks outside requests. On the real domain both work.
- Judith Chalmers has no Commons photo, so she is an initials tile everywhere. Gloria Hunniford has one. Both are on the list via `data/extras.txt`.
- The dataset is the oracle. Someone you're certain is famous may be missing (no Commons photo, no day-precision birthday on Wikidata, or under the sitelinks threshold).
- The list is international, not UK-only. A UK filter is the first follow-up.
- Commons hotlinking is normally fine but can be blocked on some networks; the initials fallback covers it.

## Follow-ups

UK-only filter, a shared (cross-device) high-score board, difficulty by era, sound, folding player lookups back into the shipped list.
