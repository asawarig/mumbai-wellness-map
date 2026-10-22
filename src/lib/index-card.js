/* The index's cards, in one place because two things draw them.
 *
 * The page ships the whole index in its HTML — 919 entries, grouped by intent
 * — so that what the map is about is readable without running any JavaScript.
 * That is the difference between a crawler, or a model, seeing a wrapper
 * around an empty div and seeing the thing itself. wellness-map.js then draws
 * the same cards again whenever the index is filtered.
 *
 * Both callers import from here, so the markup cannot drift between the copy
 * that is served and the copy that replaces it.
 */
import { INTENTS, intentMeta, iconUrl, pinColour } from './intents.js';
import PERK_OFFERS from '../data/perk-offers.json';

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (m) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]
));

/* Verified (the listing exists and is marked operational) is green, Needs
   check yellow, and Community-reported (a place a reader sent in) a light blue. */
const STATUS_TONE = { Verified: 'green', 'Needs check': 'yellow', 'Community-reported': 'blue' };
const statusWord = (v) => v;

export const tag = (text, tone = 'grey', dot = false) =>
  `<span class="tag ${tone}">${dot ? '<s></s>' : ''}${esc(text)}</span>`;

/* A category's tag, tinted from its own icon colour so the tag and the mark
   beside it agree. Falls back to the family tone for a category with no pin. */
export const categoryTag = (meta) => {
  const c = pinColour(meta) || meta.c;
  return c ? `<span class="tag cat" style="--cat:${c}">${esc(meta.verb)}</span>` : tag(meta.verb, TONE[meta.family]);
};

export const statusTag = (r) => (r.v ? `<span class="tag status-tag ${STATUS_TONE[r.v] || 'grey'}"><s></s>${esc(statusWord(r.v))}</span>` : '');

/* The right-hand marks on a card: a dot for how well the listing is known, and
   the coupon for a Plum Perks partner.
 *
 * The dot replaces a "Verified" / "Needs check" tag. Three words of chrome on
 * every row said the same thing a colour says, and the row has more useful
 * things to spend its width on; the title is there for anyone who needs the
 * word. No dot at all where the sheet says nothing, rather than a grey one
 * standing in for an absence. */
export const statusDot = (r) => (r.v
  ? `<span class="card-mark status-dot ${STATUS_TONE[r.v] || 'grey'}" title="${esc(statusWord(r.v))}"></span>`
  : '');

/* Descriptions carry the app's address as bare prose — 424 of them end with a
   naked https://www.plumhq.com/app, which the card renders as literal text
   because it escapes everything it is given. That is the right default: a
   markdown link written into `d` renders as [text](url) for the same reason,
   and 55 venues once shipped that way.

   So the URL is taken out of the prose and put on a phrase instead. Which
   phrase depends on the sentence, because there are two:

     "…see your offer in the Plum app. <url>"         93 partner cards
     "…Book a consultation here. <url>"              217 clinics
     "Check Plum for discounted rates… <url>"        114 labs

   "Plum app" is the anchor where the sentence already says it. Where it does
   not, "here" is the word the sentence offers, and "Plum app" bolted onto the
   end of "Book a consultation here." would read as a second sentence that is
   not one. Anything else keeps the link at the end, which is no worse than the
   bare URL it replaces.

   The href is a constant, so escaping the prose first and injecting the anchor
   after cannot smuggle markup in from the data. */
const PLUM_APP_URL = 'https://www.plumhq.com/app';
const PLUM_URL = /\s*https?:\/\/(?:www\.)?plumhq\.com\/app\/?/g;
const open = `<a href="${PLUM_APP_URL}" target="_blank" rel="noopener">`;

/* The description with the bare URL taken out — for title attributes, which
   cannot hold markup. */
export const descText = (s) => String(s ?? '').replace(PLUM_URL, '').trim();

