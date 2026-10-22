/* Rebuilds the map's boundary layers from OpenStreetMap.
 *
 *   node scripts/osm-boundaries.mjs
 *
 * OSM has no single relation for the Brihanmumbai Municipal Corporation: its
 * area is Mumbai City District (7964376) plus Mumbai Suburban District
 * (7964375), so the city outline is those two joined along their shared
 * border. BMC's six zones are 7888964–7888969 (admin_level=9) and its 24
 * administrative wards (A Ward … T Ward) sit under them at admin_level=10.
 * The map calls the zones "corporations" — the word the code inherited from
 * Bengaluru. Overpass lists the wards; Nominatim returns every relation as
 * an assembled, lightly simplified polygon. Writes:
 *
 *   src/data/zones.json               one polygon per ward, tagged with its zone
 *   src/data/corporation-areas.json   the six zones, for the basemap's ground colours
 *   src/data/mask.json                the city cut out of a wide rectangle (the halftone)
 *   src/data/city.json          bounding box and area
 *   src/data/corporations.json  km² per corporation (hues are left alone)
 *
 * It also reports entries whose `rg` disagrees with the corporation their pin
 * actually falls in. It does not rewrite entries.json.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { union } from 'polyclip-ts';

const DATA = new URL('../src/data/', import.meta.url);
const UA = 'mumbai-wellness-map/1.0 (boundary build script)';
const CITY_RELS = [7964376, 7964375]; // Mumbai City District, Mumbai Suburban District
const CORP_REL = { South: 7888969, Central: 7888968, West: 7888967, NorthWest: 7888966, East: 7888965, NorthEast: 7888964 };

const read = (f) => JSON.parse(readFileSync(new URL(f, DATA), 'utf8'));
const write = (f, j, pretty = false) => {
  const s = JSON.stringify(j, null, pretty ? 2 : 0);
  writeFileSync(new URL(f, DATA), s + '\n');
  console.log(`wrote ${f} (${(s.length / 1024).toFixed(0)} KB)`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Public Overpass instances answer 429/504 when busy, so try each in turn. */
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

async function overpass(q) {
  const errors = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const url of OVERPASS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(q),
          signal: AbortSignal.timeout(240000), // a hung mirror must not stall the run
        });
        if (res.ok) return (await res.json()).elements;
        errors.push(`${new URL(url).host} ${res.status}`);
      } catch (e) {
        errors.push(`${new URL(url).host} ${e.message}`);
      }
    }
    await sleep(5000);
  }
  throw new Error(`No Overpass instance answered: ${errors.join(', ')}`);
}

async function lookup(ids, threshold) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const url = 'https://nominatim.openstreetmap.org/lookup?format=geojson&polygon_geojson=1'
      + `&polygon_threshold=${threshold}&osm_ids=` + ids.slice(i, i + 50).map((id) => 'R' + id).join(',');
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`Nominatim answered ${res.status}`);
    (await res.json()).features.forEach((f) => out.set(f.properties.osm_id, f));
    await sleep(1100); // Nominatim's usage policy: at most one request a second
  }
  return out;
}

/* ---------- geometry ---------- */
const round = (ring) => ring.map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]);
const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
const roundGeom = (g) => {
  const polys = polysOf(g).map((p) => p.map(round));
  return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
};

function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inPolys = (pt, polys) => polys.some((p) => inRing(pt, p[0]) && !p.slice(1).some((h) => inRing(pt, h)));

/* Joins a relation's member ways end to end into closed rings. */
function closeRings(ways) {
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  const segs = ways.map((w) => w.geometry.map((p) => [p.lon, p.lat]));
  const out = [];
  while (segs.length) {
    let ring = segs.shift();
    while (!same(ring[0], ring[ring.length - 1])) {
      const end = ring[ring.length - 1];
      const i = segs.findIndex((s) => same(s[0], end) || same(s[s.length - 1], end));
      if (i < 0) return null;
      const s = segs.splice(i, 1)[0];
      ring = ring.concat((same(s[0], end) ? s : [...s].reverse()).slice(1));
    }
    out.push(ring);
  }
  return out;
}

