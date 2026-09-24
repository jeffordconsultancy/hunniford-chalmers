// Builds data/people.json from Wikidata. Run once; commit the output.
// Node 18+, no dependencies, no keys.
//   node scripts/build-data.mjs
//
// Selection: humans with a day-precision date of birth, a Commons image,
// an English Wikipedia article, and >= MIN_SITELINKS sitelinks (a rough fame proxy).
// Queried in year chunks because the endpoint times out on the whole range.

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";

const ENDPOINTS = [
  "https://query-main.wikidata.org/sparql",
  "https://query.wikidata.org/sparql",
];
const UA = "HunnifordChalmers/0.1 (https://github.com/markjefford/hunniford-chalmers; pub birthday game)";
const MIN_SITELINKS = 35;
const FROM_YEAR = Number(process.env.FROM || 1925);
const TO_YEAR = Number(process.env.TO || 2005); // exclusive
const FETCH_ONLY = !!process.env.FETCH_ONLY; // worker mode: fill checkpoints, write nothing else
const CHUNK_YEARS = 1;

function query(from, to) {
  return `
SELECT ?p ?pLabel ?dob ?img ?desc ?sl WHERE {
  ?p wdt:P569 ?dob . hint:Prior hint:rangeSafe true .
  FILTER(?dob >= "${from}-01-01T00:00:00Z"^^xsd:dateTime && ?dob < "${to}-01-01T00:00:00Z"^^xsd:dateTime)
  ?p wdt:P31 wd:Q5 ; wikibase:sitelinks ?sl . FILTER(?sl >= ${MIN_SITELINKS})
  ?p wdt:P18 ?img .
  ?p p:P569/psv:P569 ?dobNode . ?dobNode wikibase:timePrecision 11 .
  ?article schema:about ?p ; schema:isPartOf <https://en.wikipedia.org/> .
  ?p rdfs:label ?pLabel . FILTER(LANG(?pLabel) = "en")
  OPTIONAL { ?p schema:description ?desc . FILTER(LANG(?desc) = "en") }
}`;
}

async function run(sparql) {
  let lastErr;
  for (const ep of ENDPOINTS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(ep + "?format=json&query=" + encodeURIComponent(sparql), {
          headers: { "User-Agent": UA, Accept: "application/sparql-results+json" },
          signal: AbortSignal.timeout(90_000),
        });
        if (!res.ok) throw new Error(`${ep} -> HTTP ${res.status}`);
        const json = await res.json();
        return json.results.bindings;
      } catch (e) {
        lastErr = e;
        console.warn(`  retry (${ep}, attempt ${attempt + 1}): ${e.message}`);
        await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

function dayOfYear(m, d) {
  // 1-based day of a 366-day year (Feb 29 = 60) so windows line up across years.
  const cum = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
  return cum[m - 1] + d;
}

function clean(label) {
  if (/[(),]/.test(label)) return null; // "John Smith (actor)", "Smith, John"
  if (label.length > 40 || label.length < 3) return null;
  if (!/\s/.test(label)) return null; // single-name entries are often junk
  return label;
}

const people = new Map();
mkdirSync("data/years", { recursive: true });
for (let y = FROM_YEAR; y < TO_YEAR; y += CHUNK_YEARS) {
  const to = Math.min(y + CHUNK_YEARS, TO_YEAR);
  process.stdout.write(`${y}-${to - 1}: `);
  const ck = `data/years/${y}.json`; // per-chunk checkpoint so a flaky endpoint can't lose the run
  let rows;
  if (existsSync(ck)) { rows = JSON.parse(readFileSync(ck, "utf8")); process.stdout.write("(cached) "); }
  else { rows = await run(query(y, to)); writeFileSync(ck, JSON.stringify(rows)); }
  let added = 0;
  for (const r of rows) {
    const id = r.p.value.split("/").pop();
    if (people.has(id)) continue;
    const name = clean(r.pLabel.value);
    if (!name) continue;
    const dob = r.dob.value.slice(0, 10);
    const [yy, mm, dd] = dob.split("-").map(Number);
    if (!yy || !mm || !dd) continue;
    const img = decodeURIComponent(r.img.value.split("/").pop());
    let desc = (r.desc?.value || "").replace(/\s*\(.*?\)\s*/g, " ").trim();
    if (desc.length > 60) desc = desc.slice(0, 57).replace(/\s+\S*$/, "") + "…";
    people.set(id, { id, name, dob, doy: dayOfYear(mm, dd), img, desc, sitelinks: Number(r.sl.value) });
    added++;
  }
  console.log(`${rows.length} rows, ${added} kept, total ${people.size}`);
}

if (FETCH_ONLY) { console.log("fetch-only worker done"); process.exit(0); }
const out = [...people.values()].sort((a, b) => b.sitelinks - a.sitelinks);
mkdirSync("data", { recursive: true });
writeFileSync("data/people.json", JSON.stringify(out));
// people.js is what the page loads, so the game also works from file:// (fetch() does not).
writeFileSync("data/people.js", "window.PEOPLE=" + JSON.stringify(out) + ";");
console.log(`\nWrote data/people.json and data/people.js with ${out.length} people`);

// Sanity: how many calendar days have at least one person?
const perDay = new Array(367).fill(0);
for (const p of out) perDay[p.doy]++;
const empty = perDay.slice(1).filter((n) => n === 0).length;
const min = Math.min(...perDay.slice(1).filter((_, i) => i !== 59)); // ignore Feb 29
await import("./enrich-data.mjs");
console.log(`Calendar coverage: ${366 - empty}/366 days populated, thinnest non-leap day has ${min} people`);
