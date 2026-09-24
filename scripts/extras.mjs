// Phase 3: people who must be on the list regardless of the sitelinks threshold.
// The global fame filter (>= 35 sitelinks) drops UK household names. Add their
// Wikidata Q-ids to data/extras.txt, one per line, and run:
//   node scripts/extras.mjs
// Uses the EntityData endpoint (one small request per person, no SPARQL).
import { readFileSync, writeFileSync } from "node:fs";

const UA = "HunnifordChalmers/0.1 (https://github.com/markjefford/hunniford-chalmers; pub birthday game)";
const CUM = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
const people = JSON.parse(readFileSync("data/people.json", "utf8"));
const have = new Set(people.map((p) => p.id));
const ids = readFileSync("data/extras.txt", "utf8").split(/\r?\n/).map((l) => l.trim().split(/\s+/)[0]).filter((l) => /^Q\d+$/.test(l));

let added = 0;
for (const id of ids) {
  if (have.has(id)) continue;
  const res = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${id}.json`, { headers: { "User-Agent": UA } });
  if (!res.ok) { console.warn(`${id}: HTTP ${res.status}`); continue; }
  const e = (await res.json()).entities[id];
  const claim = (prop) => e.claims?.[prop]?.[0]?.mainsnak?.datavalue?.value;
  const t = claim("P569"), img = claim("P18");
  if (!t || t.precision < 11) { console.warn(`${id}: no day-precision DOB`); continue; }
  if (!img) console.warn(`${id}: no Commons photo, will show initials`);
  const m = /^\+(\d{4})-(\d{2})-(\d{2})/.exec(t.time);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const citizen = (e.claims?.P27 || []).map((c) => c.mainsnak?.datavalue?.value?.id);
  const p = {
    id, name: e.labels?.en?.value || id, dob: `${m[1]}-${m[2]}-${m[3]}`, doy: CUM[mo - 1] + d, img: img || "",
    desc: (e.descriptions?.en?.value || "").slice(0, 60), sitelinks: Object.keys(e.sitelinks || {}).length,
  };
  if (citizen.some((c) => ["Q145", "Q27", "Q174193"].includes(c))) p.uk = 1;
  if (citizen.some((c) => ["Q145", "Q27", "Q174193", "Q30", "Q16", "Q408", "Q664"].includes(c))) p.en = 1;
  p.extra = 1;
  people.push(p); added++;
  console.log(`+ ${p.name} ${p.dob}`);
}
writeFileSync("data/people.json", JSON.stringify(people));
writeFileSync("data/people.js", "window.PEOPLE=" + JSON.stringify(people) + ";");
console.log(`added ${added}, total ${people.length}`);
