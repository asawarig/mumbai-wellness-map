#!/usr/bin/env node
/**
 * Ingest a wellness-map-routes CSV into entries.json + routes.json.
 *
 * Every row becomes an entry, a pin at its start. Its line is kept from
 * routes.json when the route already has a snapped line from the same start
 * and end; otherwise a provisional line is built as start → waypoints → end, for
 * scripts/snap-routes.mjs to snap to the path network. A loop with no waypoints
 * has nothing to draw yet and waits for the snap. Rows whose geometry status
 * starts "Hold" get a pin and no line. Re-run whenever the CSV changes:
 *
 *   node scripts/ingest-routes.mjs [sources/routes/wellness-map-routes-v2.csv]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CSV = path.resolve(ROOT, process.argv[2] || 'sources/routes/wellness-map-routes-v2.csv');
const SOURCE = path.basename(CSV, '.csv');
const ENTRIES = path.join(ROOT, 'src/data/entries.json');
const ROUTES = path.join(ROOT, 'src/data/routes.json');

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', i = 0, inQ = false;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { rows.push(row); row = []; };
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { pushField(); i++; continue; }
    if (c === '\n') { pushField(); pushRow(); i++; continue; }
    if (c === '\r') { i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { pushField(); pushRow(); }
  const [header, ...body] = rows.filter((r) => r.some((x) => String(x).trim()));
  return body.map((r) => Object.fromEntries(header.map((h, j) => [h, r[j] ?? ''])));
}

function parseWaypoints(s) {
  if (!s?.trim()) return [];
  const out = [];
  const re = /\(([-+]?\d+\.?\d*)\s*,\s*([-+]?\d+\.?\d*)\)/g;
  let m;
  while ((m = re.exec(s))) out.push([+m[2], +m[1]]);
  return out;
}

function lengthKm(coords) {
  const R = 6371;
  let d = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const [lon1, lat1] = coords[i], [lon2, lat2] = coords[i + 1];
    const p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
    const dp = (lat2 - lat1) * Math.PI / 180, dl = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    d += 2 * R * Math.asin(Math.sqrt(a));
  }
  return d;
}

function modeToG(mode) {
  return /cycle/i.test(mode || '') ? 'cycle' : 'run';
}

function geomType(routeType) {
  if (/loop/i.test(routeType)) return 'loop';
  if (/out and back/i.test(routeType)) return 'out-and-back';
  return 'point-to-point';
}

function tagsOf(row) {
  const tg = String(row.tg || '').split('|').map((t) => t.trim()).filter(Boolean);
  const extra = [];
  if (/loop/i.test(row.route_type)) extra.push('loop');
  if (/out and back/i.test(row.route_type)) extra.push('out-and-back');
  if (/point to point/i.test(row.route_type)) extra.push('point-to-point');
  return [...new Set([...tg, ...extra, 'route'])];
}

/* Facilities worth a line on the place card; "Needs check" says nothing yet. */
function known(value) {
  const s = String(value || '').trim();
  return s && !/^needs check$/i.test(s) ? s : '';
}

const sameSpot = (a, b) => Array.isArray(a) && Array.isArray(b)
  && Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;

const RG_FALLBACK = {
  'South-east': 'South',
  'North-west': 'West',
  Central: 'Central',
  'City-wide': 'Central',
  South: 'South',
  East: 'East',
  West: 'West',
  North: 'North',
};

const csv = parseCsv(fs.readFileSync(CSV, 'utf8'));
const entries = JSON.parse(fs.readFileSync(ENTRIES, 'utf8'));
const routes = JSON.parse(fs.readFileSync(ROUTES, 'utf8'));
const byId = new Map(entries.map((e) => [e.id, e]));
const routesById = new Map(routes.features.map((f) => [f.properties?.id || f.id, f]));

const newEntries = [];
const newRoutes = [];
const tally = { kept: 0, provisional: 0, waiting: 0, held: 0 };

