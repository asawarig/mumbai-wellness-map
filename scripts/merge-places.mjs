/* Merges researched rows and the OpenStreetMap sweep into the Mumbai places
 * sheet, sources/entries/mumbai-places.csv, which ingest-entries.mjs reads.
 *
 *   node scripts/merge-places.mjs <file.csv|file.json> [...]
 *
 * Inputs are CSVs in the research format (category,g,s,n,a,ad,lat,lon,…) or
 * JSON arrays of the same objects. Put sources/entries/osm-places.csv last:
 * where a researched row and an OSM row are the same place, the first one
 * read wins, and fills its blanks (coordinates, address, website) from the
 * other.
 *
 * Then, for each row:
 *   - category from the sub-category when a row has none (G_CATEGORY)
 *   - coordinates outside the city dropped unless the row says out=1
 *   - missing coordinates looked up on Nominatim, one request a second, from
 *     the street address and then from "name, area"; an answer is kept only
 *     inside the city (or near it, for out=1 rows). Cached in .cache/ so a
 *     rerun is quick.
 *   - missing area: the nearest OSM neighbourhood (.cache/osm-neighbourhoods.json,
 *     written by osm-places.mjs)
 *   - id: kept from the existing sheet where the name and sub-category match,
 *     so links to a place survive a rerun; new rows get the next MUM-number.
 *
 * Also rewrites the Communities tab (src/data/community-categories.json) from
 * the Communities rows: each row's `notes` starts with its tab category.
 */

import fs from 'node:fs';
import path from 'node:path';
import { SUBCAT } from '../src/lib/categories.js';
import { NOT_WELLNESS, CLOSED } from './exclusions.mjs';
import { decodePlusCode, plusCodeIn } from './pluscode.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'sources/entries/mumbai-places.csv');
const CACHE = path.join(ROOT, '.cache/geocode.json');
const UA = 'mumbai-wellness-map/1.0 (places merge script)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const G_CATEGORY = {
  run: 'Move', cycle: 'Move', swim: 'Move', trek: 'Move', track: 'Move',
  badminton: 'Play', padel: 'Play', tennis: 'Play', cricket: 'Play', turf: 'Play', multisport: 'Play',
  climb: 'Play', play: 'Play', golf: 'Play', stadium: 'Play', court: 'Play', specialty: 'Play',
  gym: 'Work out', yoga: 'Work out', act_gym: 'Work out',
  healthy: 'Eat healthy', nutrition: 'Eat healthy',
  lab: 'Check your health', clinic: 'Check your health', physio: 'Check your health', newage: 'Check your health', hospital: 'Check your health',
  therapy: 'Mental health', alttherapy: 'Mental health',
  retail: 'Buy gear', bike: 'Buy gear', wearable: 'Buy gear',
  group: 'Communities', hangout: 'Communities', account: 'Communities',
};
const TAB_CATEGORIES = ['Running', 'Cycling', 'Hiking & Outdoors', 'Climbing', 'Sports & Games', 'Queer Communities', 'Social & Creative'];

/* ---------- read ---------- */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function readRows(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  if (file.endsWith('.json')) {
    const j = JSON.parse(text);
    return (Array.isArray(j) ? j : j.rows || []).map((r) => ({ ...r }));
  }
  const [head, ...body] = parseCsv(text);
  return body.filter((r) => r.some((v) => v.trim())).map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ''])));
}

const files = process.argv.slice(2);
if (!files.length) throw new Error('usage: node scripts/merge-places.mjs <file.csv|file.json> [...]');
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
let rows = [];
for (const f of files) {
  const got = readRows(f).map((r) => {
    const o = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, clean(v)]));
    o._file = path.basename(f);
    o._osm = /openstreetmap\.org/.test(o.src_url || '') && /OpenStreetMap sweep/.test(o.notes || '');
    return o;
  });
  console.log(`${path.basename(f)}: ${got.length} rows`);
  rows.push(...got);
}

/* ---------- geometry ---------- */
function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const mask = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/mask.json'), 'utf8'));
const cityRings = mask.features[0].geometry.coordinates.slice(1);
const inCity = (lon, lat) => cityRings.some((r) => inRing([lon, lat], r));
const metres = (a, b) => Math.hypot((a[0] - b[0]) * 104900, (a[1] - b[1]) * 110600);
const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));

