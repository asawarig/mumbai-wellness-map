/* Checks every place's Google Maps link against Google itself.
 *
 *   GOOGLE_MAPS_KEY=... node scripts/check-places.mjs
 *
 * Needs a key with the Places API (New) enabled. For each entry with a place
 * ID it asks Google for that place's name, location and status, and flags:
 *   not-found   Google does not know the ID
 *   far         Google's place is more than FAR_M from our pin
 *   name        Google's name shares no real word with ours
 *   closed      Google marks the place permanently closed
 * For each entry with no place ID it searches the name and address near our
 * pin and suggests the ID it finds. Writes reports/places-check.json and a
 * readable reports/places-check.csv; it changes no data.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const KEY = process.env.GOOGLE_MAPS_KEY;
if (!KEY) { console.error('Set GOOGLE_MAPS_KEY first.'); process.exit(1); }
const FAR_M = 250;
const ROOT = new URL('..', import.meta.url);
const E = JSON.parse(readFileSync(new URL('src/data/entries.json', ROOT), 'utf8'));
const pidOf = (u) => (String(u || '').match(/place_id[:=]([A-Za-z0-9_-]{20,})/) || [])[1] || '';
const metres = (a, b) => {
  const t = Math.PI / 180;
  return Math.hypot((b[0] - a[0]) * Math.cos(((a[1] + b[1]) / 2) * t) * 111320, (b[1] - a[1]) * 110570);
};
const words = (s) => new Set(String(s || '').toLowerCase().replace(/\(.*?\)|—.*$/g, ' ')
  .split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !['the', 'and', 'bangalore', 'bengaluru', 'clinic', 'centre', 'center', 'studio', 'fitness', 'gym'].includes(w)));
const sameName = (a, b) => { const A = words(a), B = words(b); return !A.size || !B.size || [...A].some((w) => B.has(w)); };

async function details(id) {
  const res = await fetch(`https://places.googleapis.com/v1/places/${id}`, {
    headers: { 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': 'id,displayName,location,businessStatus,formattedAddress' },
  });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}
async function search(r) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.formattedAddress' },
    body: JSON.stringify({
      textQuery: `${r.n.replace(/\s+—\s+.*$/, '')}, ${r.ad || r.a || ''} Bengaluru`,
      locationBias: { circle: { center: { latitude: r.lat, longitude: r.lon }, radius: 1500 } },
      maxResultCount: 1,
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()).places?.[0] || null;
}

const rows = [];
const todo = E.filter((r) => r.lat != null && r.c !== 'Activities');
let i = 0;
async function worker() {
  while (i < todo.length) {
    const r = todo[i++];
    const pid = pidOf(r.gm);
    const at = [r.lon, r.lat];
    try {
      if (pid) {
        const g = await details(pid);
        if (!g) { rows.push({ id: r.id, n: r.n, issue: 'not-found', pid }); continue; }
        const d = Math.round(metres(at, [g.location.longitude, g.location.latitude]));
        const issues = [d > FAR_M && 'far', !sameName(r.n, g.displayName?.text) && 'name', g.businessStatus === 'CLOSED_PERMANENTLY' && 'closed'].filter(Boolean);
        if (issues.length) rows.push({ id: r.id, n: r.n, issue: issues.join('+'), pid, google: g.displayName?.text, googleAddress: g.formattedAddress, metres: d });
      } else {
        const g = await search(r);
        rows.push({ id: r.id, n: r.n, issue: 'no-id', suggested: g?.id || '', google: g?.displayName?.text || '', googleAddress: g?.formattedAddress || '',
          metres: g ? Math.round(metres(at, [g.location.longitude, g.location.latitude])) : null });
      }
    } catch (e) { rows.push({ id: r.id, n: r.n, issue: 'error', error: String(e).slice(0, 200) }); }
    if (i % 100 === 0) console.log(i, '/', todo.length);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
mkdirSync(new URL('reports', ROOT), { recursive: true });
writeFileSync(new URL('reports/places-check.json', ROOT), JSON.stringify(rows, null, 1));
const csv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
writeFileSync(new URL('reports/places-check.csv', ROOT), ['id,name,issue,google_name,google_address,metres_from_pin,place_id,suggested_id',
  ...rows.map((r) => [r.id, r.n, r.issue, r.google, r.googleAddress, r.metres, r.pid, r.suggested].map(csv).join(','))].join('\n'));
const count = rows.reduce((m, r) => ({ ...m, [r.issue]: (m[r.issue] || 0) + 1 }), {});
console.log(todo.length, 'places checked;', count);