for (const row of csv) {
  const id = row.id.trim();
  if (!id) continue;
  const parent = row.parent_id ? byId.get(row.parent_id.trim()) : null;
  const g = modeToG(row.mode);
  const type = geomType(row.route_type);
  const loop = type === 'loop';
  const start = [+row.start_lat, +row.start_lon];
  const end = [+row.end_lat, +row.end_lon];
  const wps = parseWaypoints(row.waypoints);
  const coords = [[start[1], start[0]], ...wps, [end[1], end[0]]];
  const line = coords.filter((c, i) => i === 0 || c[0] !== coords[i - 1][0] || c[1] !== coords[i - 1][1]);
  if (loop && line.length >= 2) {
    const a = line[0], b = line[line.length - 1];
    if (a[0] !== b[0] || a[1] !== b[1]) line.push([...a]);
  }
  const km = parseFloat(row.dist_km) || +lengthKm(line).toFixed(2);
  const area = (row.a || parent?.a || '').trim() || 'Bengaluru';
  const rg = parent?.rg || RG_FALLBACK[row.rg] || '';

  const entry = {
    id,
    n: row.n.trim(),
    c: 'Activities',
    g,
    s: (row.s || '').trim() || (g === 'cycle' ? 'Cycling route' : 'Walking route'),
    a: area,
    raw: area,
    ad: row.start_n || '',
    lat: start[0],
    lon: start[1],
    rg,
    gm: '',
    w: '',
    ig: '',
    d: (row.d || '').trim(),
    p: (row.b || 'Free').trim() || 'Free',
    b: (row.level || '').trim(),
    t: [row.hours, row.t].filter(Boolean).map((s) => String(s).trim()).filter(Boolean).join(' · '),
    tg: tagsOf(row),
    src: SOURCE,
    v: row.v || 'Needs check',
    out: 0,
    water: known(row.water),
    toilets: known(row.toilets),
    shade: known(row.shade),
    after: known(row.post_run),
  };
  ['water', 'toilets', 'shade', 'after'].forEach((k) => { if (!entry[k]) delete entry[k]; });
  if (row.parent_id?.trim()) entry.parent_id = row.parent_id.trim();
  if (row.mode) entry.route_mode = row.mode;
  if (row.route_type) entry.route_type = row.route_type;
  newEntries.push(entry);

  if (/^hold\b/i.test(row.geom_status || '')) { tally.held++; continue; }

  const props = { id, name: entry.n, area: entry.a, g, km, loop, geom_type: type, start, end, mode: row.mode };
  const existing = routesById.get(id);
  const keep = existing?.geometry && !existing.properties?.provisional
    && sameSpot(existing.properties.start, start)
    && sameSpot(existing.properties.end || existing.properties.start, end);
  if (keep) {
    tally.kept++;
    newRoutes.push({ ...existing, properties: { ...existing.properties, ...props } });
  } else if (line.length >= 2) {
    tally.provisional++;
    newRoutes.push({
      type: 'Feature',
      id,
      properties: { ...props, source: `${SOURCE}:waypoints`, provisional: true },
      geometry: { type: 'LineString', coordinates: line },
    });
  } else {
    tally.waiting++;
  }
}

const mergedEntries = [
  ...entries.filter((e) => !String(e.id).startsWith('BLR-RT-')),
  ...newEntries,
];
routes.features = [
  ...routes.features.filter((f) => !String(f.properties?.id || f.id).startsWith('BLR-RT-')),
  ...newRoutes,
];

fs.writeFileSync(ENTRIES, `${JSON.stringify(mergedEntries, null, 2)}\n`);
fs.writeFileSync(ROUTES, `${JSON.stringify(routes, null, 2)}\n`);
console.log(`Ingested ${newEntries.length} routes from ${SOURCE} → ${mergedEntries.length} entries, ${routes.features.length} route lines`);
console.log(`  kept ${tally.kept} snapped lines, ${tally.provisional} provisional, ${tally.waiting} waiting for a snap, ${tally.held} on hold`);