/* ---------- tidy ---------- */
const OUTSIDE = /\b(4012\d\d|4013\d\d|4102\d\d|4107\d\d)\b|\b(bhiwandi|kalyan(?!\s*(jewel|nagar|kendra))|dombivli|ambernath|badlapur|ulhasnagar|kharghar|kamothe|kalamboli|ulwe|taloja|vasai|virar)\b/i;
const OSM_SKIP = new Set(['clinic', 'hospital']);
const stats = { closed: 0, sharedPin: 0, spiritual: 0, farPins: 0, osmSkipped: 0, outsideAd: 0, noG: 0, badCoords: 0, dupes: 0, geocoded: 0, geoMiss: 0, areaFilled: 0 };
rows = rows.filter((r) => {
  if (!r.n) return false;
  /* No religious or spiritual organisations, and no guru-led movements:
     the map is for health, and some of these border on cults. Healthcare
     run by a religious trust (a mission hospital, a Jain medical centre)
     stays; the organisations themselves do not. */
  if (CLOSED.test(r.n)) { stats.closed++; console.log(`  skipped (closed): ${r.n}`); return false; }
  if (NOT_WELLNESS.test(r.n) || NOT_WELLNESS.test(r.d || '') && r.g === 'alttherapy') { stats.spiritual++; console.log(`  skipped (spiritual/religious): ${r.n}`); return false; }
  /* OSM tags hundreds of nursing homes and doctors' rooms in Mumbai as
     hospitals and clinics; those come from research only. */
  /* Dentists are the exception: OSM maps them reliably, by name. */
  if (r._osm && OSM_SKIP.has(r.g) && r.s !== 'Dental clinic') { stats.osmSkipped++; return false; }
  if (!r.g || !SUBCAT[r.g]) { stats.noG++; console.log(`  skipped (unknown g ${JSON.stringify(r.g)}): ${r.n} [${r._file}]`); return false; }
  r.category = r.category || G_CATEGORY[r.g];
  r.out = r.out === '1' || r.out === 1 ? 1 : 0;
  /* An address in Bhiwandi, Kalyan-Dombivli, Panvel MC (Kharghar, Ulwe…)
     or Vasai-Virar is outside the city whatever its pin says. Mumbai, Navi
     Mumbai, Thane and Mira-Bhayandar are all in. */
  if (!r.out && OUTSIDE.test(r.ad || '')) { stats.outsideAd++; console.log(`  skipped (address outside BMC): ${r.n} — ${r.ad}`); return false; }
  let lat = num(r.lat), lon = num(r.lon);
  /* Swapped coordinates are a common slip: Mumbai is about 19 N, 72.8 E. */
  if (lat != null && lon != null && lat > 60 && lon < 30) [lat, lon] = [lon, lat];
  if (lat != null && lon != null && !r.out && !inCity(lon, lat)) {
    stats.badCoords++;
    r.notes = [r.notes, `coordinates ${lat},${lon} were outside the city; re-looked up`].filter(Boolean).join('; ');
    lat = lon = null;
  }
  r.lat = lat == null ? null : +lat.toFixed(6); r.lon = lon == null ? null : +lon.toFixed(6);
  return true;
});

/* ---------- de-duplicate ---------- */
const key = (n) => n.toLowerCase()
  .replace(/\b(the|pvt|ltd|private|limited|mumbai|centre|center|clinic|studio|cafe|café)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, '');