export function descHtml(s) {
  const t = esc(descText(s));
  if (!/https?:\/\/(?:www\.)?plumhq\.com\/app/.test(String(s ?? ''))) return t;
  /* A therapist's "Need to talk? Book a consultation here." books through the
     Plum app, so it stands on a line of its own and says it is for someone
     with Plum. */
  const talk = /\s*Need to talk\? Book a consultation here\./;
  if (talk.test(t)) return `${t.replace(talk, '')}<span class="desc-cta">Have Plum and need to talk? Book a consultation ${open}here</a>.</span>`;
  if (t.includes('Plum app')) return t.replace('Plum app', `${open}Plum app</a>`);
  if (/\bhere\./.test(t)) return t.replace(/\bhere\./, `${open}here</a>.`);
  /* "Check Plum for discounted rates…" — the brand is already in the sentence,
     so the link goes on it rather than being bolted to the end. */
  if (/\bPlum\b/.test(t)) return t.replace(/\bPlum\b/, `${open}Plum</a>`);
  return `${t} ${open}Plum app</a>`;
}

/* Intent chip tones, keyed by the intent's colour family. */
export const TONE = { leaf: 'green', vision: 'violet', marigold: 'yellow', sky: 'blue', coral: 'orange', muted: 'grey' };

/* A pin whose brand is itself a Plum Perks partner (Cult, Amaha, Clove…). */
export const isPerkPartner = (r) => (r.tg || []).includes('plum-perks');
/* A pin Playo enables — book this place through the partner, not a partner branch.
   Only where the row says so. This used to fall back to "any Play venue whose
   glyph is a turf or a court", which put a Plum Perks chip on 290 venues nobody
   had checked were on Playo — a perk claim the data could not support. */
export const isPlayoVenue = (r) => (r.tg || []).includes('playo') || /playo/i.test(r.d || '');
export const hasPerkCallout = (r) => isPerkPartner(r) || isPlayoVenue(r);

/* One chip for both, at Plum's instruction: a partner and a Playo-bookable venue
   now read the same. The two claims are still different in the data —
   isPerkPartner is the brand itself, isPlayoVenue is the layer you book it
   through — and the Offer line still says which is which, so the distinction is
   not lost, only taken off the chip. */
/* Accents are folded, not dropped: "Näck" has to normalise to "nack", which is
   how the brand is written everywhere else. */
export const normBrand = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '');

/* Every offer a brand gives. perk_id does not join — every perk_id on a pin is
   absent from the perks sheet and every sheet id is referenced by no pin — so a
   pin is matched to its brand by name, longest key first so "Tata 1MG Labs" is
   not answered by "1MG". */
/* Venues whose names do not carry their brand's key. Amaha's clinics are
   "Amaha Mental Health Centre (Indiranagar)" while the sheet says "Amaha
   Health", so seven pins showed the label and no figure while the brand's
   20% sat in the data unread.
   Matched as a PREFIX of the normalised name and never as a substring: the
   letters "amaha" appear inside "Jayamahal", and a contains-match once tagged
   a pickleball court there as an Amaha clinic. */
const BRAND_PREFIX_ALIASES = [['amahamentalhealth', 'amahahealth']];

const OFFER_KEYS = Object.keys(PERK_OFFERS).sort((a, b) => b.length - a.length);
export const offersFor = (r) => {
  const n = normBrand(r.n);
  if (!n) return [];
  const hit = PERK_OFFERS[n]
    || PERK_OFFERS[OFFER_KEYS.find((k) => k.length >= 3 && n.startsWith(k))]
    || PERK_OFFERS[OFFER_KEYS.find((k) => k.length >= 5 && n.includes(k))];
  if (hit) return hit.offers;
  const alias = BRAND_PREFIX_ALIASES.find(([pre]) => n.startsWith(pre));
  if (alias && PERK_OFFERS[alias[1]]) return PERK_OFFERS[alias[1]].offers;
  /* A Playo venue is booked through Playo, so Playo's offer is the one it
     carries — "Machaxi JC Sports Center Bellandur" was never going to match a
     brand key, so every one of these read "Plum Perks" with no figure while
     the partner beside it named a number. The brand's own name wins first, so
     a venue that is also a partner keeps its own offer. */
  return isPlayoVenue(r) ? (PERK_OFFERS.playo?.offers || []) : [];
};

