/* Sweeps OpenStreetMap for the kinds of place it maps well, and writes them as
 * rows in the places-sheet format, for review before they join the sheet.
 *
 *   node scripts/osm-places.mjs [out.csv]
 *
 * Default output: sources/entries/osm-places.csv. Every row is
 * v="Needs check" and src="OpenStreetMap", with the OSM object in src_url, so
 * an editor can tell them from hand-researched rows and fix a wrong one at
 * the source.
 *
 * Takes only named, non-private objects inside the BMC area (mask.json).
 * Each row's neighbourhood (`a`) is the nearest OSM suburb / neighbourhood
 * within 2 km, unless the object carries its own addr:suburb.
 *
 * What maps to what (g, s) is in KINDS below; the first rule that matches an
 * object wins. Clinics, dentists and hospitals are included; individual
 * doctors' practices (amenity=doctors) are not, since a name and a pin say too
 * little about them to be useful.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const UA = 'mumbai-wellness-map/1.0 (places build script)';
const CITY_RELS = [7964376, 7964375]; // Mumbai City District, Mumbai Suburban District
const OUT = process.argv[2] || fileURLToPath(new URL('../sources/entries/osm-places.csv', import.meta.url));

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function overpass(q) {
  const errors = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const url of OVERPASS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: 'data=' + encodeURIComponent(q),
          signal: AbortSignal.timeout(240000), // a hung mirror must not stall the run
        });
        if (res.ok) {
          const body = await res.json();
          /* An overloaded instance can answer 200 with a "runtime error" remark
             and no elements; that is a failure, not an empty city. */
          if (body.remark && /error|timed out|out of memory/i.test(body.remark)) throw new Error(body.remark.slice(0, 80));
          const els = body.elements;
          console.log(`  (${new URL(url).host} answered: ${els.length} elements)`);
          return els;
        }
        errors.push(`${new URL(url).host} ${res.status}`);
      } catch (e) {
        errors.push(`${new URL(url).host} ${e.message}`);
      }
    }
    await sleep(15000 * (attempt + 1));
  }
  throw new Error(`No Overpass instance answered: ${errors.join(', ')}`);
}

