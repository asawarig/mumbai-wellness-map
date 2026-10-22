/* The map's data, worked out once at build time and served as a file.
 *
 * The page used to import src/lib/db.js into its script, which meant every
 * visitor downloaded the raw listings, the parks register and the ward
 * outlines as JavaScript, and then their browser merged the duplicate parks
 * and looked up each park's ward before the map could draw. Built here, that
 * work happens once; the file is plain JSON, which parses faster than the same
 * data as script; and BaseLayout preloads it, so it downloads alongside the
 * script instead of after it.
 *
 * The listings' long text (DETAIL_FIELDS) is left out: it comes in
 * details.json, just after, so this file is only what the map needs to draw.
 * The ward outlines are in it, which keeps them out of the script.
 *
 * Prerendered on purpose. README section 1 forbids static *HTML*: Webflow
 * forces a trailing slash onto HTML assets and loops. A .json asset is served
 * like the icons and fonts in public/, with no slash added.
 */
import { DB, COUNTS, ROUTES, METRO, ZONES } from '../../lib/db.js';
import { DETAIL_FIELDS } from '../../lib/detail-fields.js';

export const prerender = true;

/* Ward outlines, simplified (Douglas-Peucker, about 11 m): the map draws them
   at most as a fill or a boundary at city and area zooms, where 11 m is about
   a pixel, and they were a third of this file. */
const TOL = 0.0001;
function simplify(pts) {
  if (pts.length < 5) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    let far = -1, best = TOL;
    for (let i = a + 1; i < b; i++) {
      /* A ring starts and ends on one point: there, distance from that point. */
      const d = len < 1e-12 ? Math.hypot(pts[i][0] - ax, pts[i][1] - ay)
        : Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
      if (d > best) { best = d; far = i; }
    }
    if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  const out = pts.filter((_, i) => keep[i]);
  return out.length >= 4 ? out : pts;
}
const simpler = (c) => (typeof c[0][0] === 'number' ? simplify(c) : c.map(simpler));
const zones = {
  ...ZONES,
  features: ZONES.features.map((f) => (f.geometry
    ? { ...f, geometry: { ...f.geometry, coordinates: simpler(f.geometry.coordinates) } } : f)),
};

export function GET() {
  const entries = DB.entries.map((r) => {
    const lite = { ...r };
    DETAIL_FIELDS.forEach((f) => { delete lite[f]; });
    /* Fields the map never reads, or reads only for being set: the sheet's
       category name (only the build checks it), "out" when it is 0, and the
       search-only raw name when it only repeats the name or the area. */
    delete lite.c;
    if (!lite.out) delete lite.out;
    if (lite.raw === lite.n || lite.raw === lite.a) delete lite.raw;
    return lite;
  });
  const body = JSON.stringify({ db: { ...DB, entries }, counts: COUNTS, routes: ROUTES, metro: METRO, zones });
  return new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
