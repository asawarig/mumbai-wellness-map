/* Brand colours for the places list.
 *
 * A place whose name carries a well-known brand gets that brand's colour behind
 * its icon in the list and on its place card; every other place takes its
 * intent's pin colour. The colours were picked by eye from each brand's logo,
 * not taken from brand guidelines, so correct them here. First match wins, and
 * each colour has to stay dark or saturated enough to carry a cream icon.
 */

const BRANDS = [
  ['Cult.fit', /\bcult\b|\beat\.fit\b/i, '#1A1A1A'],
  ['Manipal Hospitals', /\bmanipal hospital/i, '#1E4A9A'],
  ['Apollo', /\bapollo\b/i, '#02475B'],
  ['Fortis', /\bfortis\b/i, '#3D9B3A'],
  ['Narayana Health', /\bnarayana health\b/i, '#D6252F'],
  ['Aster', /\baster (cmi|labs|hospital)/i, '#0E5EAB'],
  ['Cloudnine', /\bcloudnine\b/i, '#6B2C84'],
  ['Kaya', /\bkaya clinic\b/i, '#C2185B'],
  ['Oliva', /\boliva\b/i, '#6BAA3A'],
  ['Garmin', /\bgarmin\b/i, '#007DC3'],
  ['Apple', /\baptronix\b|\bapple\b/i, '#1D1D1F'],
  ['Decathlon', /\bdecathlon\b/i, '#0082C3'],
  ['ASICS', /\basics\b/i, '#001E62'],
  ['Nike', /\bnike\b/i, '#111111'],
  ['adidas', /\badidas\b/i, '#000000'],
  ['PUMA', /\bpuma\b/i, '#1A1A1A'],
  ['Under Armour', /\bunder armour\b/i, '#1D1D1D'],
  ['New Balance', /\bnew balance\b/i, '#CF0A2C'],
  ['GIANT', /\bgiant bicycle/i, '#0052A3'],
  ['Firefox', /\bfirefox bikes\b/i, '#E1251B'],
  ['Anytime Fitness', /\banytime fitness\b/i, '#5F259F'],
  ["Gold's Gym", /\bgold'?s gym\b/i, '#C8961E'],
  ['F45', /\bf45\b/i, '#0B1F41'],
  ['Dr Lal PathLabs', /\blal pathlabs\b/i, '#1F4F9E'],
  ['Blue Tokai', /\bblue tokai\b/i, '#1C3B5A'],
];

/* The brand colour for a place name, or null. */
export function brandColour(name = '') {
  return BRANDS.find(([, pattern]) => pattern.test(name))?.[2] || null;
}
