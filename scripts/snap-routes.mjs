#!/usr/bin/env node
/**
 * Snap BLR-RT-* geometries to the path/road network.
 *
 * Lake / park loops  → Overpass footways near the start, stitched into a ring
 * Point-to-point     → public OSRM (foot or bike)
 *
 * Runs after scripts/ingest-routes.mjs, on the routes that do not have a
 * snapped line yet (or all of them with --all). Rows on hold are skipped, and a
 * route that still cannot be drawn is left as a pin with no line.
 *
 *   node scripts/snap-routes.mjs [sources/routes/wellness-map-routes-v2.csv] [--all]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CSV = path.resolve(ROOT, process.argv.slice(2).find((a) => !a.startsWith('--')) || 'sources/routes/wellness-map-routes-v2.csv');
/* Without --all, only routes with no snapped line yet are touched. */
const ALL = process.argv.includes('--all');
const ROUTES = path.join(ROOT, 'src/data/routes.json');
const CACHE = path.join(ROOT, '.cache/snap-routes');
const OSRM = 'https://router.project-osrm.org';
fs.mkdirSync(CACHE, { recursive: true });
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Overpass's public instances rate-limit by IP: exceed your slots and they
   answer 504 until one frees, which takes tens of seconds, not two. The old
   version tried each endpoint once with a 2 s pause and then gave up on the
   route for the whole run — so the first route to trip the limiter took every
   route after it down with it. A full queue would fail end to end and cache
   nothing, which is exactly how one run burned eight minutes to produce no
   geometry at all.

   So: back off properly, and long enough to matter. The queries themselves are
   cheap (1-3 s each when a slot is free) — waiting is the whole job. */
const BACKOFF_MS = [5000, 15000, 45000];

async function overpass(query, key) {
  return cachedJson(`op_${key}`, async () => {
    let lastErr;
    for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
      for (const endpoint of OVERPASS_ENDPOINTS) {
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            body: `data=${encodeURIComponent(query)}`,
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': 'bangalorehealthmap/1.0 (route snap; local build)',
              Accept: 'application/json',
            },
          });
          if (res.ok) {
            await sleep(1500);
            return res.json();
          }
          lastErr = new Error(`Overpass ${res.status}: ${(await res.text()).slice(0, 80)}`);
          /* 429 and 504 are "come back later". Anything else is the query. */
          if (res.status !== 429 && res.status !== 504) throw lastErr;
        } catch (e) {
          lastErr = e;
        }
        await sleep(2000);
      }
      const wait = BACKOFF_MS[attempt];
      if (wait) {
        console.log(`    rate-limited, waiting ${wait / 1000}s`);
        await sleep(wait);
      }
    }
    throw lastErr || new Error('Overpass failed');
  });
}

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

