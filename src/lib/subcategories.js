/* Subcategories, at most four to an activity. The sheet's own labels (`s`)
 * run to a dozen under Move and nine under Check my health, most of them a
 * handful of rows each; this folds them into groups a reader can tell apart.
 * The label stays on the row, untouched, for the card; the group is `sc`.
 *
 * Each group lists the sheet labels it takes. A label not listed falls into
 * the activity's last group, so a new label in the sheet still lands
 * somewhere rather than nowhere. Parks have no label: they come from the
 * OpenStreetMap (scripts/osm-parks.mjs), and the first Move group takes them by their `g`.
 *
 * `say` is the group as words that follow "I want to", for the sentence picker.
 */
export const SUBCATEGORIES = {
  move: [
    /* The register's parks, and the curated walking loops that are parks by
       name (Defence Colony Park, Wood Park); a lake park stays a lake loop. */
    { k: 'parks', label: 'Parks', say: 'walk in a park', g: ['park'], n: /\bpark\b/i, ns: ['Park / Lake walking loop', 'Park loop'] },
    { k: 'walks', label: 'Walking loops', say: 'walk a lake loop', s: ['Park / Lake walking loop', 'Lake loop', 'Park link', 'Lake shoreline', 'Park loop', 'Road loop'] },
    { k: 'routes', label: 'Routes, tracks and treks', say: 'run or cycle', g: ['run', 'cycle', 'track', 'trek'], s: ['Running route / trail', 'Cycling route', 'Athletics track / stadium loop'] },
    { k: 'water', label: 'Swimming and rowing', say: 'swim or row', g: ['swim'], s: ['Swimming pool', 'Rowing'] },
  ],
  play: [
    { k: 'courts', label: 'Courts', say: 'play on a court', g: ['badminton', 'padel', 'tennis'], s: ['Court venue'] },
    { k: 'venues', label: 'Multi-sport venues and stadiums', say: 'play at a stadium', g: ['multisport', 'stadium', 'golf'], s: ['Multi-sport venue / Stadium'] },
    { k: 'turfs', label: 'Turfs and grounds', say: 'play on a turf', g: ['turf', 'cricket'], s: ['Turf / Ground'] },
    { k: 'other', label: 'Pools and other sports', say: 'try a new sport', s: ['Specialty sport venue', 'Swimming pool', 'Entertainment venue'] },
  ],
  workout: [
    { k: 'gyms', label: 'Gyms', say: 'hit the gym', g: ['gym'], s: ['Gym / Fitness center', 'Specialty fitness studio', 'Recovery / Contrast therapy', 'Gym class', 'Group class'] },
    { k: 'yoga', label: 'Yoga and Pilates', say: 'stretch', g: ['yoga'], s: ['Yoga studio', 'Pilates studio', 'Yoga class', 'Barre studio'] },
    { k: 'combat', label: 'Martial arts', say: 'learn to fight', s: ['Martial arts / Combat sport', 'Martial arts'] },
    { k: 'other', label: 'Dance, climbing and more', say: 'dance or climb', g: ['act_gym'], s: ['Dance / Movement studio', 'Climbing gym'] },
  ],
  eat: [
    { k: 'eateries', label: 'Healthy eateries', say: 'eat out, healthily', g: ['healthy'], s: ['Healthy restaurant', 'Meal service / Tiffin'] },
    { k: 'nutrition', label: 'Nutritionists', say: 'see a nutritionist', g: ['nutrition'], s: ['Nutrition / Dietitian', 'Dietitian / nutritionist'] },
    { k: 'stores', label: 'Health food stores', say: 'shop organic', s: ['Health food store', 'Organic store', 'Health-food & supplement store', 'Sports nutrition store', "Farmers' market"] },
  ],
  care: [
    { k: 'dental', label: 'Dentists', say: 'see a dentist', s: ['Specialty clinic (dental)', 'Dental clinic'] },
    { k: 'labs', label: 'Labs and pharmacies', say: 'get tests done', g: ['lab'], s: ['Diagnostic lab', 'Pharmacy chain', 'Pharmacy'] },
    { k: 'physio', label: 'Physio and chiropractic', say: 'see a physio', g: ['physio'], s: ['Physiotherapy / Rehab', 'Specialty clinic (chiropractic + physiotherapy)'] },
    { k: 'clinics', label: 'Clinics', say: 'see a doctor', g: ['clinic', 'newage'], s: ['Specialty clinic', 'New-age health center', 'Specialty clinic (eye)', 'Multispeciality clinic'] },
  ],
  clear: [
    { k: 'therapy', label: 'Therapy', say: 'talk to someone', g: ['therapy'], s: ['Therapy clinic'] },
    { k: 'alt', label: 'Unconventional therapy', say: 'try something unconventional', g: ['alttherapy'], s: ['Unconventional therapy'] },
    { k: 'calm', label: 'Relaxation spaces', say: 'find somewhere calm', s: ['Relaxation space'] },
  ],
  gear: [
    { k: 'retail', label: 'Sports and fitness shops', say: 'buy sports gear', g: ['retail'], s: ['Sports / fitness retail'] },
    { k: 'bikes', label: 'Bike shops', say: 'buy a bike', g: ['bike'], s: ['Sports / fitness retail (bike)'] },
    { k: 'service', label: 'Wearables', say: 'fix my wearable', g: ['wearable'], s: ['Wearable service center'] },
  ],
  people: [
    { k: 'groups', label: 'Groups', g: ['group'], s: ['Community / group'] },
    { k: 'hangouts', label: 'Hangouts', g: ['hangout'], s: ['Fitness community hangout'] },
    { k: 'accounts', label: 'Social accounts', s: ['Social account'] },
  ],
  hospital: [
    { k: 'hospitals', label: 'Hospitals', g: ['hospital'], s: ['Hospital', 'Multispeciality clinic', 'New-age health center'] },
    { k: 'eye', label: 'Eye clinics', s: ['Specialty clinic (eye)', 'Eye clinic'] },
    { k: 'specialty', label: 'Specialty clinics', s: ['Specialty clinic'] },
  ],
  indulge: [
    { k: 'food', label: 'Indulgent food', s: ['Indulgent food'] },
    { k: 'walks', label: 'Food walks', s: ['Thindi trail / food walk'] },
  ],
};

/* The group a row falls in under its activity, or '' when the activity has
   none. */
export function subcategoryOf(r, intent) {
  const groups = SUBCATEGORIES[intent];
  if (!groups) return '';
  /* A sheet label names the group outright; the row's `g` only decides where
     the label does not. Mumbai's sheet has dozens of labels Bengaluru never
     used ("Salad bar", "Dietitian / nutritionist"), and before `g` was asked
     every one of them fell into the last group: all 114 nutritionists were
     filed as health food stores. */
  const hit = groups.find((x) => (x.s && x.s.includes(r.s))
    || (x.n && x.ns?.includes(r.s) && x.n.test(r.n || '') && !/\b(lake|kere)\b/i.test(r.n || '')))
    || groups.find((x) => x.g && x.g.includes(r.g));
  return (hit || groups[groups.length - 1]).k;
}