function assembleRelation(rel) {
  const ways = rel.members.filter((m) => m.type === 'way' && m.geometry);
  const outers = closeRings(ways.filter((m) => m.role !== 'inner'));
  const inners = closeRings(ways.filter((m) => m.role === 'inner')) || [];
  if (!outers?.length) return null;
  const polys = outers.map((o) => [o, ...inners.filter((h) => inRing(h[0], o))]);
  return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
}

const R = 6371008.8, RAD = Math.PI / 180;
function ringKm2(ring) {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
    s += (x2 - x1) * RAD * (2 + Math.sin(y1 * RAD) + Math.sin(y2 * RAD));
  }
  return Math.abs((s * R * R) / 2) / 1e6;
}
const km2 = (polys) => polys.reduce((a, p) => a + ringKm2(p[0]) - p.slice(1).reduce((b, h) => b + ringKm2(h), 0), 0);

/* ---------- fetch ---------- */
console.log('Listing wards from Overpass…');
/* BMC's 24 wards as OSM had them in October 2026. Overpass is asked first, so
   a ward added or split since turns up; when every public Overpass is busy
   (it often is) the run carries on with this list. */
const KNOWN_WARDS = {
  'A Ward': 7885399, 'B Ward': 7885397, 'C Ward': 7885398, 'D Ward': 7885394, 'E Ward': 7885393,
  'F/N Ward': 7885396, 'F/S Ward': 7885395, 'G/N Ward': 7885381, 'G/S Ward': 7885391,
  'H/E Ward': 7885378, 'H/W Ward': 7885382, 'K/E Ward': 7885379, 'K/W Ward': 7885383,
  'L Ward': 7885380, 'M/E Ward': 7885392, 'M/W Ward': 7885389, 'N Ward': 7885388,
  'P/N Ward': 7885384, 'P/S Ward': 7885377, 'R/C Ward': 7885385, 'R/N Ward': 7885390,
  'R/S Ward': 7885376, 'S Ward': 7885387, 'T Ward': 7885386,
};
let wardRels;
try {
  wardRels = await overpass(
    `[out:json][timeout:90];rel(id:${CITY_RELS.join(',')});map_to_area->.city;`
    + 'rel(area.city)["boundary"="administrative"]["admin_level"="10"];out tags;',
  );
} catch (e) {
  console.log(`  ${e.message}; using the ${Object.keys(KNOWN_WARDS).length} known wards`);
  wardRels = Object.entries(KNOWN_WARDS).map(([name, id]) => ({ id, tags: { name } }));
}
console.log(`  ${wardRels.length} admin_level=10 relations touch the city`);

console.log('Fetching zone polygons from Nominatim…');
const top = await lookup(Object.values(CORP_REL), 0.00002);
console.log('Fetching ward polygons from Nominatim…');
const wardGeo = await lookup(wardRels.map((w) => w.id), 0.00003);

/* Nominatim's index trails OSM, so a recently mapped ward can be absent from
   it. Those are assembled from their member ways via Overpass instead. */
const late = wardRels.filter((w) => !wardGeo.has(w.id)).map((w) => w.id);
if (late.length) {
  console.log(`Assembling ${late.length} ward(s) Nominatim does not have yet from Overpass…`);
  const rels = await overpass(`[out:json][timeout:90];rel(id:${late.join(',')});out geom;`);
  rels.forEach((rel) => {
    const geometry = assembleRelation(rel);
    if (geometry) wardGeo.set(rel.id, { geometry });
    else console.log(`  could not close the rings of relation ${rel.id}`);
  });
}

