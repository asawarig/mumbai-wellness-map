// Builds sources/routes/mumbai-routes.csv for scripts/snap-routes.mjs and
// scripts/park-outlines.mjs:  node scripts/make-routes-sheet.mjs
// type: P = park loop (stitch paths / park wall), L = lake loop, T = routed through points,
// O = out-and-back routed start -> turn, H = hold (no line).
import fs from 'node:fs';
const ROOT = '/Users/asawari/Downloads/wellness map mumbai';
const entries = JSON.parse(fs.readFileSync(`${ROOT}/src/data/entries.json`, 'utf8'));
const arr = Array.isArray(entries) ? entries : entries.entries || Object.values(entries);
const byId = new Map(arr.map((e) => [e.id, e]));

// [id, type, km, start [lat,lon] | null (use pin), end, waypoints[]]
const SPEC = [
  ['MUM-3430', 'L', 0.65], ['MUM-3431', 'P', 0.8], ['MUM-3432', 'P', 0, [18.9628, 72.8098]],
  ['MUM-3433', 'P', 0, [18.9388, 72.8322]], ['MUM-3435', 'P', 0.5], ['MUM-0004', 'P'],
  ['MUM-3436', 'L', 0.5], ['MUM-0007', 'P', 0.32], ['MUM-3438', 'P'], ['MUM-3439', 'P', 0.5],
  ['MUM-0010', 'P'], ['MUM-0011', 'P'], ['MUM-0012', 'P'], ['MUM-3441', 'P'], ['MUM-0013', 'P'],
  ['MUM-2811', 'P'], ['MUM-0015', 'P'], ['MUM-3443', 'P'], ['MUM-2238', 'P'], ['MUM-1838', 'L'],
  ['MUM-0016', 'P'], ['MUM-0017', 'P', 0.4], ['MUM-0018', 'P', 1.0], ['MUM-2812', 'P'],
  ['MUM-3446', 'L', 0.65], ['MUM-0020', 'P', 2.2], ['MUM-0021', 'P'], ['MUM-0025', 'P'], ['MUM-0026', 'P'],
  ['MUM-1840', 'L', 2.7], ['MUM-0027', 'P'], ['MUM-0028', 'P'], ['MUM-3449', 'P'], ['MUM-0030', 'P', 0.5],
  ['MUM-0031', 'P', 0.32], ['MUM-2614', 'P'], ['MUM-1843', 'P'], ['MUM-3452', 'P', 0.65], ['MUM-0032', 'P', 0.7],
  ['MUM-3455', 'P'], ['MUM-3456', 'P', 0.65], ['MUM-0035', 'P', 1.5], ['MUM-0034', 'P', 1.3], ['MUM-1845', 'P'],
  ['MUM-2239', 'L'], ['MUM-2240', 'L'], ['MUM-2241', 'L'],

  // Seafronts and roads
  ['MUM-0024', 'T', 3.6, [18.9535, 72.8160], [18.9258, 72.8210], [[18.9400, 72.8235]]],
  ['MUM-0003', 'O', 2.4, [19.0468, 72.8199], [19.0419, 72.8187]],
  ['MUM-0005', 'T', 0, [19.0700, 72.8232], [19.0420, 72.8190], [[19.0598, 72.8215], [19.0470, 72.8222]]],
  ['MUM-0037', 'T', 2.75, [19.0165, 72.8165], [19.0000, 72.8152]],
  ['MUM-0008', 'T', 5.25, [18.9700, 72.8048], [19.0005, 72.8155], [[18.9822, 72.8118]]],
  ['MUM-0029', 'T', 5.5, null, null, [[19.1245, 72.9055], [19.1250, 72.8965]], { loop: true }],
  ['MUM-0033', 'O', 12, [19.2297, 72.8573], [19.2058, 72.9066]],
  ['MUM-0001', 'O', 0, [19.1660, 72.8620], [19.1550, 72.8740]],
  ['MUM-2242', 'O', 0, null, [19.2300, 72.9260]],
  ['MUM-1841', 'O', 7, null, [19.0290, 73.0120]],

  // Rides
  ['MUM-0038', 'T', 9.6, [19.1660, 72.8620], [19.1310, 72.8920], [[19.1550, 72.8740]], { cycle: true }],
  ['MUM-3459', 'T', 0, [19.0700, 72.8232], [19.0600, 72.8217], [], { cycle: true }],
  ['MUM-0039', 'T', 5.25, [18.9700, 72.8048], [19.0005, 72.8155], [[18.9822, 72.8118]], { cycle: true }],
  ['MUM-3460', 'T', 0, [19.0435, 72.8640], [19.1940, 72.9630], [[19.0870, 72.9150], [19.1110, 72.9330], [19.1730, 72.9560]], { cycle: true }],
  ['MUM-2617', 'T', 0, [19.1340, 72.7990], [19.1940, 72.8370], [[19.1610, 72.7860], [19.1760, 72.7960]], { cycle: true }],
  ['MUM-0041', 'T', 15, [18.9535, 72.8160], [18.9535, 72.8160],
    [[18.9258, 72.8210], [18.9352, 72.8270], [18.9285, 72.8320], [18.9120, 72.8180], [18.9220, 72.8347], [18.9400, 72.8350], [18.9520, 72.8190]],
    { cycle: true, loop: true }],
  ['MUM-3462', 'T', 25, [18.9230, 72.8320], [19.0468, 72.8225],
    [[18.9220, 72.8347], [18.9400, 72.8235], [18.9535, 72.8160], [19.0080, 72.8155], [19.0260, 72.8360], [19.0440, 72.8400]], { cycle: true }],
  ['MUM-3463', 'T', 0, [19.0750, 72.9980], [19.0170, 73.0300], [[19.0546, 73.0053], [19.0290, 73.0120]], { cycle: true }],
  ['MUM-0043', 'O', 14, [19.2297, 72.8573], [19.2058, 72.9066], [], { cycle: true }],
  ['MUM-2618', 'T', 8, [19.3110, 72.8510], [19.2900, 72.7860], [[19.3040, 72.8150]], { cycle: true }],
  ['MUM-2243', 'O', 0, null, [19.2300, 72.9260], [], { cycle: true }],
];

