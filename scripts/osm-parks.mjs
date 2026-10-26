/* Builds src/data/parks.json: Mumbai's public parks and gardens, from
 * OpenStreetMap. Bengaluru's came from the BBMP parks register; Mumbai has no
 * equivalent open register, so this takes OSM's.
 *
 *   node scripts/osm-parks.mjs
 *
 * Takes every leisure=park, leisure=garden and recreation ground (Mumbai's
 * maidans, which OSM tags as leisure= or landuse=recreation_ground; Oval and
 * Azad Maidan are the latter) inside the city (the BMC area, mask.json) that has a
 * name, is not private, and covers at least MIN_SQM. Unnamed ones are left
 * out, and so are names that only say "park" or "garden": a pin called
 * "park 1" helps nobody. So are housing-society gardens, school grounds and
 * clubs, which OSM maps the same way but which are not open to the public.
 * Each park keeps one pin, at the middle of its outline, and the same fields
 * the BBMP register gave Bengaluru's (src/lib/db.js reads them):
 *
 *   n    name (name:en where OSM has one)
 *   t    opening hours, from opening_hours
 *   a    what is in it (src/data/park-amenities.json): playgrounds, outdoor
 *        gyms, toilets, benches and drinking water mapped inside its outline
 *   sqm  its area
 *   osm  the OSM way or relation, so a wrong one can be fixed at the source
 *
 * The ward is not stored; db.js finds it from the pin.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { CITY_RELS } from './city.mjs';
import { NOT_WELLNESS } from './exclusions.mjs';

const UA = 'mumbai-wellness-map/1.0 (parks build script)';
const MIN_SQM = 500;

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Public Overpass instances turn work away when busy, so try each, twice. */
async function overpass(q) {
  const errors = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const url of OVERPASS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: 'data=' + encodeURIComponent(q),
          signal: AbortSignal.timeout(240000), // a hung mirror must not stall the run
        });
        if (res.ok) {
          const body = await res.json();
          /* An overloaded instance can answer 200 with a "runtime error" remark
             and no elements; that is a failure, not an empty city. */
          if (body.remark && /error|timed out|out of memory/i.test(body.remark)) throw new Error(body.remark.slice(0, 80));
          const els = body.elements;
          console.log(`  (${new URL(url).host} answered: ${els.length} elements)`);
          return els;
        }
        errors.push(`${new URL(url).host} ${res.status}`);
      } catch (e) {
        errors.push(`${new URL(url).host} ${e.message}`);
      }
    }
    await sleep(15000 * (attempt + 1));
  }
  throw new Error(`No Overpass instance answered: ${errors.join(', ')}`);
}

/* ---------- geometry ---------- */
function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const R = 6371008.8, RAD = Math.PI / 180;
function ringSqm(ring) {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
    s += (x2 - x1) * RAD * (2 + Math.sin(y1 * RAD) + Math.sin(y2 * RAD));
  }
  return Math.abs((s * R * R) / 2);
}
/* The middle of a ring, by area; nudged to a vertex-average point if that
   falls outside (a crescent, an L). */
function centroid(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
    const f = x1 * y2 - x2 * y1;
    a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  }
  const c = a ? [cx / (3 * a), cy / (3 * a)] : ring[0];
  if (inRing(c, ring)) return c;
  const avg = [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
  return inRing(avg, ring) ? avg : ring[Math.floor(ring.length / 2)];
}

/* Joins a relation's outer member ways end to end into closed rings. */
function closeRings(ways) {
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  const segs = ways.map((w) => w.geometry.map((p) => [p.lon, p.lat]));
  const out = [];
  while (segs.length) {
    let ring = segs.shift();
    while (!same(ring[0], ring[ring.length - 1])) {
      const end = ring[ring.length - 1];
      const i = segs.findIndex((s) => same(s[0], end) || same(s[s.length - 1], end));
      if (i < 0) return out;
      const s = segs.splice(i, 1)[0];
      ring = ring.concat((same(s[0], end) ? s : [...s].reverse()).slice(1));
    }
    out.push(ring);
  }
  return out;
}

