/* Turn the two source KMLs into the compact GeoJSON the page loads.
 *
 *   node scripts/kml-to-geojson.mjs <rail.kml> <parks.kml>
 *
 * Writes src/data/metro.json and src/data/parks.json. Re-run it when a newer
 * export of either source turns up; the KMLs themselves are not committed,
 * the same way the boundary KML and the entry spreadsheet are not.
 *
 * The rail KML is an OpenStreetMap extract of everything on rails in the city.
 * Only railway=subway is Namma Metro; railway=rail is the mainline and
 * suburban network, and railway=construction does not say which of the two it
 * will become, so neither is drawn. The parks KML is the BBMP parks layer from
 * the Karnataka GIS system: one point per park, and no names — every
 * Data_ParksName field in it is empty.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { cleanParkName } from '../src/lib/park-name.js';

const P = 5;                       /* ~1 m, plenty for a city map */
const round = (n) => Number(n.toFixed(P));

const placemarks = (xml) => xml.match(/<Placemark>[\s\S]*?<\/Placemark>/g) || [];
const field = (pm, name) => {
  const m = pm.match(new RegExp(`<SimpleData name="${name}">([^<]*)</SimpleData>`));
  return m ? m[1].trim() : '';
};
const coords = (pm) => {
  const m = pm.match(/<coordinates>([\s\S]*?)<\/coordinates>/);
  if (!m) return [];
  return m[1].trim().split(/\s+/).filter(Boolean).map((t) => {
    const [lon, lat] = t.split(',').map(Number);
    return [round(lon), round(lat)];
  });
};

const [, , railPath, parksPath] = process.argv;
if (!railPath || !parksPath) {
  console.error('usage: node scripts/kml-to-geojson.mjs <rail.kml> <parks.kml>');
  process.exit(1);
}

/* ---- metro ---- */
const rail = placemarks(readFileSync(railPath, 'utf8'));
const kinds = {};
const metro = [];
rail.forEach((pm) => {
  const kind = field(pm, 'railway');
  kinds[kind] = (kinds[kind] || 0) + 1;
  if (kind !== 'subway') return;
  const line = coords(pm);
  if (line.length > 1) {
    metro.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } });
  }
});
writeFileSync('src/data/metro.json',
  JSON.stringify({ type: 'FeatureCollection', features: metro }) + '\n');

/* ---- parks ---- */
/* The register spells its own column headings several ways, so match on a
   squashed key rather than the literal string. */
const squash = (k) => k.toLowerCase().replace(/[^a-z0-9]/g, '');
const clean = (v) => v.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').replace(/\s+/g, ' ').trim();
const dataOf = (pm) => {
  const out = {};
  const re = /<Data name="([^"]*)">\s*<value>([\s\S]*?)<\/value>/g;
  let m;
  while ((m = re.exec(pm))) out[squash(m[1])] = clean(m[2]);
  return out;
};
const pick = (d, ...keys) => { for (const k of keys) if (d[squash(k)]) return d[squash(k)]; return ''; };
const yes = (v) => /^(yes|available|y)$/i.test(v.trim());

/* Anything that could be somebody's phone number, wherever it turns up. */
const PRIVATE = /\d{6,}|\bphone\b|\bph\s*[:.]|\bcontact\b|\bmob\b/i;
/* A real opening-hours value says a time or says it never closes. */
const TIMEISH = /\d\s*[.:]?\d*\s*(am|pm)|24\s*(hours|x7)/i;

/* One city, so a coordinate can be checked against it. Values that lost their
   decimal point are shifted back; a pair the wrong way round is turned over. */
