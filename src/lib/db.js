/* One database object assembled from the files in src/data/.
 *
 * entries.json is the file you edit to add a listing. Everything the page
 * needs beyond the raw rows — the area dropdown, the per-corporation counts,
 * the header and footer tallies — is worked out here at build time, so a new
 * entry in a new neighbourhood shows up in the filters without a second edit.
 */

import rows from '../data/entries.json';
import corporations from '../data/corporations.json';
import city from '../data/city.json';

import ZONES from '../data/zones.json';
import MASK from '../data/mask.json';
import ROUTES from '../data/routes.json';
import ICONS from '../data/icons.json';
import LABELS from '../data/labels.json';

/* Two reference layers that are not entries: the Mumbai Metro alignment and
   every park BBMP has a record of. See scripts/kml-to-geojson.mjs. */
import METRO from '../data/metro.json';
import PARKS_RAW from '../data/parks.json';
/* Safe: intents.js reads only intent-pins.json, so this does not close a loop. */
import { intentMeta } from './intents.js';
import PARK_AMENITIES from '../data/park-amenities.json';
import { cleanParkName } from './park-name.js';
import { subcategoryOf } from './subcategories.js';

/* BBMP’s register stacks many park records on one spot (exact or near).
   Collapse to one pin per place before the map draws them. */
function parkScore(f) {
  const n = (f.properties?.n || '').trim();
  let s = 0;
  if (n) s += 10;
  if (!/^maintenance of|^maintenanace of/i.test(n)) s += 40;
  if (!/ward no|ward-/i.test(n)) s += 10;
  if (/\bpark\b/i.test(n)) s += 8;
  if (n && n !== n.toUpperCase()) s += 6;
  if (n.length > 0 && n.length < 60) s += 5;
  if (n.length > 90) s -= 8;
  const a = f.properties?.a;
  if (Array.isArray(a)) s += Math.min(a.length, 6);
  if (f.properties?.t) s += 3;
  if (f.properties?.w) s += 2;
  return s;
}

