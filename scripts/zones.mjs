/* Mumbai's zone keys (src/data/corporations.json) and the zone a point falls
 * in (src/data/corporation-areas.json), shared by the ingest scripts.
 *
 * A sheet can leave `rg` blank, or write it the way people say it ("SoBo",
 * "Western Suburbs"); RG_ALIAS folds the common spellings onto a key, and
 * zoneAt() fills a blank from the pin itself.
 */
import fs from 'node:fs';

const read = (f) => JSON.parse(fs.readFileSync(new URL(`../src/data/${f}`, import.meta.url), 'utf8'));

export const ZONE_KEYS = new Set(read('corporations.json').map((c) => c.k));

export const RG_ALIAS = {
  'South Mumbai': 'South', SoBo: 'South', 'Island City': 'South', 'Zone 1': 'South',
  'Central Mumbai': 'Central', 'Zone 2': 'Central',
  'Western Suburbs': 'West', 'West Mumbai': 'West', 'Zone 3': 'West',
  'Northern Western Suburbs': 'NorthWest', 'North-west': 'NorthWest', 'North West': 'NorthWest', 'Northwest': 'NorthWest', 'Zone 4': 'NorthWest',
  'Eastern Suburbs': 'East', 'East Mumbai': 'East', 'Zone 5': 'East',
  Thane: 'Thane', TMC: 'Thane', 'Zone 8': 'Thane',
  'Navi Mumbai': 'NaviMumbai', NMMC: 'NaviMumbai', 'Zone 7': 'NaviMumbai',
  'Northern Eastern Suburbs': 'NorthEast', 'North-east': 'NorthEast', 'North East': 'NorthEast', 'Northeast': 'NorthEast', 'Zone 6': 'NorthEast',
};

const areas = read('corporation-areas.json').features;
function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);

/* The zone key a [lon, lat] falls in, or '' outside the city. */
export function zoneAt(lon, lat) {
  if (lon == null || lat == null) return '';
  const hit = areas.find((f) => polysOf(f.geometry).some((p) => inRing([lon, lat], p[0]) && !p.slice(1).some((h) => inRing([lon, lat], h))));
  return hit?.properties.rg || '';
}