const [BS, BW, BN, BE] = JSON.parse(readFileSync('src/data/city.json', 'utf8')).box;
const PAD = 0.05;
const inCity = (lon, lat) => lat >= BS - PAD && lat <= BN + PAD && lon >= BW - PAD && lon <= BE + PAD;
const shift = (v, lo, hi) => {
  let n = Math.abs(v);
  for (let i = 0; i < 9 && n > hi; i++) n /= 10;
  return n >= lo && n <= hi ? n : NaN;
};
const repair = (lon, lat) => {
  let a = shift(lat, BS - 1, BN + 1), o = shift(lon, BW - 1, BE + 1);
  if (inCity(o, a)) return [round(o), round(a)];
  const sa = shift(lon, BS - 1, BN + 1), so = shift(lat, BW - 1, BE + 1);   /* the wrong way round */
  if (inCity(so, sa)) return [round(so), round(sa)];
  return null;
};

/* What a visitor might actually want to know. The contractor, security and
   inspection columns are left behind on purpose. */
const AMENITIES = [
  ['benches',  'Benches',          ['Garden benches']],
  ['gazebo',   'Gazebo',           ['Gazebo']],
  ['gym',      'Gym equipment',    ['Gym equipment']],
  ['play',     'Play equipment',   ['Childrens Play equipments']],
  ['toilet',   'Toilet',           ['Toilet']],
  ['water',    'Borewell',         ['Borewells', 'Bore wells']],
  ['guard',    'Watchman',         ['Watchman Shed']],
  ['fountain', 'Musical fountain', ['Musical fountains']],
];

const parks = [];
const dropped = {noCoords: 0, timingsWereAPhoneNumber: 0};
placemarks(readFileSync(parksPath, 'utf8')).forEach((pm) => {
  const d = dataOf(pm);

  let pt = coords(pm)[0];
  if (pt) pt = repair(pt[0], pt[1]);
  if (!pt) {
    const lat = +pick(d, 'LATITUDE'), lon = +pick(d, 'LONGITUDE');
    if (isFinite(lat) && isFinite(lon) && lat && lon) pt = repair(lon, lat);
  }
  if (!pt) {
    const pair = pick(d, 'Coordinates');
    if (pair.includes(',')) {
      const [a, b] = pair.split(',').map(Number);
      if (isFinite(a) && isFinite(b)) pt = repair(b, a);
    }
  }
  if (!pt) { dropped.noCoords++; return; }

  /* "Maintenance Of Park in ward no-174 HSR layout, ... (FOODYS PARK)" is a
     work order, not a name. Where one of those ends in a bracketed name, that
     is the name; the rest is left as the register has it. */
  let name = pick(d, 'Name of Parks');
  const bracketed = name.match(/\(([^()]{2,60})\)\s*$/);
  if (/^maintenance of park\b/i.test(name) && bracketed) name = bracketed[1].trim();
  name = cleanParkName(name);

  const props = {};
  if (name) props.n = name;
  const ward = pick(d, 'Ward Name and No');
  if (ward) props.w = ward;
  const timings = pick(d, 'Park Timings');
  if (timings && PRIVATE.test(timings)) dropped.timingsWereAPhoneNumber++;
  else if (timings && TIMEISH.test(timings)) props.t = timings;
  const area = pick(d, 'Area (in sqm)').replace(/[^0-9.]/g, '');
  if (area && +area > 0 && +area < 1e7) props.sqm = Math.round(+area);
  const has = AMENITIES.filter(([, , keys]) => yes(pick(d, ...keys))).map(([k]) => k);
  if (has.length) props.a = has;

  parks.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: pt } });
});

/* Collapse BBMP stacks: exact/near coordinates + same-name neighbours. */
const parkRank = (f) => {
  const n = (f.properties?.n || '').trim();
  let s = 0;
  if (n) s += 10;
  if (!/^maintenance of|^maintenanace of/i.test(n)) s += 40;
  if (!/ward no|ward-/i.test(n)) s += 10;
  if (/\bpark\b/i.test(n)) s += 8;
  if (n && n !== n.toUpperCase()) s += 6;
  if (n.length > 0 && n.length < 60) s += 5;
  if (n.length > 90) s -= 8;
  if (Array.isArray(f.properties?.a)) s += Math.min(f.properties.a.length, 6);
  if (f.properties?.t) s += 3;
  if (f.properties?.w) s += 2;
  return s;
};
const parkDistM = (a, b) => {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toR, dLon = (b[0] - a[0]) * toR;
  const la1 = a[1] * toR, la2 = b[1] * toR;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};
