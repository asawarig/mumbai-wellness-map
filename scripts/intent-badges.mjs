/* The intent badges.
 *
 * Takes round badge SVGs (sources/icons/badges/<slug>.svg, 56×56: a filled
 * circle in the intent's colour, drawn first, with a glyph on it) and writes
 * the same four cuts scripts/intent-pins.mjs wrote for the old teardrop pins:
 *
 *   public/icons/intent-pin/   the badge, for places on the map
 *   public/icons/intent-mark/  the glyph alone in the badge's colour, with the
 *                              details that were badge-coloured cut out, for the
 *                              legend, chips and headings
 *   public/icons/intent-tile/  the glyph alone in its own colours
 *   public/icons/intent-cream/ the glyph alone in cream, cut out like the mark
 *
 * plus the cream cluster heap, the Plum Perks star with and without its gift,
 * the gift alone,
 * and src/data/intent-pins.json with each badge's colour.
 *
 *   node scripts/intent-badges.mjs
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'sources/icons/badges');
const OUT = (cut) => resolve(ROOT, `public/icons/intent-${cut}`);
const MANIFEST = resolve(ROOT, 'src/data/intent-pins.json');
const CREAM = '#FFFAF2';
/* Every glyph sits inside the circle; one crop keeps their sizes relative. */
const CROP = { x: 4, y: 4, size: 48 };

const SHAPE = /<(path|rect|circle)\b[^>]*?\/>/g;
const fillOf = (el) => el.match(/\bfill="([^"]*)"/)?.[1];
const withFill = (el, fill) => el.replace(/\bfill="[^"]*"/, `fill="${fill}"`);

const { x, y, size } = CROP;
const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${x} ${y} ${size} ${size}" fill="none">`;
['pin', 'mark', 'tile', 'cream'].forEach((cut) => mkdirSync(OUT(cut), { recursive: true }));

const manifest = {};
for (const file of readdirSync(SRC).filter((f) => f.endsWith('.svg')).sort()) {
  const slug = basename(file, '.svg');
  const svg = readFileSync(resolve(SRC, file), 'utf8');
  const [body, ...glyph] = svg.match(SHAPE) || [];
  if (!body?.startsWith('<circle') || !fillOf(body)) throw new Error(`${file}: the first shape should be the filled circle`);
  const colour = fillOf(body).toUpperCase();
  const own = (el) => fillOf(el)?.toUpperCase() === colour;

  const solid = (fill) => [
    open,
    `<mask id="glyph" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${size}" height="${size}">`,
    ...glyph.map((el) => withFill(el, own(el) ? '#000' : '#FFF')),
    '</mask>',
    `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${fill}" mask="url(#glyph)"/>`,
    '</svg>', '',
  ].join('\n');

  writeFileSync(resolve(OUT('pin'), `${slug}.svg`),
    ['<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56" fill="none">', body, ...glyph, '</svg>', ''].join('\n'));
  writeFileSync(resolve(OUT('mark'), `${slug}.svg`), solid(colour));
  writeFileSync(resolve(OUT('cream'), `${slug}.svg`), solid(CREAM));
  writeFileSync(resolve(OUT('tile'), `${slug}.svg`), [open, ...glyph, '</svg>', ''].join('\n'));
  manifest[slug] = { colour };
}

/* Clusters: a cloud of cream circles (sources/icons/cluster.svg), with any
   drop shadows the design carries taken off; the map writes the count on it. */
writeFileSync(resolve(ROOT, 'public/icons/cluster-pin.svg'), readFileSync(resolve(ROOT, 'sources/icons/cluster.svg'), 'utf8')
  .replace(/\s*<defs>[\s\S]*?<\/defs>/, '')
  .replace(/\s*filter="[^"]*"/g, ''));

/* The Perks star: as drawn, and with only its outline shape, for a category glyph. */
const star = readFileSync(resolve(ROOT, 'sources/icons/perk-star.svg'), 'utf8');
const [starShape, ...gift] = star.match(SHAPE);
const star74 = (shapes) => `<svg xmlns="http://www.w3.org/2000/svg" width="74" height="74" viewBox="0 0 74 74" fill="none">\n${shapes.join('\n')}\n</svg>\n`;
/* The star's points softened: drawn twice with round joins, a wide cream
   rim under a red body whose own red stroke rounds its corners. The rim
   shows about 3.3 units, which at the star's size on the map is the same
   width as the square pins' cream rim. */
/* The star itself, redrawn clean: five points on the drawn star's centre and
   reach, every corner, point and valley alike, rounded by a curve. The drawn
   star's valleys were cut with tiny facets, which a rim traced round them
   turned into kinks. */
const STAR_PATH = (() => {
  const cx = 37, cy = 37.8, R = 31.6, r = 20.5, round = [3.4, 1.9];
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rad = i % 2 ? r : R;
    return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  });
  const f = (n) => +n.toFixed(2);
  const toward = ([x1, y1], [x2, y2], d) => { const l = Math.hypot(x2 - x1, y2 - y1); return [x1 + ((x2 - x1) * d) / l, y1 + ((y2 - y1) * d) / l]; };
  let d = '';
  pts.forEach((p, i) => {
    const prev = pts[(i + 9) % 10], next = pts[(i + 1) % 10], c = round[i % 2];
    const a = toward(p, prev, c), b = toward(p, next, c);
    d += `${i ? 'L' : 'M'}${f(a[0])} ${f(a[1])}Q${f(p[0])} ${f(p[1])} ${f(b[0])} ${f(b[1])}`;
  });
  return `${d}Z`;
})();
const soft = (el) => {
  const d = STAR_PATH;
  const red = fillOf(el);
  return [
    `<path d="${d}" fill="${CREAM}" stroke="${CREAM}" stroke-width="9.6" stroke-linejoin="round"/>`,
    `<path d="${d}" fill="${red}" stroke="${red}" stroke-width="3" stroke-linejoin="round"/>`,
  ];
};
writeFileSync(resolve(ROOT, 'public/icons/perk-star-blank.svg'), star74(soft(starShape)));
writeFileSync(resolve(ROOT, 'public/icons/perk-star.svg'), star74([...soft(star.match(SHAPE)[0]), ...star.match(SHAPE).slice(1)]));
/* The gift alone, so the map can set it on the star at the size of a category glyph. */
writeFileSync(resolve(ROOT, 'public/icons/perk-gift.svg'), star74(gift));

writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Cut ${Object.keys(manifest).length} badges: ${Object.entries(manifest).map(([s, m]) => `${s} ${m.colour}`).join(', ')}`);