const merged = [];
const FILL = ['a', 'ad', 'lat', 'lon', 'gm', 'w', 'ig', 'd', 'p', 'b', 't', 'tg'];
for (const r of rows) {
  const k = key(r.n);
  const adKey = (x) => (x.ad || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const twin = merged.find((m) => {
    if (m.g === r.g && Math.min(adKey(m).length, adKey(r).length) > 30 && (adKey(m).includes(adKey(r)) || adKey(r).includes(adKey(m)))) return true;
    /* "Care Counselling Coaching" and "Care Counselling Coaching — Malvani":
       one name with and without its branch, at the same spot. */
    const bare = (n) => key(String(n).replace(/\s+—\s+.*$/, ''));
    if (m.g === r.g && m.lat != null && r.lat != null && bare(m.n) === bare(r.n) && metres([m.lon, m.lat], [r.lon, r.lat]) < 150) return true;
    if (key(m.n) !== k) return false;
    if (m.lat != null && r.lat != null) return metres([m.lon, m.lat], [r.lon, r.lat]) < 300;
    return (m.a || '').toLowerCase() === (r.a || '').toLowerCase() || !m.a || !r.a;
  });
  if (!twin) { merged.push(r); continue; }
  stats.dupes++;
  FILL.forEach((f) => { if ((twin[f] == null || twin[f] === '') && r[f] != null && r[f] !== '') twin[f] = r[f]; });
  if (r.src_url && !(twin.src_url || '').includes(r.src_url)) twin.src_url = [twin.src_url, r.src_url].filter(Boolean).join(' | ');
}

/* ---------- geocode ---------- */
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
const saveCache = () => { fs.mkdirSync(path.dirname(CACHE), { recursive: true }); fs.writeFileSync(CACHE, JSON.stringify(cache)); };
async function nominatim(q) {
  if (q in cache) return cache[q];
  const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in'
    + '&viewbox=72.70,19.35,73.10,18.85&bounded=0&q=' + encodeURIComponent(q);
  let hit = null;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
    if (res.ok) { const j = await res.json(); if (j[0]) hit = [+(+j[0].lon).toFixed(6), +(+j[0].lat).toFixed(6), j[0].addresstype || j[0].type]; }
  } catch { /* a miss, retried next run */ return null; }
  cache[q] = hit;
  await sleep(1100); // Nominatim's usage policy: at most one request a second
  return hit;
}
/* Photon (photon.komoot.io), the second geocoder: OSM-based too, and kinder
   to loose wording. Its answers carry a type and, for a street, its extent. */