/* ---------- what maps to what ---------- */
const sport = (t) => String(t.sport || '').toLowerCase().split(/[;,]\s*/);
const has = (t, s) => sport(t).includes(s);
const KINDS = [
  /* Move */
  { category: 'Move', g: 'swim', s: 'Swimming pool', test: (t) => t.leisure === 'swimming_pool' || (t.leisure === 'sports_centre' && has(t, 'swimming')) },
  { category: 'Move', g: 'track', s: 'Athletics track / stadium loop', test: (t) => t.leisure === 'track' && has(t, 'athletics') },
  /* Play */
  { category: 'Play', g: 'padel', s: 'Padel / pickleball court', test: (t) => has(t, 'padel') || has(t, 'pickleball') },
  { category: 'Play', g: 'badminton', s: 'Badminton court', test: (t) => has(t, 'badminton') },
  { category: 'Play', g: 'tennis', s: 'Tennis court', test: (t) => has(t, 'tennis') && t.leisure !== 'pitch' },
  { category: 'Play', g: 'turf', s: 'Football turf', test: (t) => (has(t, 'soccer') || has(t, 'football')) && (/turf/i.test(t.name) || t.surface === 'artificial_turf') },
  { category: 'Play', g: 'cricket', s: 'Cricket nets / ground', test: (t) => has(t, 'cricket') && /net|box|turf|academy/i.test(t.name) },
  { category: 'Play', g: 'climb', s: 'Climbing wall / bouldering', test: (t) => has(t, 'climbing') || has(t, 'bouldering') },
  { category: 'Play', g: 'golf', s: 'Golf', test: (t) => t.leisure === 'golf_course' || (t.golf === 'driving_range') },
  { category: 'Play', g: 'play', s: 'Karting, bowling & play', test: (t) => t.leisure === 'bowling_alley' || has(t, 'karting') || t.leisure === 'trampoline_park' || has(t, 'laser_tag') || has(t, 'skateboard') },
  { category: 'Play', g: 'stadium', s: 'Stadium', test: (t) => t.leisure === 'stadium' },
  { category: 'Play', g: 'specialty', s: 'Specialty sport venue', test: (t) => ['squash', 'table_tennis', 'archery', 'shooting', 'roller_skating', 'ice_skating', 'billiards', 'boxing'].some((x) => has(t, x)) && t.leisure !== 'fitness_centre' },
  { category: 'Play', g: 'multisport', s: 'Multi-sport centre', test: (t) => t.leisure === 'sports_centre' },
  /* Work out */
  { category: 'Work out', g: 'yoga', s: 'Yoga studio', test: (t) => has(t, 'yoga') || /\byoga\b/i.test(t.name) },
  { category: 'Work out', g: 'gym', s: 'Gym / Fitness center', test: (t) => t.leisure === 'fitness_centre' || t.amenity === 'gym' },
  /* Eat healthy */
  { category: 'Eat healthy', g: 'healthy', s: 'Health food store', test: (t) => t.shop === 'health_food' || t.shop === 'organic' || (t.organic === 'only' && t.shop) },
  { category: 'Eat healthy', g: 'healthy', s: 'Healthy restaurant', test: (t) => /^(restaurant|cafe)$/.test(t.amenity || '') && (t['diet:vegan'] === 'only' || /\b(salad|smoothie|vegan|organic|millet)\b/i.test(t.name)) },
  { category: 'Eat healthy', g: 'nutrition', s: 'Dietitian / nutritionist', test: (t) => t.healthcare === 'dietitian' || t['healthcare:speciality'] === 'dietetics' },
  /* Mental health */
  { category: 'Mental health', g: 'therapy', s: 'Therapy clinic', test: (t) => t.healthcare === 'psychotherapist' || t.healthcare === 'counselling' || /psychiatr/.test(t['healthcare:speciality'] || '') },
  /* Check your health */
  { category: 'Check your health', g: 'lab', s: 'Diagnostic lab', test: (t) => t.healthcare === 'laboratory' || t.healthcare === 'blood_donation' || /\b(diagnostic|patholog|lab(s|oratory)?)\b/i.test(t.name) && /^(clinic|doctors)$/.test(t.amenity || '') },
  { category: 'Check your health', g: 'physio', s: 'Physiotherapy & rehab', test: (t) => t.healthcare === 'physiotherapist' || /physio/i.test(t.name) },
  { category: 'Check your health', g: 'hospital', s: 'Hospital', test: (t) => t.amenity === 'hospital' },
  { category: 'Check your health', g: 'clinic', s: 'Dental clinic', test: (t) => t.amenity === 'dentist' || t.healthcare === 'dentist' },
  { category: 'Check your health', g: 'clinic', s: 'Specialty clinic', test: (t) => t.amenity === 'clinic' || t.healthcare === 'clinic' },
  /* Buy gear */
  { category: 'Buy gear', g: 'bike', s: 'Bike shop', test: (t) => t.shop === 'bicycle' },
  { category: 'Buy gear', g: 'retail', s: 'Sports & fitness retail', test: (t) => t.shop === 'sports' || t.shop === 'outdoor' },
];

/* ---------- fetch ---------- */
const area = `rel(id:${CITY_RELS.join(',')});map_to_area->.city;`;
console.log('Fetching places from Overpass…');
const els = await overpass(`[out:json][timeout:240];${area}
(
 nwr["leisure"~"^(fitness_centre|sports_centre|swimming_pool|bowling_alley|golf_course|stadium|trampoline_park|track)$"]["name"](area.city);
 nwr["leisure"="pitch"]["name"]["sport"~"badminton|padel|pickleball|soccer|football|cricket|tennis|climbing"](area.city);
 nwr["amenity"~"^(gym|clinic|dentist|hospital)$"]["name"](area.city);
 nwr["healthcare"~"^(laboratory|physiotherapist|psychotherapist|counselling|dietitian|clinic|dentist)$"]["name"](area.city);
 nwr["shop"~"^(health_food|organic|bicycle|sports|outdoor)$"]["name"](area.city);
 nwr["amenity"~"^(restaurant|cafe)$"]["name"]["diet:vegan"="only"](area.city);
 nwr["amenity"~"^(restaurant|cafe)$"]["name"~"salad|smoothie|vegan|organic|millet",i](area.city);
);
out center tags;`);
console.log('Fetching neighbourhood names…');
const placeEls = await overpass(`[out:json][timeout:120];${area}
node["place"~"^(suburb|neighbourhood|quarter)$"]["name"](area.city);out body;`); // body: tags alone carry no position

/* ---------- helpers ---------- */
function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const mask = JSON.parse(readFileSync(new URL('../src/data/mask.json', import.meta.url), 'utf8'));
const cityRings = mask.features[0].geometry.coordinates.slice(1);
const inCity = (pt) => cityRings.some((r) => inRing(pt, r));
const metres = (a, b) => Math.hypot((a[0] - b[0]) * 104900, (a[1] - b[1]) * 110600);