/* ---------- fetch ---------- */
const area = `rel(id:${CITY_RELS.join(',')});map_to_area->.city;`;
console.log('Fetching parks and gardens from Overpass…');
const parksRaw = await overpass(`[out:json][timeout:180];${area}
(way["leisure"~"^(park|garden|recreation_ground)$"]["name"](area.city);
 relation["leisure"~"^(park|garden|recreation_ground)$"]["name"](area.city);
 way["landuse"="recreation_ground"]["name"](area.city);
 relation["landuse"="recreation_ground"]["name"](area.city););
out body geom;`); // body, not tags: a relation needs its members to have a shape
console.log(`  ${parksRaw.length} named parks, gardens and grounds`);

console.log('Fetching what is inside them…');
const things = await overpass(`[out:json][timeout:180];${area}
(nwr["leisure"~"^(playground|fitness_station)$"](area.city);
 node["amenity"~"^(toilets|bench|drinking_water)$"](area.city);
 node["leisure"="picnic_table"](area.city););
out center tags;`);
console.log(`  ${things.length} playgrounds, outdoor gyms, toilets, benches and taps`);

const AMENITY = (t) => (t.leisure === 'playground' ? 'play'
  : t.leisure === 'fitness_station' ? 'gym'
  : t.amenity === 'toilets' ? 'toilet'
  : t.amenity === 'bench' || t.leisure === 'picnic_table' ? 'benches'
  : t.amenity === 'drinking_water' ? 'water' : null);
const thingPts = things.map((e) => ({
  k: AMENITY(e.tags || {}),
  pt: e.type === 'node' ? [e.lon, e.lat] : e.center ? [e.center.lon, e.center.lat] : null,
})).filter((t) => t.k && t.pt);

/* The city, as mask.json cuts it: every hole in the mask is part of the city. */
const mask = JSON.parse(readFileSync(new URL('../src/data/mask.json', import.meta.url), 'utf8'));
const cityRings = mask.features[0].geometry.coordinates.slice(1);
const inCity = (pt) => cityRings.some((r) => inRing(pt, r));

/* OSM's opening_hours, said the way a person would: "Mo-Su 06:00-22:00" ->
   "Daily, 6 AM – 10 PM". Anything it cannot read is kept as mapped. */
