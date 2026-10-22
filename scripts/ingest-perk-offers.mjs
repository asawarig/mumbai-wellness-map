/* Build src/data/perk-offers.json — the discount each Plum Perks brand gives.
 *
 * Two sheets, because they were filled in at different times and, more to the
 * point, cover different things:
 *
 *   perk-offers-brands.csv  the partner list. Perk Discount is the offer;
 *                           Max Discount is the rupee cap and is not shown.
 *   perk-offers-pinned.csv  the brands that only exist as pins on the map and
 *                           were missing from the first sheet. Here the offer
 *                           was written into the Max Discount column with Perk
 *                           Discount left blank, so take whichever is filled.
 *
 * A brand with no offer in either sheet is deliberate, not missing: Cult and
 * the venues it runs are a different partnership, and their cards say so in
 * general terms rather than naming a number.
 *
 * Output is keyed by a normalised brand name. The map matches an entry to a
 * brand by name, because perk_id does not join: every perk_id on a pin is
 * absent from the perks sheet and every sheet id is referenced by no pin.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
/* Accents are folded, not dropped, to match normBrand in src/lib/index-card.js:
   stripping them turns "Näck" into "nck" while the card looks up "nack", and
   the brand's offer is then written under a key nothing ever asks for. */
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '');

/* Small hand-rolled reader: these sheets carry quoted commas in the money
   column, which a split(',') would tear in half. */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const offers = {};
/* A brand can give more than one offer — Early.fit discounts both the GLP-1
   medication and the assessment, Supertails both supplies and at-home vet — so
   they are collected rather than overwritten. Keeping only the first showed one
   and silently dropped the other. */
const add = (brand, offer) => {
  const k = norm(brand);
  if (!k || !offer) return;
  const o = offer.trim();
  if (!offers[k]) offers[k] = { brand: brand.trim(), offers: [] };
  if (!offers[k].offers.includes(o)) offers[k].offers.push(o);
};

/* The partner list. Leading blank column, then Brand, Category, Perk, Max. */
for (const r of parseCsv(readFileSync(path.join(root, 'sources/perks/perk-offers-brands.csv'), 'utf8'))) {
  const [, brand, , perk] = r;
  if (!brand || brand.trim() === 'Brand Name') continue;
  add(brand, perk);
}

/* The pinned-only brands. Brand, pins, example, Perk, Max — offer in either. */
for (const r of parseCsv(readFileSync(path.join(root, 'sources/perks/perk-offers-pinned.csv'), 'utf8'))) {
  const [brand, , , perk, max] = r;
  if (!brand || brand.trim() === 'Brand Name') continue;
  add(brand, (perk || '').trim() || (max || '').trim());
}

const out = path.join(root, 'src/data/perk-offers.json');
writeFileSync(out, JSON.stringify(offers, null, 1) + '\n');
console.log(`perk-offers.json: ${Object.keys(offers).length} brands with an offer`);
