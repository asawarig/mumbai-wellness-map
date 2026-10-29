/* Builds src/data/local-rail.json and src/data/local-stations.json: Mumbai's
 * suburban railway (the "locals") — the Western, Central, Harbour,
 * Trans-Harbour and Nerul–Uran lines — drawn under the metro and switched on
 * with it.
 *
 *   node scripts/osm-local.mjs
 *
 * Takes OpenStreetMap's route=train relations of the Mumbai Suburban Railway
 * network and keeps their railway=rail member ways inside the region, merged
 * to one feature per line (a line's fast and slow, up and down relations run
 * on parallel tracks a few metres apart, so they draw as one). The Vasai–Diva
 * line runs almost entirely outside the city and is left out.
 */

import { writeFileSync, readFileSync } from 'node:fs';

const UA = 'mumbai-wellness-map/1.0 (local lines build script)';
const region = JSON.parse(readFileSync(new URL('../src/data/region.json', import.meta.url), 'utf8'));
const [W, S, E, N] = region.properties?.bbox || region.bbox;

/* Keyed by the line's ref in OSM; the colours are the lines' own. */
const LINES = {
  W: { name: 'Western Line', colour: '#EBCF1F' },
  C: { name: 'Central Line', colour: '#E2393B' },
  H: { name: 'Harbour Line', colour: '#303888' },
  T: { name: 'Trans-Harbour Line', colour: '#6A2C91' },
  U: { name: 'Nerul–Uran Line', colour: '#D9A400' },
};

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
async function overpass(q) {
  const errors = [];
  for (const url of OVERPASS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: 'data=' + encodeURIComponent(q),
        signal: AbortSignal.timeout(300000),
      });
      if (res.ok) {
        const j = await res.json();
        if (j.remark && /error|timed out|runtime/i.test(j.remark)) throw new Error(j.remark.slice(0, 120));
        return j.elements;
      }
      errors.push(`${new URL(url).host} ${res.status}`);
    } catch (e) {
      errors.push(`${new URL(url).host} ${e.message}`);
    }
  }
  throw new Error(`No Overpass instance answered: ${errors.join(', ')}`);
}

const els = await overpass(`[out:json][timeout:240];
rel["route"="train"]["network"~"Mumbai Suburban",i](${S},${W},${N},${E})->.r;
.r out body;
way(r.r)["railway"="rail"](${S},${W},${N},${E});out geom;
node(r.r)["railway"~"^(station|halt)$"](${S},${W},${N},${E});out;`);

const ways = new Map(els.filter((e) => e.type === 'way').map((w) => [w.id, w]));
const nodes = new Map(els.filter((e) => e.type === 'node').map((n) => [n.id, n]));
const lines = new Map();
const stations = new Map();
for (const rel of els.filter((e) => e.type === 'relation')) {
  const ref = (rel.tags.ref || '').toUpperCase();
  if (!LINES[ref]) continue;
  if (!lines.has(ref)) lines.set(ref, new Set());
  for (const m of rel.members) {
    if (m.type === 'way' && ways.has(m.ref)) lines.get(ref).add(m.ref);
    if (m.type === 'node' && nodes.has(m.ref)) {
      const n = nodes.get(m.ref);
      const name = n.tags?.['name:en'] || n.tags?.name;
      if (name && !stations.has(name)) stations.set(name, { type: 'Feature', properties: { name, line: ref }, geometry: { type: 'Point', coordinates: [+n.lon.toFixed(5), +n.lat.toFixed(5)] } });
    }
  }
}
if (!lines.size) throw new Error('No suburban lines came back; refusing to write an empty file.');

const features = [...lines].filter(([, ids]) => ids.size).map(([ref, ids]) => ({
  type: 'Feature',
  properties: { line: ref, name: LINES[ref].name, colour: LINES[ref].colour, kind: 'local' },
  geometry: {
    type: 'MultiLineString',
    coordinates: [...ids].map((id) => ways.get(id).geometry.map((p) => [+p.lon.toFixed(5), +p.lat.toFixed(5)])),
  },
}));

/* Route relations list stop positions, not stations, so the stations are
   asked for on their own: railway=station nodes that are not the metro's,
   kept where they sit on one of these lines. */
if (!stations.size) {
  const st = await overpass(`[out:json][timeout:180];
node["railway"~"^(station|halt)$"]["station"!~"subway|light_rail|monorail"]["network"!~"Metro",i](${S},${W},${N},${E});out;`);
  const pts = features.flatMap((f) => f.geometry.coordinates.flat().map((c) => [c, f.properties.line]));
  for (const n of st) {
    const name = n.tags?.['name:en'] || n.tags?.name;
    if (!name || stations.has(name)) continue;
    let best = null, bd = 1e9;
    for (const [c, line] of pts) {
      const d = Math.hypot((c[0] - n.lon) * 105000, (c[1] - n.lat) * 111000);
      if (d < bd) { bd = d; best = line; }
    }
    if (bd <= 120) stations.set(name, { type: 'Feature', properties: { name, line: best }, geometry: { type: 'Point', coordinates: [+n.lon.toFixed(5), +n.lat.toFixed(5)] } });
  }
}

writeFileSync(new URL('../src/data/local-rail.json', import.meta.url), JSON.stringify({ type: 'FeatureCollection', features }) + '\n');
writeFileSync(new URL('../src/data/local-stations.json', import.meta.url), JSON.stringify({ type: 'FeatureCollection', features: [...stations.values()] }) + '\n');
console.log(features.map((f) => `${f.properties.name}: ${f.geometry.coordinates.length} ways`).join('\n'));
console.log(`${stations.size} stations`);