const places = placeEls.map((p) => ({ name: p.tags['name:en'] || p.tags.name, kind: p.tags.place, pt: [p.lon, p.lat] }));
/* Kept for scripts/merge-places.mjs, which names the area of researched rows the same way. */
mkdirSync(new URL('../.cache/', import.meta.url), { recursive: true });
writeFileSync(new URL('../.cache/osm-neighbourhoods.json', import.meta.url), JSON.stringify(places));
function areaNear(pt) {
  let best = null, d = Infinity;
  for (const p of places) {
    const m = metres(pt, p.pt) * (p.kind === 'suburb' ? 0.8 : 1); // a suburb is the name people use
    if (m < d) { d = m; best = p; }
  }
  return best && d < 2000 ? best.name : '';
}
const address = (t) => [
  [t['addr:housenumber'], t['addr:housename']].filter(Boolean).join(', '),
  t['addr:street'], t['addr:suburb'] || t['addr:neighbourhood'], t['addr:city'] || 'Mumbai', t['addr:postcode'],
].filter(Boolean).join(', ');
const PRIVATE = /^(private|no|customers|members|permit)$/;
const NOT_PUBLIC = /\b(society|chs|co-?op\w*|housing|residency|apartments?|towers?|school|vidyalaya|college|hostel)\b/i;
const hours = (t) => t.opening_hours || '';
const web = (t) => t.website || t['contact:website'] || t.url || '';
const insta = (t) => {
  const v = t['contact:instagram'] || t.instagram || '';
  const m = v.match(/instagram\.com\/([^/?#]+)/i);
  return m ? `@${m[1]}` : v && !/^https?:/.test(v) ? `@${v.replace(/^@/, '')}` : '';
};

/* ---------- build ---------- */
const stats = { private: 0, outside: 0, unmatched: 0, dupes: 0 };
const rows = [];
for (const e of els) {
  const t = { ...e.tags, name: (e.tags['name:en'] || e.tags.name || '').replace(/\s+/g, ' ').trim() };
  if (!t.name) continue;
  if (PRIVATE.test(t.access || '') || NOT_PUBLIC.test(t.name)) { stats.private++; continue; }
  const pt = e.type === 'node' ? [e.lon, e.lat] : e.center ? [e.center.lon, e.center.lat] : null;
  if (!pt || !inCity(pt)) { stats.outside++; continue; }
  const kind = KINDS.find((k) => k.test(t));
  if (!kind) { stats.unmatched++; continue; }
  rows.push({
    category: kind.category, g: kind.g, s: kind.s, n: t.name,
    a: t['addr:suburb'] || areaNear(pt), ad: address(t),
    lat: +pt[1].toFixed(6), lon: +pt[0].toFixed(6), gm: '', w: web(t), ig: insta(t),
    d: '', p: '', b: '', t: hours(t), tg: '', v: 'Needs check', out: 0,
    perk_partner: '', perk_id: '',
    src_url: `https://www.openstreetmap.org/${e.type}/${e.id}`, notes: 'OpenStreetMap sweep',
  });
}
/* One row per name per spot: OSM often has a venue as both a building and a
   point inside it. */
const kept = [];
for (const r of rows) {
  if (kept.some((k) => k.n.toLowerCase() === r.n.toLowerCase() && metres([k.lon, k.lat], [r.lon, r.lat]) < 150)) { stats.dupes++; continue; }
  kept.push(r);
}

/* A run that found almost nothing is a bad answer from a busy server. */
if (kept.length < 500) throw new Error(`only ${kept.length} rows — refusing to overwrite ${OUT}`);
const COLS = ['category', 'g', 's', 'n', 'a', 'ad', 'lat', 'lon', 'gm', 'w', 'ig', 'd', 'p', 'b', 't', 'tg', 'v', 'out', 'perk_partner', 'perk_id', 'src_url', 'notes'];
const q = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
writeFileSync(OUT, [COLS.join(','), ...kept.map((r) => COLS.map((c) => q(r[c])).join(','))].join('\n') + '\n');

const by = {};
kept.forEach((r) => { by[r.g] = (by[r.g] || 0) + 1; });
console.log(`\n${kept.length} rows → ${OUT}`);
console.log('  by sub-category:', JSON.stringify(by));
console.log(`  left out: ${stats.private} private, ${stats.outside} outside the city, ${stats.unmatched} no matching kind, ${stats.dupes} duplicates`);