const parkNameKey = (n) => String(n || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const mergeParkGroup = (group) => {
  group.sort((a, b) => parkRank(b) - parkRank(a)
    || (a.properties?.n || '').localeCompare(b.properties?.n || ''));
  const best = group[0];
  const am = new Set(Array.isArray(best.properties.a) ? best.properties.a : []);
  for (const g of group) {
    (g.properties?.a || []).forEach((x) => am.add(x));
    if (!best.properties.t && g.properties?.t) best.properties.t = g.properties.t;
    if (!best.properties.w && g.properties?.w) best.properties.w = g.properties.w;
  }
  best.properties.a = [...am].sort();
  return best;
};

const beforeDedup = parks.length;
const grid = new Map();
parks.forEach((f) => {
  const [lon, lat] = f.geometry.coordinates;
  const k = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  if (!grid.has(k)) grid.set(k, []);
  grid.get(k).push(f);
});
let list = [...grid.values()].map(mergeParkGroup);
const usedNear = new Array(list.length).fill(false);
const near = [];
for (let i = 0; i < list.length; i++) {
  if (usedNear[i]) continue;
  const group = [list[i]];
  usedNear[i] = true;
  const ci = list[i].geometry.coordinates;
  for (let j = i + 1; j < list.length; j++) {
    if (usedNear[j]) continue;
    if (parkDistM(ci, list[j].geometry.coordinates) <= 50) {
      usedNear[j] = true;
      group.push(list[j]);
    }
  }
  near.push(mergeParkGroup(group));
}
list = near;
const usedName = new Array(list.length).fill(false);
const uniqueParks = [];
for (let i = 0; i < list.length; i++) {
  if (usedName[i]) continue;
  const group = [list[i]];
  usedName[i] = true;
  const key = parkNameKey(list[i].properties?.n);
  if (key.length >= 6) {
    for (let j = i + 1; j < list.length; j++) {
      if (usedName[j]) continue;
      if (parkNameKey(list[j].properties?.n) !== key) continue;
      if (parkDistM(list[i].geometry.coordinates, list[j].geometry.coordinates) <= 300) {
        usedName[j] = true;
        group.push(list[j]);
      }
    }
  }
  uniqueParks.push(mergeParkGroup(group));
}
const parkDupesDropped = beforeDedup - uniqueParks.length;
parks.length = 0;
parks.push(...uniqueParks);

/* Nothing private gets past here, whatever column it started in. */
const leaked = parks.filter(f => PRIVATE.test(Object.values(f.properties).flat().join(' ')));
if (leaked.length) {
  console.error('Refusing to write: personal details survived the filter in '
    + `${leaked.length} record(s), first is ${JSON.stringify(leaked[0].properties)}`);
  process.exit(1);
}

writeFileSync('src/data/parks.json',
  JSON.stringify({ type: 'FeatureCollection', features: parks }) + '\n');
writeFileSync('src/data/park-amenities.json',
  JSON.stringify(Object.fromEntries(AMENITIES.map(([k, label]) => [k, label])), null, 1) + '\n');

console.log('rail KML contained:', kinds);
console.log(`metro.json  ${metro.length} lines drawn (railway=subway only)`);
console.log(`parks.json  ${parks.length} parks, ${parks.filter(f => f.properties.n).length} named, `
  + `${parks.filter(f => f.properties.t).length} with usable timings, `
  + `${parks.filter(f => f.properties.a).length} listing an amenity`
  + (parkDupesDropped ? `, ${parkDupesDropped} stacked duplicates dropped` : ''));
console.log('  dropped:', dropped);
