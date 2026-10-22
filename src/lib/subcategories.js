/* Subcategories, at most four to an activity. The sheet's own labels (`s`)
 * run to a dozen under Move and nine under Check my health, most of them a
 * handful of rows each; this folds them into groups a reader can tell apart.
 * The label stays on the row, untouched, for the card; the group is `sc`.
 *
 * Each group lists the sheet labels it takes. A label not listed falls into
 * the activity's last group, so a new label in the sheet still lands
 * somewhere rather than nowhere. Parks have no label: they come from the
 * city parks register, and the first Move group takes them by their `g`.
 *
 * `say` is the group as words that follow "I want to", for the sentence picker.
 */
export const SUBCATEGORIES = {
  move: [
    /* The register's parks, and the curated walking loops that are parks by
       name (Defence Colony Park, Wood Park); a lake park stays a lake loop. */
    { k: 'parks', label: 'Parks', say: 'walk in a park', g: ['park'], n: /\bpark\b/i, ns: ['Park / Lake walking loop', 'Park loop'] },
    { k: 'walks', label: 'Walking loops', say: 'walk a lake loop', s: ['Park / Lake walking loop', 'Lake loop', 'Park link', 'Lake shoreline', 'Park loop', 'Road loop'] },
    { k: 'routes', label: 'Running and cycling routes', say: 'run or cycle', s: ['Running route / trail', 'Cycling route', 'Athletics track / stadium loop'] },
    { k: 'water', label: 'Swimming and rowing', say: 'swim or row', s: ['Swimming pool', 'Rowing'] },
  ],
  play: [
    { k: 'courts', label: 'Courts', say: 'play on a court', s: ['Court venue'] },
    { k: 'venues', label: 'Multi-sport venues and stadiums', say: 'play at a stadium', s: ['Multi-sport venue / Stadium'] },
    { k: 'turfs', label: 'Turfs and grounds', say: 'play on a turf', s: ['Turf / Ground'] },
    { k: 'other', label: 'Pools and other sports', say: 'try a new sport', s: ['Specialty sport venue', 'Swimming pool', 'Entertainment venue'] },
  ],
  workout: [
    { k: 'gyms', label: 'Gyms', say: 'hit the gym', s: ['Gym / Fitness center', 'Specialty fitness studio', 'Recovery / Contrast therapy'] },
    { k: 'yoga', label: 'Yoga and Pilates', say: 'stretch', s: ['Yoga studio', 'Pilates studio'] },
    { k: 'combat', label: 'Martial arts', say: 'learn to fight', s: ['Martial arts / Combat sport'] },
    { k: 'other', label: 'Dance, climbing and more', say: 'dance or climb', s: ['Dance / Movement studio', 'Climbing gym'] },
  ],
  eat: [
    { k: 'eateries', label: 'Healthy eateries', say: 'eat out, healthily', s: ['Healthy restaurant', 'Meal service / Tiffin'] },
    { k: 'nutrition', label: 'Nutritionists', say: 'see a nutritionist', s: ['Nutrition / Dietitian'] },
    { k: 'stores', label: 'Health food stores', say: 'shop organic', s: ['Health food store'] },
  ],
  care: [
    { k: 'dental', label: 'Dentists', say: 'see a dentist', s: ['Specialty clinic (dental)'] },
    { k: 'labs', label: 'Labs and pharmacies', say: 'get tests done', s: ['Diagnostic lab', 'Pharmacy chain'] },
    { k: 'physio', label: 'Physio and chiropractic', say: 'see a physio', s: ['Physiotherapy / Rehab', 'Specialty clinic (chiropractic + physiotherapy)'] },
    { k: 'clinics', label: 'Clinics', say: 'see a doctor', s: ['Specialty clinic', 'New-age health center', 'Specialty clinic (eye)', 'Multispeciality clinic'] },
  ],
  clear: [
    { k: 'therapy', label: 'Therapy', say: 'talk to someone', s: ['Therapy clinic'] },
    { k: 'alt', label: 'Unconventional therapy', say: 'try something unconventional', s: ['Unconventional therapy'] },
    { k: 'calm', label: 'Relaxation spaces', say: 'find somewhere calm', s: ['Relaxation space'] },
  ],
  gear: [
    { k: 'retail', label: 'Sports and fitness shops', say: 'buy sports gear', s: ['Sports / fitness retail'] },
    { k: 'bikes', label: 'Bike shops', say: 'buy a bike', s: ['Sports / fitness retail (bike)'] },
    { k: 'service', label: 'Wearable service centres', say: 'fix my wearable', s: ['Wearable service center'] },
  ],
  people: [
    { k: 'groups', label: 'Groups', s: ['Community / group'] },
    { k: 'hangouts', label: 'Hangouts', s: ['Fitness community hangout'] },
    { k: 'accounts', label: 'Social accounts', s: ['Social account'] },
  ],
  hospital: [
    { k: 'hospitals', label: 'Hospitals', s: ['Hospital', 'Multispeciality clinic', 'New-age health center'] },
    { k: 'eye', label: 'Eye clinics', s: ['Specialty clinic (eye)'] },
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
  const hit = groups.find((x) => (x.g && x.g.includes(r.g)) || (x.s && x.s.includes(r.s))
    || (x.n && x.ns?.includes(r.s) && x.n.test(r.n || '') && !/\b(lake|kere)\b/i.test(r.n || '')));
  return (hit || groups[groups.length - 1]).k;
}
