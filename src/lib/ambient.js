/* Ambient Garden City ornaments for empty map ground.
 *
 * PAUSED on the live map (Sep 2026) — the SVGs and ambient.json
 * remain so we can rethink placement and treatment later. Same drawing language
 * as the intent stamps; when rewired: non-interactive, no chip, reduced opacity,
 * pane below markers.
 */

import ambient from '../data/ambient.json';

export const AMBIENT_MARKS = ambient.marks;

export function ambientIconUrl(slug, base) {
  const root = base.endsWith('/') ? base : `${base}/`;
  return `${root}icons/ambient/${slug}.svg`;
}