/* The offer on its own line under the name, so every Perks row says the same
   two things in the same two places: that it is a Perks partner, and what the
   partner gives you. The figure used to ride on the chip when it was short
   enough to fit, which meant a row read "Upto 41% off" or "Plum Perks"
   depending on how the sheet had worded it — the same fact, two shapes, and
   no way to tell from the list which rows had a figure at all. */
/* A partner with no figure in the sheet — the Cult family, whose offers are
   not a single percentage — still gets the line, saying where the number
   lives instead of leaving a gap that reads as a missing one. */
export const NO_FIGURE_OFFER = 'Explore offers in the Plum app';
/* `always` is for the pinless brands. They are Perks partners by definition —
   they come out of the perks sheet — but they carry none of the map's tags, so
   hasPerkCallout says no to every one of them. Places have to be asked. */
export const offerLine = (r, cls = 'card-offer', { always = false } = {}) => {
  if (!always && !hasPerkCallout(r)) return '';
  const offers = offersFor(r);
  const text = offers.length ? offers.map(esc).join(', and ') : esc(NO_FIGURE_OFFER);
  return `<span class="${cls}"><b>Offer</b> ${text}</span>`;
};

/* One label, on every Perks row. */
export const calloutTag = (r) => (hasPerkCallout(r) ? tag('Plum Perks', 'red') : '');

/* `openInMap` is the grid's, not /list's. /list ships no JavaScript, so the
   button would be a control that does nothing there. */
export function indexCardHtml(r, base = '/', { openInMap = false } = {}) {
  const meta = intentMeta(r);
  const mark = meta ? `<img class="index-mark" src="${iconUrl(meta, base)}" alt="" title="${esc(meta.verb)}">` : '';
  /* A div, not a button: the card carries more than one action and a button
     cannot contain another button.
     The whole card no longer opens the map. The index is a page you read —
     brushing a card on the way down the grid should not throw you back to a
     map you deliberately left. Open in map is its own control, so going back
     is a thing you ask for. `.index-more` expands a description too long for
     the card's height. */
  return `<div class="index-card" data-id="${esc(r.id)}">
    ${mark}
    <span class="index-head">
      <span class="index-name">${esc(r.n)}</span>
      <span class="card-marks">${statusDot(r)}</span>
    </span>
    <span class="meta">${meta ? categoryTag(meta) : ''}${calloutTag(r)}</span>
    ${offerLine(r, 'index-offer')}
    ${r.d ? `<span class="index-desc">${descHtml(r.d)}</span>` : ''}
    <span class="index-actions">
      ${openInMap && r.lat != null ? `<button type="button" class="index-map" data-open-map="${esc(r.id)}">Open in map →</button>` : ''}
      ${r.d ? '<button type="button" class="index-more" aria-expanded="false">Read more</button>' : ''}
    </span>
  </div>`;
}

/* A Plum Perks brand with no pin, as an index card.
 *
 * It is the same card as a place's, with one difference that matters: a place
 * opens on the map, and these have nowhere on the map to open. So the overlay
 * stretched across the card is an anchor to the app rather than a button, and
 * the card carries no data-id for the map's click handler to find. */
export const PERKS_ONLINE_KEY = 'online';
export const PERKS_ONLINE_LABEL = 'Plum Perks online';
export const PERKS_PLACES_KEY = 'perks-bengaluru';
export const PERKS_PLACES_LABEL = 'Plum Perks in Bengaluru';

/* The gift from the toolbar's icon set, so a Perks chip fills the same icon
   slot the category chips do. Without it the label started where the others'
   drawings do and the chip sat a mark narrower than the rest of the row. */
export const PERK_GLYPH = '<svg class="chip-glyph" viewBox="0 0 24 24" aria-hidden="true">'
  + '<rect x="3.6" y="7.8" width="16.8" height="3.9" rx="1.1"/>'
  + '<path d="M5.3 11.7V19a1.4 1.4 0 0 0 1.4 1.4h10.6a1.4 1.4 0 0 0 1.4-1.4v-7.3"/>'
  + '<path d="M12 7.8v12.6"/>'
  + '<path d="M12 7.8C10.5 7.9 8.2 8 7.4 7.1 6.5 6.1 7.1 4.4 8.5 4.3c1.7-.1 2.8 2 3.5 3.5Z"/>'
  + '<path d="M12 7.8c1.5.1 3.8.2 4.6-.7.9-1 .3-2.7-1.1-2.8-1.7-.1-2.8 2-3.5 3.5Z"/>'
  + '</svg>';

