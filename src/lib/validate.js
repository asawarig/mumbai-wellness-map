/* Build-time check on src/data/entries.json.
 *
 * Called from the page frontmatter, so it runs on `astro build` and on every
 * save in `astro dev`, and a bad row stops the build with the id and the reason
 * rather than shipping a pin that renders as a blank square. That is deliberate:
 * a new sub-category has to be given an icon and a label before it can appear.
 */

import { CATS, SUBCAT } from './categories.js';
import { INTENT_BY_K } from './intents.js';
import { DB, RAW_ENTRIES, ICONS, LABELS } from './db.js';

const [S, W, N, E] = DB.box;
const CORP_KEYS = new Set(DB.corps.map((c) => c.k));
/* The three values the coloured dot on a card understands: green, yellow, blue. */
const VERIFICATION = new Set(['Verified', 'Needs check', 'Community-reported', '']);

export function validateEntries() {
  const problems = [];
  const seen = new Set();

  RAW_ENTRIES.forEach((r, i) => {
    const at = r.id || `row ${i + 1}`;
    const say = (msg) => problems.push(`${at}: ${msg}`);

    if (!r.id) say('has no id');
    else if (seen.has(r.id)) say('duplicate id');
    seen.add(r.id);

    if (!r.n) say('has no name');
    if (!CATS.some((c) => c.k === r.c)) say(`unknown category ${JSON.stringify(r.c)}`);
    if (!r.g || !SUBCAT[r.g]) {
      say(`unknown sub-category ${JSON.stringify(r.g)} — add it to src/lib/categories.js`);
    } else {
      if (SUBCAT[r.g] !== r.c) say(`sub-category ${r.g} belongs to ${SUBCAT[r.g]}, not ${r.c}`);
      if (!LABELS[r.g]) say(`sub-category ${r.g} has no label in src/data/labels.json`);
      if (!ICONS[r.g]) say(`sub-category ${r.g} has no icon in src/data/icons.json`);
    }

    const hasLat = r.lat != null, hasLon = r.lon != null;
    if (hasLat !== hasLon) say('has one of lat/lon but not the other');
    if (hasLat && hasLon) {
      if (typeof r.lat !== 'number' || typeof r.lon !== 'number') say('lat/lon are not numbers');
      /* Inside the gazetted box, or explicitly flagged as a day trip beyond it.
         A silent typo in a coordinate is the one error that looks fine. */
      else if (!r.out && (r.lat < S || r.lat > N || r.lon < W || r.lon > E)) {
        say(`lat/lon ${r.lat},${r.lon} fall outside Mumbai (BMC) — set "out": 1 if that is intended`);
      }
    }

    /* A row may carry its own category where the sub-category cannot give it.
       An unknown one would drop the row out of every chip, silently. */
    if (r.cat && !INTENT_BY_K[r.cat]) say(`unknown category ${JSON.stringify(r.cat)}`);

    if (r.rg && !CORP_KEYS.has(r.rg)) say(`unknown corporation ${JSON.stringify(r.rg)}`);
    if (r.v != null && !VERIFICATION.has(r.v)) say(`unknown verification_status ${JSON.stringify(r.v)}`);
    if (r.tg != null && !Array.isArray(r.tg)) say('tg (tags) must be an array');
  });

  if (problems.length) {
    throw new Error(
      `${problems.length} problem${problems.length > 1 ? 's' : ''} in src/data/entries.json:\n  `
      + problems.join('\n  '),
    );
  }
  return RAW_ENTRIES.length;
}
