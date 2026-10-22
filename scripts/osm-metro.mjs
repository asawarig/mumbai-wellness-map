/* Builds src/data/metro.json: the Namma Metro lines that are running.
 *
 *   node scripts/osm-metro.mjs
 *
 * Takes OpenStreetMap's route=subway relations for Namma Metro inside the city
 * and keeps only their member ways tagged railway=subway. Track that is still
 * being built is tagged railway=construction in OSM, so it drops out on its
 * own, and a line appears here once OSM shows it open. One feature per line,
 * in the line's colour.
 */

import { writeFileSync } from 'node:fs';

const UA = 'bengaluru-wellness-map/1.0 (metro build script)';
const CITY_REL = 7902476;
const LINE_COLOUR = { Purple: '#9B3FB5', Green: '#23994A', Yellow: '#E2B100', Pink: '#E05599', Blue: '#2E7DD1' };

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
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(q),
      });
      if (res.ok) return (await res.json()).elements;
      errors.push(`${new URL(url).host} ${res.status}`);
    } catch (e) {
      errors.push(`${new URL(url).host} ${e.message}`);
    }
  }
  throw new Error(`No Overpass instance answered: ${errors.join(', ')}`);
}

const els = await overpass(`[out:json][timeout:120];rel(${CITY_REL});map_to_area->.city;
rel["route"="subway"]["network"="Namma Metro"](area.city)->.r;
.r out body;
way(r.r)["railway"="subway"];out geom;`);

const ways = new Map(els.filter((e) => e.type === 'way').map((w) => [w.id, w]));
const lines = new Map();
for (const rel of els.filter((e) => e.type === 'relation')) {
  const ref = rel.tags.ref || (rel.tags.name || 'Metro').split(' ')[0];
  if (!lines.has(ref)) {
    const hex = /^#[0-9a-f]{6}$/i.test(rel.tags.colour || '') ? rel.tags.colour : '#3A3934';
    lines.set(ref, { ref, colour: LINE_COLOUR[ref] || hex, ways: new Set() });
  }
  rel.members.forEach((m) => { if (m.type === 'way' && ways.has(m.ref)) lines.get(ref).ways.add(m.ref); });
}

const features = [...lines.values()].filter((l) => l.ways.size).map((l) => ({
  type: 'Feature',
  properties: { line: l.ref, name: `${l.ref} Line`, colour: l.colour },
  geometry: {
    type: 'MultiLineString',
    coordinates: [...l.ways].map((id) => ways.get(id).geometry.map((p) => [+p.lon.toFixed(5), +p.lat.toFixed(5)])),
  },
}));

writeFileSync(new URL('../src/data/metro.json', import.meta.url), JSON.stringify({ type: 'FeatureCollection', features }) + '\n');
console.log(features.map((f) => `${f.properties.name}: ${f.geometry.coordinates.length} ways`).join('\n'));
