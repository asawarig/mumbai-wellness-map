#!/usr/bin/env node
/**
 * Walking routes for the curated days (src/data/themed-days.json).
 *
 * Each day's stops are walked in order on OSRM's foot profile, run by FOSSGIS
 * at routing.openstreetmap.de, and the answer is kept in
 * src/data/themed-day-routes.json: the street path to draw between the stops,
 * the distance, the walking time and an estimate of the calories walked.
 * It runs here, once, so a visitor's browser never asks a router anything.
 *
 * Calories: walking at an easy pace is about 3.5 METs, and a MET is about
 * 1 kcal per kg per hour, so a 70 kg adult burns 3.5 × 70 = 245 kcal an
 * hour walking. Only the walking between stops counts — the climb, the class
 * or the swim at the first stop is not something a router can know.
 *
 * A leg longer than WALK_MAX_KM is not a walk anyone takes between a climb and
 * lunch: it is routed for a car instead (an auto or a cab), marked as a ride,
 * timed as one, and left out of the calories.
 *
 *   npm run build   # map.json must exist: stops are looked up in it
 *   node scripts/themed-day-routes.mjs
 *   node scripts/themed-day-routes.mjs "Market morning"   # just that day;
 *                                                          # the rest are kept
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DAYS = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/themed-days.json'), 'utf8'));
const MAP = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist/client/data/map.json'), 'utf8'));
const OUT = path.join(ROOT, 'src/data/themed-day-routes.json');
const ROUTER = 'https://routing.openstreetmap.de/routed-foot/route/v1/driving';
const RIDE = 'https://routing.openstreetmap.de/routed-car/route/v1/driving';
const WALK_MAX_KM = 2;
const KCAL_PER_HOUR = 3.5 * 70;

const byId = new Map(MAP.db.entries.map((r) => [r.id, r]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (x, n) => Number(x.toFixed(n));

async function route(base, pts) {
  const url = `${base}/${pts.map((r) => `${r.lon},${r.lat}`).join(';')}?overview=full&geometries=geojson&steps=false`;
  const res = await fetch(url, { headers: { 'User-Agent': 'bengaluru-wellness-map (build script)' } });
  const body = await res.json();
  /* The FOSSGIS servers ask for no more than one request a second. */
  await sleep(1100);
  return body.code === 'Ok' ? body.routes[0] : null;
}

/* A day's title on the command line reroutes that day alone and keeps the
   others as they are in the file. */
const ONLY = process.argv[2];
const out = ONLY && fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
for (const day of DAYS) {
  if (ONLY && day.title !== ONLY) continue;
  const stops = day.stops.map((id) => byId.get(id)).filter((r) => r?.lat != null);
  const legs = [];
  let pathPts = [];
  for (let i = 1; i < stops.length; i++) {
    let r = await route(ROUTER, [stops[i - 1], stops[i]]);
    if (!r) { console.warn(`skip a leg of ${day.title}`); continue; }
    let mode = 'walk';
    if (r.distance / 1000 > WALK_MAX_KM) {
      const ride = await route(RIDE, [stops[i - 1], stops[i]]);
      if (ride) { r = ride; mode = 'ride'; }
    }
    legs.push({ mode, km: round(r.distance / 1000, 2), min: Math.max(1, Math.round(r.duration / 60)) });
    const pts = r.geometry.coordinates.map(([x, y]) => [round(x, 5), round(y, 5)]);
    pathPts = pathPts.concat(pathPts.length ? pts.slice(1) : pts);
  }
  if (!legs.length) continue;
  const walk = legs.filter((l) => l.mode === 'walk');
  const walkMin = walk.reduce((a, l) => a + l.min, 0);
  out[day.title] = {
    walkKm: round(walk.reduce((a, l) => a + l.km, 0), 2),
    walkMin,
    rideMin: legs.filter((l) => l.mode === 'ride').reduce((a, l) => a + l.min, 0),
    kcal: Math.round((KCAL_PER_HOUR * walkMin) / 60),
    legs,
    path: pathPts,
  };
  const o = out[day.title];
  console.log(`${day.title.padEnd(26)} walk ${o.walkKm} km ${o.walkMin} min ${o.kcal} kcal${o.rideMin ? `  + ride ${o.rideMin} min` : ''}`);
}
fs.writeFileSync(OUT, JSON.stringify(out) + '\n');
console.log(`wrote ${Object.keys(out).length} of ${DAYS.length} to ${path.relative(ROOT, OUT)}`);
