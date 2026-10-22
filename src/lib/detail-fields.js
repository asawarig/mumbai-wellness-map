/* The fields of a listing that the map, its filters and its counts never
 * read: the description, the address and links, who it suits, the hours and
 * where it came from. They are a little over half of the listings by weight,
 * so they travel in a second file (src/pages/data/details.json.js) that loads
 * after the map has what it needs to draw. */
export const DETAIL_FIELDS = ['d', 'ad', 'gm', 'w', 'ig', 'b', 't', 'src'];
