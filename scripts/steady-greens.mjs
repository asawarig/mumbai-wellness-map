#!/usr/bin/env node
/**
 * The city's greens from the detailed (zoom-13) vector tiles, as one GeoJSON
 * the basemap draws at every zoom below 14 (addSteadyGreens, src/lib/basemap.js).
 *
 * Vector tiles leave out polygons that are small for their zoom, and the
 * suburbs' greens are mostly small: grounds, gardens, pitches, patches of
 * grass. While the map zooms it shows the coarser tiles it already has until
 * the finer ones arrive, so that green blinked out and back on every zoom.
 * Drawn from one set of detailed tiles, the same green is there at every
 * zoom, whatever has loaded.
 *
 *   node scripts/steady-greens.mjs        # writes public/data/steady-greens.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public/data/steady-greens.json');
const Z = 13;
const UA = 'mumbai-wellness-map/1.0 (steady greens; build script)';

/* The city's own outline (mask.json holds it as the holes in the world). */
const mask = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/mask.json'), 'utf8'));
const rings = mask.features[0].geometry.coordinates.slice(1);
let W = 180, S = 90, E = -180, N = -90;
for (const r of rings) for (const [x, y] of r) { W = Math.min(W, x); E = Math.max(E, x); S = Math.min(S, y); N = Math.max(N, y); }

const GREEN = {
  landcover: new Set(['grass', 'wetland', 'wood', 'farmland']),
  landuse: new Set(['cemetery', 'pitch', 'stadium', 'track', 'playground', 'theme_park', 'zoo']),
  park: null,
};
const lon2x = (lon) => Math.floor(((lon + 180) / 360) * 2 ** Z);
const lat2y = (lat) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** Z);

function perp(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (!dx && !dy) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
function simplify(c, tol) {
  if (c.length < 4) return c;
  let dm = 0, ix = 0;
  for (let i = 1; i < c.length - 1; i++) { const d = perp(c[i], c[0], c[c.length - 1]); if (d > dm) { dm = d; ix = i; } }
  if (dm <= tol) return [c[0], c[c.length - 1]];
  return simplify(c.slice(0, ix + 1), tol).slice(0, -1).concat(simplify(c.slice(ix), tol));
}
/* About 5 m: under a pixel below zoom 14, where this is drawn. */
const TOL = 0.00005;
const round = (c) => c.map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]);
/* Polygons that cross tile edges arrive in pieces; the pieces butt up, so
   drawn in one colour they read as one. Below ~150 m² a piece is invisible
   at every zoom this is drawn at. */
const areaM2 = (r) => {
  let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
  return Math.abs(a / 2) * 111320 * 110540 * Math.cos((r[0][1] * Math.PI) / 180);
};

const template = (await fetch('https://tiles.openfreemap.org/planet').then((r) => r.json())).tiles[0];
const features = [];
const jobs = [];
for (let x = lon2x(W); x <= lon2x(E); x++) for (let y = lat2y(N); y <= lat2y(S); y++) jobs.push([x, y]);
let done = 0;
async function worker() {
  while (jobs.length) {
    const [x, y] = jobs.shift();
    const url = template.replace('{z}', Z).replace('{x}', x).replace('{y}', y);
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`tile ${Z}/${x}/${y}: ${res.status}`);
    const tile = new VectorTile(new PbfReader(new Uint8Array(await res.arrayBuffer())));
    for (const [name, classes] of Object.entries(GREEN)) {
      const layer = tile.layers[name];
      if (!layer) continue;
      for (let i = 0; i < layer.length; i++) {
        const f = layer.feature(i);
        if (classes && !classes.has(f.properties.class)) continue;
        const g = f.toGeoJSON(x, y, Z).geometry;
        const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
        for (const poly of polys) {
          const rs = poly.map((r) => round(simplify(r, TOL))).filter((r) => r.length >= 4);
          if (rs.length && areaM2(rs[0]) >= 150) features.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: rs } });
        }
      }
    }
    done++;
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const body = JSON.stringify({ type: 'FeatureCollection', source: `OpenFreeMap / OpenMapTiles zoom ${Z} (${template.split('/')[4]}), © OpenStreetMap contributors, ODbL`, features });
fs.writeFileSync(OUT, body);
console.log(`${done} tiles, ${features.length} green polygons, ${(body.length / 1024).toFixed(0)} KB → ${path.relative(ROOT, OUT)}`);
