/* Builds public/data/green-roads.json: the stretches of road and footpath
 * that run through Bengaluru's green areas. The basemap outlines those roads
 * in green and draws those paths in green; everywhere else roads have no
 * outline and paths are grey (basemap.js, setGreenRoads).
 *
 *   node scripts/osm-green-areas.mjs
 *
 * The tiles cannot tell a road that it is in a park, and MapLibre cannot cut
 * a line at a polygon's edge, so the cutting is done here, once: every road
 * that touches a green area is clipped to it, and only the pieces inside are
 * kept, each tagged with the tile class it is drawn as (major, mid, minor,
 * or path for footpaths and tracks).
 *
 * Takes OpenStreetMap's parks, gardens, golf courses, recreation grounds,
 * nature reserves, woods, forests, grass, village greens and cemeteries over
 * the city and a margin round it. Outer rings only: a multipolygon's outer
 * ways are joined into rings and its holes are ignored. Rings are simplified
 * to about 2 m and anything under MIN_AREA is dropped, which keeps the file
 * small without losing any park a road could run through.
 *
 * Served as a static file rather than imported, so it does not weigh down the
 * page's script; the map fetches it after the style is up.
 */

import { writeFileSync, mkdirSync } from 'node:fs';

const UA = 'bengaluru-wellness-map/1.0 (green areas build script)';
/* south, west, north, east: the city and a margin, as the map's grid. */
const BBOX = '12.70,77.30,13.25,77.95';
const MIN_AREA = 2000; // m²
const TOLERANCE = 0.00002; // degrees, about 2 m
const OUT = 'public/data/green-roads.json';

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
      });
      if (res.ok) return (await res.json()).elements;
      errors.push(`${new URL(url).host} ${res.status}`);
    } catch (e) {
      errors.push(`${new URL(url).host} ${e.message}`);
    }
  }
  throw new Error(`No Overpass instance answered: ${errors.join(', ')}`);
}

const tags = [
  ['leisure', 'park|garden|golf_course|recreation_ground|nature_reserve'],
  ['landuse', 'recreation_ground|forest|grass|village_green|cemetery'],
  ['natural', 'wood'],
];
/* The roads, by OSM highway tag, as the tile classes the basemap draws. */
const ROAD_CLASS = {
  motorway: 'major', trunk: 'major', primary: 'major',
  motorway_link: 'major', trunk_link: 'major', primary_link: 'major',
  secondary: 'mid', tertiary: 'mid', secondary_link: 'mid', tertiary_link: 'mid',
  residential: 'minor', unclassified: 'minor', living_street: 'minor', service: 'minor', road: 'minor',
  footway: 'path', path: 'path', track: 'path', pedestrian: 'path', cycleway: 'path', steps: 'path', bridleway: 'path',
};
const els = await overpass(`[out:json][timeout:300];(
${tags.map(([k, v]) => `way["${k}"~"^(${v})$"](${BBOX});relation["${k}"~"^(${v})$"](${BBOX});`).join('\n')}
)->.g;
.g out geom;
.g map_to_area->.ga;
way(area.ga)["highway"~"^(${Object.keys(ROAD_CLASS).join('|')})$"]["tunnel"!="yes"];
out geom;`);

/* Shoelace on a local flat projection: plenty for a size cut-off. */
function areaM2(ring) {
  const lat0 = (ring.reduce((s, p) => s + p[1], 0) / ring.length) * Math.PI / 180;
  const kx = 111320 * Math.cos(lat0), ky = 110540;
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * kx * ring[i + 1][1] * ky - ring[i + 1][0] * kx * ring[i][1] * ky;
  }
  return Math.abs(a) / 2;
}

/* Douglas–Peucker. */
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const [x1, y1] = pts[0], [x2, y2] = pts[pts.length - 1];
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  let best = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    const d = len ? Math.abs(dy * px - dx * py + x2 * y1 - y2 * x1) / len : Math.hypot(px - x1, py - y1);
    if (d > best) { best = d; idx = i; }
  }
  if (best <= tol) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, idx + 1), tol).slice(0, -1), ...simplify(pts.slice(idx), tol)];
}

const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const closed = (r) => r.length >= 4 && same(r[0], r[r.length - 1]);

