/* Rebuild src/data/entries.json from a places CSV.
 *
 *   node scripts/ingest-entries.mjs sources/entries/healthmap_v8_recategorised.csv
 *
 * The sheet is the source of truth for what is on the map, but it is a sheet:
 * a few columns disagree with the code, and one of them (out) has been
 * flattened to zero. Rather than hand-fixing the export every time, the four
 * reconciliations below are done here, and each is counted in the summary so a
 * surprising number is visible rather than silent.
 *
 *   c            taken from the sub-category, not the sheet. src/lib/categories.js
 *                is the authority: a run is an Activity whichever tab it was
 *                typed on, and the build refuses a row where the two disagree.
 *   out          derived from whether the pin falls inside the gazetted box,
 *                because the sheet exports every row as 0.
 *   rg           kept when it is one of the six zone keys (scripts/zones.mjs
 *                folds "SoBo", "Western Suburbs" and the like onto them);
 *                otherwise the row already in entries.json, and failing that
 *                the zone the pin falls in.
 *   map_eligible honoured: "no" drops the coordinates, so the entry stays in
 *                the list and off the map. That is how the sheet marks a place
 *                the parks layer already pins, or a route still being traced.
 *   g            the v8 sheet writes the Plum Perks branches it added with an
 *                act_ prefix (act_dental, act_pharmacy …). Each one is an
 *                existing sub-category under a new name, so G_ALIAS below folds
 *                them back rather than minting seven sub-categories that would
 *                each need an icon and a label.
 *
 * Route geometry is not touched. src/data/routes.json is traced by hand (see
 * scripts/snap-routes.mjs) and a straight line between a start and an end
 * would draw a road that does not exist.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUBCAT } from '../src/lib/categories.js';
import { ZONE_KEYS, RG_ALIAS, zoneAt } from './zones.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSV = path.resolve(ROOT, process.argv[2] || 'sources/entries/healthmap_v8_recategorised.csv');
const OUT = path.join(ROOT, 'src/data/entries.json');

const city = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/city.json'), 'utf8'));
const [S, W, N, E] = city.box;
const CORPS = ZONE_KEYS;
/* v8 branch rows under an act_ prefix, folded onto the sub-category each one
   already has. The s column on every row confirms the pairing, and dental has
   166 rows of precedent in the sheet itself. Pharmacy is the one with no
   equivalent: filed as clinic so the ten Apollo branches pin, which is the
   assumption to revisit if pharmacy earns its own glyph. */
/* Hospitals are parked out of Check your health: asked for directly, on the
   grounds that the category is about checking your health, not admission. The
   rule is every row in that category whose sub-category is Hospital or whose
   name says Hospital — 68 filed as Hospital, 8 eye hospitals filed under the
   hospital sub-category, and 15 named Hospital but filed as specialty clinics,
   which a sub-category sweep alone would have missed.

   Parked, not deleted, the way v8 parked Indulge: the rows stay in the data and
   in the A-Z index, and come off the map. Set this false to put all 91 back.
   Note that eight of them are Cloudnine, a Plum Perks partner (PLUM-007), so
   parking takes eight badged partner locations off the map with them. */
const PARK_HOSPITALS = true;

/* The v8 sheet's nine public categories, as the keys src/lib/intents.js uses.
   Five sub-categories split across two or three categories, so the category is
   no longer derivable from g — it is carried per row as `cat` and the build
   checks it. "Parked (Indulge)" is the sixty-six indulgent rows v8 set aside:
   kept in the list, off the map, one flag from coming back. */
const CATEGORY = {
  'Move': 'move',
  'Play': 'play',
  'Work out': 'workout',
  'Eat healthy': 'eat',
  'Check your health': 'care',
  'Mental health': 'clear',
  'Buy gear': 'gear',
  'Communities': 'people',
  'Parked (Indulge)': 'indulge',
};

const G_ALIAS = {
  act_hospital: 'hospital',
  act_physio: 'physio',
  act_therapy: 'therapy',
  act_healthfood: 'healthy',
  act_retail: 'retail',
  act_dental: 'clinic',
  act_pharmacy: 'clinic',
};

/* The rows already shipped, for the one field the sheet cannot always give. */
const previous = new Map(
  JSON.parse(fs.readFileSync(OUT, 'utf8')).map((r) => [r.id, r]),
);

