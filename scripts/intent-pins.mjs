/* The intent pins — superseded by scripts/intent-badges.mjs, which cuts the
 * round badges now on the map. Running this would bring the teardrops back.
 *
 * Takes the designer's pin SVGs (one per map intent, exported at 62×64: a pin
 * silhouette filled with the intent's colour, drawn first, with a glyph on it)
 * and writes three cuts of each:
 *
 *   public/icons/intent-pin/   the pin, outlined in cream, for places on the map
 *   public/icons/intent-mark/  the glyph alone in the pin's colour, with the
 *                              details that were pin-coloured cut out, for the
 *                              legend, chips and headings
 *   public/icons/intent-tile/  the glyph alone in its own colours, to sit in a
 *                              box filled with the pin's colour
 *   public/icons/intent-cream/ the glyph alone in cream, cut out the same way as
 *                              the mark, for a box filled with any other colour
 *
 * and src/data/intent-pins.json with each pin's colour. File names become
 * slugs ("work out.svg" -> work-out), which must match `icon` in intents.js.
 *
 *   node scripts/intent-pins.mjs "path/to/Map icons svg pin"
 *
 * Without a path it re-cuts the pins already in public/icons/intent-pin/.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = (cut) => resolve(ROOT, `public/icons/intent-${cut}`);
const MANIFEST = resolve(ROOT, 'src/data/intent-pins.json');

/* Every glyph sits inside the pin's body. One square crop around all of them
   keeps their sizes relative to each other, as they are on the pins. */
const CROP = { x: 8.5, y: 3, size: 44 };
const CREAM = '#FFFAF2';

/* A flat 62×64 pin; the map sizes and anchors it to match (wellness-map.js). */
const pinSvg = (paths) => [
  '<svg xmlns="http://www.w3.org/2000/svg" width="62" height="64" viewBox="0 0 62 64" fill="none">',
  ...paths,
  '</svg>',
  '',
].join('\n');

const PATH = /<path\b([^>]*?)\/>/g;
const attr = (attrs, name) => attrs.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
const slugOf = (file) => basename(file, '.svg').trim().toLowerCase().replace(/\s+/g, '-');

const src = process.argv[2] ? resolve(process.argv[2]) : OUT('pin');
const files = readdirSync(src).filter((f) => f.toLowerCase().endsWith('.svg')).sort();
if (!files.length) throw new Error(`No SVGs in ${src}`);
['pin', 'mark', 'tile', 'cream'].forEach((cut) => mkdirSync(OUT(cut), { recursive: true }));

const { x, y, size } = CROP;
const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${x} ${y} ${size} ${size}" fill="none">`;
const manifest = {};
let silhouette = null;

for (const file of files) {
  const slug = slugOf(file);
  const svg = readFileSync(resolve(src, file), 'utf8');
  const paths = [...svg.matchAll(PATH)].map(([, a]) => ({ d: attr(a, 'd'), fill: attr(a, 'fill'), stroke: attr(a, 'stroke') }));

  /* The silhouette is drawn first; everything after it is glyph. */
  const [body, ...glyph] = paths;
  if (!body?.d || !body.fill) throw new Error(`${file}: the first path should be the filled pin silhouette`);
  const colour = body.fill.toUpperCase();
  if (!glyph.length || glyph.some((p) => !p.d || !p.fill)) throw new Error(`${file}: glyph paths need a d and a fill`);
  const pinColoured = (p) => p.fill.toUpperCase() === colour;

  const tile = [open, ...glyph.map((p) => `<path d="${p.d}" fill="${p.fill}"/>`), '</svg>', ''].join('\n');
  /* The glyph in one colour. Painted in order into a mask, so a pin-coloured
     detail drawn over the glyph becomes a hole in it rather than disappearing
     into it. */
  const solid = (fill) => [
    open,
    `<mask id="glyph" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${size}" height="${size}">`,
    ...glyph.map((p) => `<path d="${p.d}" fill="${pinColoured(p) ? '#000' : '#FFF'}"/>`),
    '</mask>',
    `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${fill}" mask="url(#glyph)"/>`,
    '</svg>',
    '',
  ].join('\n');

  /* Rebuilt from its paths, with a cream outline on a coloured silhouette so it
     lifts off any ground; a cream silhouette gets none. */
  const outline = colour !== CREAM ? ` stroke="${CREAM}"` : '';
  writeFileSync(resolve(OUT('pin'), `${slug}.svg`), pinSvg([
    `<path d="${body.d}" fill="${body.fill}"${outline}/>`,
    ...glyph.map((p) => `<path d="${p.d}" fill="${p.fill}"/>`),
  ]));
  silhouette = body.d;
  writeFileSync(resolve(OUT('mark'), `${slug}.svg`), solid(colour));
  writeFileSync(resolve(OUT('cream'), `${slug}.svg`), solid('#FFFAF2'));
  writeFileSync(resolve(OUT('tile'), `${slug}.svg`), tile);
  manifest[slug] = { colour };
}

/* The cluster pin: the same silhouette in cream, with no outline. */
writeFileSync(resolve(ROOT, 'public/icons/cluster-pin.svg'), pinSvg([`<path d="${silhouette}" fill="${CREAM}"/>`]));
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Cut ${files.length} pins: ${Object.keys(manifest).map((s) => `${s} ${manifest[s].colour}`).join(', ')}`);
