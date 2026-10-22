#!/usr/bin/env node
/**
 * Ingest sources/routes running routes (CSV + GeoJSON) into entries.json + routes.json.
 *
 * - Rows with a master_id reuse / refresh that entry (BLR-*).
 * - Road segments without a master get an RT-* entry.
 * - Existing snapped route lines are kept.
 * - GeoJSON LineStrings become provisional start→end lines for snap-routes.mjs
 *   (OSRM/Overpass), not published as Strava geometry.
 *
 *   node scripts/ingest-running-routes.mjs [sources/routes]
 *   node scripts/snap-routes.mjs sources/routes/snap-queue.csv
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.resolve(ROOT, process.argv[2] || 'sources/routes');
const CSV = path.join(DIR, 'running-routes.csv');
const GEO = path.join(DIR, 'running-routes.geojson');
const QUEUE = path.join(DIR, 'snap-queue.csv');
const ENTRIES = path.join(ROOT, 'src/data/entries.json');
const ROUTES = path.join(ROOT, 'src/data/routes.json');
const SOURCE = 'running-routes';

const CORP = new Set(['Central', 'East', 'West', 'South', 'North']);
/* Same gazetted box ingest-entries.mjs uses. A route beyond it is a day trip and
   has to say so — the page's validator rejects an unflagged one at render time,
   which is a 200 with an empty body rather than a build failure. This only
   surfaced when routes stopped borrowing a master entry's flag. */
const [BOX_S, BOX_W, BOX_N, BOX_E] =
  JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/city.json'), 'utf8')).box;
const outsideBox = (lat, lon) => (
  Number.isFinite(lat) && Number.isFinite(lon)
  && (lat < BOX_S || lat > BOX_N || lon < BOX_W || lon > BOX_E) ? 1 : 0
);

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

