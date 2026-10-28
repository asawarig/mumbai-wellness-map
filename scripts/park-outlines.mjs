#!/usr/bin/env node
/**
 * Park walks drawn as the park's own outline, the way the Bengaluru map draws
 * its park and lake loops (their routes.json sources read "osm:way/…" and
 * "nominatim:way/…"): one closed line round the park, fetched from Nominatim's
 * lookup, which answers 50 parks a request. snap-routes.mjs's parkWalk() would
 * trace the paths inside instead, but it needs Overpass for every park, and
 * the public Overpass servers spend whole days at capacity.
 *
 *   node scripts/park-outlines.mjs [sources/routes/mumbai-routes.csv]
 *
 * Reads the sheet's rows that name an OSM element (`osm`, e.g. way/49682798)
 * and are not on hold; writes or replaces their lines in src/data/routes.json,
 * keyed by the park's id (PARK-lat_lon, as db.js builds it). A park whose
 * outline is implausible as a walk — shorter than 250 m or longer than 6 km —
 * is left without a line and listed.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CSV = path.resolve(ROOT, process.argv[2] || 'sources/routes/mumbai-routes.csv');
const ROUTES = path.join(ROOT, 'src/data/routes.json');
const CACHE = path.join(ROOT, '.cache/park-outlines.json');
const UA = 'mumbai-wellness-map/1.0 (park outlines; local build)';

function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; } else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const [h, ...b] = rows.filter((r) => r.some((x) => x));
  return b.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
}
const hav = (a, b) => {
  const R = 6371008.8, t = Math.PI / 180;
  const x = Math.sin(((b[1] - a[1]) * t) / 2) ** 2 + Math.cos(a[1] * t) * Math.cos(b[1] * t) * Math.sin(((b[0] - a[0]) * t) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};
const lengthM = (c) => c.slice(1).reduce((s, p, i) => s + hav(c[i], p), 0);
function perp(p, a, b) {
  const k = Math.cos(p[1] * Math.PI / 180) * 111320;
  const [px, py, ax, ay, bx, by] = [p[0] * k, p[1] * 110540, a[0] * k, a[1] * 110540, b[0] * k, b[1] * 110540];
  const dx = bx - ax, dy = by - ay;
  if (!dx && !dy) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function simplify(c, tol = 4) {
  if (c.length < 3) return c;
  let dm = 0, ix = 0;
  for (let i = 1; i < c.length - 1; i++) { const d = perp(c[i], c[0], c[c.length - 1]); if (d > dm) { dm = d; ix = i; } }
  if (dm <= tol) return [c[0], c[c.length - 1]];
  return simplify(c.slice(0, ix + 1), tol).slice(0, -1).concat(simplify(c.slice(ix), tol));
}
const round = (c) => c.map(([x, y]) => [+x.toFixed(6), +y.toFixed(6)]);

const sheet = parseCsv(fs.readFileSync(CSV, 'utf8')).filter((r) => !/^hold\b/i.test(r.geom_status || ''));
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};

/* A park or lake loop from the places sheet (MUM-…) has a name and a gate
   pin but no OSM element. Find the element by name: Nominatim's search, kept
   only if it is a park, garden, lake or reservoir and its outline passes
   within 250 m of the pin — the same anchoring snap-routes.mjs asks of a
   trace. Routes already drawn keep their line. */
