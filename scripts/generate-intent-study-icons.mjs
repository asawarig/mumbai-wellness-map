import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public/icons/intent-study');
const DATA_MANIFEST = resolve(ROOT, 'src/data/intent-study-manifest.json');

const P = {
  plum: '#571541',
  cream: '#FFFCF9',
  promise: '#FFEBDB',
  coral: '#FF4052',
  marigold: '#FFBF21',
  sky: '#429CD8',
  paleSky: '#DCEFF8',
  leaf: '#92BD33',
  muted: '#8C6079',
};

/* Garden City field-guide marks.
 *
 * These are intentionally illustrations rather than generic UI pictograms:
 * one local object, one dominant intent colour, Plum structural ink, and one
 * contextual accent. Texture belongs to larger spot art, never the 24px SVG.
 */
const icons = [
  {
    slug: 'move',
    name: 'Move',
    description: 'Bengaluru lake steps beneath a flowering rain-tree canopy',
    art: `
      <path fill="${P.leaf}" stroke="none" d="M3.1 8.2c-.7-1.5.2-3 1.8-3.1.2-1.8 2.2-2.7 3.6-1.5 1.1-1.4 3.4-1.1 4 .5 1.7-.9 3.8.2 3.8 2.1 1.6.1 2.5 1.8 1.7 3.1-3.6-.6-6.3-.7-8.5-.2-2.3.5-4.3.3-6.4-.9Z"/>
      <path fill="none" d="M8.5 8.2c-.1 2.2-.9 3.6-2.2 4.8m2.2-4.8c1.6.9 2.8 1.1 4.4.4"/>
      <path fill="${P.cream}" d="M4.1 13h7.5v2H5.2zm1.1 2h8.7v2.1H6.3zm1.1 2.1h9.4v2.1H7.4z"/>
      <path fill="none" stroke="${P.sky}" d="M3.4 20.4c1.5-.8 2.8-.8 4.2 0 1.3.8 2.7.8 4 0 1.4-.8 2.7-.8 4.1 0 1.3.8 2.6.8 4 0M7 22c1-.5 2-.5 3 0 1 .5 2 .5 3 0 1-.5 2-.5 3 0"/>
      <path fill="${P.coral}" stroke="none" d="M18.3 7.2c-.9-.3-1.1-1.4-.3-1.9-.4-.9.4-1.8 1.3-1.4.6-.8 1.8-.3 1.8.6 1 .1 1.3 1.3.5 1.9.4.9-.5 1.7-1.4 1.3-.6.8-1.7.4-1.9-.5-.5.2-1 .2-1.4 0Z"/>
      <circle cx="19.8" cy="5.8" r=".45" fill="${P.marigold}" stroke="none"/>`,
  },
  {
    slug: 'play',
    name: 'Play',
    description: 'Gully-cricket stumps, ball and a flowering branch',
    art: `
      <path fill="${P.coral}" stroke="${P.plum}" d="m5.2 5.1 2.5-.2.4 11.8-2.5.2zm5.2-.3 2.5.1-.3 11.8-2.5-.1zm5.1.3 2.4.3-.7 11.7-2.4-.3Z"/>
      <path fill="none" d="m4.5 17.7 14.1.2M5 4.6l13.4.5"/>
      <circle cx="19.1" cy="10.3" r="2.5" fill="${P.marigold}"/>
      <path fill="none" d="m17.4 8.5-1.9-2.1"/>
      <path fill="${P.leaf}" stroke="none" d="M3.4 5.2c.2-1.5 1.3-2.5 2.8-2.7-.2 1.5-1.2 2.5-2.8 2.7Z"/>`,
  },
  {
    slug: 'work-out',
    name: 'Work out',
    description: 'Colourful climbing holds on a Bengaluru granite wall',
    art: `
      <path fill="${P.plum}" stroke="none" d="M3.6 3.5 20 4.2l.5 16.2-16.8.2Z"/>
      <path fill="${P.promise}" stroke="none" opacity=".18" d="m5 5.1 4.5-.4-1.7 2.5 3.8 1.4-2.1 2.3 3.1 2.3-3 2.1 1.2 3.6-5.4-.2Z"/>
      <path fill="${P.marigold}" stroke="none" d="M6 6.2h3.7l-1.2 2.7-3.1-.2Z"/>
      <path fill="${P.coral}" stroke="none" d="m14.2 6.5 3.3.4-.6 3.1-3.7-.2Z"/>
      <path fill="${P.sky}" stroke="none" d="m9.7 11.1 3.8-.4.7 3.1-3.9 1Z"/>
      <path fill="${P.leaf}" stroke="none" d="m15.3 14.8 2.9.4-1.1 3.1-3.4-.2Z"/>
      <path fill="none" stroke="${P.promise}" d="M6.2 18.1c2.1-1 3.3-2.4 4.1-4.1 1-2.2 2.3-3.7 4.1-4.6"/>`,
  },
  {
    slug: 'eat-healthy',
    name: 'Eat healthy',
    description: 'A banana-leaf meal seen from above',
    art: `
      <path fill="${P.leaf}" stroke="${P.plum}" d="M3.4 12.3C7 5.5 13.8 3.2 20.6 4.1c-.7 7.7-5.8 14.3-14.9 16.2-1.7-2.5-2.5-5.2-2.3-8Z"/>
      <path fill="none" d="M5.4 18.4C9 13.8 13 10.2 19 5.8"/>
      <circle cx="11.6" cy="11.4" r="3.1" fill="${P.promise}" stroke="none"/>
      <circle cx="8.1" cy="15.1" r="1.5" fill="${P.marigold}" stroke="none"/>
      <path fill="${P.coral}" stroke="none" d="m14.8 7.1 2.7.4-1.3 2.1-2.4-.5Z"/>`,
  },
  {
    slug: 'indulge',
    name: 'Indulge',
    description: 'A steel filter-coffee tumbler nested in its dabarah',
    art: `
      <ellipse cx="12" cy="19.2" rx="7.6" ry="2.1" fill="${P.marigold}" stroke="${P.plum}"/>
      <path fill="${P.coral}" stroke="${P.plum}" d="m7.2 7.1 9.7.1-1.1 8.1c-.3 2-2 3.4-4.1 3.3-2-.1-3.6-1.5-3.8-3.5Z"/>
      <ellipse cx="12.1" cy="7.1" rx="4.9" ry="2.1" fill="${P.promise}"/>
      <path fill="none" d="M9.1 6.8c1.5.8 4.3.8 6 0"/>
      <path fill="none" stroke="${P.sky}" d="M10 4.8c-.8-1.1-.6-2 .5-2.8m3.1 2.7c.9-1.1.8-2.1-.2-3"/>`,
  },
  {
    slug: 'reset',
    name: 'Reset',
    description: 'A quiet courtyard bench beneath fern and Tabebuia',
    art: `
      <path fill="${P.paleSky}" stroke="${P.plum}" d="M3.2 4.4h17.5v15.4H3.5Z"/>
      <path fill="${P.leaf}" stroke="none" d="M4.2 5.2c3.8-.2 6.5 1.1 8 3.8-3.8.5-6.5-.8-8-3.8Zm15.4-.3c-3.1.3-5.2 1.6-6.3 4.1 3.2.2 5.3-1.2 6.3-4.1Z"/>
      <path fill="${P.coral}" stroke="none" d="M17.5 7c-.7-.3-.9-1.2-.2-1.6-.3-.8.4-1.5 1.1-1.1.5-.7 1.5-.3 1.5.5.8.1 1 1 .4 1.5.3.7-.4 1.4-1.2 1.1-.4.6-1.4.3-1.6-.4Z"/>
      <path fill="${P.plum}" stroke="none" d="M5.4 14.2h12.7v2.4H5.4zm1.1 2.4h1.7v3H6.5zm9.2 0h1.7v3h-1.7Z"/>
      <path fill="${P.marigold}" stroke="${P.plum}" d="M10.3 11.7h3.5l-.5 2.5h-2.5Z"/>
      <path fill="none" d="M11.2 11.1c-.7-.8-.6-1.5.2-2.2m1.4 2.1c.7-.8.6-1.5-.1-2.1"/>`,
  },
  {
    slug: 'clear-my-head',
    name: 'Clear my head',
    description: 'An open window, slow curtain and distant dome',
    art: `
      <path fill="${P.sky}" stroke="${P.plum}" d="m4.1 4.1 15.7.5-.4 15.3-15.6-.3Z"/>
      <path fill="${P.promise}" stroke="${P.plum}" d="m6.5 6.5 10.9.3-.3 10.8-10.8-.2Z"/>
      <path fill="none" d="m11.9 6.7-.2 10.8M6.4 12l10.8.3"/>
      <path fill="${P.coral}" stroke="none" d="M6.4 6.5c2.2 2.3 2.6 4.7 1.1 7.1-1.1 1.8-1.2 3-.4 3.8H4.6l.2-10.9Z"/>
      <path fill="${P.plum}" stroke="none" d="M13.4 17.5c.3-2.3 1.6-3.7 3.8-4.3 2.2.7 3.3 2.2 3.3 4.6Z"/>
      <circle cx="17.1" cy="13.1" r=".7" fill="${P.marigold}" stroke="none"/>`,
  },
  {
    slug: 'get-care',
    name: 'Get care',
    description: 'A welcoming neighbourhood clinic with a shaded veranda',
    art: `
      <path fill="${P.sky}" d="M3.3 9.4 5 5.6l14.5.2 1.2 3.7-.9.8-15.7-.1Z"/>
      <path fill="${P.coral}" stroke="none" d="m3.5 9.2 17 .2-.8 2-15.5-.1Z"/>
      <path fill="${P.paleSky}" d="M5 11.3v8.9h14v-8.8"/>
      <path fill="${P.plum}" stroke="none" d="m9.3 13.1 5.4.1-.1 7H9.1Z"/>
      <path fill="${P.promise}" stroke="none" d="m10.3 14 3.2.1-.1 6.1h-3.2Z"/>
      <circle cx="12.8" cy="17.2" r=".35" fill="${P.coral}" stroke="none"/>
      <path fill="none" d="M6.2 13.3h2v3.1h-2zm9.8 0h1.9v3.1H16zM19.2 20.1v-4.4m0 1.7c-.9-.2-1.5-.8-1.7-1.6 1-.1 1.6.4 1.7 1.6Zm0 .8c.9-.3 1.5-.9 1.7-1.8-.9 0-1.6.6-1.7 1.8Z"/>
      <path fill="${P.leaf}" stroke="none" d="M17.8 19.4h2.8l-.4 2h-2Z"/>
      <path fill="none" d="M3.5 21.5c4-.2 7.8-.2 11.3 0 2.2.1 4.1 0 5.9-.2"/>`,
  },
  {
    slug: 'buy-gear',
    name: 'Buy gear',
    description: 'A bicycle wheel and Bengaluru cycle bell',
    art: `
      <circle cx="10.1" cy="13.6" r="7.3" fill="${P.promise}" stroke="${P.plum}"/>
      <circle cx="10.1" cy="13.6" r="1.3" fill="${P.coral}" stroke="none"/>
      <path fill="none" d="M10.1 6.3v6m0 2.6v6m-7.3-7.3h6m2.6 0h6m-5.2-5.2-1.3 3.9m-2.2 2.2-3.8 1.3m10.4 2.9-4.2-3.5"/>
      <path fill="${P.leaf}" stroke="${P.plum}" d="M16.1 5.4c0-2 1.4-3.4 3.2-3.4 1.7 0 2.9 1.2 2.9 2.8s-1.1 2.7-2.6 2.9h-3.5Z"/>
      <path fill="none" d="M18.8 7.7v2.1m-1.7 0h3.4"/>`,
  },
  {
    slug: 'fix-my-wearable',
    name: 'Fix my wearable',
    description: 'An open watch face and a tiny repair tool',
    art: `
      <path fill="${P.muted}" stroke="${P.plum}" d="m8.7 6.5.8-3.8h5l.8 3.8m0 11-.8 3.8h-5l-.8-3.8"/>
      <rect x="6.7" y="6.1" width="10.7" height="11.8" rx="3" fill="${P.coral}" stroke="${P.plum}"/>
      <circle cx="12" cy="12" r="3.2" fill="${P.promise}"/>
      <path fill="none" d="M12 9.8v2.5l1.6 1"/>
      <path fill="${P.sky}" stroke="${P.plum}" d="m17.6 15.8 1.4-1.4 2.2 2.2-1.4 1.4-1-.4-2.7 2.7-1.2-1.2 2.7-2.7Z"/>`,
  },
  {
    slug: 'find-your-people',
    name: 'Find your people',
    description: 'A gathering of seed-like marks beneath one canopy',
    art: `
      <path fill="${P.coral}" stroke="none" d="M3.1 8.4c-.5-1.5.4-2.8 1.9-2.8.4-1.6 2.3-2.2 3.6-1.2 1.3-1.3 3.4-.7 3.9.9 1.6-.8 3.5.2 3.6 1.9 1.6.2 2.3 1.7 1.5 3-5.2-1.2-10-.7-14.5-1.8Z"/>
      <path fill="none" d="M9.7 8.5c0 2-.6 3.4-1.8 4.5m1.8-4.5c1.2.9 2.4 1.1 3.7.8"/>
      <ellipse cx="6" cy="16.7" rx="1.6" ry="2.1" fill="${P.leaf}" stroke="none" transform="rotate(-18 6 16.7)"/>
      <ellipse cx="10" cy="15.2" rx="1.6" ry="2.1" fill="${P.sky}" stroke="none" transform="rotate(10 10 15.2)"/>
      <ellipse cx="14.2" cy="16.2" rx="1.6" ry="2.1" fill="${P.marigold}" stroke="none" transform="rotate(-8 14.2 16.2)"/>
      <ellipse cx="18" cy="15" rx="1.6" ry="2.1" fill="${P.muted}" stroke="none" transform="rotate(17 18 15)"/>
      <path fill="none" d="M5.1 20.2c3.8-1.3 8.9-1.2 13.7.1"/>`,
  },
];

function svg({ name, description, art }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-labelledby="title desc">
  <title id="title">${name}</title>
  <desc id="desc">${description}</desc>
  <g stroke="${P.plum}" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">
${art.trim().split('\n').map((line) => `    ${line.trim()}`).join('\n')}
  </g>
</svg>
`;
}

mkdirSync(OUT, { recursive: true });
for (const icon of icons) {
  writeFileSync(resolve(OUT, `${icon.slug}.svg`), svg(icon));
}

const manifest = `${JSON.stringify(
  icons.map(({ slug, name, description }) => ({ slug, name, description })),
  null,
  2,
)}\n`;
writeFileSync(resolve(OUT, 'manifest.json'), manifest);
writeFileSync(DATA_MANIFEST, manifest);

console.log(`Wrote ${icons.length} intent icons to ${OUT}`);