// Traced, looked at on the map, and refused: footway tangles through housing,
// inland roads standing in for the coastal promenade, wrong ends.
const HOLD = new Set(['MUM-3431', 'MUM-3435', 'MUM-3436', 'MUM-0007', 'MUM-3439', 'MUM-0008', 'MUM-0039',
  'MUM-0001', 'MUM-2617', 'MUM-0041', 'MUM-0021', 'MUM-0035',
  // No reliable outline: left as pins at the user's call (2026-10-28).
  'MUM-2240', 'MUM-0018', 'MUM-2238', 'MUM-0025', 'MUM-0026', 'MUM-0032', 'MUM-3455', 'MUM-2811', 'MUM-0012',
  'MUM-0020', 'MUM-0011', 'MUM-0030']);
// Outlines looked at on the map and refused: thin strips (a loop up and back a
// promenade), a stray-armed outline, a private estate lawn, a bare sports ground.
const OSM_FOR = {
 "MUM-0016": "way/112796885",
 "MUM-3432": "way/40748778",
 "MUM-3433": "relation/20401140",
 "MUM-0010": "way/22906436",
 "MUM-0011": "way/152314740",
 "MUM-3441": "way/559429510",
 "MUM-0013": "way/152314268",
 "MUM-0015": "way/39181022",
 "MUM-2812": "way/40638190",
 "MUM-0028": "way/42352120",
 "MUM-0030": "way/38757942",
 "MUM-0031": "way/465343064",
 "MUM-2614": "way/1063930017",
 "MUM-3452": "way/49176399",
 "MUM-1845": "way/235978553",
 "MUM-2239": "relation/8728646",
 "MUM-0020": "way/1289073486",
 "MUM-2241": "way/37813439",
 "MUM-3456": "way/107213234"
};
// Park and lake loops' own OSM elements, matched by name and position.
const PARK_HOLD = ['PARK-19.04947_72.83581','PARK-19.14551_72.82112','PARK-18.93723_72.82966','PARK-19.28877_72.94217','PARK-19.00754_73.03614','PARK-19.10835_72.91665','PARK-19.03770_73.02268','PARK-19.00325_73.01484','PARK-19.15689_72.83582'];
const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const head = ['id', 'n', 'a', 'mode', 'route_type', 'dist_km', 'start_lat', 'start_lon', 'end_lat', 'end_lon', 'waypoints', 's', 'geom_status', 'osm'];
const out = [head.join(',')];
for (const [id, type, km = 0, st, en, wps = [], opt = {}] of SPEC) {
  const e = byId.get(id);
  if (!e) throw new Error(`no entry ${id}`);
  const start = st || (e.lat ? [e.lat, e.lon] : null);
  if (!start) throw new Error(`no start for ${id}`);
  const loop = type === 'P' || type === 'L' || opt.loop;
  const end = loop ? (en || start) : en;
  const rt = loop ? 'loop' : type === 'O' ? 'out and back' : 'point to point';
  const mode = opt.cycle || e.g === 'cycle' ? 'Cycle' : 'Run';
  out.push([id, e.n, e.a, mode, rt, km || '', start[0], start[1], end[0], end[1],
    wps.map(([a, b]) => `(${a}, ${b})`).join(' '), type === 'P' ? 'park loop' : '', HOLD.has(id) ? 'hold: checked on the map, trace was wrong' : '', OSM_FOR[id] || ''].map(q).join(','));
}
// Parks of a hectare or more get a walk round their own paths (parkWalk in
// snap-routes.mjs), unless a running loop on the map already covers them.
const parks = JSON.parse(fs.readFileSync(`${ROOT}/src/data/parks.json`, 'utf8')).features;
const routed = arr.filter((e) => /^(run|track)$/.test(e.g) && e.lat);
// Joggers Park and its spellings sit beside a run row of the same name.
const norm = (n) => n.toLowerCase().replace(/[^a-z]/g, '');
const words = (n) => new Set(n.toLowerCase().match(/[a-z]{4,}/g) || []);
const PHOLD = new Set(PARK_HOLD);
let nParks = 0;
for (const f of parks) {
  const { n, sqm, osm } = f.properties;
  if (!n || !osm || sqm < 10000) continue;
  const [lon, lat] = f.geometry.coordinates;
  const id = `PARK-${lat.toFixed(5)}_${lon.toFixed(5)}`;
  const w = words(n);
  const covered = routed.some((e) => Math.hypot((e.lat - lat) * 111, (e.lon - lon) * 105) < 0.6
    && (norm(e.n).includes(norm(n)) || norm(n).includes(norm(e.n).split(/park|garden|udyan/)[0] || '#')
      || [...words(e.n)].some((x) => w.has(x) && !/^(park|garden|ground|udyan|maidan|joggers|track)$/.test(x))));
  if (covered) continue;
  out.push([id, n, '', 'Walk', 'loop', '', lat, lon, lat, lon, '', '', PHOLD.has(id) ? 'hold: checked on the map, trace was wrong' : '', osm].map(q).join(','));
  nParks++;
}
console.log(nParks, 'park walks');
fs.writeFileSync(`${ROOT}/sources/routes/mumbai-routes.csv`, `${out.join('\n')}\n`);
console.log(out.length - 1, 'routes');