/* The two districts, joined into one outline along the border they share. */
console.log('Joining the two districts into the city outline…');
const dist = await lookup(CITY_RELS, 0.00002);
const parts = CITY_RELS.map((id) => {
  const f = dist.get(id);
  if (!f) throw new Error(`Nominatim did not return district relation ${id}`);
  return polysOf(f.geometry);
});
/* Specks under 0.05 km² (rocks off the coast) are left out. */
const cityGeom = {
  type: 'MultiPolygon',
  coordinates: union(...parts).filter((p) => ringKm2(p[0]) > 0.05).map((p) => [p[0]]),
};
if (!cityGeom.coordinates.length) throw new Error('Could not join the two districts into one outline');
const cityPolys = polysOf(cityGeom);
console.log(`  city outline: ${cityPolys.length} ring(s), ${cityPolys.reduce((a, p) => a + p[0].length, 0)} points`);
const corpPolys = {};
for (const [rg, id] of Object.entries(CORP_REL)) {
  const f = top.get(id);
  if (!f) throw new Error(`Nominatim did not return the ${rg} corporation (relation ${id})`);
  corpPolys[rg] = polysOf(f.geometry);
}

/* A ward belongs to the corporation holding most of its vertices. Wards that
   only touch the city from outside hold none and are dropped. */
function corpFor(polys) {
  const votes = {};
  polys.forEach((p) => p[0].forEach((pt) => {
    for (const rg in corpPolys) if (inPolys(pt, corpPolys[rg])) votes[rg] = (votes[rg] || 0) + 1;
  }));
  const total = polys.reduce((a, p) => a + p[0].length, 0);
  const best = Object.keys(votes).sort((a, b) => votes[b] - votes[a])[0];
  return best && votes[best] / total > 0.3 ? best : null;
}

/* BMC's ward letters mean little to most people, so each carries the
   neighbourhoods it is known by. */
const WARD_AREAS = {
  'A': 'Colaba, Fort', 'B': 'Dongri, Masjid Bunder', 'C': 'Kalbadevi, Marine Lines', 'D': 'Malabar Hill, Grant Road',
  'E': 'Byculla, Mazgaon', 'F/N': 'Matunga, Sion, Wadala', 'F/S': 'Parel, Sewri', 'G/N': 'Dadar, Mahim, Dharavi',
  'G/S': 'Worli, Prabhadevi, Lower Parel', 'H/E': 'Bandra East, Khar East, Santacruz East', 'H/W': 'Bandra West, Khar West, Santacruz West',
  'K/E': 'Andheri East, Vile Parle East, Jogeshwari East', 'K/W': 'Andheri West, Juhu, Versova', 'L': 'Kurla, Sakinaka',
  'M/E': 'Govandi, Mankhurd, Deonar', 'M/W': 'Chembur, Tilak Nagar', 'N': 'Ghatkopar, Vidyavihar',
  'P/N': 'Malad', 'P/S': 'Goregaon', 'R/C': 'Borivali', 'R/N': 'Dahisar', 'R/S': 'Kandivali',
  'S': 'Bhandup, Powai, Vikhroli', 'T': 'Mulund',
};
const wardLabel = (name) => {
  const code = String(name).replace(/\s*Ward\s*$/i, '').trim();
  return WARD_AREAS[code] ? `${code} Ward (${WARD_AREAS[code]})` : name;
};

function corpVotes(polys) {
  const votes = {};
  polys.forEach((p) => p[0].forEach((pt) => {
    for (const rg in corpPolys) if (inPolys(pt, corpPolys[rg])) votes[rg] = (votes[rg] || 0) + 1;
  }));
  return { ...votes, of: polys.reduce((a, p) => a + p[0].length, 0) };
}

/* Ward names that match an entry's area keep the click-to-filter behaviour. */
const entries = read('entries.json');
const norm = (s) => String(s || '').toLowerCase()
  .replace(/\bward\b/g, '').replace(/\bnagara\b/g, 'nagar').replace(/[^a-z0-9]/g, '');
const areaByNorm = new Map();
entries.forEach((r) => { if (r.a) areaByNorm.set(norm(r.a), r.a); });

const wards = [];
const missing = [];
const outside = [];
for (const rel of wardRels) {
  const f = wardGeo.get(rel.id);
  if (!f) { missing.push(rel.tags.name); continue; }
  const polys = polysOf(f.geometry);
  const rg = corpFor(polys);
  if (!rg) { outside.push(`${rel.tags.name} ${JSON.stringify(corpVotes(polys))}`); continue; }
  const ward = wardLabel(rel.tags['name:en'] || rel.tags.name);
  wards.push({
    type: 'Feature',
    properties: { rg, ward, area: areaByNorm.get(norm(ward)) || '', osm: rel.id },
    geometry: roundGeom(f.geometry),
  });
}
wards.sort((a, b) => a.properties.rg.localeCompare(b.properties.rg) || a.properties.ward.localeCompare(b.properties.ward));

