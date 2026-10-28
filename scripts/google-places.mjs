#!/usr/bin/env node
/**
 * Match the places sheet against Google Places (API "New", Text Search) to get
 * each place's Google place ID, and to find places Google says have closed or
 * cannot find at all.
 *
 *   node scripts/google-places.mjs                 # dry run: counts requests, sends nothing
 *   node scripts/google-places.mjs --run --yes     # query Google, write the review report
 *   node scripts/google-places.mjs --apply         # write the matched place IDs into the sheet
 *
 *   --limit 20       only the first N places (try it on a handful first)
 *   --only MUM-0012,MUM-0450   only these ids
 *
 * The key is read from GOOGLE_PLACES_KEY and never written anywhere.
 *
 * What is kept. Google's terms let a place ID be stored indefinitely; the rest
 * of a Places answer may only be cached for a short time. So the answers go to
 * .cache/google-places/ (not committed) for the review report, and --apply
 * writes nothing into the sheet but the place ID. Delete the cache once the
 * report has been reviewed: `rm -rf .cache/google-places`.
 *
 * Cost. Each place is one Text Search request asking for id, displayName,
 * location and businessStatus (the "Pro" field set). Check the current free
 * monthly allowance at https://mapsplatform.google.com/pricing before a full
 * run; the dry run prints how many requests it would send. A cached answer is
 * never requested twice.
 *
 * Matching. A result counts only if its name is close to ours and it sits near
 * our pin (300 m), or, for a place with no pin, inside its area (3 km of the
 * area's middle). Anything looser goes in the report as "check", not into the
 * sheet: a wrong place ID is worse than none, because Directions would open a
 * different business.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SHEET = path.join(ROOT, 'sources/entries/mumbai-places.csv');
const CACHE = path.join(ROOT, '.cache/google-places');
const REPORT = path.join(ROOT, '.cache/google-places-report.csv');
const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
const FIELDS = 'places.id,places.displayName,places.location,places.businessStatus';

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const opt = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const RUN = flag('--run'), YES = flag('--yes'), APPLY = flag('--apply');
const LIMIT = +opt('--limit') || Infinity;
const ONLY = opt('--only') ? new Set(opt('--only').split(',')) : null;

/* ---------- the sheet ---------- */
function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; continue; }
    if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const raw = fs.readFileSync(SHEET, 'utf8');
const [HEAD, ...BODY] = parseCsv(raw).filter((r) => r.some((x) => x !== ''));
const rows = BODY.map((r) => Object.fromEntries(HEAD.map((h, i) => [h, r[i] ?? ''])));

/* Routes, treks, parks and online communities have no Google listing worth
   matching; delivery-only kitchens have no door to send anyone to. */
const SKIP_G = new Set(['run', 'cycle', 'trek', 'track', 'park', 'group', 'account', 'hangout']);
const hasPlaceId = (r) => /place_id[:=]/.test(r.gm || '');
const todo = rows.filter((r) => !SKIP_G.has(r.g) && r.map_eligible !== 'no' && !hasPlaceId(r)
  && (!ONLY || ONLY.has(r.id))).slice(0, LIMIT);

/* ---------- geometry and names ---------- */
const metres = (a, b) => Math.hypot((a[0] - b[0]) * 110600, (a[1] - b[1]) * 104900);
const pinned = rows.filter((r) => r.lat && r.a);
const areaMid = new Map();
for (const r of pinned) {
  const m = areaMid.get(r.a) || [0, 0, 0];
  areaMid.set(r.a, [m[0] + +r.lat, m[1] + +r.lon, m[2] + 1]);
}
for (const [k, [la, lo, n]] of areaMid) areaMid.set(k, n >= 3 ? [la / n, lo / n] : null);
const CITY = { Thane: 'Thane', NaviMumbai: 'Navi Mumbai', MiraBhayandar: 'Mira-Bhayandar' };
const STOP = new Set(['the', 'and', 'of', 'mumbai', 'centre', 'center', 'clinic', 'studio', 'gym', 'fitness', 'dr', 'pvt', 'ltd', 'cafe', 'café', 'west', 'east']);
const words = (s) => new Set(String(s).toLowerCase().replace(/\s+—\s+.*$/, '').match(/[a-z0-9]+/g)?.filter((w) => w.length > 1 && !STOP.has(w)) || []);
function nameScore(ours, theirs) {
  const a = words(ours), b = words(theirs);
  if (!a.size || !b.size) return 0;
  let hit = 0; for (const w of a) if (b.has(w)) hit++;
  return hit / Math.min(a.size, b.size);
}

