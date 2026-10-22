/* Fetch a logo for every Plum Perks brand, for the tray thumbnails.
 *
 *   LOGO_DEV_TOKEN=pk_xxx node scripts/fetch-perk-logos.mjs
 *
 * Writes public/logos/perks/<key>.png and src/data/perk-logos.json, which maps
 * the same normalised brand key the offers use to the file that was fetched.
 * Nothing else reads the directory, so a brand with no logo simply keeps the
 * initials tile it has today — the map degrades to what it does now rather
 * than to a broken image.
 *
 * Why an API and not each brand's own site: favicons are whatever the brand
 * happened to upload. Across a sample, one was 180x180 and another — Playo's —
 * was 16x16, which is unusable at any size the tray draws. The API returns one
 * size for everybody, which is the only way a grid of them looks deliberate.
 *
 * Domains come from the project's own data, not from searching: perks.json
 * carries a website for all 62 brands, and the tagged entries carry one for 77
 * of the 101 pins. Brands neither file knows are reported at the end for
 * someone to supply, rather than guessed at.
 *
 * These are partner logos. The rights to use them are Plum's to hold, and this
 * script assumes that has been settled.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const token = process.env.LOGO_DEV_TOKEN;
if (!token) {
  console.error('LOGO_DEV_TOKEN is not set.\n  LOGO_DEV_TOKEN=pk_xxx node scripts/fetch-perk-logos.mjs');
  process.exit(1);
}
const SIZE = Number(process.env.LOGO_SIZE || 256);
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const read = (p) => JSON.parse(readFileSync(path.join(root, p), 'utf8'));

/* Every brand we owe a logo, keyed the way the offers are keyed. */
const offers = read('src/data/perk-offers.json');
const wanted = new Map(Object.entries(offers).map(([k, v]) => [k, v.brand]));

/* Domains, from this project's own data. */
const domains = new Map();
const host = (u) => { try { return new URL(u).hostname; } catch { return null; } };
for (const p of read('src/data/perks.json').perks) {
  if (p.w && host(p.w)) domains.set(norm(p.n), host(p.w));
}
const entries = read('src/data/entries.json');
for (const r of (Array.isArray(entries) ? entries : entries.entries || [])) {
  if ((r.tg || []).includes('plum-perks') && r.w && host(r.w)) {
    const k = norm(r.n);
    if (!domains.has(k)) domains.set(k, host(r.w));
  }
}
/* A brand key matched against those, longest first so "Tata 1MG Labs" is not
   answered by "1MG". */
const keys = [...domains.keys()].sort((a, b) => b.length - a.length);
const domainFor = (k) => domains.get(k)
  || domains.get(keys.find((d) => d.startsWith(k) && k.length >= 4))
  || domains.get(keys.find((d) => k.startsWith(d) && d.length >= 4))
  || domains.get(keys.find((d) => (d.includes(k) || k.includes(d)) && Math.min(d.length, k.length) >= 5))
  || null;

const outDir = path.join(root, 'public/logos/perks');
mkdirSync(outDir, { recursive: true });

/* Files Plum supplied are kept, not re-fetched. Several fetched logos turned
   out to be the wrong company because the sheet's website was wrong, and the
   supplied file is the correction — so a re-run must not quietly undo it. */
const manifestPath = path.join(root, 'src/data/perk-logos.json');
let existing = {};
try { existing = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch {}
const supplied = Object.fromEntries(
  Object.entries(existing).filter(([, v]) => v && v.source === 'supplied'),
);
const manifest = { ...supplied };
const noDomain = [];
const failed = [];
let fetched = 0;

for (const [key, brand] of wanted) {
  if (supplied[key]) continue;
  const domain = domainFor(key);
  if (!domain) { noDomain.push(brand); continue; }
  const url = `https://img.logo.dev/${domain}?token=${token}&size=${SIZE}&format=png`;
  try {
    const res = await fetch(url);
    const buf = Buffer.from(await res.arrayBuffer());
    /* A placeholder comes back small; anything under a kilobyte is not a logo
       worth shipping, and the initials tile is better than a grey square. */
    if (!res.ok || buf.length < 1000 || buf.subarray(0, 8).toString('binary') !== '\x89PNG\r\n\x1a\n') {
      failed.push(`${brand} (${domain}) ${res.status} ${buf.length}B`);
      continue;
    }
    writeFileSync(path.join(outDir, `${key}.png`), buf);
    manifest[key] = { brand, domain, file: `${key}.png` };
    fetched++;
  } catch (err) {
    failed.push(`${brand} (${domain}) ${err.message}`);
  }
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + '\n');
console.log(`\nfetched ${fetched} of ${wanted.size} brands, kept ${Object.keys(supplied).length} supplied`);
if (noDomain.length) console.log(`\nno domain in this project's data (${noDomain.length}) — supply one and re-run:\n  ${noDomain.join(', ')}`);
if (failed.length) console.log(`\nthe API had nothing usable for (${failed.length}):\n  ${failed.join('\n  ')}`);