console.log(`  ${wards.length} wards inside the six zones`);
if (missing.length) console.log(`  ${missing.length} not returned by Nominatim: ${missing.join(', ')}`);
if (outside.length) console.log(`  ${outside.length} outside the corporations, dropped: ${outside.join(', ')}`);
const byRg = {};
wards.forEach((w) => { byRg[w.properties.rg] = (byRg[w.properties.rg] || 0) + 1; });
console.log('  wards per corporation:', JSON.stringify(byRg));
console.log(`  ${wards.filter((w) => w.properties.area).length} ward names match an entry area`);

const corps = read('corporations.json');

/* ---------- write ---------- */
write('zones.json', { type: 'FeatureCollection', features: wards });

/* A wide rectangle with the city cut out of it. The cut-out has to wind against
   the rectangle (outer counter-clockwise, holes clockwise, as RFC 7946 says),
   or MapLibre reads the city as a second polygon instead of a hole. */
/* Wide enough that city fit + Leaflet↔GL overscan never runs past the mask. */
const WORLD = [[50, -5], [110, -5], [110, 35], [50, 35], [50, -5]];
const signedArea = (ring) => ring.reduce((s, [x1, y1], i) => {
  const [x2, y2] = ring[(i + 1) % ring.length];
  return s + (x1 * y2 - x2 * y1);
}, 0);
const clockwise = (ring) => (signedArea(ring) < 0 ? ring : [...ring].reverse());
if (cityPolys.some((p) => p.length > 1)) console.log('  note: the city polygon has inner rings; the mask ignores them');
write('mask.json', {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [WORLD, ...cityPolys.map((p) => clockwise(round(p[0])))] } }],
});

write('corporation-areas.json', {
  type: 'FeatureCollection',
  features: Object.entries(CORP_REL).map(([rg, id]) => ({
    type: 'Feature', properties: { rg }, geometry: roundGeom(top.get(id).geometry),
  })),
});

const cityPts = cityPolys.flatMap((p) => p[0]);
const [W, S, E, N] = [Math.min(...cityPts.map((p) => p[0])), Math.min(...cityPts.map((p) => p[1])),
  Math.max(...cityPts.map((p) => p[0])), Math.max(...cityPts.map((p) => p[1]))];
const city = read('city.json');
write('city.json', {
  ...city,
  box: [+S.toFixed(5), +W.toFixed(5), +N.toFixed(5), +E.toFixed(5)],
  gba_km2: Math.round(km2(cityPolys)),
  source: `OpenStreetMap relations ${CITY_RELS.join(' + ')} (Mumbai City and Mumbai Suburban districts, the BMC area), fetched ${new Date().toISOString().slice(0, 10)}`,
});
/* Hand-edited (the hue families live here), so it stays readable. */
write('corporations.json', corps.map((c) => ({ ...c, km2: Math.round(km2(corpPolys[c.k])) })), true);

/* ---------- entry check ---------- */
const wrong = [];
let noCorp = 0;
entries.forEach((r) => {
  if (r.lat == null || r.lon == null || r.out) return;
  const actual = Object.keys(corpPolys).find((rg) => inPolys([r.lon, r.lat], corpPolys[rg])) || '';
  if (!actual) { noCorp++; return; }
  if ((r.rg || '') !== actual) wrong.push(`${r.id} ${r.n} (${r.a}): rg=${r.rg || '—'}, pin is in ${actual}`);
});
console.log(`\n${wrong.length} pinned in-city entries carry a different rg than their pin's corporation`
  + (noCorp ? `; ${noCorp} pinned in-city entries fall in no corporation` : ''));
wrong.slice(0, 40).forEach((l) => console.log('  ' + l));