const drawn = new Set(JSON.parse(fs.readFileSync(ROUTES, 'utf8')).features.map((f) => f.properties.id));
const KIND = /^(leisure:(park|garden|nature_reserve|recreation_ground)|natural:water|water:(lake|pond|reservoir)|landuse:(reservoir|recreation_ground))$/;
for (const r of sheet) {
  if (r.osm || drawn.has(r.id) || !/loop/i.test(r.route_type) || r.waypoints) continue;
  const key = `search:${r.id}`;
  if (!(key in cache)) {
    const base = r.n.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+—\s+.*$/, '').replace(/\b(walking loop|loop|perimeter|running track|track|trails?|walk)\b/gi, '').replace(/,.*$/, '').trim();
    const url = `https://nominatim.openstreetmap.org/search?format=json&polygon_geojson=1&limit=5&countrycodes=in&q=${encodeURIComponent(`${base}, ${r.a}`)}`;
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
    const got = res.ok ? await res.json() : [];
    const pin = [+r.start_lon, +r.start_lat];
    const near = (g) => {
      const ring = g?.type === 'Polygon' ? g.coordinates[0] : g?.type === 'MultiPolygon' ? g.coordinates[0][0] : null;
      return ring && ring.some((c) => hav(c, pin) <= 250);
    };
    const hit = got.find((g) => KIND.test(`${g.class}:${g.type}`) && near(g.geojson));
    cache[key] = hit ? `${hit.osm_type}/${hit.osm_id}` : null;
    if (hit) cache[`${hit.osm_type}/${hit.osm_id}`] = hit.geojson;
    fs.writeFileSync(CACHE, JSON.stringify(cache));
    await new Promise((res2) => setTimeout(res2, 1100));
  }
  if (cache[key]) r.osm = cache[key];
}
const rows = sheet.filter((r) => r.osm);
const want = rows.map((r) => r.osm).filter((o) => !(o in cache));
const code = (o) => ({ way: 'W', relation: 'R', node: 'N' })[o.split('/')[0]] + o.split('/')[1];
for (let i = 0; i < want.length; i += 50) {
  const ids = want.slice(i, i + 50);
  const url = `https://nominatim.openstreetmap.org/lookup?format=json&polygon_geojson=1&osm_ids=${ids.map(code).join(',')}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const got = await res.json();
  for (const o of ids) cache[o] = null;
  for (const g of got) cache[`${g.osm_type}/${g.osm_id}`] = g.geojson || null;
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  await new Promise((r) => setTimeout(r, 1100));
}

const routes = JSON.parse(fs.readFileSync(ROUTES, 'utf8'));
const byId = new Map(routes.features.map((f, i) => [f.properties.id, i]));
let ok = 0; const skipped = [];
for (const r of rows) {
  const g = cache[r.osm];
  const ring = g?.type === 'Polygon' ? g.coordinates[0]
    : g?.type === 'MultiPolygon' ? g.coordinates.map((p) => p[0]).sort((a, b) => lengthM(b) - lengthM(a))[0] : null;
  if (!ring) { skipped.push(`${r.n}: no outline`); continue; }
  /* Start the loop at the point of the outline nearest the park's pin. */
  const pin = [+r.start_lon, +r.start_lat];
  const open = ring.slice(0, -1);
  const s = open.reduce((bi, c, i) => (hav(c, pin) < hav(open[bi], pin) ? i : bi), 0);
  const loop = [...open.slice(s), ...open.slice(0, s), open[s]];
  const coords = round(simplify(loop));
  const km = +(lengthM(coords) / 1000).toFixed(2);
  if (km < 0.25 || km > 6) { skipped.push(`${r.n}: outline ${km} km`); continue; }
  /* A loop the sheet gives a length for has to come out near it. */
  const stated = parseFloat(r.dist_km) || 0;
  if (stated && (km < stated * 0.5 || km > stated * 1.6)) { skipped.push(`${r.n}: outline ${km} km against a stated ${stated} km`); continue; }
  const walk = /walk/i.test(r.mode);
  const feat = {
    type: 'Feature', id: r.id,
    properties: { id: r.id, name: r.n, area: r.a || '', g: walk ? 'walk' : 'run', km: stated || +km.toFixed(1), snapped_km: km, loop: true, geom_type: 'loop', mode: r.mode || 'Walk', source: `nominatim:${r.osm}`, provisional: false },
    geometry: { type: 'LineString', coordinates: coords },
  };
  if (byId.has(r.id)) routes.features[byId.get(r.id)] = feat; else { byId.set(r.id, routes.features.length); routes.features.push(feat); }
  ok++;
}
fs.writeFileSync(ROUTES, `${JSON.stringify(routes, null, 2)}\n`);
console.log(`${ok} park walks written; ${skipped.length} skipped`);
skipped.forEach((s) => console.log('  -', s));