/* Joins a multipolygon's open outer ways end to end into closed rings. */
function stitch(ways) {
  const rest = ways.filter((w) => w.length > 1).map((w) => [...w]);
  const rings = [];
  while (rest.length) {
    let cur = rest.shift();
    let grew = true;
    while (!same(cur[0], cur[cur.length - 1]) && grew) {
      grew = false;
      for (let i = 0; i < rest.length; i++) {
        const w = rest[i], end = cur[cur.length - 1];
        if (same(w[0], end)) cur = [...cur, ...w.slice(1)];
        else if (same(w[w.length - 1], end)) cur = [...cur, ...[...w].reverse().slice(1)];
        else if (same(w[w.length - 1], cur[0])) cur = [...w, ...cur.slice(1)];
        else if (same(w[0], cur[0])) cur = [...[...w].reverse(), ...cur.slice(1)];
        else continue;
        rest.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (closed(cur)) rings.push(cur);
  }
  return rings;
}

const lonLat = (g = []) => g.map((p) => [p.lon, p.lat]);
const rings = [];
const roads = els.filter((el) => el.type === 'way' && el.tags?.highway in ROAD_CLASS);
for (const el of els) {
  if (el.type === 'way' && !(el.tags?.highway in ROAD_CLASS)) {
    const g = lonLat(el.geometry);
    if (closed(g)) rings.push(g);
  } else if (el.type === 'relation') {
    rings.push(...stitch(el.members.filter((m) => m.type === 'way' && m.role === 'outer').map((m) => lonLat(m.geometry))));
  }
}

const polygons = [];
for (const ring of rings) {
  if (areaM2(ring) < MIN_AREA) continue;
  const s = simplify(ring, TOLERANCE);
  if (!same(s[0], s[s.length - 1])) s.push(s[0]);
  if (s.length >= 4) polygons.push([s.map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)])]);
}

/* ---------- clipping ----------
   Each polygon's bounding box goes in a coarse grid, so a road is only tested
   against the parks near it. A road is cut wherever it crosses a park's edge,
   and a piece is kept when its middle lies inside a park. */
const CELL = 0.01;
const boxes = polygons.map(([ring]) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ring) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
});
const grid = new Map();
const cellKey = (i, j) => `${i},${j}`;
boxes.forEach(([x0, y0, x1, y1], n) => {
  for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) {
    for (let j = Math.floor(y0 / CELL); j <= Math.floor(y1 / CELL); j++) {
      const k = cellKey(i, j);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(n);
    }
  }
});
function near(x0, y0, x1, y1) {
  const out = new Set();
  for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) {
    for (let j = Math.floor(y0 / CELL); j <= Math.floor(y1 / CELL); j++) {
      for (const n of grid.get(cellKey(i, j)) || []) {
        const b = boxes[n];
        if (b[0] <= x1 && b[2] >= x0 && b[1] <= y1 && b[3] >= y0) out.add(n);
      }
    }
  }
  return [...out];
}
function inside([x, y], ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/* Where segment a→b crosses segment c→d, as a share of the way along a→b. */
function cross(a, b, c, d) {
  const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  if (!den) return null;
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den;
  const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
  return t > 0 && t < 1 && u >= 0 && u <= 1 ? t : null;
}
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

const pieces = [];
for (const road of roads) {
  const line = lonLat(road.geometry);
  if (line.length < 2) continue;
  const xs = line.map((p) => p[0]), ys = line.map((p) => p[1]);
  const cands = near(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)).map((n) => polygons[n][0]);
  if (!cands.length) continue;
  const inAny = (p) => cands.some((ring) => inside(p, ring));
  let cur = null;
  const flush = () => { if (cur && cur.length > 1) pieces.push({ c: ROAD_CLASS[road.tags.highway], line: cur }); cur = null; };
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    const ts = [0, 1];
    for (const ring of cands) {
      for (let k = 0; k < ring.length - 1; k++) {
        const t = cross(a, b, ring[k], ring[k + 1]);
        if (t !== null) ts.push(t);
      }
    }
    ts.sort((p, q) => p - q);
    for (let k = 0; k < ts.length - 1; k++) {
      if (ts[k + 1] - ts[k] < 1e-12) continue;
      const p = lerp(a, b, ts[k]), q = lerp(a, b, ts[k + 1]);
      if (inAny(lerp(a, b, (ts[k] + ts[k + 1]) / 2))) {
        if (!cur) cur = [p];
        cur.push(q);
      } else flush();
    }
  }
  flush();
}

/* Five decimals is about a metre: finer than any of these lines is drawn. */
const round5 = ([x, y]) => [+x.toFixed(5), +y.toFixed(5)];
mkdirSync('public/data', { recursive: true });
/* Two files. The main and mid roads show from the city view and come with
   the page; the minor roads (from zoom 13) and the footpaths (from 15) are
   nearly all of the weight, so they wait in a second file the map fetches
   only once someone zooms in that far. */
const FAR = new Set(['major', 'mid']);
const write = (file, keep) => writeFileSync(file, JSON.stringify({
  type: 'FeatureCollection',
  features: pieces.filter(({ c }) => keep(c)).map(({ c, line }) => ({
    type: 'Feature', properties: { c }, geometry: { type: 'LineString', coordinates: line.map(round5) },
  })),
}));
write(OUT, (c) => FAR.has(c));
write(OUT.replace('.json', '-near.json'), (c) => !FAR.has(c));
console.log(`${polygons.length} green areas, ${roads.length} roads touching them, `
  + `${pieces.length} pieces inside → ${OUT}`);
