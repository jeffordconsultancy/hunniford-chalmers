/* Hunniford Chalmers — the pub birthday game. Vanilla JS, no network except photos. */
(() => {
  "use strict";

  // ---------- Config ----------
  // Days between the two anchors' birthdays, levels 1..10. The year always counts.
  const WINDOWS = [1095, 365, 182, 91, 61, 42, 30, 21, 14, 10];
  const LABELS = ["three years", "a year", "six months", "three months", "two months", "six weeks", "a month", "three weeks", "a fortnight", "ten days"];
  const LIVES = 3;
  const MIN_BETWEEN = 3; // an anchor pair needs at least this many valid answers on the list
  const LAUNCH = "2026-09-24"; // Daily #1
  const FLASH_MS = 1700;

  // ---------- Data ----------
  const RAW = window.PEOPLE || [];
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const UK_RE = /\b(British|English|Scottish|Welsh|Irish|Northern Irish|UK|United Kingdom)\b/i;
  const EN_RE = /\b(American|Australian|Canadian|New Zealand|U\.S\.|United States)\b/i;
  function anchorWeight(p) {
    const uk = p.uk || UK_RE.test(p.desc || ""), en = p.en || EN_RE.test(p.desc || "");
    return Math.pow(p.sitelinks, 3) * (uk ? 10 : en ? 3 : 1);
  }

  function prep(p) {
    const [y, m, d] = p.dob.split("-").map(Number);
    return {
      ...p, y, m, d,
      abs: Math.floor(Date.UTC(y, m - 1, d) / 86400000),
      key: fold(p.name),
      words: fold(p.name).split(/\s+/),
      w: anchorWeight(p), // anchors lean towards faces a British pub knows; everyone stays a valid answer
    };
  }
  const PEOPLE = RAW.map(prep);
  const KNOWN = new Set(PEOPLE.map((p) => p.id));
  const BY_ABS = new Map();
  for (const p of PEOPLE) {
    if (!BY_ABS.has(p.abs)) BY_ABS.set(p.abs, []);
    BY_ABS.get(p.abs).push(p);
  }
  const ABS_DAYS = [...BY_ABS.keys()].sort((a, b) => a - b);
  const ABS_PREFIX = []; // count of people with abs < ABS_DAYS[i]
  { let c = 0; for (let i = 0; i < ABS_DAYS.length; i++) { ABS_PREFIX[i] = c; c += BY_ABS.get(ABS_DAYS[i]).length; } ABS_PREFIX[ABS_DAYS.length] = c; }
  const lowerBound = (x) => { let lo = 0, hi = ABS_DAYS.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (ABS_DAYS[mid] < x) lo = mid + 1; else hi = mid; } return lo; };
  const countAbsBetween = (a, b) => ABS_PREFIX[lowerBound(b)] - ABS_PREFIX[lowerBound(a + 1)]; // strictly between
  const PAIRS = {}; // window -> [[absA, absB]]

  const fmtDob = (p) => `${p.d} ${MONTHS[p.m - 1]} ${p.y}`;

  // ---------- RNG ----------
  function mulberry32(seed) {
    return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const hash = (s) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const weightedPick = (arr, rng, wf = (p) => p.w) => {
    let total = 0; for (const x of arr) total += wf(x);
    let r = rng() * total;
    for (const x of arr) { r -= wf(x); if (r <= 0) return x; }
    return arr[arr.length - 1];
  };

  // ---------- State ----------
  const $ = (s) => document.querySelector(s);
  const el = {
    home: $("#screen-home"), level: $("#screen-level"), over: $("#screen-over"), about: $("#screen-about"), scores: $("#screen-scores"),
    hsEntry: $("#hs-entry"), hsForm: $("#hs-form"), hsInitials: $("#hs-initials"), hsPlaced: $("#hs-placed"),
    scoresTable: $("#scores-table"), scoresEmpty: $("#scores-empty"),
    flash: $("#flash"), flashInner: $("#flash-inner"),
    btnDaily: $("#btn-daily"), dataCount: $("#data-count"),
    ladder: $("#ladder"), levelName: $("#level-name"), lives: $("#lives"),
    cardA: $("#card-a"), cardB: $("#card-b"), prompt: $("#prompt"),
    guess: $("#guess"), suggest: $("#suggest"), note: $("#note"),
    overTitle: $("#over-title"), overSub: $("#over-sub"), overAnchors: $("#over-anchors"), overAnswers: $("#over-answers"),
    btnShare: $("#btn-share"), sharePreview: $("#share-preview"),
  };
  let run = null;
  let flashTimer = null;

  const todayKey = () => new Date().toISOString().slice(0, 10);
  const dailyNumber = (key) => Math.round((Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) - Date.UTC(2026, 8, 24)) / 86400000) + 1;
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  // People this player looked up on Wikidata earlier stay on their list.
  const LOOKED_UP = (store.get("hc-lookups") || []).filter((p) => p && p.id && p.dob);
  for (const raw of LOOKED_UP) if (!KNOWN.has(raw.id)) { PEOPLE.push(prep({ ...raw, lookedUp: 1 })); KNOWN.add(raw.id); }

  // ---------- Screens ----------
  function show(name) {
    for (const k of ["home", "level", "over", "about", "scores"]) el[k].hidden = k !== name;
    window.scrollTo(0, 0);
    if (name === "home") refreshHome();
    if (name === "scores") renderScores();
  }
  function refreshHome() {
    el.dataCount.textContent = `${PEOPLE.length.toLocaleString("en-GB")} people on the list. Daily #${dailyNumber(todayKey())}.`;
    const done = store.get("hc-daily-" + todayKey());
    el.btnDaily.textContent = done ? `Daily · played (level ${done.level})` : "Daily";
  }

  // ---------- Cards ----------
  const initials = (name) => name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  const photoUrl = (p, w = 240) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(p.img)}?width=${w}`;
  const commonsPage = (p) => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(p.img)}`;
  function photoHtml(p, cls = "photo") {
    if (!p.img) return `<div class="${cls}"><div class="initials">${initials(p.name)}</div></div>`;
    return `<a class="${cls}" href="${commonsPage(p)}" target="_blank" rel="noopener" tabindex="-1" title="Photo source and licence on Wikimedia Commons">
      <img src="${photoUrl(p)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'initials',textContent:'${initials(p.name).replace(/'/g, "")}'}))">
    </a>`;
  }
  function cardHtml(p, extra = "") {
    return `${photoHtml(p)}<div class="name">${esc(p.name)}</div><div class="dob">${fmtDob(p)}</div>${p.desc ? `<div class="desc">${esc(p.desc)}</div>` : ""}${extra}`;
  }

  // ---------- Anchor generation ----------
  // Anchor B is born exactly w days after anchor A. Valid answers are strictly between.
  const inWindow = (p, lv) => p.abs > lv.a.abs && p.abs < lv.b.abs;
  function validAnswers(lv) {
    const out = [];
    for (let i = lowerBound(lv.a.abs + 1); i < ABS_DAYS.length && ABS_DAYS[i] < lv.b.abs; i++) out.push(...BY_ABS.get(ABS_DAYS[i]));
    return out;
  }
  function pairs(w) {
    if (PAIRS[w]) return PAIRS[w];
    const out = [];
    for (const x of ABS_DAYS) if (BY_ABS.has(x + w) && countAbsBetween(x, x + w) >= MIN_BETWEEN) out.push([x, x + w]);
    if (!out.length) for (const x of ABS_DAYS) if (BY_ABS.has(x + w) && countAbsBetween(x, x + w) >= 1) out.push([x, x + w]);
    return (PAIRS[w] = out);
  }
  const dayWeight = (abs) => Math.max(...BY_ABS.get(abs).map((p) => p.w));
  function makeLevel(n, rng) {
    const w = WINDOWS[n - 1];
    const [x, y] = weightedPick(pairs(w), rng, ([x, y]) => Math.sqrt(dayWeight(x) * dayWeight(y))); // both anchors should be known faces
    return { n, w, label: LABELS[n - 1], a: weightedPick(BY_ABS.get(x), rng), b: weightedPick(BY_ABS.get(y), rng), guessed: new Set(), rows: [] };
  }

  // ---------- High scores (arcade style) ----------
  // Storage is one small object so a shared backend can replace localStorage later without touching the UI.
  const SCORES_MAX = 10;
  const SCORE_MIN_LEVEL = 3; // cleared this many levels and you may enter your initials (or any score while the table has room)
  const scoreStore = {
    load() { return (store.get("hc-scores") || []).filter((s) => s && s.name && Number.isInteger(s.level)); },
    save(rows) { store.set("hc-scores", rows); },
  };
  const rankScore = (s) => s.level * 1000 + s.lives * 100 - Math.min(s.wrong, 99);
  function sortScores(rows) { return rows.sort((x, y) => rankScore(y) - rankScore(x) || x.ts - y.ts); }
  function qualifies(entry) {
    const rows = sortScores(scoreStore.load());
    if (entry.level < 1) return false;
    if (rows.length < SCORES_MAX && entry.level >= 1) return true;
    return entry.level >= SCORE_MIN_LEVEL && rankScore(entry) > rankScore(rows[rows.length - 1]);
  }
  function addScore(entry) {
    const rows = sortScores([...scoreStore.load(), entry]).slice(0, SCORES_MAX);
    scoreStore.save(rows);
    return rows.findIndex((r) => r.ts === entry.ts && r.name === entry.name);
  }
  const fmtWhen = (ts) => new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  function scoresTableHtml(rows, youTs) {
    return rows.map((r, i) => `<tr class="${r.ts === youTs ? "you" : ""}${i === 0 ? " first" : ""}"><td>${i + 1}</td><td class="name">${esc(r.name)}</td><td>${r.level}${r.won ? " 🏆" : ""}</td><td>${"🍺".repeat(r.lives) || "–"}</td><td class="when">${fmtWhen(r.ts)}</td></tr>`).join("");
  }
  function renderScores(youTs) {
    const rows = sortScores(scoreStore.load());
    el.scoresTable.querySelector("tbody").innerHTML = scoresTableHtml(rows, youTs);
    el.scoresEmpty.hidden = rows.length > 0;
  }
  let pendingEntry = null;
  function offerHighScore(entry) {
    pendingEntry = entry;
    el.hsPlaced.hidden = true;
    el.hsEntry.hidden = false;
    el.hsInitials.value = "";
    setTimeout(() => el.hsInitials.focus({ preventScroll: true }), 80);
  }
  el.hsInitials.addEventListener("input", () => { el.hsInitials.value = el.hsInitials.value.toUpperCase().replace(/[^A-Z0-9!?]/g, "").slice(0, 3); });
  el.hsForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!pendingEntry) return;
    const name = (el.hsInitials.value || "???").padEnd(3, "?").slice(0, 3);
    const entry = { ...pendingEntry, name };
    const pos = addScore(entry);
    pendingEntry = null;
    el.hsEntry.hidden = true;
    el.hsPlaced.innerHTML = `<div class="arcade-head">${pos === 0 ? "New top score" : "Rank " + (pos + 1)}</div><table class="scores"><tbody>${scoresTableHtml(sortScores(scoreStore.load()), entry.ts)}</tbody></table>`;
    el.hsPlaced.hidden = false;
  });

  // ---------- Run ----------
  function startRun({ daily }) {
    const key = todayKey();
    const seed = daily ? hash("HC:" + key) : (Math.random() * 2 ** 32) >>> 0;
    run = { daily, key, level: 1, lives: LIVES, rng: mulberry32(seed), levels: [], lv: null, result: null };
    nextLevel();
    show("level");
  }
  function nextLevel() {
    run.lv = makeLevel(run.level, run.rng);
    run.levels.push(run.lv);
    renderLevel();
  }
  function renderLevel() {
    const lv = run.lv;
    el.levelName.innerHTML = `<span class="lv-num">${String(lv.n).padStart(2, "0")}</span><span class="lv-label">${run.daily ? "Daily · " : ""}${lv.label}</span>`;
    for (const li of el.ladder.children) {
      const r = +li.dataset.rung;
      li.className = r < lv.n ? "done" : r === lv.n ? "now" : "";
    }
    renderLives();
    el.cardA.innerHTML = cardHtml(lv.a);
    el.cardB.innerHTML = cardHtml(lv.b);
    el.prompt.innerHTML = `Name someone born in the <strong>${lv.label}</strong> between ${fmtDob(lv.a)} and ${fmtDob(lv.b)}. <span class="fine">${lv.w - 1} days, not counting either birthday.</span>`;
    el.note.textContent = ""; el.note.className = "note";
    el.guess.value = ""; closeSuggest();
    setTimeout(() => el.guess.focus({ preventScroll: true }), 50);
  }
  function renderLives() {
    [...el.lives.children].forEach((s, i) => s.classList.toggle("lost", i >= run.lives));
  }

  function judge(p) {
    const lv = run.lv;
    if (p.id === lv.a.id || p.id === lv.b.id) return { kind: "anchor", why: "That's one of the anchors. Nice try. No penalty." };
    if (lv.guessed.has(p.id)) return { kind: "repeat", why: "Already tried this level. No penalty." };
    if (inWindow(p, lv)) return { kind: "good", why: `Born ${fmtDob(p)} — in the window.` };
    if (p.abs === lv.a.abs || p.abs === lv.b.abs) return { kind: "boundary", why: `Born ${fmtDob(p)} — same day as an anchor. Strictly between only.` };
    const early = lv.a.abs - p.abs, late = p.abs - lv.b.abs;
    const span = (n) => n >= 730 ? `${Math.round(n / 365)} years` : n >= 60 ? `${Math.round(n / 30.4)} months` : `${n} day${n === 1 ? "" : "s"}`;
    const why = early > 0 ? `Born ${fmtDob(p)} — ${span(early)} too early.` : `Born ${fmtDob(p)} — ${span(late)} too late.`;
    return { kind: "bad", why };
  }

  function submit(p) {
    const lv = run.lv;
    const v = judge(p);
    closeSuggest(); el.guess.value = "";
    if (v.kind === "anchor" || v.kind === "repeat") { el.note.textContent = v.why; el.note.className = "note warn"; return; }
    lv.guessed.add(p.id);
    const good = v.kind === "good";
    const cls = good ? "good" : (v.kind === "boundary" ? "boundary" : "bad");
    lv.rows.push(good ? "🟩" : "🟥");
    if (!good) { run.lives--; renderLives(); }
    const verdict = good ? "In the window!" : (v.kind === "boundary" ? "On the line" : "Missed");
    el.flashInner.innerHTML = `<article class="card ${cls}">${cardHtml(p, `<div class="verdict">${verdict}</div><div class="why">${v.why}</div>`)}</article><p class="tap">tap to continue</p>`;
    el.flash.hidden = false;
    const proceed = () => {
      clearTimeout(flashTimer); el.flash.hidden = true; el.flash.onclick = null;
      if (good) {
        if (lv.n === 10) return endRun("won");
        run.level++; nextLevel();
      } else if (run.lives <= 0) {
        endRun("lost");
      } else {
        el.note.textContent = `${run.lives} ${run.lives === 1 ? "life" : "lives"} left. Try another name.`; el.note.className = "note warn";
        el.guess.focus({ preventScroll: true });
      }
    };
    el.flash.onclick = proceed;
    flashTimer = setTimeout(proceed, FLASH_MS);
  }

  function endRun(how) {
    const lv = run.lv;
    const reached = how === "won" ? 10 : lv.n;
    run.result = { how, reached };
    const rows = run.levels.map((l, i) => (how === "won" || i < run.levels.length - 1) ? "🟩" : (how === "lost" ? "🟥" : "⬜"));
    while (rows.length < 10) rows.push("⬛");
    const label = run.daily ? `Hunniford Chalmers #${dailyNumber(run.key)}` : "Hunniford Chalmers";
    const score = how === "won" ? "10/10 🏆" : `level ${reached}/10`;
    run.shareText = `${label} — ${how === "won" ? "cleared it" : "reached " + score} ${"🍺".repeat(Math.max(run.lives, 0))}\n${rows.join("")}\n${location.href.split("#")[0]}`;
    if (run.daily) store.set("hc-daily-" + run.key, { level: reached, how });

    el.overTitle.textContent = how === "won" ? "You have done a Hunniford Chalmers." : how === "lost" ? `Out at level ${lv.n}.` : `Gave up at level ${lv.n}.`;
    el.overSub.textContent = how === "won" ? "Ten levels, from three years down to ten days. That is the whole game and you have finished it." : `The window was ${lv.label}: ${fmtDob(lv.a)} to ${fmtDob(lv.b)}.`;
    el.overAnchors.innerHTML = `<article class="card">${cardHtml(lv.a)}</article><div class="between" aria-hidden="true">→</div><article class="card">${cardHtml(lv.b)}</article>`;
    const answers = validAnswers(lv).filter((p) => !lv.guessed.has(p.id)).sort((a, b) => b.sitelinks - a.sitelinks).slice(0, 3);
    el.overAnswers.innerHTML = answers.map((p) => `<li>${photoHtml(p, "thumb")}<div class="who">${esc(p.name)}<small>${fmtDob(p)}${p.desc ? " · " + esc(p.desc) : ""}</small></div></li>`).join("") || "<li>Nobody, apparently. That shouldn't happen.</li>";
    el.sharePreview.hidden = true; el.btnShare.textContent = "Share";
    el.hsEntry.hidden = true; el.hsPlaced.hidden = true; pendingEntry = null;
    const cleared = how === "won" ? 10 : lv.n - 1;
    const wrong = run.levels.reduce((n, l) => n + l.rows.filter((r) => r === "🟥").length, 0);
    const entry = { level: cleared, lives: Math.max(run.lives, 0), wrong, won: how === "won", daily: run.daily, ts: Date.now() };
    if (qualifies(entry)) offerHighScore(entry);
    show("over");
  }

  // ---------- Autocomplete ----------
  let sugItems = [], sugIndex = -1;
  function search(q) {
    const k = fold(q.trim());
    if (k.length < 2) return [];
    const starts = [], words = [], subs = [];
    for (const p of PEOPLE) {
      if (p.key.startsWith(k)) starts.push(p);
      else if (p.words.some((w) => w.startsWith(k))) words.push(p);
      else if (p.key.includes(k)) subs.push(p);
      if (starts.length > 40) break;
    }
    const bySl = (a, b) => b.sitelinks - a.sitelinks;
    return [...starts.sort(bySl), ...words.sort(bySl), ...subs.sort(bySl)].slice(0, 8);
  }
  function renderSuggest(items, fromWikidata = false) {
    sugItems = items; sugIndex = items.length ? 0 : -1;
    if (!items.length) return closeSuggest();
    el.suggest.innerHTML = items.map((p, i) => `<li role="option" data-i="${i}" class="${i === 0 ? "active" : ""}${fromWikidata ? " wd" : ""}"><span>${esc(p.name)}${fromWikidata ? ` <small class="tag">${p.dob.slice(0, 4)}</small>` : ""}</span><span class="d">${esc(p.desc || "")}</span></li>`).join("");
    el.suggest.hidden = false;
  }
  function closeSuggest() { el.suggest.hidden = true; el.suggest.innerHTML = ""; sugItems = []; sugIndex = -1; }
  function setActive(i) {
    sugIndex = (i + sugItems.length) % sugItems.length;
    [...el.suggest.children].forEach((li, j) => li.classList.toggle("active", j === sugIndex));
    el.suggest.children[sugIndex]?.scrollIntoView({ block: "nearest" });
  }
  el.guess.addEventListener("input", () => { el.note.textContent = ""; el.note.className = "note"; lookupPending = null; renderSuggest(search(el.guess.value)); });
  el.guess.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && sugItems.length) { e.preventDefault(); setActive(sugIndex + 1); }
    else if (e.key === "ArrowUp" && sugItems.length) { e.preventDefault(); setActive(sugIndex - 1); }
    else if (e.key === "Escape") closeSuggest();
    else if (e.key === "Enter") {
      e.preventDefault();
      if (sugItems.length && sugIndex >= 0) submit(sugItems[sugIndex]);
      else if (el.guess.value.trim()) {
        const exact = PEOPLE.find((p) => p.key === fold(el.guess.value));
        if (exact) submit(exact);
        else offerLookup(el.guess.value.trim());
      }
    }
  });
  el.suggest.addEventListener("mousedown", (e) => { const li = e.target.closest("li"); if (li) { e.preventDefault(); submit(sugItems[+li.dataset.i]); } });
  document.addEventListener("click", (e) => { if (!e.target.closest(".search")) closeSuggest(); });

  // ---------- Wikidata lookup (free, no key; rate-limited per player, not per site) ----------
  const WD_API = "https://www.wikidata.org/w/api.php";
  let lookupPending = null;
  function offerLookup(q) {
    lookupPending = q;
    el.note.className = "note warn";
    el.note.innerHTML = `Not on our list — no penalty. <button type="button" class="link small" id="btn-lookup">Look up “${esc(q)}” on Wikidata</button>`;
  }
  async function wd(params) {
    const url = WD_API + "?" + new URLSearchParams({ ...params, format: "json", origin: "*" });
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }
  async function lookup(q) {
    el.note.className = "note";
    el.note.textContent = "Asking Wikidata…";
    try {
      const s = await wd({ action: "wbsearchentities", search: q, language: "en", uselang: "en", type: "item", limit: 7 });
      const ids = (s.search || []).map((r) => r.id);
      if (!ids.length) return noLookup(q);
      const g = await wd({ action: "wbgetentities", ids: ids.join("|"), props: "labels|descriptions|claims|sitelinks", languages: "en" });
      const found = [];
      for (const id of ids) {
        const e = g.entities?.[id]; if (!e || e.missing !== undefined) continue;
        const claims = e.claims || {};
        const human = (claims.P31 || []).some((c) => c.mainsnak?.datavalue?.value?.id === "Q5");
        const t = claims.P569?.[0]?.mainsnak?.datavalue?.value;
        if (!human || !t || t.precision < 11) continue;
        const m = /^\+(\d{4})-(\d{2})-(\d{2})/.exec(t.time); if (!m || +m[1] < 1800) continue;
        const raw = {
          id, name: e.labels?.en?.value || q, dob: `${m[1]}-${m[2]}-${m[3]}`,
          img: claims.P18?.[0]?.mainsnak?.datavalue?.value || "",
          desc: (e.descriptions?.en?.value || "").slice(0, 60), sitelinks: Object.keys(e.sitelinks || {}).length,
        };
        found.push(KNOWN.has(id) ? PEOPLE.find((p) => p.id === id) : prep({ ...raw, lookedUp: 1 }));
      }
      if (!found.length) return noLookup(q);
      for (const p of found) if (!KNOWN.has(p.id)) { PEOPLE.push(p); KNOWN.add(p.id); }
      const keep = PEOPLE.filter((p) => p.lookedUp).slice(-500).map(({ id, name, dob, img, desc, sitelinks }) => ({ id, name, dob, img, desc, sitelinks }));
      store.set("hc-lookups", keep);
      el.note.textContent = found.length === 1 ? "Found one on Wikidata. Is this them?" : "Found these on Wikidata. Pick the right one.";
      renderSuggest(found, true);
      el.guess.focus({ preventScroll: true });
    } catch (e) {
      el.note.className = "note warn";
      el.note.textContent = "Couldn't reach Wikidata just now. No penalty — try another name.";
    }
  }
  function noLookup(q) {
    el.note.className = "note warn";
    el.note.textContent = `Wikidata has nobody called “${q}” with a known birthday. No penalty.`;
  }
  document.addEventListener("click", (e) => { if (e.target.id === "btn-lookup" && lookupPending) { e.preventDefault(); lookup(lookupPending); } });

  // ---------- Buttons ----------
  document.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]"); if (go) { e.preventDefault(); show(go.dataset.go); return; }
    const b = e.target.closest("[data-action]"); if (!b) return;
    switch (b.dataset.action) {
      case "play": startRun({ daily: false }); break;
      case "daily": startRun({ daily: true }); break;
      case "again": startRun({ daily: false }); break;
      case "giveup": if (run && confirmGiveUp()) endRun("gaveup"); break;
      case "share": share(); break;
    }
  });
  function confirmGiveUp() { return true; } // no modal dialogs; it's a pub game

  async function share() {
    const text = run?.shareText || "";
    let copied = false;
    try { if (navigator.share) { await navigator.share({ text }); copied = true; } } catch {}
    if (!copied) { try { await navigator.clipboard.writeText(text); copied = true; } catch {} }
    el.sharePreview.textContent = text; el.sharePreview.hidden = false;
    el.btnShare.textContent = copied ? "Copied" : "Copy the text below";
  }

  // ---------- Boot ----------
  if (!PEOPLE.length) {
    el.dataCount.textContent = "No data loaded. Run `node scripts/build-data.mjs` first.";
  }
  show("home");
  window.HC = { PEOPLE, pairs, WINDOWS, scoreStore, startRun, submit, judge, get run() { return run; }, search };
})();