function haversine(a, b) {
  const R = 6371008.8;
  const toR = Math.PI / 180;
  const [lon1, lat1] = a, [lon2, lat2] = b;
  const p1 = lat1 * toR, p2 = lat2 * toR;
  const dp = (lat2 - lat1) * toR, dl = (lon2 - lon1) * toR;
  const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function lengthM(coords) {
  let d = 0;
  for (let i = 0; i < coords.length - 1; i++) d += haversine(coords[i], coords[i + 1]);
  return d;
}

function closeLoop(coords) {
  if (!coords.length) return coords;
  const a = coords[0], b = coords[coords.length - 1];
  if (a[0] !== b[0] || a[1] !== b[1]) return [...coords, [...a]];
  return coords;
}

function orientToStart(coords, start) {
  const ring = coords[0][0] === coords[coords.length - 1][0]
    && coords[0][1] === coords[coords.length - 1][1]
    ? coords.slice(0, -1)
    : coords.slice();
  if (ring.length < 3) return closeLoop(ring);
  let best = 0, bestD = Infinity;
  ring.forEach((c, i) => {
    const d = haversine(c, start);
    if (d < bestD) { bestD = d; best = i; }
  });
  return closeLoop([...ring.slice(best), ...ring.slice(0, best)]);
}

function simplify(coords, tol = 6) {
  if (coords.length < 3) return coords;
  let dmax = 0, idx = 0;
  const a = coords[0], b = coords[coords.length - 1];
  for (let i = 1; i < coords.length - 1; i++) {
    const d = perpM(coords[i], a, b);
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax <= tol) return [a, b];
  const left = simplify(coords.slice(0, idx + 1), tol);
  const right = simplify(coords.slice(idx), tol);
  return left.slice(0, -1).concat(right);
}

function perpM(pt, a, b) {
  const scale = Math.cos(pt[1] * Math.PI / 180) * 111320;
  const px = pt[0] * scale, py = pt[1] * 110540;
  const ax = a[0] * scale, ay = a[1] * 110540;
  const bx = b[0] * scale, by = b[1] * 110540;
  const dx = bx - ax, dy = by - ay;
  if (!dx && !dy) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

async function cachedJson(key, fetcher) {
  const p = path.join(CACHE, `${key.replace(/[^\w.-]+/g, '_').slice(0, 120)}.json`);
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  const data = await fetcher();
  fs.writeFileSync(p, JSON.stringify(data));
  return data;
}

function stitch(segments, tol = 30, keepSeed = false) {
  const segs = segments.map((s) => s.slice()).filter((s) => s.length > 1);
  if (!segs.length) return null;
  if (!keepSeed) segs.sort((a, b) => lengthM(b) - lengthM(a));
  let line = segs.shift();
  let changed = true;
  while (segs.length && changed) {
    changed = false;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      for (const cand of [s, [...s].reverse()]) {
        if (haversine(line[line.length - 1], cand[0]) < tol) {
          line = line.concat(cand.slice(1));
          segs.splice(i, 1);
          changed = true;
          break;
        }
        if (haversine(line[0], cand[cand.length - 1]) < tol) {
          line = cand.slice(0, -1).concat(line);
          segs.splice(i, 1);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }
  return line;
}

const PATHS = 'footway|path|cycleway|pedestrian|track';

/* The closed water ring nearest the start, not the largest one in range.
   Picking the largest is how a gate on a small kere ends up ringing whatever
   bigger lake happened to fall inside the search radius. */
async function waterRingNear(lat, lon, radius) {
  const q = `
  [out:json][timeout:90];
  (
    way(around:${radius},${lat},${lon})["natural"="water"];
    relation(around:${radius},${lat},${lon})["natural"="water"];
    way(around:${radius},${lat},${lon})["landuse"="reservoir"];
  );
  out geom;
  `;
  const data = await overpass(q, `water_${lat.toFixed(4)}_${lon.toFixed(4)}_${radius}`);
  const start = [lon, lat];
  let best = null;
  let bestD = Infinity;
  for (const el of data.elements || []) {
    const rings = [];
    if (el.type === 'way' && el.geometry?.length > 10) {
      rings.push(el.geometry.map((g) => [g.lon, g.lat]));
    } else if (el.members) {
      const outer = [];
      for (const m of el.members) {
        if ((m.role === 'outer' || !m.role) && m.geometry?.length) {
          outer.push(...m.geometry.map((g) => [g.lon, g.lat]));
        }
      }
      if (outer.length > 10) rings.push(outer);
    }
    for (const ring of rings) {
      const closed = closeLoop(ring);
      const perim = lengthM(closed);
      if (perim < 300 || perim > 20000) continue;
      const d = Math.min(...closed.map((c) => haversine(c, start)));
      if (d < bestD) { bestD = d; best = closed; }
    }
  }
  return best;
}

/* The same idea as waterRingNear, for a walled garden instead of a lake. A
   park's circuit is its perimeter, and where the internal roads will not
   stitch into a ring, the wall is the shape people actually run. */
async function parkRingNear(lat, lon, radius) {
  const q = `
  [out:json][timeout:90];
  (
    way(around:${radius},${lat},${lon})["leisure"~"park|garden"];
    relation(around:${radius},${lat},${lon})["leisure"~"park|garden"];
  );
  out geom;
  `;
  const data = await overpass(q, `park_${lat.toFixed(4)}_${lon.toFixed(4)}_${radius}`);
  const start = [lon, lat];
  let best = null;
  let bestD = Infinity;
  for (const el of data.elements || []) {
    const rings = [];
    if (el.type === 'way' && el.geometry?.length > 10) {
      rings.push(el.geometry.map((g) => [g.lon, g.lat]));
    } else if (el.members) {
      const outer = [];
      for (const m of el.members) {
        if ((m.role === 'outer' || !m.role) && m.geometry?.length) {
          outer.push(...m.geometry.map((g) => [g.lon, g.lat]));
        }
      }
      if (outer.length > 10) rings.push(outer);
    }
    for (const ring of rings) {
      const closed = closeLoop(ring);
      const perim = lengthM(closed);
      if (perim < 300 || perim > 20000) continue;
      const d = Math.min(...closed.map((c) => haversine(c, start)));
      if (d < bestD) { bestD = d; best = closed; }
    }
  }
  return best;
}

async function waysNear(query, key) {
  const data = await overpass(query, key);
  return (data.elements || [])
    .map((el) => (el.geometry || []).map((g) => [g.lon, g.lat]))
    .filter((seg) => seg.length > 1);
}

/* Paths inside a corridor of the shoreline — Overpass takes a polyline for
   `around`, so this asks for the promenade itself rather than every footway
   within half a kilometre of the gate. */
function pathsAlong(ring, corridor) {
  const pts = sampleRing(ring, 30).map(([o, a]) => `${a.toFixed(5)},${o.toFixed(5)}`).join(',');
  const q = `
  [out:json][timeout:120];
  way(around:${corridor},${pts})["highway"~"${PATHS}"];
  out geom;
  `;
  return waysNear(q, `along_${ring[0][1].toFixed(4)}_${ring[0][0].toFixed(4)}_${corridor}`);
}

function pathsAround(lat, lon, radius, types = PATHS) {
  const q = `
  [out:json][timeout:90];
  way(around:${radius},${lat},${lon})["highway"~"${types}"];
  out geom;
  `;
  return waysNear(q, `fw_${lat.toFixed(4)}_${lon.toFixed(4)}_${radius}_${types.length}`);
}

/* stitch() returns an open line and closeLoop joins its ends with a straight
   segment. Across a lake that segment is a line through the water, so a line
   whose ends are far apart is not a ring and must not be published as one. */
/* A loop is entered where its pin is. waterRingNear picks the *nearest* ring in
   range, but nearest is not near: it ringed a lake 653 m from the gate of BDA
   Sculpture Park, and drew Defence Colony's street grid — which has no water at
   all — as a ring 574 m away. orientToStart then rotates the result to its
   closest vertex, which makes a trace of somewhere else look deliberate.

   The distance guard cannot catch this, because the rows it happens to are the
   rows the sheet states no distance for. Anchoring is the check that does not
   need one: every trace the sheet could vouch for came back within 103 m of its
   start, so a ring a quarter-kilometre away is a different place. */
const ANCHOR_M = 250;

function touchesStart(coords, start) {
  return coords.some((c) => haversine(c, start) <= ANCHOR_M);
}

/* Growing one ring from the longest segment finds a real ring that is often not
   the one at the place: inside a 450 m search the longest path can lie entirely
   on the far side of it. All five refusals traced to exactly that — a
   perfectly good ring 311-422 m from the gate it was supposed to start at.

   So every segment near the gate is tried as a seed, and the ring is chosen on
   evidence: nearest the stated distance where the sheet has one, and otherwise
   only where it hugs the gate and closes cleanly. Where nothing clears that bar
   the route keeps its placeholder — with no stated distance there is nothing to
   check a guess against, and the best-scoring candidate for a 200 m football
   ground was a 3.6 km ring of the surrounding streets. */
function ringFromSegments(segments, start, plausible, expectKm, source) {
  const pool = (segments || []).filter((s) => s.length > 1);
  const nearest = (coords) => Math.min(...coords.map((c) => haversine(c, start)));
  const seeds = pool
    .map((s, i) => [nearest(s), i])
    .filter(([d]) => d <= ANCHOR_M)
    .sort((a, b) => a[0] - b[0]);

  const cands = [];
  for (const [, i] of seeds) {
    const line = stitch([pool[i], ...pool.filter((_, j) => j !== i)], 30, true);
    if (!line || line.length < 3) continue;
    const gap = haversine(line[0], line[line.length - 1]);
    const len = lengthM(line);
    if (gap > Math.min(300, len * 0.25)) continue;
    if (!plausible(len + gap)) continue;
    const anchor = nearest(line);
    if (anchor > ANCHOR_M) continue;
    cands.push({ line, km: (len + gap) / 1000, gap, anchor });
  }
  if (!cands.length) return null;

  let pick;
  if (expectKm) {
    pick = cands.reduce((a, b) => (Math.abs(a.km - expectKm) <= Math.abs(b.km - expectKm) ? a : b));
  } else {
    const tight = cands.filter((c) => c.anchor <= 60 && c.gap <= 40);
    if (!tight.length) return null;
    pick = tight.reduce((a, b) => (a.anchor <= b.anchor ? a : b));
  }
  return { coords: simplify(orientToStart(closeLoop(pick.line), start), 5), source };
}

/** Prefer a closed ring of paths that hugs the lake.
 *
 * This used to sample twelve points off the water ring and ask OSRM to walk
 * between them. OSRM routes the *network*: where a shore has no mapped
 * promenade it goes out to the nearest road and back, so every trace it
 * produced with a known distance came back 2.7x to 5.6x too long — Chelekere's
 * 1.2 km loop as 5.46 km, Begur's 4 km as 11.73 km. Routing is the wrong tool
 * for "the path around this lake": the path is something OSM either has or does
 * not have. Ask for it directly, and when it is missing say so by falling back
 * to the shoreline rather than inventing a route.
 */
async function loopFromFootways(lat, lon, { radius = 700, expectKm = 0, park = false } = {}) {
  const start = [lon, lat];
  /* A park loop does not go looking for water. Lalbagh has a tank in one
     corner, and ringing it produced a closed, plausible-looking 3.07 km line
     for a 4 km circuit — the right shape around the wrong thing, and plausible
     enough to win before the footway stitching below was ever reached. When
     the sheet says the loop is a park, the paths are the only answer. */
  const ring = park ? null : await waterRingNear(lat, lon, radius);
  const perimKm = ring ? lengthM(ring) / 1000 : 0;

  /* A candidate is only accepted at the length the sheet states, or — with no
     stated distance — within reach of the shoreline it is meant to follow. */
  const plausible = (metres) => {
    const km = metres / 1000;
    if (expectKm) return km >= expectKm * 0.6 && km <= expectKm * 1.6;
    if (perimKm) return km >= perimKm * 0.7 && km <= perimKm * 2;
    /* No stated distance and no lake to measure against. The floor used to be
       0.8 km, which is longer than plenty of real loops — RT-010's football
       ground is a 200 m perimeter and was refused for being itself. Closure,
       the gap check and touchesStart are what reject junk here; length only has
       to rule out a stray fragment of pavement. */
    return km >= 0.12 && km <= 12;
  };

  if (ring) {
    /* Widen the corridor until a ring closes: a lakeside path can be set back
       from the water by a bund, a fence line or a road. */
    for (const corridor of [40, 80, 150]) {
      const hit = ringFromSegments(
        await pathsAlong(ring, corridor),
        start, plausible, expectKm, `overpass:lakeside-paths@${corridor}m`,
      );
      if (hit) return hit;
    }
    /* No mapped path. The shoreline is the right shape and is labelled as a
       shoreline, which is honest in a way a routed detour was not. */
    if (plausible(lengthM(ring)) && touchesStart(ring, start)) {
      return { coords: simplify(orientToStart(ring, start), 8), source: 'overpass:water-ring' };
    }
  }

  /* Not a lake — a park. Stitch the paths around the gate.
     450 m is right for a pocket park entered from its middle, and far too
     short for one entered from a corner: Lalbagh's west gate is 1.2 km from
     the far side of its own circuit, so the search never saw the half of the
     park the route runs through. A park loop gets a radius that can reach
     across it; everything else keeps the tighter net. */
  const reach = park ? Math.max(radius, 1300) : Math.min(radius, 450);
  /* A big park's circuit is its internal ring road, which OSM tags service,
     not footway — Lalbagh's is, and on footways alone no ring closed at all.
     Cars are not the point: these are drives inside a walled garden, and they
     are what people run. Only the park branch asks for them. */
  const types = park ? `${PATHS}|service|unclassified|residential` : PATHS;
  const stitched = ringFromSegments(
    await pathsAround(lat, lon, reach, types),
    start, plausible, expectKm, 'overpass:footways-stitched',
  );
  if (stitched || !park) return stitched;

  /* Lalbagh's drives are mapped, and they still would not stitch into a ring —
     the gates, the glasshouse forecourt and the lake path break it in enough
     places that no closed line comes out. The park's own boundary does close,
     at 4.24 km against the 4.0 the sheet states, and it is the shape of the
     circuit because the circuit runs the wall. Labelled for what it is, the
     way the shoreline fallback above is. */
  const wall = await parkRingNear(lat, lon, reach);
  if (wall && plausible(lengthM(wall)) && touchesStart(wall, start)) {
    return { coords: simplify(orientToStart(wall, start), 8), source: 'overpass:park-perimeter' };
  }
  return null;
}

function sampleRing(coords, n) {
  const ring = coords[0][0] === coords[coords.length - 1][0]
    ? coords.slice(0, -1)
    : coords.slice();
  const total = lengthM(closeLoop(ring));
  const step = total / n;
  const out = [ring[0]];
  let acc = 0;
  let target = step;
  for (let i = 0; i < ring.length - 1; i++) {
    const seg = haversine(ring[i], ring[i + 1]);
    while (acc + seg >= target && out.length < n) {
      const t = (target - acc) / seg;
      out.push([
        ring[i][0] + (ring[i + 1][0] - ring[i][0]) * t,
        ring[i][1] + (ring[i + 1][1] - ring[i][1]) * t,
      ]);
      target += step;
    }
    acc += seg;
  }
  return out;
}

async function osrmRoute(profile, points) {
  /* points: [lon,lat][] */
  const uniq = points.filter((p, i) => i === 0 || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);
  if (uniq.length < 2) return null;
  const pathCoords = uniq.map((p) => `${p[0]},${p[1]}`).join(';');
  const url = `${OSRM}/route/v1/${profile}/${pathCoords}?overview=full&geometries=geojson&continue_straight=true`;
  const key = `osrm_${profile}_${pathCoords}`.slice(0, 140);
  const data = await cachedJson(key, async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    await new Promise((r) => setTimeout(r, 400));
    return res.json();
  });
  if (data.code !== 'Ok' || !data.routes?.[0]) return null;
  return {
    coords: simplify(data.routes[0].geometry.coordinates, 5),
    metres: data.routes[0].distance,
    source: `osrm:${profile}`,
  };
}

/** Out-and-back along a parent loop (e.g. Sankey) between start and a far point. */
function outAndBackFromLoop(loopCoords, start, end) {
  const ring = loopCoords[0][0] === loopCoords[loopCoords.length - 1][0]
    ? loopCoords.slice(0, -1)
    : loopCoords.slice();
  const i0 = ring.reduce((bi, c, i) => (haversine(c, start) < haversine(ring[bi], start) ? i : bi), 0);
  const i1 = ring.reduce((bi, c, i) => (haversine(c, end) < haversine(ring[bi], end) ? i : bi), 0);
  if (i0 === i1) return null;
  const forward = i0 < i1 ? ring.slice(i0, i1 + 1) : ring.slice(i1, i0 + 1).reverse();
  const back = [...forward].reverse();
  return simplify(forward.concat(back.slice(1)), 5);
}

async function main() {
  const csv = parseCsv(fs.readFileSync(CSV, 'utf8'));
  const routes = JSON.parse(fs.readFileSync(ROUTES, 'utf8'));
  const byId = new Map(routes.features.map((f) => [f.properties.id, f]));

  /* Known good lake/park rings already in the map. */
  const sankey = byId.get('BLR-156');
  const cubbon = byId.get('BLR-001');

  for (const row of csv) {
    const id = row.id.trim();
    if (!id) continue;
    if (/^hold\b/i.test(row.geom_status || '')) {
      console.log(`\n${id} ${row.n}: on hold, no line`);
      continue;
    }
    let feat = byId.get(id);
    if (feat && !feat.properties.provisional && !ALL) continue;
    if (!feat) {
      /* A route the ingest could not draw yet: a loop with no waypoints. */
      const isLoop = /loop/i.test(row.route_type);
      feat = {
        type: 'Feature',
        id,
        properties: {
          id,
          name: row.n.trim(),
          area: (row.a || '').trim(),
          g: /cycle/i.test(row.mode) ? 'cycle' : 'run',
          km: parseFloat(row.dist_km) || 0,
          loop: isLoop,
          geom_type: isLoop ? 'loop' : /out and back/i.test(row.route_type) ? 'out-and-back' : 'point-to-point',
          start: [+row.start_lat, +row.start_lon],
          end: [+row.end_lat, +row.end_lon],
          mode: row.mode,
          provisional: true,
        },
        geometry: null,
      };
      routes.features.push(feat);
      byId.set(id, feat);
    }
    const start = [+row.start_lon, +row.start_lat];
    const end = [+row.end_lon, +row.end_lat];
    const wps = parseWaypoints(row.waypoints);
    const loop = /loop/i.test(row.route_type);
    const cycle = /cycle/i.test(row.mode);
    const expectKm = parseFloat(row.dist_km) || 0;
    const profile = cycle ? 'bike' : 'foot';
    let result = null;

    console.log(`\n${id} ${row.n}`);

    try {
      if (id === 'BLR-RT-04' && sankey) {
        const oab = outAndBackFromLoop(sankey.geometry.coordinates, start, wps[0] || end);
        if (oab) result = { coords: oab, source: 'reuse:BLR-156-out-and-back' };
      }
      if (id === 'BLR-RT-01' || id === 'BLR-RT-08' || id === 'BLR-RT-03') {
        result = await loopFromFootways(+row.start_lat, +row.start_lon, { radius: 750, expectKm });
        if (result) result.coords = orientToStart(result.coords, start);
      }
      if (id === 'BLR-RT-04' && !result) {
        result = await loopFromFootways(+row.start_lat, +row.start_lon, { radius: 500, expectKm });
      }
      /* The Cubbon Park circuit runs the same internal roads as the park's own loop. */
      if (id === 'BLR-RT-14' && cubbon) {
        result = { coords: orientToStart(cubbon.geometry.coordinates, start), source: 'reuse:BLR-001' };
      }
      /* A lake or park loop given only its gate: ring the water, or stitch the footways. */
      if (!result && loop && !wps.length) {
        result = await loopFromFootways(+row.start_lat, +row.start_lon, {
          radius: 700, expectKm, park: /park loop/i.test(row.s || ''),
        });
      }

      if (!result) {
        const pts = [start, ...wps, end];
        if (loop && (pts[0][0] !== pts[pts.length - 1][0] || pts[0][1] !== pts[pts.length - 1][1])) {
          pts.push([...start]);
        }
        /* For long rides, OSRM through all waypoints; for short, same. */
        result = await osrmRoute(profile, pts);
        /* Foot fallback if bike fails */
        if (!result && cycle) result = await osrmRoute('foot', pts);
      }
    } catch (err) {
      console.warn('  error', err.message);
    }

    if (!result?.coords?.length) {
      console.warn('  KEEP provisional straight line');
      continue;
    }

    const km = +(lengthM(result.coords) / 1000).toFixed(2);
    /* The last line of defence, and the one that was missing: a trace is only
       published at a length the sheet does not contradict. Every strategy is
       checked, not just the lake one — a route drawn at four times its stated
       distance is worse than a route with no line at all, because the card goes
       on quoting the honest number beside it. */
    if (expectKm && (km > expectKm * 1.6 || km < expectKm * 0.5)) {
      console.warn(`  REJECT ${result.source}  ~${km} km against a stated ${expectKm} km — keeping the straight line`);
      continue;
    }
    feat.geometry = { type: 'LineString', coordinates: result.coords };
    feat.properties = {
      ...feat.properties,
      km: parseFloat(row.dist_km) || km,
      snapped_km: km,
      source: result.source,
      provisional: false,
    };
    console.log(`  ok ${result.source}  ${result.coords.length} pts  ~${km} km`);
  }

  /* A route that still has nothing to draw stays a pin. */
  routes.features = routes.features.filter((f) => f.geometry?.coordinates?.length >= 2);
  fs.writeFileSync(ROUTES, `${JSON.stringify(routes, null, 2)}\n`);
  console.log('\nWrote', ROUTES, `(${routes.features.length} lines)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
