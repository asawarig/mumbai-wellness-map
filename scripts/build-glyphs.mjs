/* Builds the map's label glyphs (public/fonts/<name>/<range>.pbf) from a font
 * file, since OpenFreeMap only serves its own fonts. fontnik is not a project
 * dependency; install it for the run:
 *
 *   npm i --no-save fontnik
 *   node scripts/build-glyphs.mjs DMSans-Light.ttf "public/fonts/DM Sans Light"
 *
 * DM Sans Light is the static 300 weight from Google Fonts (OFL). Thinner
 * weights lose the I: its stem is too fine for fontnik and comes out empty. */
import fontnik from 'fontnik';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const [src, outDir] = process.argv.slice(2);
const font = readFileSync(src);
mkdirSync(outDir, { recursive: true });
const ranges = [];
for (let s = 0; s < 65536; s += 256) ranges.push([s, s + 255]);
let total = 0, written = 0;
for (const [start, end] of ranges) {
  const pbf = await new Promise((ok, fail) => fontnik.range({ font, start, end }, (e, d) => e ? fail(e) : ok(d)));
  // Skip ranges with no glyphs so the folder stays small; MapLibre only asks for ranges it needs.
  // Every range is written, empty or not: a missing one is a 404 the map reports as an error.
  writeFileSync(`${outDir}/${start}-${end}.pbf`, pbf);
  total += pbf.length; written++;
}
console.log(`wrote ${written} ranges, ${(total / 1024).toFixed(0)} KB`);