/* A CSV reader that understands quoted fields and embedded newlines — the
   notes and description columns have both. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
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

const text = fs.readFileSync(CSV, 'utf8').replace(/^﻿/, '');
const [header, ...body] = parseCsv(text);
const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
const need = ['id', 'n', 'c', 'g', 'lat', 'lon'];
const missing = need.filter((k) => idx[k] == null);
if (missing.length) throw new Error(`${path.basename(CSV)} has no ${missing.join(', ')} column`);

const get = (row, key) => (idx[key] == null ? '' : String(row[idx[key]] ?? '').trim());
const num = (v) => { const n = Number(v); return v === '' || Number.isNaN(n) ? null : n; };

/* Rows whose kind the sheet has in the wrong drawer: cryotherapy is not a
   calm place to sit, it is the unconventional kind of reset. */
const S_FIX = {
  'BLR-458': 'Unconventional therapy', // VAURA Wellness (Cryotherapy)
};
/* Only the places cleared for the map are published (published.json, from
   the Google sweep's ready-to-publish files and the checked additions). The
   rest stay in the sheet, held off the map, the list and search until a
   cleaned list clears them. Communities without a pin and parked hospitals
   are not part of that sweep and are kept as before. */
const PUBLISHED = new Set(JSON.parse(fs.readFileSync(path.join(path.dirname(CSV), 'published.json'), 'utf8')).ids);
const stats = { rows: 0, fixedCategory: 0, categorised: 0, parkedHospitals: 0, outside: 0, fixedRg: 0, droppedRg: 0, unmapped: 0, noCoords: 0 };
const seen = new Set();
const entries = [];