const DAY = { mo: 'Mon', tu: 'Tue', we: 'Wed', th: 'Thu', fr: 'Fri', sa: 'Sat', su: 'Sun' };
const clock = (h, m) => {
  const hh = +h % 24, mm = m ? `:${m}` : '';
  return `${hh % 12 || 12}${mm === ':00' ? '' : mm} ${hh < 12 ? 'AM' : 'PM'}`;
};
function plainHours(raw) {
  const s = String(raw).trim();
  if (s === '24/7') return 'Open 24 hours';
  if (/^sunrise-sunset$/i.test(s)) return 'Sunrise to sunset';
  const span = (t) => t.replace(/\b(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\b/g, (_, a, b, c, d) => `${clock(a, b)} – ${clock(c, d)}`);
  const days = (t) => t
    .replace(/\bmo-su\b/i, 'Daily')
    .replace(/\b(mo|tu|we|th|fr|sa|su)-(mo|tu|we|th|fr|sa|su)\b/gi, (_, a, b) => `${DAY[a.toLowerCase()]}–${DAY[b.toLowerCase()]}`)
    .replace(/\b(mo|tu|we|th|fr|sa|su)\b/gi, (d) => DAY[d.toLowerCase()])
    .replace(/\bPH\b/, 'Holidays');
  const rules = s.split(/\s*;\s*/);
  if (!rules.every((r) => /^((mo|tu|we|th|fr|sa|su|ph)(-(mo|tu|we|th|fr|sa|su))?\s+)?\d{1,2}:\d{2}-\d{1,2}:\d{2}(\s*,\s*\d{1,2}:\d{2}-\d{1,2}:\d{2})*$|^ph off$/i.test(r))) return s;
  return rules.map((r) => (/^ph off$/i.test(r) ? 'closed on holidays'
    : days(span(r)).replace(/\s*,\s*(?=\d)/g, ' and ').replace(/^(\S+(?:–\S+)?)\s+(?=\d)/, '$1, '))).join('; ')
    .replace(/^(?=\d)/, 'Daily, ');
}

/* ---------- build ---------- */
const PRIVATE = /^(private|no|customers|permit)$/;
/* Mapped as gardens and grounds, but behind a gate. */
const NOT_PUBLIC = /\b(society|soc\.?|chs|co-?op\w*|housing|residency|residence|apartments?|towers?|complex|school|vidya|vidyalaya|college|university|academy|hostel|club|gymkhana|association|hotel|back area|compound|police|parade ground|chapel|church|convent|canossa|holy cross|st\.?|saint|aquarium|plaza|chowk|building|mmrda|jio)\b|^(back|front) ground$/i;
/* Names that say nothing but what the thing is. */
const GENERIC = /^(bmc\s+|municipal\s+)?(park|garden|udyan|play\s*ground|ground|open space|recreation ground)(\s*(no\.?\s*)?\d+)?$/i;
/* "abhinav nagar garden" -> "Abhinav Nagar Garden"; names with any capitals stay as mapped. */
const tidyName = (n) => (n === n.toLowerCase() || n === n.toUpperCase()
  ? n.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : n);
const stats = { private: 0, generic: 0, small: 0, outside: 0, open: 0, dupes: 0 };
const parks = [];
for (const e of parksRaw) {
  const t = e.tags || {};
  const name = tidyName((t['name:en'] || t.name).replace(/\s+/g, ' ').trim());
  if (PRIVATE.test(t.access || '') || NOT_PUBLIC.test(name)) { stats.private++; continue; }
  if (NOT_WELLNESS.test(name)) { stats.private++; continue; }
  if (GENERIC.test(name)) { stats.generic++; continue; }
  /* Gardens inside housing societies and hotels are mapped as gardens too. */
  if (t.leisure === 'garden' && /^(residential|private|hotel)$/.test(t['garden:type'] || '')) { stats.private++; continue; }
  const rings = e.type === 'way'
    ? (e.geometry && e.geometry.length > 3 ? [e.geometry.map((p) => [p.lon, p.lat])] : [])
    : closeRings((e.members || []).filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry));
  const closed = rings.filter((r) => r.length > 3 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]);
  if (!closed.length) { stats.open++; continue; }
  const sqm = Math.round(closed.reduce((s, r) => s + ringSqm(r), 0));
  if (sqm < MIN_SQM) { stats.small++; continue; }
  const biggest = closed.reduce((a, b) => (ringSqm(b) > ringSqm(a) ? b : a));
  const at = centroid(biggest);
  if (!inCity(at)) { stats.outside++; continue; }
  const has = new Set();
  thingPts.forEach((x) => { if (closed.some((r) => inRing(x.pt, r))) has.add(x.k); });
  parks.push({
    type: 'Feature',
    properties: {
      n: name,
      ...(t.opening_hours && { t: plainHours(t.opening_hours) }),
      a: [...has].sort(),
      sqm,
      osm: `${e.type}/${e.id}`,
    },
    geometry: { type: 'Point', coordinates: [+at[0].toFixed(5), +at[1].toFixed(5)] },
  });
}

/* The same park mapped twice (a way and a relation, or two halves under one
   name) keeps its biggest outline. */
const dist = (a, b) => Math.hypot((a[0] - b[0]) * 104900, (a[1] - b[1]) * 110600);
parks.sort((a, b) => b.properties.sqm - a.properties.sqm);
const kept = [];
for (const p of parks) {
  const twin = kept.find((k) => k.properties.n.toLowerCase() === p.properties.n.toLowerCase()
    && dist(k.geometry.coordinates, p.geometry.coordinates) < 400);
  if (twin) { stats.dupes++; continue; }
  kept.push(p);
}
kept.sort((a, b) => a.properties.n.localeCompare(b.properties.n));

/* A run that found almost nothing is a bad answer, not a city without parks:
   keep the file that is there. */
if (kept.length < 200) throw new Error(`only ${kept.length} parks — refusing to overwrite src/data/parks.json`);
writeFileSync(new URL('../src/data/parks.json', import.meta.url), JSON.stringify({
  type: 'FeatureCollection',
  source: `OpenStreetMap leisure=park|garden inside relations ${CITY_RELS.join(' + ')}, fetched ${new Date().toISOString().slice(0, 10)}. ODbL.`,
  features: kept,
}) + '\n');

const withA = kept.filter((p) => p.properties.a.length).length;
const withT = kept.filter((p) => p.properties.t).length;
console.log(`\n${kept.length} parks written to src/data/parks.json`);
console.log(`  ${withA} with something mapped inside them, ${withT} with opening hours`);
console.log(`  left out: ${stats.private} private, ${stats.generic} with only a generic name, ${stats.small} under ${MIN_SQM} m², ${stats.outside} outside the city, ${stats.open} unclosed outlines, ${stats.dupes} duplicates`);
