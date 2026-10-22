/* Rebuild src/data/perks.json from the Plum Perks sheet.
 *
 *   node scripts/ingest-perks.mjs [sources/perks/plum_perks.csv]
 *
 * Perks are partner brands with no visitable Bengaluru address — D2C labels,
 * apps, at-home services. They are cards, never pins: nothing in the sheet
 * carries a coordinate, and a brand card on a map would be a lie about where
 * the brand is. They do not go into entries.json for the same reason — the
 * counts, the clustering and the A-Z index are all about places you can walk to.
 *
 * Each row names the map category it supports, so the pane groups by category
 * and a perk sits with the places it belongs next to.
 *
 * Two things the sheet asks for and this script does:
 *
 *   held      a row that is not Verified is left out of perks.json altogether,
 *             not written and hidden. The sheet's note on the category is that
 *             the unconfirmed ones are "unconfirmed before they go public", and
 *             sixteen still carry working copy in the description ("Product
 *             line to verify", best_for "Verify"). perks.json is imported into
 *             the page bundle, so a row written and then filtered in the
 *             browser would still be public in the source — withholding has to
 *             happen here. The CSV keeps them; flip SHIP_UNVERIFIED once they
 *             are confirmed.
 *   cat       the supporting category as the key src/lib/intents.js uses, so a
 *             perk card draws with the same glyph and colour as the pins in
 *             that category.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSV = path.resolve(ROOT, process.argv[2] || 'sources/perks/plum_perks.csv');
const CATEGORIES = path.join(ROOT, 'sources/entries/categories.csv');
const OUT = path.join(ROOT, 'src/data/perks.json');

/* Set true once the unverified partners are confirmed.

   Currently TRUE at Plum's instruction, to look at the 31 held-back brands on
   staging — not because they are confirmed. The master list still marks every
   one of them "Needs check", and 29 of the 31 have no website, so their cards
   carry a name, a description that often says "verify", and no link but the
   app. Turn this back to false unless the decision is to publish unconfirmed
   partner records. */
const SHIP_UNVERIFIED = true;

/* The sheet's category names, as the keys src/lib/intents.js uses. */
const CATEGORY = {
  'Move': 'move',
  'Play': 'play',
  'Work out': 'workout',
  'Eat healthy': 'eat',
  'Check your health': 'care',
  'Mental health': 'clear',
  'Buy gear': 'gear',
  'Communities': 'people',
};

/* Perks the sheet files under Communities that are not communities: the elder
   care ones go under Check your health. The rest of that column (pets, kids,
   magazines, home services) shows under the online list's misc chip. */
const CAT_FIX = {
  'PLUM-087': 'care', // Khyaal
  'PLUM-088': 'care', // Samarth Care
};

/* A CSV reader that understands quoted fields and embedded newlines — the
   description and flags columns have both. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function table(file) {
  const [header, ...body] = parseCsv(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  return body
    .filter((r) => r.length > 1)
    .map((r) => (key) => (idx[key] == null ? '' : String(r[idx[key]] ?? '').trim()));
}

/* The category blurb, so the pane says what the sheet says it says. */
let blurb = 'Get discounts with our Perks partners on the Plum app.';
for (const get of table(CATEGORIES)) {
  if (get('category') === 'Plum Perks' && get('blurb')) blurb = get('blurb');
}

const stats = { rows: 0, held: 0, noLink: 0 };
const seen = new Set();
const perks = [];

for (const get of table(CSV)) {
  const id = get('id');
  if (!id) continue;
  if (seen.has(id)) throw new Error(`duplicate perk id ${id} in ${path.basename(CSV)}`);
  seen.add(id);
  stats.rows++;

  /* A brand can serve more than one activity: "Buy gear; Work out". The
     first is its own (its colour, its icon); the rest are kept in "also", so
     it shows under each of those chips in Online perks too. */
  const [supports = '', ...more] = get('supports_category').split(';').map((x) => x.trim()).filter(Boolean);
  const cat = CAT_FIX[id] || CATEGORY[supports];
  if (supports && !cat) throw new Error(`${id}: unknown supports_category ${JSON.stringify(supports)}`);
  const also = more.map((x) => {
    if (!CATEGORY[x]) throw new Error(`${id}: unknown supports_category ${JSON.stringify(x)}`);
    return CATEGORY[x];
  }).filter((k) => k !== cat);

  const v = get('verification_status');
  if (!SHIP_UNVERIFIED && v !== 'Verified') { stats.held++; continue; }

  /* Ivory and Nutriviva give an instagram.com URL as their website, and that is
     deliberate — Plum's exception. Every Instagram handle was stripped from the
     listings and the perk brands, so a future cleanup could reasonably mistake
     these for the same thing and remove them. They are the brand's only link. */
  const w = get('website');
  const ig = get('instagram');
  if (!w && !ig) stats.noLink++;

  perks.push({
    id,
    n: get('name'),
    cat,
    ...(also.length ? { also } : {}),
    /* What kind of brand it is, and how you reach it — the two things that
       stand in for an address on a card that has none. */
    s: get('subcategory'),
    /* "Verify" is the sheet's note to itself, not a place. 24 unverified rows
       carry it, and it would otherwise render as an area chip telling a reader
       to verify something. */
    a: get('area') === 'Verify' ? '' : get('area'),
    d: get('description'),
    b: get('best_for'),
    w,
    /* Instagram handles are not shipped — see ingest-entries.mjs. The handle is
       still read above, because a brand with neither a site nor a handle is
       worth counting, but it does not reach the page. */
    tg: get('tags').split(',').map((t) => t.trim()).filter(Boolean),
    v,
  });
}

perks.sort((a, b) => a.n.localeCompare(b.n));

fs.writeFileSync(OUT, `${JSON.stringify({
  blurb,
  /* The blurb is the call to action, so it is the link. */
  ctaUrl: 'https://www.plumhq.com/app',
  perks,
}, null, 2)}\n`);

console.log(`perks.json <- ${path.basename(CSV)}`);
console.log(`  ${stats.rows} partner brands in the sheet, ${perks.length} written, ${stats.held} held back as unverified`);
console.log(`  ${stats.noLink} with neither a website nor an Instagram — the app CTA is their only link`);
