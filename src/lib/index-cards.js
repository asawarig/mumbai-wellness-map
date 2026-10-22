/* Card heights for the index grid, in one place because two pages draw it.
 *
 * The map's index view and /list render the same cards from the same markup
 * (index-card.js), so they have to size them the same way too — /list shipped
 * without this and showed twenty-one different card heights next to a map view
 * showing one.
 *
 * Every card takes the height of the tallest on the page, capped: one
 * 411-character description would otherwise set the height of three thousand
 * cards, most of which are a sentence. Anything still clipped gets Read more,
 * which expands that card and grows only the grid row it sits in.
 *
 * Without JavaScript the cards keep their natural heights and every word is
 * still on the page — uneven, but complete. That is the floor this degrades to,
 * and it is why /list can carry this without depending on it.
 */

/* Tall enough for a median description, short enough that a sentence-long card
   is not mostly white space. */
export const CARD_CAP = 240;

/* Returns true once it has actually measured something. */
export function equaliseCards(root, { cap = CARD_CAP } = {}) {
  if (!root) return false;
  /* Cleared before measuring, or each pass measures the height the last pass
     set and the cards only ever grow. */
  root.style.removeProperty('--index-card-h');
  const cards = root.querySelectorAll('.index-card');
  if (!cards.length) return false;

  let tallest = 0;
  for (const card of cards) {
    card.classList.remove('has-more');
    const h = card.offsetHeight;
    if (h > tallest) tallest = h;
  }
  /* A section with no layout yet reports every height as zero — the grid has
     just been un-hidden, or the cards were written a moment ago. Say so, so the
     caller can come back rather than leaving the cards at their own heights. */
  if (!tallest) return false;
  root.style.setProperty('--index-card-h', `${Math.min(tallest, cap)}px`);

  /* Now they are at their final height, mark the ones still clipped — only
     those offer Read more, and only those reserve the room for it. */
  for (const card of cards) {
    if (card.classList.contains('is-open')) continue;
    if (card.scrollHeight > card.clientHeight + 1) card.classList.add('has-more');
  }
  return true;
}

/* Wires Read more and keeps the height in step with the window. Returns the
   measuring function so a caller can run it again after a re-render. */
export function mountIndexCards(root, { cap = CARD_CAP, visible = () => true } = {}) {
  if (!root) return () => {};

  let frame = 0;
  let timer = 0;

  /* Two things make a single pass unreliable, and both took a while to see:
     a pass can land before the grid has layout — the map un-hides its index
     view and measures in the same tick — and requestAnimationFrame does not
     run at all in a background tab, so a page opened in one would never size
     its cards and nothing would come back to fix it.

     So: schedule with rAF when the page is visible and a timer when it is not,
     and let a pass that measured nothing ask for another. Bounded, so a
     genuinely empty grid cannot spin. */
  const measure = (tries = 6) => {
    if (!visible()) return;
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    const again = () => {
      if (!equaliseCards(root, { cap }) && tries > 0) measure(tries - 1);
    };
    if (document.hidden) timer = setTimeout(again, 48);
    else frame = requestAnimationFrame(again);
  };

  root.addEventListener('click', (e) => {
    const more = e.target.closest('.index-more');
    if (!more || !root.contains(more)) return;
    /* stopImmediatePropagation, not stopPropagation. The map page binds its own
       click handler to this same element to open a place, and stopPropagation
       only stops the event reaching ANCESTORS — a second listener on the same
       node still runs. Read more expanded the card and flew the map to the
       place at the same time. This module is mounted first, so stopping the
       remaining listeners here is what keeps the two apart. */
    e.stopImmediatePropagation();
    const card = more.closest('.index-card');
    const open = card.classList.toggle('is-open');
    more.setAttribute('aria-expanded', String(open));
    more.textContent = open ? 'Read less' : 'Read more';
    /* Closing can leave a card that no longer overflows — after a resize, say —
       so let the next pass decide whether it still needs the link. */
    if (!open) measure();
  });

  window.addEventListener('resize', () => measure());

  /* Measure again once the page has actually settled. On /list this module runs
     at load, before the stylesheet and the webfont have been applied — card
     heights depend on both, and a pass taken too early either measures the
     fallback font's metrics or finds no layout at all and bails. The map view
     never hit this because a reader has to click into it, by which time
     everything has long since loaded. Re-measuring is cheap and idempotent. */
  if (document.readyState !== 'complete') window.addEventListener('load', () => measure(), { once: true });
  /* A tab sized while hidden was sized on a timer; re-do it properly once it is
     actually on screen. */
  document.addEventListener('visibilitychange', () => { if (!document.hidden) measure(); });
  document.fonts?.ready?.then(() => measure()).catch(() => {});

  measure();
  return () => measure();
}
