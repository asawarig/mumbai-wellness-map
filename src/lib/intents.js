/* The nine public categories for the wellness map.
 *
 * Each entry in entries.json keeps its brand category (c) and sub-category (g).
 * Categories are a presentation layer on top: the prompt, the chip row and the
 * pin colour families all read this file.
 *
 * Until v8 a category could be derived from the sub-category alone. It cannot
 * any more: five sub-categories split across two or three categories (a swim
 * spot is Move or Play, a climbing wall is Work out or Play, a new-age centre
 * is Check your health, Mental health or Work out, a shop is Buy gear or Eat
 * healthy, a stadium is Play or Move). So the sheet carries the category per
 * row in entries.json as `cat`, and G_TO_INTENT below is the fallback for the
 * rows no sheet produced — city parks (sub-category "park"; see src/lib/db.js)
 * and the traced routes, which are Move either way.
 *
 * The keys are internal and older than the v8 names: `care` is Check your
 * health, `clear` is Mental health, `people` is Communities. They are also the
 * DOM ids, the pin image names and the icon file names on disk, so they were
 * left alone when the labels changed. The verb is what a reader sees.
 *
 * Communities is list-only — never invent map pins for it. The v8 sheet asks
 * for cards plus a pin where a club has a fixed meeting point, which is a
 * change of its own; only 7 of its 57 rows carry coordinates today.
 */

import PINS from '../data/intent-pins.json';

/* Where a reader tells us what we missed. Used by the About copy and by the
   note an empty locality shows. */
export const SUGGEST_FORM = 'https://tally.so/r/gDEb24';

export const VISION = '#571541';
export const PROMISE = '#FFEBDB';
export const SURFACE = '#FFFCF9';

export const INTENT_COLOUR = {
  leaf: '#92BD33',
  vision: VISION,
  marigold: '#FFBF21',
  sky: '#429CD8',
  /* Plum, not red: red is kept for Plum Perks. */
  coral: VISION,
  muted: '#8C6079',
};

/* The fallback, for a row with no category of its own. Exclusive: every g key
   appears in exactly one category. Where a sub-category splits, this is the
   side the majority of its rows fall on. */
export const G_TO_INTENT = {
  run: 'move',
  cycle: 'move',
  swim: 'move',
  trek: 'move',
  track: 'move',
  park: 'move',

  badminton: 'play',
  padel: 'play',
  tennis: 'play',
  cricket: 'play',
  turf: 'play',
  multisport: 'play',
  play: 'play',
  golf: 'play',
  stadium: 'play',
  court: 'play',
  specialty: 'play',

  gym: 'workout',
  yoga: 'workout',
  climb: 'workout',
  act_gym: 'workout',

  healthy: 'eat',
  nutrition: 'eat',
  indulgent: 'indulge',

  /* A new-age health centre is Check your health unless the sheet says the row
     is a relaxation space (Mental health) or contrast therapy (Work out). */
  newage: 'care',

  therapy: 'clear',
  alttherapy: 'clear',

  /* Where a hospital would sit if it were not parked — see the Hospitals entry
     below and PARK_HOSPITALS in scripts/ingest-entries.mjs. */
  hospital: 'care',
  clinic: 'care',
  lab: 'care',
  physio: 'care',

  retail: 'gear',
  bike: 'gear',
  /* Wearable service used to be a category of its own. v8 files gear support
     with gear. */
  wearable: 'gear',

  group: 'people',
  hangout: 'people',
  account: 'people',
};