export function perkIndexCardHtml(p, base = '/') {
  const meta = intentMeta(p);
  const mark = meta ? `<img class="index-mark" src="${iconUrl(meta, base)}" alt="" title="${esc(meta.verb)}">` : '';
  return `<div class="index-card index-card-perk">
    ${mark}
    <span class="index-name">${esc(p.n)}</span>
    <span class="meta">${meta ? categoryTag(meta) : ''}${tag('Plum Perks', 'red')}${tag(p.s || p.a || 'Online')}${statusTag(p)}</span>
    ${offerLine(p, 'index-offer', { always: true })}
    ${p.d ? `<span class="index-desc">${descHtml(p.d)}</span>` : ''}
    <a class="index-open" href="${PLUM_APP_URL}" target="_blank" rel="noopener"
       aria-label="${esc(p.n)} — get the Plum app"></a>
    ${p.d ? '<button type="button" class="index-more" aria-expanded="false">Read more</button>' : ''}
  </div>`;
}

/* The brands as their own section. They are not a category — they ship to the
   whole country, so neither an area nor a "what do you want to do" applies —
   which is exactly why they get a section of their own rather than being
   scattered through the ones that do. */
export function perksSectionHtml(perks = [], base = '/') {
  if (!perks.length) return '';
  const found = [...perks].sort((a, b) => String(a.n || '').localeCompare(String(b.n || '')));
  return `<section class="index-section" id="${PERKS_ONLINE_KEY}">
    <h3>${esc(PERKS_ONLINE_LABEL)} <em>${found.length}</em></h3>
    <div class="index-grid">${found.map((p) => perkIndexCardHtml(p, base)).join('')}</div>
  </section>`;
}

/* The partners you can walk into, in one place. They are already in their
   category sections above — a Perks gym is a gym — but spread across eight
   headings there is nowhere on the page that shows what Plum Perks is in this
   city. This is that, and it is the other half of the online list. */
export function perkPlacesSectionHtml(entries = [], base = '/', opts = {}) {
  const found = entries.filter(hasPerkCallout).sort((a, b) => String(a.n || '').localeCompare(String(b.n || '')));
  if (!found.length) return '';
  return `<section class="index-section" id="${PERKS_PLACES_KEY}">
    <h3>${esc(PERKS_PLACES_LABEL)} <em>${found.length}</em></h3>
    <div class="index-grid">${found.map((x) => indexCardHtml(x, base, opts)).join('')}</div>
  </section>`;
}

/* Every entry, grouped by intent and sorted by name — the same shape
   renderIndex() produces with no filters applied, which is what the page
   should arrive holding. */
export function indexBodyHtml(entries, base = '/', perks = []) {
  const groups = [
    ...INTENTS.map((i) => ({ i, rows: entries.filter((r) => intentMeta(r)?.k === i.k) })),
    { i: null, rows: entries.filter((r) => !intentMeta(r)) },
  ];
  return groups.map(({ i, rows }) => {
    if (!rows.length) return '';
    const found = [...rows].sort((a, b) => a.n.localeCompare(b.n));
    /* id so /list's category chips can jump here; the map's index view has
       filters instead and simply ignores it. */
    return `<section class="index-section"${i ? ` id="${esc(i.k)}"` : ''}>
      <h3>${i ? `<img src="${iconUrl(i, base)}" alt="">${esc(i.verb)}` : 'Other'} <em>${found.length}</em></h3>
      <div class="index-grid">${found.map((x) => indexCardHtml(x, base)).join('')}</div>
    </section>`;
  }).join('') + perkPlacesSectionHtml(entries, base) + perksSectionHtml(perks, base);
}