async function photon(q) {
  const k = `photon:${q}`;
  if (k in cache) return cache[k];
  let hit = null;
  try {
    const res = await fetch('https://photon.komoot.io/api/?limit=1&lang=en&lat=19.07&lon=72.87&q=' + encodeURIComponent(q),
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
    if (res.ok) {
      const f = (await res.json()).features?.[0];
      if (f) {
        const ex = f.properties.extent; // [w, n, e, s]
        const span = ex ? metres([ex[0], ex[1]], [ex[2], ex[3]]) : 0;
        hit = [+f.geometry.coordinates[0].toFixed(6), +f.geometry.coordinates[1].toFixed(6), f.properties.type, span];
      }
    }
  } catch { return null; }
  cache[k] = hit;
  await sleep(400);
  return hit;
}
/* A hit that only found the neighbourhood or the city is not a pin for a place;
   a long road is not either. */
const COARSE = /^(city|state|state_district|county|suburb|neighbourhood|quarter|city_district|postcode|town|village|district|locality|country|administrative)$/;
const usable = (hit, r) => {
  if (!hit) return false;
  const type = hit[2] || '';
  /* A route or a trek can be a beach, a village or a peak. */
  const loose = /^(run|cycle|trek|track)$/.test(r.g);
  if (COARSE.test(type) && !(loose && /^(village|locality|neighbourhood)$/.test(type))) return false;
  if (/^(street|road)$/.test(type) && (hit[3] || 0) > (loose ? 6000 : 1500)) return false;
  return true;
};
/* Where a row's neighbourhood is known, a pin must land near it. */
const hoodsForCheck = fs.existsSync(path.join(ROOT, '.cache/osm-neighbourhoods.json'))
  ? JSON.parse(fs.readFileSync(path.join(ROOT, '.cache/osm-neighbourhoods.json'), 'utf8')) : [];
const hoodPt = (a) => {
  const words = String(a || '').toLowerCase().split(/[/,()]+/).map((w) => w.replace(/\b(east|west|e|w)\b/g, '').trim()).filter((w) => w.length > 2);
  const h = hoodsForCheck.filter((x) => Array.isArray(x.pt) && x.pt[0] != null).find((x) => words.some((w) => x.name.toLowerCase().includes(w) || w.includes(x.name.toLowerCase())));
  return h?.pt || null;
};
const LANDMARK = /\b(mall|marketcity|market city|palladium|phoenix|inorbit|infiniti|oberoi|r city|viviana|lake shore|korum|growel|nexus|grand central|raghuleela|kamala mills|todi mills|high street|udyan|udyaan|park|garden|beach|chowpatty|caves?|jetty|hospital|institute|fort|station|gymkhana|complex|lake|club|stadium|maidan|temple|church|school|college|university|hotel|plaza|centre|center|bhavan|bhawan|dome|pagoda)\b/i;
const JUNK = /^(shop|unit|office|flat|gala|plot|no\.?|ground|first|second|third|\d+(st|nd|rd|th)?\s*floor|floor|ugf|lgf|wing|block|room|near|opp\.?|opposite|behind|next to|above|below|beside)\b|^\d+[a-z]?$/i;
/* Which city to name in a lookup: a Thane or Navi Mumbai address asked about
   as if it were in Mumbai finds nothing. */
const NAVI = /navi mumbai|vashi|sanpada|juinagar|turbhe|nerul|seawoods|belapur|kopar ?khairane|ghansoli|rabale|airoli|digha|mahape/i;
const cityOf = (r) => {
  const t = `${r.ad || ''} ${r.a || ''}`;
  if (/mira road|mira-bhayandar|mira bhayandar|bhayandar|bhayander|kashimira|uttan/i.test(t) && !/bhayandar ?pada/i.test(t)) return 'Mira-Bhayandar';
  return NAVI.test(t) ? 'Navi Mumbai' : /\bthane\b|ghodbunder|majiwada|kalwa|mumbra|diva\b|kasarvadavali|naupada|kolshet|manpada|vartak nagar|wagle/i.test(t) ? 'Thane' : 'Mumbai';
};
const CITY_CENTRE = { Mumbai: [72.88, 19.08], Thane: [72.97, 19.2], 'Navi Mumbai': [73.02, 19.06], 'Mira-Bhayandar': [72.86, 19.29] };
function queries(r) {
  const c = cityOf(r);
  const city = r.out ? '' : (new RegExp(`\\b${c}\\b`, 'i').test(r.ad || '') ? '' : `, ${c}`);
  const segs = String(r.ad || '').replace(/^(start|starts at|starting point|meeting point)\s*:?\s*/i, '')
    .split(/\s*[,;–]\s*/).map((x) => x.trim()).filter(Boolean);
  const useful = segs.filter((x) => !JUNK.test(x) && !/^(mumbai|maharashtra|india|\d{6})$/i.test(x) && !/^mumbai\s+\d{6}$/i.test(x));
  const area = r.a ? r.a.split(/\s*[/(]\s*/)[0] : '';
  const out = [];
  useful.filter((x) => LANDMARK.test(x)).forEach((x) => out.push(`${x}${area && !x.includes(area) ? ', ' + area : ''}${city}`));
  useful.filter((x) => /\b(building|bldg|house|tower|heights|chambers|arcade|apartments?|niwas|sadan|mansion)\b/i.test(x)).forEach((x) => out.push(`${x}, ${area}${city}`));
  useful.filter((x) => /\b(road|rd|marg|lane|street|path|highway|link|causeway)\b/i.test(x)).forEach((x) => out.push(`${x}, ${area}${city}`));
  const name = r.n.split(/\s+[—-]\s+/)[0].replace(/\(.*?\)/g, '')
    .replace(/\b(trek|trail|hike|ride|walk|loop|run|route|circuit)\b/gi, '').replace(/\s+/g, ' ').trim();
  out.push(`${name}${area ? ', ' + area : ''}${city}`);
  if (r.ad) out.push(useful.slice(0, 3).join(', ') + city);
  return [...new Set(out.map((q) => q.replace(/\s+/g, ' ').replace(/^,\s*/, '')))].slice(0, 6);
}
/* Day trips beyond OUT_MAX_M stay on the list but get no pin: the map's edge
   is a circle that takes in every pin (build-region.mjs), and a fort 100 km
   off would make it four times the city. Bengaluru's circle is 38.5 km. */
const CENTRE = [72.879, 19.081], OUT_MAX_M = 50000;
for (const r of merged) {
  if (r.out && r.lat != null && metres([r.lon, r.lat], CENTRE) > OUT_MAX_M) {
    r.notes = [r.notes, `pin ${r.lat},${r.lon} is over ${OUT_MAX_M / 1000} km out; listed as a day trip without one`].filter(Boolean).join('; ');
    r.lat = r.lon = null; r._noLookup = true;
  }
}
/* A pin far from the neighbourhood the row names is usually a listing that
   reused its company's head-office pin: look it up again from the address. */
for (const r of merged) {
  if (r.lat == null || r.out) continue;
  const near = hoodPt(r.a);
  if (near && metres([r.lon, r.lat], near) > 5000) {
    r.notes = [r.notes, `source pin ${r.lat},${r.lon} was ${(metres([r.lon, r.lat], near) / 1000).toFixed(1)} km from ${r.a}; re-looked up`].filter(Boolean).join('; ');
    r.lat = r.lon = null; stats.farPins++;
  }
}
const need = merged.filter((r) => r.lat == null && !r._noLookup && r.category !== 'Communities');
console.log(`\nLooking up ${need.length} rows without coordinates…`);
let done = 0;
for (const r of need) {
  const near = r.out ? null : hoodPt(r.a);
  /* A plus code in the address is an exact spot: decode it first. */
  const pc = plusCodeIn(r.ad);
  if (pc) {
    const ref = near || CITY_CENTRE[cityOf(r)];
    const hit = decodePlusCode(pc, ref[1], ref[0]);
    if (hit && (r.out || inCity(hit.lon, hit.lat))) {
      r.lon = +hit.lon.toFixed(6); r.lat = +hit.lat.toFixed(6);
      r.notes = [r.notes, `pin from plus code ${pc}`].filter(Boolean).join('; ');
      stats.geocoded++; done++;
      continue;
    }
  }
  for (const q of queries(r)) {
    let found = null;
    for (const look of [nominatim, photon]) {
      const hit = await look(q);
      if (!usable(hit, r)) continue;
      const ok = r.out ? metres([hit[0], hit[1]], CENTRE) < OUT_MAX_M : inCity(hit[0], hit[1]);
      if (!ok) continue;
      if (near && metres([hit[0], hit[1]], near) > 4000) continue;
      found = { hit, q, by: look === nominatim ? 'Nominatim' : 'Photon' };
      break;
    }
    if (found) {
      r.lon = found.hit[0]; r.lat = found.hit[1];
      r.notes = [r.notes, `pin from ${found.by}: "${found.q}" — check`].filter(Boolean).join('; ');
      stats.geocoded++;
      break;
    }
  }
  if (r.lat == null) { stats.geoMiss++; r.notes = [r.notes, 'no pin found; listed without one'].filter(Boolean).join('; '); }
  if (++done % 25 === 0) { saveCache(); console.log(`  ${done}/${need.length}`); }
}
saveCache();

/* ---------- shared buildings ----------
   A place still without a pin, in the same mall or named building as a place
   that has one, stands where that one does: "3rd Floor, Phoenix Palladium
   Mall" and "Palladium, Lower Parel" are the same few metres. */
{
  /* Buildings only: a beach, a park or a lake is too big to share a pin in. */
  const BUILDING = /\b(mall|marketcity|market city|palladium|phoenix|inorbit|infiniti|oberoi|r city|viviana|lake shore|korum|growel|nexus|grand central|raghuleela|plaza|towers?|complex|bhavan|bhawan|building|bldg|heights|chambers|arcade|business park|mills|apartments?|co-?op|chs)\b/i;
  const segsOf = (r) => String(r.ad || '').split(/\s*[,;]\s*/).map((x) => x.trim())
    .filter((x) => BUILDING.test(x) && !/\b(beach|park|garden|udyan|lake|chowpatty|maidan|fort|caves?|trail|station)\b/i.test(x) && x.length > 5)
    .map((x) => x.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
  const areaWords = (r) => new Set(String(r.a || '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3 && !/^(east|west|road|nagar|mumbai)$/.test(w)));
  const sameArea = (m, r) => { const a = areaWords(m), b = areaWords(r); return !a.size || !b.size || [...a].some((w) => b.has(w)); };
  const GENERIC_BLD = /^(mall|the mall|complex|centre|center|plaza|tower|building|house)$/;
  const core = (k) => k.replace(/\b(mall|the|shop|no|ground|floor|level|unit)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const pinned = merged.filter((m) => m.lat != null).map((m) => ({ m, keys: segsOf(m).map(core).filter((k) => k.length >= 6 && !GENERIC_BLD.test(k)) }));
  for (const r of merged) {
    if (r.lat != null || r.category === 'Communities' || r.out) continue;
    const mine = segsOf(r).map(core).filter((k) => k.length >= 6 && !GENERIC_BLD.test(k));
    if (!mine.length) continue;
    const hit = pinned.find(({ m, keys }) => cityOf(m) === cityOf(r) && sameArea(m, r)
      && keys.some((k) => mine.some((x) => x === k || (x.length >= 8 && k.includes(x)) || (k.length >= 8 && x.includes(k)))))?.m;
    if (!hit) continue;
    r.lat = hit.lat; r.lon = hit.lon; stats.sharedPin++;
    r.notes = [String(r.notes || '').replace(/;?\s*no pin found; listed without one/, ''), `pin shared with ${hit.n} (same building)`].filter(Boolean).join('; ');
  }
}

/* ---------- area ---------- */
const NB = path.join(ROOT, '.cache/osm-neighbourhoods.json');
const hoods = (fs.existsSync(NB) ? JSON.parse(fs.readFileSync(NB, 'utf8')) : []).filter((h) => Array.isArray(h.pt) && h.pt[0] != null);
for (const r of merged) {
  if (r.a || r.lat == null || !hoods.length) continue;
  let best = null, d = Infinity;
  for (const h of hoods) {
    const m = metres([r.lon, r.lat], h.pt) * (h.kind === 'suburb' ? 0.8 : 1);
    if (m < d) { d = m; best = h; }
  }
  if (best && d < 2500) { r.a = best.name; stats.areaFilled++; }
}

/* ---------- ids ---------- */
const prev = fs.existsSync(OUT) ? readRows(OUT) : [];
/* Same name, same kind, same spot (to ~100 m): the same place. The spot tells
   apart branches that share a bare name ("Decathlon", "Gym"). */
const spot = (r) => (r.lat == null || r.lat === '' ? '' : `${(+r.lat).toFixed(3)},${(+r.lon).toFixed(3)}`);
const idFor = new Map(prev.map((p) => [`${key(p.n)}|${p.g}|${spot(p)}`, p.id]));
prev.forEach((p) => { const k = `${key(p.n)}|${p.g}`; if (!idFor.has(k)) idFor.set(k, p.id); });
let next = prev.reduce((m, p) => Math.max(m, +(String(p.id).match(/MUM-(\d+)/)?.[1] || 0)), 0);
const ORDER = Object.keys(G_CATEGORY);
merged.sort((a, b) => ORDER.indexOf(a.g) - ORDER.indexOf(b.g) || a.n.localeCompare(b.n));
const used = new Set();
for (const r of merged) {
  let id = idFor.get(`${key(r.n)}|${r.g}|${spot(r)}`) || idFor.get(`${key(r.n)}|${r.g}`);
  if (!id || used.has(id)) id = `MUM-${String(++next).padStart(4, '0')}`;
  used.add(id);
  r.id = id;
}

/* ---------- Plum Perks ----------
   The map reads a partner from the tag plum-perks and a Playo venue from the
   tag playo (src/lib/index-card.js). Research marks a partner branch in
   perk_partner / perk_id; any row named after a partner brand with physical
   branches is one too, whoever found it (the OSM sweep finds Apollo
   Pharmacies the research did not). */
const PERK_BRANDS = /\beat\.? ?fit\b|^(cult\.?fit|cult\b|healthkart|apollo pharmacy|clove dental|sabka dentist|vijaya diagnostic|cloudnine|qi spine|the wellness co|amaha|the sleep company|vetic|tagda raho|studio oura|ultrahuman|praan health|dr\.? paws|arva health)/i;
let perkTagged = 0, playoTagged = 0;
for (const r of merged) {
  const tags = new Set(String(r.tg || '').split('|').map((t) => t.trim()).filter(Boolean));
  const playo = r.perk_id === 'PLUM-054' || /playo\.co/i.test(r.w || '') || /on playo/i.test(r.notes || '');
  const partner = !playo && ((r.perk_partner || '').toLowerCase() === 'yes' || /^PLUM-/.test(r.perk_id || '') || PERK_BRANDS.test(r.n));
  if (playo && !tags.has('playo')) { tags.add('playo'); playoTagged++; }
  if (partner && !tags.has('plum-perks')) { tags.add('plum-perks'); perkTagged++; }
  r.tg = [...tags].join('|');
}
console.log(`\n  ${perkTagged} Plum Perks partner branches tagged, ${playoTagged} Playo venues tagged`);

/* ---------- write the sheet ---------- */
const COLS = ['category', 'intent_v7', 'id', 'n', 'c', 'g', 's', 'a', 'raw', 'ad', 'lat', 'lon', 'rg', 'gm', 'w', 'ig', 'd', 'p', 'b', 't', 'tg',
  'src', 'v', 'out', 'map_eligible', 'perk_partner', 'perk_id', 'src_url', 'notes'];
const q = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const lines = merged.map((r) => COLS.map((c) => q({
  ...r,
  intent_v7: r.category,
  c: SUBCAT[r.g],
  raw: r.a || '',
  src: r._osm ? 'OpenStreetMap' : 'Web research',
  v: r.v || 'Needs check',
  map_eligible: r.lat != null ? 'yes' : 'no',
  rg: '',
}[c])).join(','));
fs.writeFileSync(OUT, [COLS.join(','), ...lines].join('\n') + '\n');

/* ---------- the Communities tab ---------- */
const CC = path.join(ROOT, 'src/data/community-categories.json');
const cc = JSON.parse(fs.readFileSync(CC, 'utf8'));
const tabOf = (r) => TAB_CATEGORIES.find((t) => (r.notes || '').toLowerCase().startsWith(t.toLowerCase()))
  || TAB_CATEGORIES.find((t) => (r.notes || '').toLowerCase().includes(t.toLowerCase())) || 'Social & Creative';
const handle = (ig) => (ig ? `https://www.instagram.com/${ig.replace(/^@/, '').replace(/\/$/, '')}/` : '');
cc.communities = merged.filter((r) => r.category === 'Communities' && r.g === 'group')
  .map((r) => ({ category: tabOf(r), name: r.n, url: r.w || handle(r.ig) }))
  .filter((c) => c.url)
  .sort((a, b) => TAB_CATEGORIES.indexOf(a.category) - TAB_CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name));
fs.writeFileSync(CC, JSON.stringify(cc, null, 2) + '\n');

/* ---------- report ---------- */
const by = {};
merged.forEach((r) => { const k = `${r.category} / ${r.g}`; by[k] = by[k] || { rows: 0, pinned: 0 }; by[k].rows++; if (r.lat != null) by[k].pinned++; });
console.log(`\n${merged.length} places → ${path.relative(ROOT, OUT)}`);
Object.entries(by).forEach(([k, v]) => console.log(`  ${k.padEnd(32)} ${String(v.rows).padStart(4)}  (${v.pinned} pinned)`));
console.log(`  ${stats.spiritual} spiritual/religious organisations left out, ${stats.osmSkipped} OSM clinics/hospitals left out, ${stats.outsideAd} skipped for an address outside the city, ${stats.dupes} duplicates merged, ${stats.noG} skipped for an unknown sub-category, ${stats.badCoords} coordinates outside the city re-looked up`);
console.log(`  ${stats.closed} closed places left out, ${stats.sharedPin} pins shared within a building, ${stats.farPins} source pins far from their area re-looked up, ${stats.geocoded} pinned by lookup, ${stats.geoMiss} left without a pin, ${stats.areaFilled} areas filled from OSM`);
console.log(`  ${cc.communities.length} communities in the Communities tab`);