export const INTENTS = [
  {
    k: 'move',
    verb: 'Move',
    prompt: 'move',
    family: 'leaf',
    c: INTENT_COLOUR.leaf,
    map: true,
    parks: true,
    icon: 'move',
    vignette: 'art/vignette-move.png',
    g: ['run', 'cycle', 'swim', 'trek', 'track', 'park'],
    blurb: 'Run, cycle, swim, trek — and the city’s parks.',
  },
  {
    k: 'play',
    verb: 'Play',
    prompt: 'play',
    family: 'leaf',
    c: INTENT_COLOUR.leaf,
    map: true,
    parks: false,
    icon: 'play',
    vignette: 'art/vignette-play.png',
    g: ['badminton', 'padel', 'tennis', 'cricket', 'turf', 'multisport', 'play', 'golf', 'stadium', 'court', 'specialty'],
    blurb: 'Courts, turfs, stadiums and games.',
  },
  {
    k: 'workout',
    verb: 'Work out',
    prompt: 'work out',
    family: 'vision',
    c: INTENT_COLOUR.vision,
    map: true,
    parks: false,
    icon: 'work-out',
    vignette: 'art/vignette-workout.png',
    g: ['gym', 'yoga', 'climb', 'act_gym'],
    blurb: 'Gyms, yoga, climbing, classes and recovery.',
  },
  {
    k: 'eat',
    verb: 'Eat healthy',
    prompt: 'eat healthy',
    family: 'marigold',
    c: INTENT_COLOUR.marigold,
    map: true,
    parks: false,
    icon: 'eat-healthy',
    vignette: 'art/vignette-eat.png',
    g: ['healthy', 'nutrition'],
    blurb: 'Kitchens, health food stores and dietitians.',
  },
  {
    k: 'care',
    verb: 'Check your health',
    prompt: 'check my health',
    family: 'coral',
    c: INTENT_COLOUR.coral,
    map: true,
    parks: false,
    icon: 'get-care',
    vignette: 'art/vignette-care.png',
    g: ['clinic', 'lab', 'physio', 'newage'],
    blurb: 'Labs, checkups, clinics and physio.',
  },
  {
    k: 'clear',
    verb: 'Mental health',
    prompt: 'center myself',
    family: 'sky',
    c: INTENT_COLOUR.sky,
    map: true,
    parks: false,
    icon: 'clear-my-head',
    vignette: 'art/vignette-clear.png',
    g: ['therapy', 'alttherapy'],
    blurb: 'Therapy, counselling and quiet rooms.',
  },
  {
    k: 'gear',
    verb: 'Buy gear',
    prompt: 'buy gear',
    family: 'muted',
    c: INTENT_COLOUR.muted,
    /* Off the map: shops are not what the map is for. The rows stay in the
       data, so turning this back on brings them back as they were. */
    map: false,
    parks: false,
    icon: 'buy-gear',
    vignette: 'art/vignette-gear.png',
    g: ['retail', 'bike', 'wearable'],
    blurb: 'Shoes, bikes, mats — and the shop that fixes your watch.',
  },
  {
    k: 'people',
    verb: 'Communities',
    prompt: 'find my people',
    family: 'coral',
    c: INTENT_COLOUR.coral,
    map: false,
    parks: false,
    icon: 'find-your-people',
    vignette: 'art/cliff-people.png',
    g: ['group', 'hangout', 'account'],
    blurb: 'Run clubs, riding groups and the accounts worth following.',
  },
  /* Parked out of Check your health: the 91 hospitals, on the grounds that the
     category is about checking your health, not admission. Kept in the data and
     in the A-Z index, off the map. scripts/ingest-entries.mjs holds the rule and
     the flag that puts them back; it borrows the Check your health glyph rather
     than mint one for a category that is not meant to be browsed. */
  {
    k: 'hospital',
    verb: 'Hospitals',
    prompt: 'find a hospital',
    family: 'coral',
    c: INTENT_COLOUR.coral,
    map: false,
    parked: true,
    parks: false,
    icon: 'get-care',
    vignette: 'art/vignette-care.png',
    g: ['hospital'],
    blurb: 'Hospitals, parked off the map.',
  },
  /* Parked by the v8 recategorisation: 66 rows of indulgent food with no home
     in the nine. The sheet keeps them at map_eligible=no rather than deleting
     them, so they stay in the list and the A–Z index and off the map, and the
     category comes back with one flag flip. */
  {
    k: 'indulge',
    verb: 'Indulge',
    prompt: 'indulge',
    family: 'marigold',
    c: INTENT_COLOUR.marigold,
    map: false,
    parked: true,
    parks: false,
    icon: 'indulge',
    vignette: 'art/vignette-indulge.png',
    g: ['indulgent'],
    blurb: 'Worth the treat.',
  },
];

export const INTENT_BY_K = Object.fromEntries(INTENTS.map((i) => [i.k, i]));
export const MAP_INTENTS = INTENTS.filter((i) => i.map);

/* Takes an entry, so a row can carry a category the sub-category would not
   give. A bare sub-category string still works for the callers that have one. */
export function intentForG(entry) {
  if (entry && typeof entry === 'object') return entry.cat || G_TO_INTENT[entry.g] || null;
  return G_TO_INTENT[entry] || null;
}

export function intentMeta(entry) {
  const k = intentForG(entry);
  return k ? INTENT_BY_K[k] : null;
}

const slugOf = (intent) => (typeof intent === 'string' ? INTENT_BY_K[intent]?.icon : intent?.icon) || 'move';

/* An intent's icon, cut from its pin by scripts/intent-pins.mjs:
 *   'mark'  the glyph alone in the pin's colour, for the legend, chips and headings
 *   'tile'  the glyph in its own colours, for a box filled with pinColour()
 *   'cream' the glyph in cream, for a box filled with any other colour
 *   'pin'   the whole pin, for places on the map
 * An intent without a pin (Communities) keeps its study icon for all three. */
export function iconUrl(intent, base = '/', cut = 'mark') {
  const slug = slugOf(intent);
  const root = base.endsWith('/') ? base : `${base}/`;
  return PINS[slug] ? `${root}icons/intent-${cut}/${slug}.svg` : `${root}icons/intent-study/${slug}.svg`;
}

/* The fill of an intent's pin, or null for an intent without one. */
export function pinColour(intent) {
  return PINS[slugOf(intent)]?.colour || null;
}

export function vignetteUrl(intent, base = '/') {
  const path = typeof intent === 'string' ? INTENT_BY_K[intent]?.vignette : intent?.vignette;
  const root = base.endsWith('/') ? base : `${base}/`;
  return path ? `${root}${path.replace(/^\//, '')}` : `${root}art/empty-state.png`;
}
