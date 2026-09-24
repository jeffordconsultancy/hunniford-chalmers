// Phase 2 of the data build: adds country-of-citizenship flags so anchors lean
// towards faces a British pub would know. Reads data/people.json, rewrites both data files.
//   node scripts/enrich-data.mjs
import { readFileSync, writeFileSync } from "node:fs";

const ENDPOINTS = ["https://query-main.wikidata.org/sparql", "https://query.wikidata.org/sparql"];
const UA = "HunnifordChalmers/0.1 (https://github.com/markjefford/hunniford-chalmers; pub birthday game)";
const UK_IE = new Set(["Q145", "Q27", "Q174193"]);                 // UK, Ireland, UK of GB & Ireland
const ANGLO = new Set(["Q30", "Q16", "Q408", "Q664", ...UK_IE]);   // + US, Canada, Australia, NZ
const BATCH = 400;

async function run(sparql) {
  let lastErr;
  for (const ep of ENDPOINTS) for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(ep + "?format=json&query=" + encodeURIComponent(sparql), { headers: { "User-Agent": UA, Accept: "application/sparql-results+json" }, signal: AbortSignal.timeout(90_000) });
      if (!res.ok) throw new Error(`${ep} -> HTTP ${res.status}`);
      return (await res.json()).results.bindings;
    } catch (e) { lastErr = e; console.warn(`  retry: ${e.message}`); await new Promise((r) => setTimeout(r, 5000 * (attempt + 1))); }
  }
  throw lastErr;
}

const people = JSON.parse(readFileSync("data/people.json", "utf8"));
const byId = new Map(people.map((p) => [p.id, p]));
for (const p of people) { delete p.uk; delete p.en; }

for (let i = 0; i < people.length; i += BATCH) {
  const ids = people.slice(i, i + BATCH).map((p) => "wd:" + p.id).join(" ");
  process.stdout.write(`${i}/${people.length} `);
  const rows = await run(`SELECT ?p ?c WHERE { VALUES ?p { ${ids} } ?p wdt:P27 ?c . }`);
  for (const r of rows) {
    const p = byId.get(r.p.value.split("/").pop());
    const c = r.c.value.split("/").pop();
    if (UK_IE.has(c)) p.uk = 1;
    if (ANGLO.has(c)) p.en = 1;
  }
}
console.log();
writeFileSync("data/people.json", JSON.stringify(people));
writeFileSync("data/people.js", "window.PEOPLE=" + JSON.stringify(people) + ";");
console.log(`uk/ie: ${people.filter((p) => p.uk).length}, anglosphere: ${people.filter((p) => p.en).length}, total ${people.length}`);