for (const row of body) {
  if (!row.length || !get(row, 'id')) continue;
  const id = get(row, 'id');
  if (seen.has(id)) throw new Error(`duplicate id ${id} in ${path.basename(CSV)}`);
  seen.add(id);
  stats.rows++;

  const gRaw = get(row, 'g');
  /* v8 renamed the column to intent_v7 when it recategorised the sheet. */
  const intent = get(row, 'intent') || get(row, 'intent_v7');
  /* Session 38 added Athletics track / stadium loop under Move, but reused the
     Play "stadium" key. Remap so intent filtering stays exclusive. */
  const g = G_ALIAS[gRaw] || ((gRaw === 'stadium' && intent === 'Move') ? 'track' : gRaw);
  if (G_ALIAS[gRaw]) stats.aliasedG = (stats.aliasedG || 0) + 1;
  /* categories.js decides which category a sub-category belongs to. */
  const c = SUBCAT[g] || get(row, 'c');
  if (c !== get(row, 'c')) stats.fixedCategory++;
  if (g !== gRaw) stats.fixedTrack = (stats.fixedTrack || 0) + 1;

  /* The sheet's own category, where it has one. Settled before the coordinates
     because a parked row gives its coordinates up. */
  const catRaw = get(row, 'category');
  let cat = CATEGORY[catRaw];
  if (catRaw && !cat) throw new Error(`${id}: unknown category ${JSON.stringify(catRaw)}`);

  const parkHospital = PARK_HOSPITALS && cat === 'care'
    && (g === 'hospital' || /hospital/i.test(get(row, 'n')));
  if (parkHospital) { cat = 'hospital'; stats.parkedHospitals++; }

  let lat = num(get(row, 'lat'));
  let lon = num(get(row, 'lon'));
  if (parkHospital) { lat = null; lon = null; }
  const unpinnedCommunity = cat === 'people' && lat == null;
  if (!PUBLISHED.has(id) && !parkHospital && !unpinnedCommunity) { stats.held = (stats.held || 0) + 1; continue; }
  /* A retired duplicate (map_eligible=no and merged into another row) is not
     a place of its own: it leaves the list too, or it shows there with no pin
     while its original is pinned beside it. */
  if (get(row, 'map_eligible').toLowerCase() === 'no' && get(row, 'merged_from')) { stats.retired = (stats.retired || 0) + 1; continue; }
  if (get(row, 'map_eligible').toLowerCase() === 'no' && lat != null) {
    lat = null; lon = null;
    stats.unmapped++;
  }
  if (lat == null || lon == null) { lat = null; lon = null; stats.noCoords++; }

  /* A pin beyond the gazetted box is a day trip, not a typo, but only if it
     says so — the build rejects an unflagged one. */
  const out = lat != null && (lat < S || lat > N || lon < W || lon > E) ? 1 : 0;
  if (out) stats.outside++;

  let rg = get(row, 'rg');
  if (RG_ALIAS[rg]) { rg = RG_ALIAS[rg]; stats.fixedRg++; }
  if (rg && !CORPS.has(rg)) {
    const fromCorp = get(row, 'corporation');
    const was = CORPS.has(fromCorp) ? fromCorp : previous.get(id)?.rg;
    if (was && CORPS.has(was)) { rg = was; stats.fixedRg++; }
    else { rg = ''; stats.droppedRg++; }
  }
  /* Blank or unknown: the zone the pin is in. */
  if (!rg && !out) rg = zoneAt(lon, lat);

  const entry = {
    id,
    n: get(row, 'n'),
    c,
    g,
    s: S_FIX[id] || get(row, 's'),
    a: get(row, 'a'),
    raw: get(row, 'raw'),
    ad: get(row, 'ad'),
    lat,
    lon,
    rg,
    gm: get(row, 'gm'),
    w: get(row, 'w'),
    /* Instagram handles are not shipped. The sheet's column was wrong on most
       of the 477 listings that had one, and a handle that goes to the wrong
       account is worse than no handle: it is a link this map asserts is the
       place. Restore by putting this line back once the column is trustworthy;
       the card still renders a handle if one is ever present. */
    /* Except for communities: there the handle is the community, the
       column was checked for them, and for most it is the only way in. */
    ...(/communit/i.test(c) && get(row, 'ig') ? { ig: get(row, 'ig') } : {}),
    d: get(row, 'd'),
    p: get(row, 'p'),
    b: get(row, 'b'),
    t: get(row, 't') || get(row, 'hours'),
    tg: get(row, 'tg').split('|').map((s) => s.trim()).filter(Boolean),
    src: get(row, 'src'),
    v: get(row, 'v'),
    out,
  };

  if (cat) { entry.cat = cat; stats.categorised++; }
  /* A pin placed by looking its address up (merge-places, pin_missing) is only
     as good as the lookup: marked, so anything that trusts a pin's exact
     position can tell these apart. */
  if (lat != null && /pin from (Photon|Nominatim|lookup)|shared (pin|building)/i.test(get(row, 'notes'))) entry.pinApprox = 1;

  /* Route rows carry three extra fields the place card reads. */
  const mode = get(row, 'mode');
  const routeType = get(row, 'route_type');
  const parent = get(row, 'parent_id');
  if (mode) entry.route_mode = mode;
  if (routeType) entry.route_type = routeType;
  if (parent) entry.parent_id = parent;

  entries.push(entry);
}

fs.writeFileSync(OUT, `${JSON.stringify(entries, null, 2)}\n`);

const added = entries.filter((e) => !previous.has(e.id)).length;
const removed = [...previous.keys()].filter((id) => !seen.has(id)).length;
console.log(`entries.json <- ${path.basename(CSV)}`);
console.log(`  ${stats.rows} rows  (+${added} new, -${removed} gone, ${previous.size} before)`);
console.log(`  ${stats.rows - stats.noCoords} pinned, ${stats.noCoords} without coordinates`);
console.log(`  ${stats.held || 0} rows held back, not in published.json`);
console.log(`  ${stats.unmapped} pinned rows set aside by map_eligible=no`);
console.log(`  ${stats.outside} outside the city box, flagged out=1`);
console.log(`  ${stats.fixedCategory} categories corrected from the sub-category`);
console.log(`  ${stats.fixedTrack || 0} Move/stadium rows remapped to track`);
console.log(`  ${stats.aliasedG || 0} act_* sub-categories folded onto existing ones`);
console.log(`  ${stats.categorised} rows carry one of the nine categories from the sheet`);
console.log(`  ${stats.parkedHospitals} hospitals parked out of Check your health and off the map`);
console.log(`  ${stats.fixedRg} corporations recovered from the previous data, ${stats.droppedRg} dropped`);
