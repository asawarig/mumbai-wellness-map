/* The listings' long text, by id: the half of each listing the map does not
 * need to draw (see src/lib/detail-fields.js). The page asks for it once the
 * map's own data is in, and fills it into the listings as it lands. Empty
 * fields are left out, since the page fills those in as blanks anyway.
 *
 * Prerendered, like map.json: a .json asset, not HTML (README section 1).
 */
import { DB } from '../../lib/db.js';
import { DETAIL_FIELDS } from '../../lib/detail-fields.js';

export const prerender = true;

export function GET() {
  const out = {};
  DB.entries.forEach((r) => {
    const d = {};
    DETAIL_FIELDS.forEach((f) => { if (r[f]) d[f] = r[f]; });
    if (Object.keys(d).length) out[r.id] = d;
  });
  return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