function csvEscape(s) {
  const t = String(s ?? '');
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/* The file carries running, cycling and athletics-track rows. Honour the
   route_type column rather than filing everything as a run. */
const G_BY_TYPE = { cycle: 'cycle', track: 'track' };
const SUB_BY_G = {
  cycle: 'Cycling route',
  track: 'Athletics track / stadium loop',
  run: 'Running route / trail',
};
const MODE_BY_G = { cycle: 'Cycle', track: 'Walk / Run', run: 'Walk / Run' };

function gOf(row) {
  return G_BY_TYPE[String(row.route_type || '').trim().toLowerCase()] || 'run';
}

function tagsOf(row) {
  const base = String(row.tags || '').split('|').map((t) => t.trim()).filter(Boolean);
  const extra = ['route', gOf(row)];
  if (/loop/i.test(row.shape)) extra.push('loop');
  if (/linear/i.test(row.shape)) extra.push('point-to-point');
  if (row.surface) extra.push(String(row.surface).toLowerCase().replace(/\s+/g, '-'));
  if (row.heat_rank) extra.push(`heat-${row.heat_rank}`);
  return [...new Set([...base, ...extra])];
}

function isLoop(shape) {
  return /^loop$/i.test(String(shape || '').trim());
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

const sameSpot = (a, b) => Array.isArray(a) && Array.isArray(b)
  && Math.abs(a[0] - b[0]) < 1e-5 && Math.abs(a[1] - b[1]) < 1e-5;

const csv = parseCsv(fs.readFileSync(CSV, 'utf8'));
const geo = JSON.parse(fs.readFileSync(GEO, 'utf8'));
const byRouteId = new Map(geo.features.map((f) => [f.properties.route_id, f]));
const entries = JSON.parse(fs.readFileSync(ENTRIES, 'utf8'));
const routes = JSON.parse(fs.readFileSync(ROUTES, 'utf8'));
const byId = new Map(entries.map((e) => [e.id, e]));
const routesById = new Map(routes.features.map((f) => [f.properties?.id || f.id, f]));

/* Area → corporation from existing pins, for road rows with a blank corporation. */
const areaRg = new Map();
for (const e of entries) {
  if (e.a && e.rg && CORP.has(e.rg) && !areaRg.has(e.a)) areaRg.set(e.a, e.rg);
}

const tally = { created: 0, updated: 0, keptLines: 0, provisional: 0, pinOnly: 0 };
const touchIds = new Set();
const queue = [];

for (const row of csv) {
  const routeId = row.route_id?.trim();
  if (!routeId) continue;
  const master = (row.master_id || '').trim();
  const id = master || routeId;
  touchIds.add(id);

  const feat = byRouteId.get(routeId);
  const geom = feat?.geometry;
  const lat = +(row.lat || (geom?.type === 'Point' ? geom.coordinates[1] : geom?.coordinates?.[0]?.[1]));
  const lon = +(row.lon || (geom?.type === 'Point' ? geom.coordinates[0] : geom?.coordinates?.[0]?.[0]));
  const loop = isLoop(row.shape);
  const km = parseFloat(row.distance_km);
  const rg = CORP.has(row.corporation) ? row.corporation : (areaRg.get(row.area) || '');
  const name = (row.display_name || row.name || '').trim();
  const g = gOf(row);
  const existing = byId.get(id);

  const next = {
    ...(existing || {}),
    id,
    n: name || existing?.n || routeId,
    c: 'Activities',
    g,
    s: existing?.s || SUB_BY_G[g],
    a: (row.area || existing?.a || '').trim() || 'Bengaluru',
    raw: (row.area || existing?.raw || '').trim() || 'Bengaluru',
    ad: existing?.ad || '',
    lat: Number.isFinite(lat) ? lat : existing?.lat,
    lon: Number.isFinite(lon) ? lon : existing?.lon,
    rg: rg || existing?.rg || '',
    gm: existing?.gm || '',
    w: existing?.w || '',
    ig: existing?.ig || '',
    d: (row.description || '').trim() || existing?.d || '',
    p: (row.price || '').trim() || existing?.p || 'Free',
    b: existing?.b || '',
    t: (row.timings || '').trim() || existing?.t || '',
    tg: tagsOf(row),
    src: (row.source || '').trim() || existing?.src || SOURCE,
    v: (row.verified || '').trim() || existing?.v || 'Needs check',
    out: outsideBox(lat, lon) || existing?.out || 0,
  };
  if (Number.isFinite(km) && km > 0) next.route_km = km;
  if (row.surface) next.surface = row.surface.trim();
  if (row.shape) next.route_type = row.shape.trim();
  if (row.route_id) next.route_id = row.route_id;
  if (!existing) tally.created++;
  else tally.updated++;
  byId.set(id, next);

  /* Geometry: keep a good existing line; else provisional from LineString endpoints. */
  const existingLine = routesById.get(id);
  const keep = existingLine?.geometry?.type === 'LineString'
    && !existingLine.properties?.provisional
    && Array.isArray(existingLine.geometry.coordinates)
    && existingLine.geometry.coordinates.length >= 3;

  let start = [lat, lon];
  let end = [lat, lon];
  if (geom?.type === 'LineString' && geom.coordinates?.length >= 2) {
    const a = geom.coordinates[0];
    const b = geom.coordinates[geom.coordinates.length - 1];
    start = [a[1], a[0]];
    end = [b[1], b[0]];
  }

  const props = {
    id,
    name: next.n,
    area: next.a,
    g,
    km: Number.isFinite(km) && km > 0 ? km : undefined,
    loop,
    geom_type: loop ? 'loop' : 'point-to-point',
    start,
    end,
    mode: MODE_BY_G[g],
    route_id: routeId,
  };

  if (keep) {
    tally.keptLines++;
    routesById.set(id, {
      ...existingLine,
      properties: {
        ...existingLine.properties,
        ...props,
        km: props.km ?? existingLine.properties.km,
      },
    });
    continue;
  }

  if (geom?.type === 'LineString' && geom.coordinates?.length >= 2) {
    const line = geom.coordinates.map((c) => [c[0], c[1]]);
    const est = +(lengthKm(line).toFixed(2));
    tally.provisional++;
    routesById.set(id, {
      type: 'Feature',
      id,
      properties: {
        ...props,
        km: props.km || est,
        source: `${SOURCE}:endpoints`,
        provisional: true,
        geometry_precision: feat.properties?.geometry_precision || 'endpoint-estimate',
      },
      geometry: { type: 'LineString', coordinates: line },
    });
    queue.push({
      id,
      n: next.n,
      mode: MODE_BY_G[g],
      route_type: loop ? 'Loop' : 'Point to point',
      a: next.a,
      rg: next.rg,
      dist_km: props.km || est || '',
      start_lat: start[0],
      start_lon: start[1],
      end_lat: end[0],
      end_lon: end[1],
      waypoints: '',
      d: next.d,
      tg: (next.tg || []).join('|'),
      geom_status: 'Start and end fixed; line to be snapped to OSM path',
      v: next.v,
    });
    continue;
  }

  /* Point-only loop with no line yet: queue for Overpass ring snap. */
  if (loop && Number.isFinite(lat) && Number.isFinite(lon)) {
    tally.pinOnly++;
    queue.push({
      id,
      n: next.n,
      mode: MODE_BY_G[g],
      route_type: 'Loop',
      a: next.a,
      rg: next.rg,
      dist_km: Number.isFinite(km) ? km : '',
      start_lat: lat,
      start_lon: lon,
      end_lat: lat,
      end_lon: lon,
      waypoints: '',
      d: next.d,
      tg: (next.tg || []).join('|'),
      geom_status: 'Start fixed; loop to be snapped to OSM footways',
      v: next.v,
    });
    continue;
  }

  tally.pinOnly++;
}

/* Merge entries: refresh touched ids, keep everything else. */
const mergedEntries = entries.map((e) => byId.get(e.id) || e);
for (const id of touchIds) {
  if (!entries.some((e) => e.id === id)) mergedEntries.push(byId.get(id));
}

/* Merge route features: drop provisional RT/master lines we are replacing; keep others. */
const keepFeatures = routes.features.filter((f) => {
  const id = f.properties?.id || f.id;
  return !touchIds.has(id);
});
const newFeatures = [...routesById.values()].filter((f) => touchIds.has(f.properties?.id || f.id));
routes.features = [...keepFeatures, ...newFeatures];

fs.writeFileSync(ENTRIES, `${JSON.stringify(mergedEntries, null, 2)}\n`);
fs.writeFileSync(ROUTES, `${JSON.stringify(routes, null, 2)}\n`);

const qHeader = [
  'id', 'n', 'mode', 'route_type', 'parent_id', 'c', 's', 'a', 'rg', 'dist_km', 'dist_source',
  'surface', 'gradient', 'level', 'start_n', 'start_lat', 'start_lon', 'end_n', 'end_lat', 'end_lon',
  'waypoints', 'water', 'toilets', 'shade', 'post_run', 'b', 'hours', 'd', 't', 'tg', 'geom_status', 'v', 'notes',
];
const qRows = queue.map((r) => qHeader.map((h) => {
  const v = {
    ...r,
    parent_id: '',
    c: 'Routes',
    s: 'Running route / trail',
    dist_source: '',
    surface: '',
    gradient: '',
    level: '',
    start_n: '',
    end_n: '',
    water: '',
    toilets: '',
    shade: '',
    post_run: '',
    b: 'Free',
    hours: '',
    t: '',
    notes: 'sources/routes running-routes ingest',
  }[h];
  return csvEscape(v ?? '');
}).join(','));
fs.writeFileSync(QUEUE, `${qHeader.join(',')}\n${qRows.join('\n')}\n`);

console.log(`Ingested ${csv.length} running routes from ${path.relative(ROOT, DIR)}`);
console.log(`  entries: ${tally.created} created, ${tally.updated} updated → ${mergedEntries.length} total`);
console.log(`  lines: ${tally.keptLines} kept snapped, ${tally.provisional} provisional, ${tally.pinOnly} pin-only / queued`);
console.log(`  snap queue: ${queue.length} → ${path.relative(ROOT, QUEUE)}`);
console.log(`  next: node scripts/snap-routes.mjs ${path.relative(ROOT, QUEUE)}`);