/* ---------- Google ---------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cacheFile = (id) => path.join(CACHE, `${id}.json`);
async function search(r, key) {
  const f = cacheFile(r.id);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  const name = r.n.replace(/\s+—\s+.*$/, '');
  const centre = r.lat ? [+r.lat, +r.lon] : areaMid.get(r.a);
  const body = {
    textQuery: [name, r.a, CITY[r.rg] || 'Mumbai'].filter(Boolean).join(', '),
    regionCode: 'IN',
    pageSize: 3,
    ...(centre && { locationBias: { circle: { center: { latitude: centre[0], longitude: centre[1] }, radius: r.lat ? 1000 : 3000 } } }),
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELDS },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (res.status === 429 || res.status >= 500) { await sleep(2000 * (attempt + 1)); continue; }
    const j = await res.json();
    if (!res.ok) throw new Error(`Places ${res.status}: ${j.error?.message || ''}`);
    const out = (j.places || []).map((p) => ({
      id: p.id, name: p.displayName?.text || '', lat: p.location?.latitude, lon: p.location?.longitude, status: p.businessStatus || '',
    }));
    fs.writeFileSync(f, JSON.stringify(out));
    return out;
  }
  throw new Error('Places kept answering 429/5xx');
}

function judge(r, results) {
  const centre = r.lat ? [+r.lat, +r.lon] : areaMid.get(r.a);
  const reach = r.lat ? 300 : 3000;
  const scored = results.map((p) => ({
    ...p,
    dist: centre && p.lat != null ? Math.round(metres(centre, [p.lat, p.lon])) : null,
    sim: +nameScore(r.n, p.name).toFixed(2),
  })).sort((a, b) => (b.sim - a.sim) || ((a.dist ?? 1e9) - (b.dist ?? 1e9)));
  const best = scored[0];
  if (!best) return { verdict: 'not-found' };
  const near = best.dist != null && best.dist <= reach;
  let verdict;
  if (best.sim >= 0.6 && near) verdict = best.status === 'CLOSED_PERMANENTLY' ? 'closed' : best.status === 'CLOSED_TEMPORARILY' ? 'temp-closed' : 'match';
  else if (best.sim >= 0.4 || near) verdict = 'check';
  else verdict = 'not-found';
  return { verdict, best };
}

/* ---------- apply ---------- */
if (APPLY) {
  if (!fs.existsSync(REPORT)) throw new Error('No report yet: run with --run --yes first.');
  const [h, ...b] = parseCsv(fs.readFileSync(REPORT, 'utf8')).filter((r) => r.length > 1);
  const rep = b.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
  const ids = new Map(rep.filter((x) => x.verdict === 'match' && x.place_id).map((x) => [x.id, x.place_id]));
  let n = 0;
  for (const r of rows) {
    const pid = ids.get(r.id);
    if (!pid || hasPlaceId(r)) continue;
    const q = encodeURIComponent(r.n.replace(/\s+—\s+.*$/, ''));
    r.gm = `https://www.google.com/maps/search/?api=1&query=${q}&query_place_id=${pid}`;
    n++;
  }
  fs.writeFileSync(SHEET, `${[HEAD, ...rows.map((r) => HEAD.map((k) => r[k]))].map((r) => r.map(csvCell).join(',')).join('\n')}\n`);
  console.log(`wrote ${n} place IDs into ${path.relative(ROOT, SHEET)}. Closed and not-found places are in the report for a person to act on.`);
  console.log('next: node scripts/ingest-entries.mjs sources/entries/mumbai-places.csv');
  process.exit(0);
}

/* ---------- run ---------- */
fs.mkdirSync(CACHE, { recursive: true });
const uncached = todo.filter((r) => !fs.existsSync(cacheFile(r.id)));
console.log(`${todo.length} places to match; ${uncached.length} need a request (${todo.length - uncached.length} already cached).`);
if (!RUN) { console.log('Dry run: nothing sent. Add --run --yes to query Google.'); process.exit(0); }
const KEY = process.env.GOOGLE_PLACES_KEY;
if (!KEY) { console.error('GOOGLE_PLACES_KEY is not set.'); process.exit(1); }
if (!YES) { console.error(`This sends ${uncached.length} requests. Re-run with --yes to go ahead.`); process.exit(1); }

const out = [];
let done = 0;
const queue = [...todo];
async function worker() {
  while (queue.length) {
    const r = queue.shift();
    try {
      const { verdict, best } = judge(r, await search(r, KEY));
      out.push({ id: r.id, n: r.n, a: r.a, g: r.g, verdict, google_name: best?.name || '', status: best?.status || '', distance_m: best?.dist ?? '', similarity: best?.sim ?? '', place_id: best?.id || '' });
    } catch (e) {
      out.push({ id: r.id, n: r.n, a: r.a, g: r.g, verdict: 'error', google_name: e.message.slice(0, 120) });
      if (/40[13]/.test(e.message)) { console.error(e.message); queue.length = 0; }
    }
    if (++done % 100 === 0) console.log(`  ${done}/${todo.length}`);
    await sleep(120);
  }
}
await Promise.all([worker(), worker(), worker()]);
out.sort((a, b) => a.id.localeCompare(b.id));
const cols = ['id', 'n', 'a', 'g', 'verdict', 'google_name', 'status', 'distance_m', 'similarity', 'place_id'];
fs.writeFileSync(REPORT, `${[cols, ...out.map((r) => cols.map((c) => r[c] ?? ''))].map((r) => r.map(csvCell).join(',')).join('\n')}\n`);
const tally = out.reduce((m, r) => ((m[r.verdict] = (m[r.verdict] || 0) + 1), m), {});
console.log('\n', tally);
console.log(`report: ${path.relative(ROOT, REPORT)} (not committed; it holds Google's answers)`);
console.log('next: review it, then node scripts/google-places.mjs --apply');
