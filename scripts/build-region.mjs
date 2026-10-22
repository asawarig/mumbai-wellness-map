/* Builds src/data/region.json: the edge of the map — a circle round
 * Mumbai, wide enough to take in the greater area its places reach into.
 *
 *   node scripts/build-region.mjs
 *
 * Rerun it after ingesting entries, routes or metro, so the edge still takes
 * in everything. The region is everything the map draws — the city limits
 * (mask.json), every pinned place (entries.json), every route (routes.json)
 * and the metro (metro.json). The circle is centred on the middle of the city
 * limits, and its radius reaches the farthest of those points plus MARGIN_KM,
 * so the outermost place has a little room rather than sitting on the edge.
 * Beyond it the basemap draws nothing (basemap.js), and the map cannot be
 * panned or zoomed out past it (wellness-map.js).
 */

import { readFileSync, writeFileSync } from 'node:fs';

/* Wiggle room past the outermost place. */
const MARGIN_KM = 2;
/* Points round the circle: plenty for a smooth edge at any zoom. */
const STEPS = 256;

const load = (f) => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url)));

const points = [];
const walk = (c) => (typeof c[0] === 'number' ? points.push([c[0], c[1]]) : c.forEach(walk));

const cityRings = load('mask.json').features[0].geometry.coordinates.slice(1);
walk(cityRings);
const entries = load('entries.json');
(Array.isArray(entries) ? entries : Object.values(entries))
  .filter((e) => e.lat != null && e.lon != null)
  .forEach((e) => points.push([+e.lon, +e.lat]));
for (const f of ['routes.json', 'metro.json']) {
  const data = load(f);
  (data.features || []).forEach((feature) => feature.geometry && walk(feature.geometry.coordinates));
}

/* Kilometres on a flat projection about the middle of the city limits:
   plenty at a city's scale, and it makes the radius a true distance. */
const cityPts = cityRings.flat();
const lon0 = (Math.min(...cityPts.map((p) => p[0])) + Math.max(...cityPts.map((p) => p[0]))) / 2;
const lat0 = (Math.min(...cityPts.map((p) => p[1])) + Math.max(...cityPts.map((p) => p[1]))) / 2;
const KX = 111.32 * Math.cos((lat0 * Math.PI) / 180), KY = 110.57;
const toKm = ([x, y]) => [(x - lon0) * KX, (y - lat0) * KY];
const toLonLat = ([x, y]) => [+(x / KX + lon0).toFixed(5), +(y / KY + lat0).toFixed(5)];

/* About the middle of the city, just far enough out for the farthest point. */
const farthest = Math.max(...points.map((p) => Math.hypot(...toKm(p))));
const circle = { x: 0, y: 0, r: farthest };
const radius = Math.ceil((circle.r + MARGIN_KM) * 2) / 2;
const centre = toLonLat([0, 0]);

const ring = Array.from({ length: STEPS }, (_, i) => {
  const a = (i / STEPS) * Math.PI * 2;
  return toLonLat([circle.x + Math.cos(a) * radius, circle.y + Math.sin(a) * radius]);
});
ring.push(ring[0]);
const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
const bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];

writeFileSync(new URL('../src/data/region.json', import.meta.url), JSON.stringify({
  type: 'Feature',
  properties: {
    name: 'Bengaluru and around',
    note: `A ${radius} km circle about the middle of the city limits: its farthest pinned place, route or metro point plus ${MARGIN_KM} km. Built by scripts/build-region.mjs.`,
    center: centre,
    radius_km: radius,
    bbox,
  },
  geometry: { type: 'Polygon', coordinates: [ring] },
}));
console.log(`${points.length} points, farthest ${circle.r.toFixed(1)} km → ${radius} km about `
  + `${centre.join(', ')}; bbox ${bbox.join(', ')}`);