function parkDistM(a, b) {
  const R = 6371000;
  const toR = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toR;
  const dLon = (b[0] - a[0]) * toR;
  const la1 = a[1] * toR;
  const la2 = b[1] * toR;
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function parkNameKey(n) {
  return String(n || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function mergeParkGroup(group) {
  group.sort((a, b) => parkScore(b) - parkScore(a)
    || (a.properties?.n || '').localeCompare(b.properties?.n || ''));
  const best = {
    type: 'Feature',
    properties: { ...(group[0].properties || {}) },
    geometry: group[0].geometry,
  };
  const am = new Set(Array.isArray(best.properties.a) ? best.properties.a : []);
  for (const g of group) {
    (g.properties?.a || []).forEach((x) => am.add(x));
    if (!best.properties.t && g.properties?.t) best.properties.t = g.properties.t;
    if (!best.properties.w && g.properties?.w) best.properties.w = g.properties.w;
  }
  best.properties.a = [...am].sort();
  return best;
}

function dedupeParks(fc) {
  const points = (fc.features || []).filter((f) => f?.geometry?.type === 'Point');

  /* Exact + ~11 m grid (4 d.p.). */
  const grid = new Map();
  for (const f of points) {
    const [lon, lat] = f.geometry.coordinates;
    const k = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(f);
  }
  let list = [...grid.values()].map(mergeParkGroup);

  /* Near-duplicates within 50 m. */
  const used = new Array(list.length).fill(false);
  const near = [];
  for (let i = 0; i < list.length; i++) {
    if (used[i]) continue;
    const group = [list[i]];
    used[i] = true;
    const ci = list[i].geometry.coordinates;
    for (let j = i + 1; j < list.length; j++) {
      if (used[j]) continue;
      if (parkDistM(ci, list[j].geometry.coordinates) <= 50) {
        used[j] = true;
        group.push(list[j]);
      }
    }
    near.push(mergeParkGroup(group));
  }
  list = near;

  /* Same cleaned name within 300 m (duplicate work-order rows). */
  const usedName = new Array(list.length).fill(false);
  const named = [];
  for (let i = 0; i < list.length; i++) {
    if (usedName[i]) continue;
    const group = [list[i]];
    usedName[i] = true;
    const key = parkNameKey(list[i].properties?.n);
    if (key.length >= 6) {
      for (let j = i + 1; j < list.length; j++) {
        if (usedName[j]) continue;
        if (parkNameKey(list[j].properties?.n) !== key) continue;
        if (parkDistM(list[i].geometry.coordinates, list[j].geometry.coordinates) <= 300) {
          usedName[j] = true;
          group.push(list[j]);
        }
      }
    }
    named.push(mergeParkGroup(group));
  }

  return { type: 'FeatureCollection', features: named.map((f) => ({
    ...f,
    properties: {
      ...f.properties,
      n: cleanParkName(f.properties?.n || ''),
    },
  })) };
}

const PARKS = dedupeParks(PARKS_RAW);

/* A listing only has to carry the fields that say what it is and where it is.
   Everything optional is filled in here, so a short new row in entries.json
   renders the same as a row that came out of the original spreadsheet. */
const TEXT = ['n', 'c', 'g', 's', 'a', 'raw', 'ad', 'gm', 'w', 'ig', 'd', 'p', 'b', 't', 'src', 'v'];
/* Delivery-only kitchens (no dine-in, so no pin) are not on the map at all:
   not in the list, the search, the counts or a planned day. A delivery brand
   that is a Plum Perks partner is listed in Online perks instead, from
   perks.json, so only a row also tagged plum-perks is kept here. */
const onTheMap = (row) => !(row.tg || []).includes('delivery-only') || (row.tg || []).includes('plum-perks');
const entries = rows.filter(onTheMap).map((row) => {
  const r = { ...row };
  TEXT.forEach((f) => { if (r[f] == null) r[f] = ''; });
  if (!Array.isArray(r.tg)) r.tg = [];
  if (r.lat == null || r.lon == null) { r.lat = null; r.lon = null; }
  r.out = r.out ? 1 : 0;
  if (!r.raw) r.raw = r.a;
  return r;
});

/* Corporation counts follow the data rather than being written down twice. */
const tally = {};
entries.forEach((r) => { if (r.rg) tally[r.rg] = (tally[r.rg] || 0) + 1; });
const corps = corporations.map((c) => ({ ...c, n: tally[c.k] || 0 }));

/* Areas nest under the corporation they sit in, so the two filters read as one
   hierarchy rather than two lists that can contradict each other. Anything with
   no corporation — an online community, a day trip past the boundary — lands in
   a sixth group at the bottom. */
const byRg = {};
entries.forEach((r) => {
  if (!r.a) return;
  const k = r.rg || '';
  (byRg[k] = byRg[k] || new Set()).add(r.a);
});
const areas = [];
corps.forEach((c) => {
  if (byRg[c.k]) areas.push({ rg: c.k, label: c.label, items: [...byRg[c.k]].sort() });
});
if (byRg['']) {
  areas.push({ rg: '', label: 'Outside the six zones', items: [...byRg['']].sort() });
}

/* Flat area list ordered by mapped-pin density (for the prompt dropdown). */
const areaPinCounts = {};
entries.forEach((r) => {
  if (r.lat == null || r.lon == null || !r.a) return;
  areaPinCounts[r.a] = (areaPinCounts[r.a] || 0) + 1;
});
const seen = new Set();
const areasByPins = [];
areas.forEach((g) => g.items.forEach((a) => {
  if (seen.has(a)) return;
  seen.add(a);
  areasByPins.push(a);
}));
areasByPins.sort((a, b) => (areaPinCounts[b] || 0) - (areaPinCounts[a] || 0) || a.localeCompare(b));

/* city parks join the listings as Move places (sub-category "park"), so they
   filter, count, cluster, search and list like everything else. A park takes
   its ward's corporation, and the ward's area when the ward shares a name with
   the listings. */
function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const WARDS = ZONES.features.map((f) => {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  polys.forEach((p) => p[0].forEach(([x, y]) => { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }));
  return { props: f.properties, polys, w, s, e, n };
});
const wardAt = (lon, lat) => WARDS.find((z) => lon >= z.w && lon <= z.e && lat >= z.s && lat <= z.n
  && z.polys.some((p) => inRing([lon, lat], p[0])))?.props;

export const parkId = (lat, lon) => `PARK-${lat.toFixed(5)}_${lon.toFixed(5)}`;
const knownAreas = new Set(entries.map((r) => r.a).filter(Boolean));
const parkEntries = PARKS.features.map((f) => {
  const p = f.properties || {};
  const [lon, lat] = f.geometry.coordinates;
  const ward = wardAt(lon, lat);
  const has = (p.a || []).map((k) => PARK_AMENITIES[k]).filter(Boolean);
  const wardName = p.w ? (/^\d+$/.test(String(p.w)) ? `Ward ${p.w}` : String(p.w)) : (ward?.ward || '');
  return {
    id: parkId(lat, lon), n: p.n || 'Unnamed park', c: 'Activities', g: 'park', s: '',
    a: ward?.area && knownAreas.has(ward.area) ? ward.area : '',
    raw: wardName || 'city park', ad: '', lat, lon, rg: ward?.rg || '',
    gm: '', w: '', ig: '', p: 'Free', b: '', t: p.t || '', tg: ['park'], src: 'city parks register', v: '', out: 0,
    d: has.length ? `A city park with ${has.join(', ').toLowerCase()}.` : 'A city park.',
    park: { sqm: p.sqm || 0 },
  };
});

/* Each row's group within its activity (src/lib/subcategories.js). */
const allEntries = [...entries, ...parkEntries];
allEntries.forEach((r) => { const k = intentMeta(r)?.k; if (k) r.sc = subcategoryOf(r, k); });
/* A place with more than one thing to do answers each of them (scs, besides
   its own sub-category): a lake park is a lake walk and a park, a lake with
   boats is somewhere to row, a sports centre with courts and a turf is both.
   Read from its name and tags only, which say what is there; a description
   also mentions what is nearby. */
const MORE_TO_DO = {
  move: {
    walks: /\b(lake|kere)\b/i,
    parks: /\b(park|udyan\w*)\b/i,
    water: /\b(boating|boat ride|rowing|kayak\w*|paddl\w*|swimming|swim)\b/i,
    routes: /\b(jogging track|running track|cycling track|cycle track|athletics track)\b/i,
  },
  play: {
    courts: /\b(badminton|tennis|pickleball|squash|table tennis|basketball court|volleyball)\b/i,
    turfs: /\b(turf|football ground|cricket ground|box cricket)\b/i,
    other: /\b(swimming pool|swimming|skating|archery|shooting)\b/i,
  },
};
allEntries.forEach((r) => {
  const k = intentMeta(r)?.k, rules = MORE_TO_DO[k];
  if (!rules || !r.n) return;
  const said = `${r.n} ${(r.tg || []).join(' ')}`.replace(/-/g, ' ');
  /* "Gardens" counts as a park only beside a lake (Lumbini Gardens on
     Nagavara Lake); on its own it is too loose. */
  const also = Object.keys(rules).filter((sub) => sub !== r.sc && (rules[sub].test(said)
    || (sub === 'parks' && /\b(lake|kere)\b/i.test(r.n) && /\bgardens?\b/i.test(r.n))));
  if (also.length) r.scs = [r.sc, ...also];
});

export const DB = {
  entries: allEntries,
  areas, areasByPins, areaPinCounts, corps, box: city.box, gba_km2: city.gba_km2,
};

/* The rows exactly as they sit in entries.json, before the defaults above are
   filled in. The build-time check reads these so it sees what you typed. */
export const RAW_ENTRIES = rows;
export { ZONES, MASK, ROUTES, ICONS, LABELS, METRO, PARKS, PARK_AMENITIES };

/* Facts the page states in its header, footer and meta description. Counted
   once here so the copy can never drift from the data. */
export const COUNTS = {
  total: entries.length,
  mapped: entries.filter((r) => r.lat != null).length,
  verified: entries.filter((r) => r.v === 'Verified').length,
  outside: entries.filter((r) => r.out).length,
  parks: parkEntries.length,
};
COUNTS.unpinned = COUNTS.total - COUNTS.mapped - COUNTS.outside;
/* total and mapped count the compiled sheet, which is what the About panel is
   describing. The two below are what a reader would count for themselves, and
   are what the page titles and meta descriptions claim:

     onMap   pins on the map browsing all of Mumbai, counted the way the map
             counts them: coordinates, inside the city, and in a category the
             map draws. Anything looser disagrees with the number the list
             header shows — it was 14 out, counting six Communities pins the map
             never draws and eight day trips that appear only once their own
             area is picked.
     listed  everything the A-Z index and /list show, parks included. That
             includes the rows held off the map on purpose (the parked
             hospitals and Indulge), which are still there to be read.

   Before these existed the homepage claimed every sheet row as a place on the
   map, counting 157 parked rows it does not show, while /list said "all 2400"
   on a page rendering 2791. */
COUNTS.onMap = DB.entries.filter(
  (r) => r.lat != null && !r.out && intentMeta(r)?.map,
).length;
COUNTS.listed = DB.entries.length;
