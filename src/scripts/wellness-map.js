/* The Mumbai Wellness Map.
 *
 * A framed map with its chrome laid over it (see WellnessMap.astro). The legend
 * top-left is the intent filter (src/lib/intents.js) and holds the area picker;
 * search top-right narrows everything by tags, notes, names and places. Picking
 * a pin or a result opens the place card on its pin; the index view lists every
 * entry. Intent pins, and the marks and tiles cut from them, live in
 * public/icons/intent-pin|mark|tile|cream/ (scripts/intent-pins.mjs).
 *
 * The map is MapLibre GL throughout: the basemap (src/lib/basemap.js), the road
 * colours (src/lib/road-fillets.js), and over them the routes, metro, clusters
 * and pins as GL layers, so panning and zooming stay on the GPU.
 */

import { Map as GLMap, Marker, LngLatBounds, setWorkerUrl } from 'maplibre-gl';
/* The page's styles ride along with the script as well as in the page.
   Webflow keeps the HTML (and the styles inlined in it) for up to four hours,
   while this script, under a fixed name, is fetched fresh: a new feature could
   arrive before its styles did and draw unstyled. Adding the current styles
   from here keeps the two in step; where the page is already current they are
   the same rules twice, and nothing changes. */
import WM_CSS from '../styles/wellness-map.css?inline';
import PM_CSS from '../styles/prompt-map.css?inline';
{
  const tag = document.createElement('style');
  tag.id = 'wm-styles-current';
  tag.textContent = `${WM_CSS}\n${PM_CSS}`;
  document.head.appendChild(tag);
}
/* MapLibre finds its worker by a path computed at runtime, which no bundler
   can follow. Have Vite bundle the worker and hand MapLibre the URL instead. */
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
/* The map's worker script is only asked for once the map is made, which is
   after map.json has arrived; fetched now, it comes down alongside map.json
   and the worker starts from the cache. Measured on the live site, the tiles
   waited on it for 0.7s. */
fetch(maplibreWorkerUrl).catch(() => {});

/* The listings, parks, trails, metro and ward outlines come as one file built
   at deploy (src/pages/data/map.json.js), preloaded by BaseLayout, rather than
   inside this script. */
import LABELS from '../data/labels.json';
import PLUM_HEART from '../icons/plum-heart.svg?raw';
import TAB_IC_EXPLORE from '../icons/tab-explore.svg?raw';
import TAB_IC_PLAN from '../icons/tab-plan.svg?raw';
import TAB_IC_PEOPLE from '../icons/tab-people.svg?raw';
import TAB_IC_ONLINE from '../icons/tab-online.svg?raw';
import { DETAIL_FIELDS } from '../lib/detail-fields.js';
const DATA_BASE = `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}data/`;
/* This build's stamp on details.json, so a browser's cached copy from an
   earlier deploy is never mixed with this script (astro.config.mjs). */
const DATA_V = typeof __DATA_V__ !== 'undefined' ? `?v=${__DATA_V__}` : '';
const { db: DB, counts: COUNTS, routes: ROUTES, metro: METRO, zones: ZONES } = await fetch(`${DATA_BASE}map.json`).then((r) => r.json());
/* The long text (descriptions, addresses, links, hours) is asked for now but
   at low priority, so it never competes with the map's tiles; it is filled
   in by applyDetails below when it lands. Until then those fields are blank. */
/* Asked for once the map has drawn (or after 4s at the latest), so its 300KB
   does not share the connection with the map's first tiles. */
let detailsGo;
const DETAILS = new Promise((ok) => { detailsGo = ok; })
  .then(() => fetch(`${DATA_BASE}details.json${DATA_V}`, { priority: 'low' }))
  .then((r) => r.json());
setTimeout(() => detailsGo(), 4000);
DB.entries.forEach((r) => DETAIL_FIELDS.forEach((f) => { if (r[f] == null) r[f] = ''; }));
setZones(ZONES);
import EVENTS from '../data/events.json';
import PERKS from '../data/perks.json';
import PERK_OFFERS from '../data/perk-offers.json';
import PERK_LOGOS from '../data/perk-logos.json';
import METRO_STATIONS from '../data/metro-stations.json';
/* The card's tab icons: Phosphor's filled set (not drawn here). */
import COMMUNITY_CATEGORIES from '../data/community-categories.json';
import THEMED_DAYS from '../data/themed-days.json';
import DAY_ROUTES from '../data/themed-day-routes.json';
import { SUBCATEGORIES } from '../lib/subcategories.js';
import { glStyle, setTone, setSelectedArea, selectedRoadLayers, LABEL_LAYERS, RASTER, setZones, POSTER, setGreenRoads, BASEMAP, REGION_BBOX } from '../lib/basemap.js';
import { addOutsideVeil } from '../lib/outside-veil.js';
import { addRoadFillets, setRoadRegions } from '../lib/road-fillets.js';
import { INTENTS, MAP_INTENTS, INTENT_BY_K, intentMeta, iconUrl, pinColour, SUGGEST_FORM } from '../lib/intents.js';
import { brandColour } from '../lib/brands.js';
import { esc, tag, categoryTag, statusTag, indexCardHtml, perksSectionHtml, perkPlacesSectionHtml, PERKS_ONLINE_KEY, PERKS_PLACES_KEY, TONE, isPerkPartner, isPlayoVenue, hasPerkCallout, calloutTag, statusDot, offerLine, NO_FIGURE_OFFER, descHtml, descText, offersFor, normBrand } from '../lib/index-card.js';
import { mountIndexCards } from '../lib/index-cards.js';
setWorkerUrl(maplibreWorkerUrl);

if (!document.getElementById('map')) throw new Error('Wellness map: #map is not on the page');

const BASE = import.meta.env.BASE_URL || '/';
/* BASE keeps whatever trailing slash astro.config.mjs gave it, which off Webflow
   is "/" and on Webflow is "/health-map/mumbai" with none. Anything that
   concatenates a path onto it has to add the slash itself — iconUrl does, and a
   logo src that did not shipped "/health-map/mumbailogos/perks/x.png" to
   production while working everywhere it was tested, because only Webflow sets
   a base at all. */
const BASE_PATH = BASE.endsWith('/') ? BASE : `${BASE}/`;
const E = DB.entries;
const BY_ID = new Map(E.map((r) => [r.id, r]));
/* Intent key + map eligibility, once — shuffle and filter hit this thousands
   of times. */
const INTENT_OF = new Map(E.map((r) => {
  const meta = intentMeta(r);
  return [r.id, meta?.map ? meta.k : null];
}));
/* Which (intent, area) pairs have at least one pin, so the dice cannot land on
   an empty map — otherwise shuffle scans all 2,756 entries up to 20 times a
   click. Two indexes, not one: the map opens on the perks, and a pairing that
   holds 40 gyms may hold no Perks gym at all. */
const PINNED = { all: new Set(), perks: new Set() };
const PINNED_AREA = { all: new Set(), perks: new Set() };
let PINNED_ANY = false;
let PINNED_ANY_PERK = false;
for (const r of E) {
  if (r.lat == null) continue;
  const k = INTENT_OF.get(r.id);
  if (!k) continue;
  const scopes = hasPerkCallout(r) ? ['all', 'perks'] : ['all'];
  for (const scope of scopes) {
    PINNED_AREA[scope].add(r.a);
    PINNED[scope].add(`${k}\0${r.a}`);
    PINNED[scope].add(`${k}\0all`);
  }
  PINNED_ANY = true;
  if (scopes.length > 1) PINNED_ANY_PERK = true;
}
/* Plum app link used on place-card perk callouts. */
/* The Plum app, where an offer is redeemed. On a phone it goes straight to
   the app's store page, which opens the app when it is already installed; on
   anything else, to the app's page on plumhq.com. */
const PLUM_WEB = PERKS.ctaUrl || 'https://www.plumhq.com/app';
const PLUM_STORE = /android/i.test(navigator.userAgent) ? 'https://play.google.com/store/apps/details?id=com.plumhq.employee.production'
  : /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    ? 'https://apps.apple.com/in/app/plum-health-benefits/id1616851078' : '';
const PLUM_APP = PLUM_STORE || PLUM_WEB;
/* Where someone without Plum starts. Plum's home page until there is a
   sign-up page to send them to. */
const PLUM_SIGNUP = 'https://www.plumhq.com';
/* Every other link to the app page (in the listings' own words, the intro,
   the cards) goes to the store too. */
if (PLUM_STORE) {
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href^="https://www.plumhq.com/app"], a[href^="https://plumhq.com/app"]');
    if (a) a.href = PLUM_STORE;
  }, true);
}
/* Where a place asks to become a Plum Perks partner. Until there is a page of
   its own, the suggestions form takes it. */
const PARTNER_URL = PERKS.partnerUrl || 'https://tally.so/r/mDeKVZ';
const PLUM_RED = '#FF4052';
/* isPerkPartner, isPlayoVenue, hasPerkCallout and calloutTag live in
   index-card.js, so the map cards, the index grid and /list all make the same
   claim about who the Plum Perks partner is. */

/* The discount a partner actually gives, by brand.

   perk_id does not join — every perk_id on a pin is absent from the perks
   sheet and every sheet id is referenced by no pin — so a pin is matched to
   its brand by name: exact first, then the brand as a prefix of the place
   ("Cult.fit Indiranagar"), then contained anywhere ("Sporthood @ Cult").
   Longest key wins, so "Tata 1MG Labs" cannot be answered by "1MG".

   No match is an answer, not a gap. Cult and the venues it runs are a
   different partnership and name no figure. */

/* Stable GeoJSON features — shuffle only filters this list, it does not rebuild it.
   Perk-partner pins use a plum-red cut of the same intent pin (pin-<slug>-perk)
   and carry perk:1 so the glow layer can find them. */
/* Places that share a spot (a mall, one building, the same lake gate) sit
   on top of each other and only the top one can be pressed. They are fanned
   out on a small ring round that spot, just far enough to tell apart once
   the map is close. */
const SPREAD = (() => {
  const groups = new Map();
  for (const r of E) {
    if (r.lat == null) continue;
    const k = `${r.lat.toFixed(4)},${r.lon.toFixed(4)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const at = new Map();
  for (const rows of groups.values()) {
    if (rows.length < 2) continue;
    const ring = 0.00016 * (1 + rows.length / 8);
    rows.forEach((r, i) => {
      const a = (2 * Math.PI * i) / rows.length;
      at.set(r.id, [r.lon + (ring * Math.cos(a)) / Math.cos((r.lat * Math.PI) / 180), r.lat + ring * Math.sin(a)]);
    });
  }
  return at;
})();
const spreadAt = (r) => SPREAD.get(r.id) || [r.lon, r.lat];
const PLACE_FEATURE = new Map(E.filter((r) => r.lat != null).map((r) => {
  const meta = intentMeta(r);
  const slug = pinColour(meta) ? meta.icon : 'move';
  /* Anything with a Plum offer is the Perks star: a partner, and a venue
     booked through Playo, which the Perks filter and the OFFER line already
     count as one. A Playo venue kept the round pin and read as no offer. */
  const perk = hasPerkCallout(r);
  return [r.id, {
    type: 'Feature',
    properties: {
      id: r.id,
      n: r.n,
      /* The pin a partner rests on: its own shape and glyph, in plum red. The
         gift rides above it on its own layer, fading in and out. */
      icon: perk ? `pin-${slug}-perkcat` : `pin-${slug}`,
      slug,
      k: meta?.k || '',
      perk: perk ? 1 : 0,
    },
    geometry: { type: 'Point', coordinates: spreadAt(r) },
  }];
}));

const isReal = u => u && !/goo\.gl\/example/.test(u);
/* Directions has to be directions. One row — eat.fit, which is citywide and
   has no address to give — carries its website in the gm column, and isReal
   alone was happy to label cult.fit/eatfit "Directions". A url that is not a
   map is not a map, whatever column it arrives in. */
const isMapsUrl = (u) => isReal(u)
  && /^https?:\/\/(www\.)?(google\.[a-z.]+\/maps|maps\.google\.|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(u);
/* A place's link to Google Maps, in Google's own documented form so the
   Maps app opens it as well as the web does: the place's name and address
   as the search, and its place ID where we have one. The data's links were
   "place/?q=place_id:…", which the app often answers with "not found", or
   carried "Google" as their search words, so a place ID Google did not know
   searched for Google itself. With the name and address as the search, the
   worst case is a search that finds the place by name. */
const placeIdOf = (u) => (String(u || '').match(/place_id[:=]([A-Za-z0-9_-]{20,})/) || [])[1] || '';
function mapsUrlFor(r) {
  const name = String(r.n || '').replace(/\s+—\s+.*$/, '').trim();
  const where = r.ad || [r.a, 'Mumbai'].filter(Boolean).join(', ');
  const pid = placeIdOf(r.gm);
  if (!pid && isMapsUrl(r.gm) && !/[?&]q=place_id|query=Google&/.test(r.gm)) return r.gm;
  const q = encodeURIComponent(where ? `${name}, ${where}` : name);
  return `https://www.google.com/maps/search/?api=1&query=${q}${pid ? `&query_place_id=${pid}` : ''}`;
}
/* A trail has no place of its own on Google Maps, so its link is directions
   along its own line: start to end (or round to the start, for a loop),
   through points spaced evenly along the way so Google traces the route we
   drew. Three of them, the most Google keeps on a phone. */
const TRAIL_STOPS = 3;
function trailMapsUrl(f) {
  const line = f?.geometry?.coordinates;
  if (!line || line.length < 2) return '';
  const at = ([lon, lat]) => `${lat.toFixed(6)},${lon.toFixed(6)}`;
  const seg = [0];
  for (let i = 1; i < line.length; i++) {
    const [x1, y1] = line[i - 1], [x2, y2] = line[i];
    seg.push(seg[i - 1] + Math.hypot((x2 - x1) * Math.cos(y1 * Math.PI / 180), y2 - y1));
  }
  const total = seg[seg.length - 1];
  const pointAt = (d) => {
    const i = Math.max(1, seg.findIndex((v) => v >= d));
    const t = (d - seg[i - 1]) / ((seg[i] - seg[i - 1]) || 1);
    const [x1, y1] = line[i - 1], [x2, y2] = line[i];
    return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
  };
  const loop = !!f.properties?.loop;
  const n = TRAIL_STOPS;
  const via = Array.from({ length: n }, (_, k) => at(pointAt(total * (k + 1) / (n + 1))));
  const q = new URLSearchParams({
    api: '1',
    origin: at(line[0]),
    destination: at(loop ? line[0] : line[line.length - 1]),
    waypoints: via.join('|'),
    travelmode: f.properties?.g === 'cycle' ? 'bicycling' : 'walking',
  });
  return `https://www.google.com/maps/dir/?${q}`;
}
/* A Surprise me day, as Google Maps directions through its stops in order.
   Four stops at most is two in between, inside what Google keeps on a phone. */
/* The planned day, said plainly in the card above the other days: how many
   stops, its name, its walk, and the way to go. */
/* Puts a planned day away: its line, numbers and circle go, and the list
   shows everything in its part of town again. */
function putDayAway() {
  planFor = ''; clearPuzzle('plan'); state.planIds = new Set(); state.planTitle = ''; state.planStats = ''; state.planBook = [];
  closeLens(); closePlace();
  state.intents = new Set(MAP_INTENTS.map((x) => x.k));
  state.subs = {};
  syncIntentUI();
  scheduleRender({ fit: true });
}
/* What a made day was made from: its words and part of town, while it is on the map. */
function madeKey() {
  return state.planIds.size ? `${sentence.plan.join('>')}@${state.area}` : '';
}
function dayBlockHtml() {
  const stops = [...state.planIds].map((id) => BY_ID.get(id)).filter(Boolean);
  const url = planMapsUrl(stops);
  const n = stops.length;
  return `<div class="day-block">
    <button type="button" class="day-exit" data-s-exit="1" aria-label="Close this day">×</button>
    <span class="day-kicker">Your day · ${n} stop${n === 1 ? '' : 's'}</span>
    ${state.planTitle ? `<span class="notice-title">${esc(state.planTitle)}</span>` : ''}
    ${state.planStats ? `<span class="notice-stats">${esc(state.planStats)}</span>` : ''}
    <span class="day-acts">${url ? `<a class="day-act day-go" href="${esc(url)}" target="_blank" rel="noopener">Go to Google Maps ↗</a>` : ''}</span>
  </div>`;
}
/* A day's walk on Google Maps: each stop by its name and address, with its
   place ID where we have one, so Google routes between the places
   themselves rather than between bare coordinates. */
function planMapsUrl(stops) {
  const at = stops.filter((r) => r.lat != null);
  if (at.length < 2) return '';
  const said = (r) => `${String(r.n || '').replace(/\s+—\s+.*$/, '').trim()}, ${r.ad || [r.a, 'Mumbai'].filter(Boolean).join(', ')}`;
  const first = at[0], last = at[at.length - 1], mid = at.slice(1, -1);
  const q = new URLSearchParams({ api: '1', origin: said(first), destination: said(last), travelmode: 'walking' });
  if (placeIdOf(first.gm)) q.set('origin_place_id', placeIdOf(first.gm));
  if (placeIdOf(last.gm)) q.set('destination_place_id', placeIdOf(last.gm));
  if (mid.length) {
    q.set('waypoints', mid.map(said).join('|'));
    if (mid.every((r) => placeIdOf(r.gm))) q.set('waypoint_place_ids', mid.map((r) => placeIdOf(r.gm)).join('|'));
  }
  return `https://www.google.com/maps/dir/?${q}`;
}
const igUrl = h => 'https://instagram.com/' + h.replace(/^@/,'');
const hostOf = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return 'Website'; } };

/* Tags and thumbs take their tint from the intent's colour family. */

const state = {
  intents: new Set(MAP_INTENTS.map((i) => i.k)),
  area: 'all',
  rg: 'all',
  query: '',
  view: 'map',
  active: null,
  /* The map opens with the city in one colour; Colours turns the corporations on. */
  paint: 'plain',
  /* Runs and rides are drawn from the start: they are the only thing on the
     map that is a line rather than a pin, and a city's routes are most of
     what "move" means here. */
  routes: true,
  /* Plum Perks narrows every surface — map, list, counts, legend — to the
     places carrying a perk.
     Off at the start. The map used to open filtered to the partners, and the
     opening view is the one place that cannot afford it: 276 pins where the
     city holds 2,371, so the first thing anyone saw was the emptiest map the
     site can draw, and picking any category made it fuller. There is no way
     to add pins to that view — 276 is every partner there is.
     Plum Perks leads instead of excluding: partners take the top of the list
     wherever they appear, they carry their gift on the map and their offer on
     the row, and this button is here to narrow to them when that is what
     someone wants. */
  /* The map opens on the Plum Perks partners, the reason it exists; the
     button is pressed from the start and pressing it shows everything. */
  /* Off on arrival: the list opens on All, the toolbar button and the
     list's Plum Perks half being one switch. */
  perksOnly: false,
  /* The list's third mode: only the kitchens that deliver and seat no one. */
  deliveryOnly: false,
  /* The sentence picker's narrowing of an activity to one of its groups
     (src/lib/subcategories.js), as { intent: group }. */
  subs: {},
  /* The stops of a Surprise me plan, shown whatever the filters say. */
  planIds: new Set(),
  clearView: false,
  threeD: false,
  listMin: false,
  /* Mobile: places sheet stays closed until opened from the menu. */
  /* On a phone the list is always there as a bar along the bottom. */
  showList: true,
  /* Index: one category at a time, or 'all'. */
  indexIntent: 'all',
  indexArea: 'all',
  /* A random rank per entry once Randomize has been pressed. */
  shuffle: null,
  /* Which half of the Perks answer the list is showing: the places in
     Mumbai, or the brands that ship to it. */
  listTab: 'places',
};

const isNarrow = () => window.matchMedia('(max-width: 820px)').matches;
/* Phones start with the sheet collapsed so the map is the first thing you see. */
state.listMin = isNarrow();
let touched = false;

const footText =
  'Basemap: OpenStreetMap data via OpenFreeMap, drawn with MapLibre. '
  + 'City, corporation and ward boundaries and metro lines © OpenStreetMap contributors. '
  + COUNTS.total + ' entries compiled by hand: ' + COUNTS.mapped + ' pinned, '
  + COUNTS.unpinned + ' with no fixed address, ' + COUNTS.outside + ' starting outside the city limits. '
  + 'Plus ' + COUNTS.parks + ' public parks from OpenStreetMap. '
  + 'Mumbai, Navi Mumbai, Thane and Mira-Bhayandar cover ' + DB.gba_km2 + ' km² across nine zones: the BMC\u2019s six, Navi Mumbai, Thane and Mira-Bhayandar. '
  + 'Last reviewed September 2026. Not medical advice.';

const footEl = document.getElementById('foot');
if (footEl) footEl.textContent = footText;

const frameEl = document.getElementById('frame');
/* The paper map's chrome (prompt-map.css .is-paper) follows the basemap. */
if (BASEMAP === 'paper') frameEl?.classList.add('is-paper');
/* The listing as bands: each place a full-width strip in its category's
   colour, its name on it, a red square where it has a Plum Perks offer. */
const LIST_BANDS = true;
if (BASEMAP === 'paper' && LIST_BANDS) frameEl?.classList.add('is-bands');
const mapEl = document.getElementById('map');
/* While the intro card is up the map fills the screen and the page around it
   waits off to the side (.is-intro, set in the markup; prompt-map.css). Show
   me slides it in. Without an intro there is nothing to wait for. */
if (!document.getElementById('intro')) frameEl?.classList.remove('is-intro');
const topLeft = document.getElementById('topleft');
const topRight = document.getElementById('topright');
const toolbarEl = document.querySelector('.toolbar');
const legendEl = document.getElementById('legend');
const cliffEl = document.getElementById('cliff');
const searchPanel = document.getElementById('search-panel');
const placeCard = document.getElementById('place-card');
const cardsEl = document.getElementById('cards');
const noticeEl = document.getElementById('notice');
const resultsBody = document.getElementById('results-body');
const resultsTitle = document.getElementById('results-title');
const resultsSub = document.getElementById('results-sub');
const resultsToggle = document.getElementById('results-toggle');
const resultsTabs = document.getElementById('results-tabs');
const setTabCount = (k, n) => {
  const el = resultsTabs?.querySelector(`[data-tab-count="${k}"]`);
  if (el) el.textContent = String(n);
};
const indexView = document.getElementById('index-view');
const indexBody = document.getElementById('index-body');
const indexSearch = document.getElementById('index-search');
const indexSub = document.getElementById('index-sub');
const warnEl = document.getElementById('tilewarn');
const scaleEl = document.getElementById('scalebar');

/* ---------- results list ---------- */
function openResultsList() {
  /* On a phone, keep the sheet minimized so filtering doesn't bury the map. */
  setListMinimized(isNarrow());
}

/* On a phone the prompt folds to its two lines ("I want to be well",
   "in Mumbai"), so the list and the map have the screen; a chevron on it
   opens and folds it, and opening the list folds it. */
/* On a phone the paper map is one card too: the sentence and the list are
   halves of it, so folding the sentence folds the card to its first line and
   the red foot, and neither half tucks the other away. */
const paperPhone = () => BASEMAP === 'paper' && isNarrow();
function foldPrompt(fold) {
  const el = document.getElementById('prompt');
  if (!el || !isNarrow()) return;
  el.classList.toggle('is-folded', !!fold);
  if (paperPhone()) {
    frameEl?.classList.toggle('is-card-folded', !!fold);
    syncStack();
    return;
  }
  if (!fold && !state.listMin) setListMinimized(true);
  const b = document.getElementById('prompt-fold');
  b?.setAttribute('aria-expanded', String(!fold));
  b?.setAttribute('aria-label', fold ? 'Show the activities' : 'Hide the activities');
  syncStack();
}
/* On a phone the list is never closed, only tucked down to its tab in the
   corner; elsewhere closing it hides it as before. */
function tuckList() {
  if (paperPhone()) { foldPrompt(true); return; }
  if (isNarrow()) { state.showList = true; if (searchPanel) searchPanel.hidden = false; setListMinimized(true); return; }
  state.showList = false;
  if (searchPanel) searchPanel.hidden = true;
}
function setListMinimized(min) {
  if (paperPhone()) {
    state.listMin = false;
    searchPanel?.classList.remove('is-min');
    requestAnimationFrame(() => fillList());
    return;
  }
  state.listMin = !!min;
  /* On a phone the open list and the open prompt share the screen badly, so
     opening one folds the other: the list folds the activities and shuts the
     area picker; the prompt opening tucks the list (foldPrompt, setPanel). */
  if (isNarrow() && !state.listMin) {
    foldPrompt(true);
    const ap = document.getElementById('prompt-area-panel');
    if (ap && !ap.hidden) { ap.hidden = true; document.getElementById('prompt-area-btn')?.setAttribute('aria-expanded', 'false'); }
  }
  searchPanel?.classList.toggle('is-min', state.listMin);
  if (resultsToggle) {
    resultsToggle.setAttribute('aria-expanded', state.listMin ? 'false' : 'true');
    /* An icon, the chevron turned up when the list is minimised. */
    resultsToggle.classList.toggle('is-min', !!state.listMin);
    resultsToggle.setAttribute('aria-label', state.listMin ? 'Expand the list' : 'Minimize the list');
    resultsToggle.title = state.listMin ? 'Expand' : 'Minimize';
  }
  /* Expanding is the first time the panel has a height to measure against.
     Deferred, because syncSearchPanel calls this before it has replaced the
     rows, and filling against the previous list would only be thrown away. */
  if (!state.listMin) queueMicrotask(fillList);
}

resultsToggle?.addEventListener('click', (e) => {
  e.stopPropagation();
  setListMinimized(!state.listMin);
  syncStack();
});
document.getElementById('results-shuffle')?.addEventListener('click', (e) => {
  e.stopPropagation();
  state.shuffle = new Map(E.map((r) => [r.id, Math.random()]));
  /* The list is open to be shuffled, so it stays open: on a phone the redraw
     below hides the sheet unless it is marked as shown. */
  state.showList = true;
  setListMinimized(false);
  syncSearchPanel(filtered());
  resultsBody?.scrollTo({ top: 0 });
});
document.querySelector('.results-head')?.addEventListener('click', () => {
  if (state.listMin) setListMinimized(false);
});
/* Switching halves is a list change only: the map keeps whatever the sentence
   asked of it, so the places are still under the pins when you switch back. */
resultsTabs?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-list-tab]');
  if (!btn || btn.dataset.listTab === state.listTab) return;
  state.listTab = btn.dataset.listTab;
  setListMinimized(false);
  syncSearchPanel(filtered());
  resultsBody?.scrollTo({ top: 0 });
});
/* Communities, Events and Online perks: toggles in the desktop's top bar
   that open a panel of their own on the right, since none of them has pins. */
const listTabs = document.getElementById('list-tabs');
const panePeople = document.getElementById('pane-people');
const paneEvents = document.getElementById('pane-events');
const paneOnline = document.getElementById('pane-online');
const sidePanel = document.getElementById('side-panel');
const paneAbout = document.getElementById('pane-about');
const SIDE_TITLES = { people: 'Communities', events: 'Upcoming events', online: 'Online perks', about: 'About' };
/* The side panel: one of Communities, Events or Online perks, or none. The
   frame's .is-side moves the map's right edge in and the panel slides into
   the room; the list on the left stays on the places throughout. */
function setListPane(pane) {
  const open = pane && pane !== 'places' ? pane : null;
  listTabs?.querySelectorAll('[data-pane]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pane === open)));
  if (panePeople) panePeople.hidden = open !== 'people';
  if (paneEvents) paneEvents.hidden = open !== 'events';
  if (paneOnline) paneOnline.hidden = open !== 'online';
  if (paneAbout) paneAbout.hidden = open !== 'about';
  document.getElementById('open-cliff')?.setAttribute('aria-pressed', String(open === 'about'));
  if (open === 'people') fillPeople(document.getElementById('list-people'), { filters: true });
  if (open === 'events') {
    fillEvents(document.getElementById('list-events'), document.getElementById('list-events-blurb'),
      document.getElementById('list-events-contribute'));
  }
  if (open === 'online') fillOnlinePane();
  const title = document.getElementById('side-title');
  if (title && open) title.textContent = SIDE_TITLES[open];
  if (open && sidePanel) sidePanel.hidden = false;
  frameEl?.classList.toggle('is-side', !!open);
  document.getElementById('side-body')?.scrollTo({ top: 0 });
}
/* The toggles live in the top bar now, with no Places of their own: pressing
   the one that is on closes the panel. */
listTabs?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-pane]');
  if (!btn) return;
  setListPane(btn.getAttribute('aria-pressed') === 'true' ? null : btn.dataset.pane);
});
document.getElementById('side-close')?.addEventListener('click', () => setListPane(null));

/* Delegated, so rows added as the list grows are live without rewiring. */
/* The Plum Perks drawer (paper map): the partners that fit what the sentence
   asks, pinned ones first, under a red bar that slides it up and down. */
const perksDrawer = document.getElementById('perks-drawer');
const pdBody = document.getElementById('pd-body');
const pdHandle = document.getElementById('pd-handle');
const PD_MAX = 12;
/* "See all N partners" lists every one in the drawer itself (kept open, at
   full height) until the drawer is folded away. */
let pdShowAll = false, lastPartners = [], pdAsked = null;
function fillPerksDrawer(partners) {
  if (!perksDrawer || BASEMAP !== 'paper') return;
  lastPartners = partners;
  perksDrawer.hidden = false;
  /* It folds itself away when what the map is asked changes (an activity,
     the part of town, a search, a day) or when nothing matches, so the
     list under it shows the new answer. */
  const asked = JSON.stringify([[...state.intents].sort(), state.subs, state.area, state.query, [...state.planIds]]);
  const changed = pdAsked !== null && asked !== pdAsked;
  pdAsked = asked;
  if (perksDrawer.classList.contains('is-open') && (changed || !partners.length)) setDrawerOpen(false);
  const list = [...partners].sort((a, b) => (b.lat != null) - (a.lat != null));
  const html = list.length
    ? list.slice(0, pdShowAll ? list.length : PD_MAX).map((r) => paperRowHtml(r, ' prow-perk')).join('')
      + (list.length > PD_MAX && !pdShowAll ? `<button type="button" class="pd-all" data-pd-all="1">See all ${list.length} partners</button>` : '')
    : `<p class="pd-empty">No Plum Perks partners for this yet. Run a place like these? <a href="${esc(PARTNER_URL)}" target="_blank" rel="noopener">Become a Plum partner ↗</a></p>`;
  if (pdBody && pdBody.__html !== html) { pdBody.__html = html; pdBody.innerHTML = html; }
  const label = perksDrawer.querySelector('.pd-label');
  /* On a planned day the foot speaks for the day: how many of its stops carry
     an offer, or, with none, the offer to make it a Plum Perks day. */
  const planned = state.planIds.size > 0;
  perksDrawer.classList.toggle('is-make', planned && !list.length);
  if (label) label.textContent = planned
    ? (list.length ? `${list.length} ${list.length === 1 ? 'stop has' : 'stops have'} a Plum Perks offer` : 'Make it a Plum Perks day')
    : perksDrawer.classList.contains('is-open')
      ? `Plum Perks · ${list.length} ${list.length === 1 ? 'partner' : 'partners'}`
      : list.length ? 'See discounts with Plum Perks' : 'No Plum Perks here yet · become a partner';
}
/* A planned day with no partner in it: one stop is swapped for the nearest
   Plum Perks partner of the same kind (same activity and group, so a cafe
   stays a cafe), within PERK_SWAP_KM, last stop first
   (the meal, usually), and the day is shown again. */
const PERK_SWAP_KM = 2;
function makePerksDay() {
  const stops = [...state.planIds].map((id) => BY_ID.get(id)).filter(Boolean);
  /* First a partner of the very same kind; failing that, any partner in the
     same activity that is somewhere to go rather than a shop. */
  const passes = [(r, at) => r.s === at.s && dayFit(r, INTENT_OF.get(r.id)), (r) => dayFit(r, INTENT_OF.get(r.id))];
  for (const fits of passes) {
    for (let i = stops.length - 1; i >= 0; i--) {
      const at = stops[i], k = INTENT_OF.get(at.id);
      const partner = E.filter((r) => r.lat != null && !r.out && hasPerkCallout(r) && INTENT_OF.get(r.id) === k && fits(r, at) && !state.planIds.has(r.id))
        .map((r) => [kmBetween(r, at), r]).filter(([d]) => d <= PERK_SWAP_KM).sort((x, y) => x[0] - y[0])[0];
      if (partner) {
        const next = stops.slice(); next[i] = partner[1];
        showPlanned(next, `${(state.planTitle || 'Your day').replace(/ · with Plum Perks$/, '')} · with Plum Perks`, state.area);
        return true;
      }
    }
  }
  const label = perksDrawer?.querySelector('.pd-label');
  if (label) label.textContent = 'no partner close enough to this day';
  return false;
}
/* On a phone the list folds away behind its own bar; a press opens it. */
const listBar = document.getElementById('list-bar');
function setListOpen(open) {
  searchPanel?.classList.toggle('is-list-open', open);
  listBar?.setAttribute('aria-expanded', String(open));
  syncListBar();
}
function syncListBar() {
  const label = listBar?.querySelector('.lb-label');
  if (!label) return;
  const n = listItems.length;
  const open = searchPanel?.classList.contains('is-list-open');
  /* A planned day's stops are the day, and the bar says so. */
  const day = state.planIds.size && sentence?.tab === 'plan';
  label.textContent = day
    ? (open ? 'Hide your day' : `See your day \u00b7 ${state.planIds.size} ${state.planIds.size === 1 ? 'stop' : 'stops'}`)
    : open ? 'Hide places' : n ? `See ${n.toLocaleString('en-IN')} ${n === 1 ? 'place' : 'places'}` : 'See the places';
}
listBar?.addEventListener('click', () => setListOpen(!searchPanel.classList.contains('is-list-open')));
/* A press on the bar opens it all the way up the card, or shuts it. The bar
   can also be dragged: the drawer then follows it to any height, shuts when
   let go near the foot and takes the whole card when let go near the top. */
let pdDragged = false;
function setDrawerOpen(open, { slide = true } = {}) {
  /* Folded away, the drawer goes back to its first dozen next time. */
  if (!open && pdShowAll) { pdShowAll = false; fillPerksDrawer(lastPartners); }
  /* Opening hands the drawer the whole panel in one layout step, which no
     transition can ease; so it is moved there at once and then slid up from
     where it was (and down again on closing). The list stays drawn behind it
     while it rises, where it was, so the sheet passes over it. */
  const rb = searchPanel?.querySelector('.results-body');
  const from = perksDrawer.getBoundingClientRect().top;
  const held = open && rb && !searchPanel.classList.contains('has-pd-full') && rb.offsetParent
    ? { top: rb.offsetTop, h: rb.offsetHeight, scroll: rb.scrollTop } : null;
  perksDrawer.classList.toggle('is-open', open);
  setDrawerFull(open);
  if (pdBody) { pdBody.style.maxHeight = ''; pdBody.style.transition = ''; }
  pdHandle?.setAttribute('aria-expanded', String(open));
  frameEl?.classList.toggle('is-pd-open', open);
  /* The plan card gives up (or takes back) its full height, and the list
     re-hangs from it, before the slide measures where the drawer ends. */
  syncPlanHeight();
  syncStack();
  const dy = from - perksDrawer.getBoundingClientRect().top;
  if (slide && dy && !S_REDUCED()) {
    if (held) {
      Object.assign(rb.style, { position: 'absolute', left: '0', right: '0', top: `${held.top}px`, height: `${held.h}px` });
      rb.style.setProperty('display', 'block', 'important');
      rb.scrollTop = held.scroll;
    }
    if (pdBody && open) pdBody.style.transition = 'none';
    /* Cut at the card's foot while it moves, so the sheet never hangs below. */
    if (searchPanel) searchPanel.style.clipPath = 'inset(-40px -40px 0 -40px)';
    const anim = perksDrawer.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }],
      { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' });
    const done = () => {
      if (held) ['position', 'left', 'right', 'top', 'height', 'display'].forEach((k) => rb.style.removeProperty(k));
      if (pdBody) pdBody.style.transition = '';
      if (searchPanel) searchPanel.style.clipPath = '';
    };
    anim.finished.then(done, done);
  }
  scheduleRender({ fit: false });
}
pdHandle?.addEventListener('pointerdown', (e) => {
  if (perksDrawer.classList.contains('is-make') || e.button > 0 || !pdBody) return;
  const y0 = e.clientY;
  const start = perksDrawer.classList.contains('is-open') ? pdBody.getBoundingClientRect().height : 0;
  /* As high as it goes: what it measures when it has the whole card. */
  const wasOpen = perksDrawer.classList.contains('is-open'), wasFull = perksDrawer.classList.contains('is-full');
  const keep = pdBody.style.maxHeight;
  pdBody.style.transition = 'none'; pdBody.style.maxHeight = '';
  perksDrawer.classList.add('is-open'); setDrawerFull(true);
  const top = pdBody.getBoundingClientRect().height;
  perksDrawer.classList.toggle('is-open', wasOpen); setDrawerFull(wasFull);
  pdBody.style.maxHeight = keep; pdBody.offsetHeight; pdBody.style.transition = '';
  pdDragged = false;
  const move = (ev) => {
    const dy = ev.clientY - y0;
    if (!pdDragged && Math.abs(dy) < 6) return;
    if (!pdDragged) {
      pdDragged = true;
      setDrawerFull(false);
      perksDrawer.classList.add('is-open');
      pdBody.style.transition = 'none';
    }
    pdBody.style.maxHeight = `${Math.max(0, Math.min(top, start - dy))}px`;
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    if (!pdDragged) return;
    const h = pdBody.getBoundingClientRect().height;
    pdBody.style.transition = '';
    if (h < 48) setDrawerOpen(false);
    else if (h > top - 40) setDrawerOpen(true);
    else pdHandle.setAttribute('aria-expanded', 'true');
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
});
pdHandle?.addEventListener('click', () => {
  if (pdDragged) { pdDragged = false; return; }
  if (perksDrawer.classList.contains('is-make')) { makePerksDay(); return; }
  setDrawerOpen(!perksDrawer.classList.contains('is-open'));
});
pdBody?.addEventListener('click', (e) => {
  if (e.target.closest('[data-pd-all]')) {
    pdShowAll = true;
    const top = pdBody.scrollTop;
    fillPerksDrawer(lastPartners);
    setDrawerOpen(true);
    setDrawerFull(true);
    pdBody.scrollTop = top;
    return;
  }
  if (e.target.closest('.prow-shut')) { const id = e.target.closest('.prow')?.dataset.id; if (id) openRowIn(id, pdBody); return; }
  const row = e.target.closest('.card-main')?.parentElement;
  if (!row?.dataset.id) return;
  if (isNarrow()) openRowIn(row.dataset.id, pdBody);
  else select(row.dataset.id, false);
});
/* As the page arrives, the drawer rises halfway to show the perks are there,
   then folds away on its own after PEEK_MS. A press or drag on it in that time
   is the reader taking it, and it stays where they put it. */
const PEEK_MS = 3000;
let peekTimer = 0;
function peekDrawer() {
  if (!perksDrawer || perksDrawer.hidden || !pdBody || perksDrawer.classList.contains('is-open')
    || perksDrawer.classList.contains('is-make')) return;
  /* Half of what it measures with the whole card. */
  pdBody.style.transition = 'none';
  perksDrawer.classList.add('is-open'); setDrawerFull(true);
  const full = pdBody.getBoundingClientRect().height;
  setDrawerFull(false);
  pdBody.style.maxHeight = '0px'; pdBody.offsetHeight;
  pdBody.style.transition = '';
  pdBody.style.maxHeight = `${Math.round(full / 2)}px`;
  pdHandle?.setAttribute('aria-expanded', 'true');
  clearTimeout(peekTimer);
  peekTimer = setTimeout(() => {
    if (!perksDrawer.classList.contains('is-open')) return;
    pdBody.style.maxHeight = '0px';
    peekTimer = setTimeout(() => setDrawerOpen(false, { slide: false }), 480);
  }, PEEK_MS);
}
perksDrawer?.addEventListener('pointerdown', () => clearTimeout(peekTimer), true);

/* The open drawer taking the whole card. */
function setDrawerFull(on) {
  perksDrawer?.classList.toggle('is-full', !!on);
  searchPanel?.classList.toggle('has-pd-full', !!on);
}

/* A row under the pointer lifts its pin on the map, the way a pin under the
   pointer lights its row: the two always point at each other. */
cardsEl?.addEventListener('mouseover', (e) => {
  const row = e.target.closest('.prow');
  if (!row || !map || row.classList.contains('is-open')) return;
  const f = PLACE_FEATURE.get(row.dataset.id);
  if (!f || lifted?.id === row.dataset.id) return;
  /* Not while the map is flying to a place: the list under a still pointer is
     redrawn mid-flight, and a pin lifted then was left hanging where the
     flight passed while the map moved on under it. */
  if (map.isMoving() || map.isEasing?.()) return;
  liftPin(f, map.project(f.geometry.coordinates));
});
cardsEl?.addEventListener('mouseout', (e) => {
  const row = e.target.closest('.prow');
  if (!row || row.contains(e.relatedTarget)) return;
  if (lifted?.id === row.dataset.id) dropPin();
});
/* A planned day, edited: stops taken out (the ×) or put in a new order (a
   stop dragged by its number). The day is drawn again from what is left,
   and its streets asked for afresh. With none left, the day is put away. */
function editDay(ids) {
  const stops = ids.map((id) => BY_ID.get(id)).filter(Boolean);
  if (!stops.length) { putDayAway(); return; }
  clearPuzzle('plan');
  const title = state.planTitle || 'Your day';
  showPlanned(stops, title, state.area);
}
let dayDragged = false;
cardsEl?.addEventListener('pointerdown', (e) => {
  const grip = e.target.closest('.prow.is-stop .prow-no');
  if (!grip || !state.planIds.size || e.button > 0) return;
  const row = grip.closest('.prow');
  const rows = [...cardsEl.querySelectorAll('.prow.is-stop')];
  if (rows.length < 2) return;
  e.preventDefault();
  const y0 = e.clientY;
  let moved = false;
  row.classList.add('is-dragging');
  const move = (ev) => {
    const dy = ev.clientY - y0;
    if (Math.abs(dy) > 4) moved = true;
    row.style.transform = `translateY(${dy}px)`;
  };
  const up = (ev) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    row.classList.remove('is-dragging');
    row.style.transform = '';
    if (!moved) return;
    dayDragged = true;
    setTimeout(() => { dayDragged = false; }, 0);
    /* The new place is wherever the row's middle now sits among the others. */
    const mid = row.getBoundingClientRect().top + row.offsetHeight / 2 + (ev.clientY - y0);
    const others = rows.filter((x) => x !== row);
    let at = others.findIndex((x) => { const b = x.getBoundingClientRect(); return mid < b.top + b.height / 2; });
    if (at < 0) at = others.length;
    const ids = others.map((x) => x.dataset.id);
    ids.splice(at, 0, row.dataset.id);
    if (ids.join('>') !== [...state.planIds].join('>')) editDay(ids);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
});
cardsEl?.addEventListener('click', (e) => {
  if (dayDragged) { e.preventDefault(); e.stopPropagation(); return; }
  const drop = e.target.closest('[data-plan-drop]');
  if (drop) { editDay([...state.planIds].filter((id) => id !== drop.dataset.planDrop)); return; }
  const near = e.target.closest('[data-near-area]');
  if (near) { onAreaPicked(near.dataset.nearArea); renderSentence(); return; }
  if (e.target.closest('.prow-shut')) { const id = e.target.closest('.prow')?.dataset.id; if (id) openRowIn(id); return; }
  const row = e.target.closest('.card-main')?.parentElement;
  if (!row?.dataset.id) return;
  /* On a desktop a row opens its place on the map (the card on the pin); on a
     phone, where the map is small behind the list, it opens in the list. */
  if (BASEMAP === 'paper' && row.classList.contains('prow') && isNarrow()) openRowIn(row.dataset.id);
  else select(row.dataset.id, false);
});

/* ---------- the legend: intents and area ---------- */
function selectedMapIntents() {
  return MAP_INTENTS.map((i) => i.k).filter((k) => state.intents.has(k));
}

/* "Move, Play, & Reset" — Oxford comma, ampersand. Used for the list title. */
function formatIntentPhrase(keys = selectedMapIntents()) {
  const verbs = keys.map((k) => INTENT_BY_K[k]?.verb).filter(Boolean);
  if (!verbs.length || verbs.length >= MAP_INTENTS.length) return '';
  if (verbs.length === 1) return verbs[0];
  if (verbs.length === 2) return `${verbs[0]} & ${verbs[1]}`;
  return `${verbs.slice(0, -1).join(', ')}, & ${verbs[verbs.length - 1]}`;
}

function setIntents(keys, { renderMap = false } = {}) {
  const next = keys.filter((k) => INTENT_BY_K[k]?.map);
  state.intents = new Set(next.length ? next : MAP_INTENTS.map((i) => i.k));
  Object.keys(state.subs).forEach((k) => { if (!state.intents.has(k) || state.intents.size >= MAP_INTENTS.length) delete state.subs[k]; });
  /* Picking an activity is a new question; Delivery only steps back to All. */
  if (state.deliveryOnly) { state.deliveryOnly = false; syncPerks(); }
  syncIntentUI();
  if (renderMap) {
    closePlace();
    openResultsList();
    /* The camera stays where the reader left it: picking an activity only
       changes which pins show, it does not reframe the map around them. */
    scheduleRender({ fit: false });
  }
}

function syncIntentUI() {
  document.querySelectorAll('[data-legend]').forEach((btn) => {
    btn.setAttribute('aria-pressed', state.intents.has(btn.dataset.legend));
  });
  /* The prompt's word summarises whatever is on: "be well" for the lot,
     otherwise the verbs themselves. Defined below, so guard the first call. */
  if (typeof syncPromptLabels === 'function') syncPromptLabels();
}

/* With everything on, a click shows just that intent; after that, clicks toggle. */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-legend]');
  if (!btn) return;
  const k = btn.dataset.legend;
  if (!k || !INTENT_BY_K[k]?.map) return;
  let next;
  if (selectedMapIntents().length >= MAP_INTENTS.length) next = [k];
  else if (state.intents.has(k)) next = [...state.intents].filter((x) => x !== k);
  else next = [...state.intents, k];
  setIntents(next, { renderMap: true });
});
document.getElementById('legend-reset')?.addEventListener('click', () => {
  setIntents(MAP_INTENTS.map((i) => i.k), { renderMap: true });
});

const legendToggle = document.getElementById('legend-toggle');
function setLegendCollapsed(collapsed) {
  legendEl?.classList.toggle('is-open', !collapsed);
  if (legendToggle) {
    legendToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    legendToggle.textContent = collapsed ? 'Filters' : 'Hide';
  }
}
/* Phones stay collapsed; desktop never uses the mobile open/close rule. */
if (isNarrow()) setLegendCollapsed(true);
else setLegendCollapsed(false);

function setArea(area, { clearRg = true } = {}) {
  state.area = area || 'all';
  /* The area is the primary place filter. A leftover corporation must not
     AND-filter it away. */
  if (clearRg) {
    state.rg = 'all';
    if (rgEl) rgEl.value = 'all';
  }
  const desktop = document.getElementById('area');
  const mobile = document.getElementById('area-mobile');
  if (desktop) desktop.value = state.area;
  if (mobile) mobile.value = state.area;
  if (typeof syncPromptLabels === 'function') syncPromptLabels();
}

/* ---------- shared bits of markup ---------- */
const initials = (n) => String(n || '')
  .replace(/\(.*?\)/g, ' ')
  .split(/[\s&|/+—–-]+/).filter((w) => /^[\p{L}\p{N}]/u.test(w))
  .slice(0, 2).map((w) => w[0]).join('').toUpperCase();

/* Tile for list rows, people and the place card: the intent's glyph in cream on
   the place's brand colour, or on its intent's own colour. Perk-partner places
   take plum red so they read as Plum Perks on the map and in the list. An intent
   without a pin (Find your people) has no cream cut, so its icon is masked into cream. */
/* A partner's own logo for the Perks tray, where the thumbnail is 52px and a
   logo is legible. Keyed the way the offers are, and matched the same way.

   Deliberately not used on the map pins: a fetched logo is a full-colour
   raster, and at pin size it becomes a smudge in a box.

   A brand with no logo keeps its initials tile, so an unfetched or failed
   logo degrades to what the tray does today rather than to a broken image. */
const LOGO_KEYS = Object.keys(PERK_LOGOS).sort((a, b) => b.length - a.length);
const logoFor = (r) => {
  const n = normBrand(r.n);
  if (!n) return null;
  /* Three, not four: the shortest real key here is "1mg", and the brand it has
     to answer is "1MG (Tata 1mg)". Longest key is tried first either way, so a
     short one only ever wins when nothing longer fits. */
  const hit = PERK_LOGOS[n]
    || PERK_LOGOS[LOGO_KEYS.find((k) => k.length >= 3 && n.startsWith(k))]
    || PERK_LOGOS[LOGO_KEYS.find((k) => k.length >= 5 && n.includes(k))];
  return hit ? `${BASE_PATH}logos/perks/${hit.file}` : null;
};

/* The tray's thumbnail: the brand's logo where there is one, otherwise exactly
   what thumbHtml would have drawn. */
function perkThumbHtml(r, cls = 'thumb') {
  const logo = logoFor(r);
  if (!logo) return thumbHtml(r, cls);
  return `<span class="${cls} logo-tile" aria-hidden="true"><img src="${esc(logo)}" alt="" loading="lazy" /></span>`;
}

/* The tile on a list row.
 *
 * A Perks partner keeps the solid tile it has always had — filled in its
 * colour, glyph knocked out in cream. Everything else is the same tile
 * inverted: cream ground, hairline edge, and the glyph painted in the colour
 * the tile would have been.
 *
 * That makes the solid tile mean something. It used to be what every row
 * looked like, so a column of them said nothing; now it is the badge for "this
 * one has an offer", and the eye goes to it. The categories are still legible
 * on the inverted rows, in the glyph rather than the ground.
 *
 * Inverted rows always mask the cream cut, which is a silhouette: the mark cut
 * is a multi-colour drawing and masking it paints its internal detail solid
 * too, which reads as a blob at 44px. */
/* The icon on a list row is the map's own pin for the place, whole: the round
   badge, or the Perks star with the category's glyph for a partner, so the
   list and the map read the same. A category with no badge keeps its tile,
   rounded to match. */
function rowBadgeHtml(r, cls = 'thumb card-ico') {
  const meta = intentMeta(r);
  if (!meta || !pinColour(meta)) return thumbHtml(r, `${cls} is-round`);
  if (hasPerkCallout(r)) {
    return `<span class="${cls} row-star" style="--star:url('${ICONS}perk-star-blank.svg')" aria-hidden="true"
      ><img src="${iconUrl(meta, BASE, 'cream')}" alt=""></span>`;
  }
  return `<span class="${cls} row-badge row-square" style="--sq:${pinColour(meta)}" aria-hidden="true"><img src="${iconUrl(meta, BASE, 'tile')}" alt=""></span>`;
}

function thumbHtml(r, cls = 'thumb') {
  const meta = intentMeta(r);
  const pin = pinColour(meta);
  if (meta) {
    const fill = hasPerkCallout(r) ? PLUM_RED : (brandColour(r.n) || pin || meta.c);
    if (hasPerkCallout(r)) {
      const glyph = pin
        ? `<img src="${iconUrl(meta, BASE, 'cream')}" alt="">`
        : `<i class="tile-glyph" style="--glyph:url('${iconUrl(meta, BASE)}')"></i>`;
      return `<span class="${cls} pin-tile" style="background:${fill}" aria-hidden="true">${glyph}</span>`;
    }
    const cut = pin ? 'cream' : 'mark';
    return `<span class="${cls} pin-tile is-light" style="--tile:${fill}" aria-hidden="true"
      ><i class="tile-glyph" style="--glyph:url('${iconUrl(meta, BASE, cut)}')"></i></span>`;
  }
  const tone = TONE[meta?.family] || 'grey';
  return `<span class="${cls} ${tone}" aria-hidden="true"><span class="thumb-initials">${esc(initials(r.n))}</span></span>`;
}

/* A Plum Perks brand with no address. It joins the list under the pinned
   places when the Perks layer is on, so the layer answers "what does Plum get
   me" completely rather than only the half that happens to sit on a street.
   The row is an anchor, not a button: there is no pin to fly to, so it opens
   the brand instead, and the delegated card handler ignores it because the
   wrapper carries no data-id. */
/* The partners with no pin, in the list beside the map rather than in a pane
   of their own. They carry what that pane carried — what they do, what the
   offer is — and every one of them ends at the same door: a brand's own site
   is where you pay full price, and the offer only exists inside the app. */
/* An online partner as a coupon, not a place: a red stub with the offer's
   figure set large ("22%", "₹500", "Free"), a torn edge, then the brand, a
   line about it and its activity. The whole ticket goes to the Plum app. */
/* The online perks are things you take home, not places to go: a seat
   cushion, a supplement, an electric toothbrush. "Buy gear" is the right verb
   beside a shop on the map, where it sits among move/eat/play, but on a
   coupon it reads like sports equipment. Renamed here and on this section's
   own filter chip, so the two agree; the map keeps the verb it has. */
const ONLINE_KIND_LABEL = { gear: 'Personal care' };
const onlineKindLabel = (m) => ONLINE_KIND_LABEL[m.k] || m.verb || m.prompt || '';

function onlineRowHtml(p) {
  const meta = intentMeta(p);
  const colour = (meta && (paperColourOf(meta.k) || pinColour(meta))) || '#C4BBFF';
  const offer = offersFor(p)[0] || '';
  const fig = offer.match(/(₹\s?[\d,]+|rs\.?\s?[\d,]+|\d+\s?%)/i);
  /* The stub holds a figure and the two or three words that qualify it:
     "20%" over "flat off", "Free" over "consultation". offerShort cuts an
     offer at its "on …", which is what keeps most of them that short. The
     ones with no such join have nowhere to be cut — "Unlimited free vet home
     visits" was set whole in a line built for a word — so anything longer
     than three words is left to the body, which has the room, and the stub
     says "with Plum".

     An offer with neither a figure nor a "free" used to read "Perk", which
     names nothing a reader wants. It leads on its own first word instead —
     "Exclusive" over "offer", "Exclusive" over "price" — and only falls back
     to "Perk" when there is no offer at all. */
  const words = offerShort(offer).trim().split(/\s+/).filter(Boolean);
  const free = /free/i.test(offer);
  const big = fig ? fig[1].replace(/^rs\.?\s?/i, '₹').replace(/\s/g, '')
    : free ? 'Free'
      : words[0] || 'Perk';
  const qualifier = fig
    ? offerShort(offer).replace(fig[1], '').replace(/\s+/g, ' ').trim() || 'off'
    : free ? offerShort(offer).replace(/^free\s*/i, '').trim()
      : words.slice(1).join(' ');
  const small = !offer || qualifier.split(/\s+/).filter(Boolean).length > 3 ? 'with Plum' : qualifier;
  const about = aboutLine(p);
  return `<a class="coupon" href="${esc(PLUM_APP)}" target="_blank" rel="noopener"><span class="cp-in">
    <span class="cp-stub"><b>${esc(big)}</b><small>${esc(small.toLowerCase())}</small></span>
    <span class="cp-body">
      <span class="cp-head">${logoFor(p) ? `<img class="cp-logo" src="${esc(logoFor(p))}" alt="" loading="lazy">` : `<span class="cp-logo cp-initials" aria-hidden="true">${esc(initials(p.n))}</span>`}<span class="cp-name">${esc(p.n)}</span></span>
      ${about ? `<span class="cp-about">${esc(about)}</span>` : ''}
      ${meta ? `<span class="cp-kinds">${isMiscPerk(p)
        ? `<span class="cp-kind" style="--c:${MISC_GREY}">Misc</span>`
        : perkKinds(p).map((k) => INTENT_BY_K[k]).filter(Boolean).map((m) => `<span class="cp-kind" style="--c:${(paperColourOf(m.k) || pinColour(m)) || '#C4BBFF'}">${esc(onlineKindLabel(m))}</span>`).join('')}</span>` : ''}
    </span>
  </span></a>`;
}
function perkCardRow(p) {
  const meta = intentMeta(p);
  return `<div class="card perk-card">
    <a class="card-main" href="${esc(PLUM_APP)}" target="_blank" rel="noopener">
      ${perkThumbHtml(p)}
      <span class="card-text">
        <span class="card-name">${esc(p.n)}</span>
        ${offerLine(p, 'card-offer', { always: true })}
        ${p.d ? `<span class="perk-card-desc" title="${esc(descText(p.d))}">${esc(descText(p.d))}</span>` : ''}
        <span class="meta">
          ${meta ? categoryTag(meta) : ''}
          ${p.s || p.a ? tag(p.s || p.a) : ''}
        </span>
      </span>
    </a>
  </div>`;
}

/* The name line carries the marks on its right: how well the listing is known,
   and whether it is a Perks partner. The area tag is gone — on most rows it
   repeated the place name back at itself. */
/* A place's line in the paper listing: the start of its description, else
   what kind of place it is. */
/* The name a row shows: the branch after " — " is dropped. Where that leaves
   two places looking the same ("Agilus Diagnostics" fourteen times), each one's
   line ends with where it is: "Diagnostic lab · Chembur". */
const shownName = (n) => String(n || '').replace(/\s+—\s+.*$/, '');
const SHARED_NAME = (() => {
  const n = new Map();
  E.forEach((r) => { const k = shownName(r.n).toLowerCase(); n.set(k, (n.get(k) || 0) + 1); });
  return n;
})();
const branchOf = (r) => (String(r.n || '').match(/\s+—\s+(.*)$/)?.[1] || r.a || '').trim();
function aboutLine(r) {
  const d = firstSentence(descText(r.d || '')).replace(/[.!?]$/, '');
  const where = SHARED_NAME.get(shownName(r.n).toLowerCase()) > 1 ? branchOf(r) : '';
  /* With a place to name, the kind of place is enough before it, so the
     area is never the part cut off. */
  const what = where ? (r.s || d) : (d || r.s || '');
  const line = where ? [what, where].filter(Boolean).join(' · ') : what;
  return line.length > 70 ? `${line.slice(0, 68).replace(/\s+\S*$/, '')}…` : line;
}
/* The paper listing: a small square in the category's colour, the name, then
   in grey the offer (where there is one) and a line about the place. */
/* An offer cut to its figure for the red tag: "Upto 60% off on scaling,
   polishing" reads "Upto 60% off". */
const offerShort = (o) => (o === 'Plum Perks offer' ? 'Plum Perks' : String(o).replace(/\s+on\s+.*$/i, ''));
function paperRowHtml(r, cls = '') {
  const meta = intentMeta(r);
  const colour = (meta && (paperColourOf(meta.k) || pinColour(meta))) || '#C4BBFF';
  const offer = hasPerkCallout(r) ? (offersFor(r)[0] || 'Plum Perks offer') : '';
  const about = aboutLine(r);
  /* A stop on a planned day carries its number, in the same black square as on the map. */
  const stopNo = state.planIds.has(r.id) ? [...state.planIds].indexOf(r.id) + 1 : 0;
  return `<div class="card prow${cls}${offer ? ' has-perk' : ''}${stopNo ? ' is-stop' : ''}${state.active === r.id ? ' is-active' : ''}" data-id="${esc(r.id)}">
    <button type="button" class="card-main">
      ${stopNo ? `<span class="prow-no" aria-label="Stop ${stopNo}">${stopNo}</span>` : `<span class="prow-sq" style="--c:${colour}" aria-hidden="true"></span>`}
      <span class="prow-name">${esc(shownName(r.n))}</span>
      <span class="prow-meta">${offer ? `<span class="prow-offer">${esc(offer)}</span>` : ''}${offer && about ? '<i aria-hidden="true">•</i>' : ''}${about ? `<span>${esc(about)}</span>` : ''}</span>
      ${offer ? `<span class="prow-pk" title="${esc(offer)}, with Plum Perks">${esc(offerShort(offer))}</span>` : ''}
    </button>
    ${stopNo ? `<button type="button" class="prow-drop" data-plan-drop="${esc(r.id)}" aria-label="Take ${esc(r.n.replace(/\s+—\s+.*$/, ''))} out of the day"><svg class="s-x-ic" viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5"/></svg></button>` : ''}
    ${openRow === r.id ? rowMoreHtml(r) : ''}
  </div>`.replace('class="card prow', `style="--c:${colour}" class="card prow${openRow === r.id ? ' is-open' : ''}`);
}
/* The second way to see a place: its row opens where it is in the list,
   lit in its category's colour, with the same body as the card on a pin. */
var openRow = '';
function rowMoreHtml(r) {
  return `<div class="prow-more"><div class="prow-more-in">${paperPlaceBody(r, placeParts(r))}<button type="button" class="prow-shut">Close</button></div></div>`;
}
function shutRow(el, quick) {
  el.classList.remove('is-open');
  const more = el.querySelector('.prow-more');
  if (!more) return;
  if (quick || S_REDUCED()) { more.remove(); return; }
  more.addEventListener('transitionend', () => more.remove(), { once: true });
  setTimeout(() => more.remove(), 400);
}
const at0 = (r) => [r.lon, r.lat];
function openRowIn(id, scope = cardsEl) {
  const r = BY_ID.get(id);
  const el = scope?.querySelector(`.prow[data-id="${CSS.escape(id)}"]`);
  if (!r || !el) { select(id, false); return; }
  [cardsEl, pdBody].forEach((box) => box?.querySelectorAll('.prow.is-open').forEach((x) => { if (x !== el) shutRow(x); }));
  /* A row opened in the perks drawer gives the drawer the whole card. */
  if (scope === pdBody) setDrawerFull(true);
  if (openRow === id) {
    openRow = '';
    shutRow(el);
    state.active = null;
    setActivePin();
    markActiveRows(null);
    return;
  }
  if (placeCard && !placeCard.hidden) { placeCard.hidden = true; cardAt = null; }
  openRow = id;
  state.active = id;
  setActivePin();
  markActiveRows(id);
  el.insertAdjacentHTML('beforeend', rowMoreHtml(r));
  el.classList.add('is-open');
  const more = el.querySelector('.prow-more');
  if (!S_REDUCED()) { more.classList.add('is-shut'); more.offsetHeight; more.classList.remove('is-shut'); }
  /* The opened row rises to the top of the list so it reads in full. */
  setTimeout(() => {
    const box = el.closest('.results-body, .pd-body');
    if (!box) { el.scrollIntoView({ block: 'nearest', behavior: S_REDUCED() ? 'auto' : 'smooth' }); return; }
    const top = box.scrollTop + el.getBoundingClientRect().top - box.getBoundingClientRect().top;
    box.scrollTo({ top, behavior: S_REDUCED() ? 'auto' : 'smooth' });
  }, 260);
  if (!map || (r.lat == null && !TRAIL[r.id])) return;
  if (!planBounds) map.setMaxBounds(null);
  /* The pin goes to the middle of the map the card leaves clear: right of
     the card on a desktop, under it on a phone. Its name shows beside it. */
  const mr = mapEl.getBoundingClientRect();
  const card = [promptEl, searchPanel, perksDrawer].filter((el) => el && !el.hidden)
    .map((el) => el.getBoundingClientRect()).filter((b) => b.width > 40 && b.height > 0)
    .reduce((u, b) => (u ? { left: Math.min(u.left, b.left), top: Math.min(u.top, b.top), right: Math.max(u.right, b.right), bottom: Math.max(u.bottom, b.bottom) } : b), null);
  let free = { left: mr.left, top: mr.top, right: mr.right, bottom: mr.bottom };
  if (card) {
    if (isNarrow()) free.top = Math.min(card.bottom + 12, mr.bottom - 80);
    else free.left = Math.min(card.right + 12, mr.right - 80);
  }
  /* A route is framed whole in that clear part, not just its start. */
  if (TRAIL[r.id]) {
    const g = TRAIL[r.id].geometry;
    const b = boundsOf(g.type === 'LineString' ? g.coordinates : g.type === 'MultiLineString' ? g.coordinates.flat(1) : [at0(r)]);
    if (!b.isEmpty()) map.fitBounds(b, { padding: { left: free.left - mr.left + 40, top: free.top - mr.top + 40, right: mr.right - free.right + 40, bottom: mr.bottom - free.bottom + 40 }, maxZoom: 16, duration: S_REDUCED() ? 0 : 700 });
    return;
  }
  const at = [r.lon, r.lat];
  const offset = [(free.left + free.right) / 2 - (mr.left + mr.right) / 2, (free.top + free.bottom) / 2 - (mr.top + mr.bottom) / 2];
  map.easeTo({ center: at, zoom: Math.max(map.getZoom(), PIN_FOCUS_ZOOM), offset, duration: S_REDUCED() ? 0 : 700 });
}
function rowHtml(r) {
  if (BASEMAP === 'paper') return paperRowHtml(r);
  const meta = intentMeta(r);
  return `<div class="card${state.active === r.id ? ' is-active' : ''}" data-id="${esc(r.id)}" style="--cat:${(meta && pinColour(meta)) || '#998CFC'}">
    <button type="button" class="card-main">
      <span class="card-text">
        <span class="card-head">
          ${rowBadgeHtml(r)}
          <span class="card-name">${esc(r.n)}</span>
          <span class="card-marks">${statusDot(r)}</span>
        </span>
        ${offerLine(r)}
        <span class="meta">
          ${meta ? categoryTag(meta) : ''}
        </span>
      </span>
    </button>
  </div>`;
}

/* A community: what it is in one line, and where to find it — its website
   (often the event page), else Instagram, else Google Maps. */
function personHtml(r) {
  const link = r.w ? [r.w, hostOf(r.w)]
    : r.ig ? [igUrl(r.ig), r.ig.startsWith('@') ? r.ig : '@' + r.ig]
    : isMapsUrl(r.gm) ? [mapsUrlFor(r), 'Google Maps'] : null;
  return `<div class="person">
    ${thumbHtml(r)}
    <span class="person-text">
      <span class="card-name">${esc(r.n)}</span>
      ${r.d ? `<span class="person-desc">${descHtml(r.d)}</span>` : ''}
      ${link ? `<a class="person-link" href="${esc(link[0])}" target="_blank" rel="noopener">${esc(link[1])} ↗</a>` : ''}
    </span>
  </div>`;
}

/* A weekly event: when, where, and the listing to open. */
/* In the perks pane the 'people' group is not communities to join, it is the
   brands that fit none of the other categories, so it heads as More. Only the
   pane is relabelled; the intent keeps its name everywhere else. */

/* A Plum Perks brand in the pane. Unlike perkCardRow in the results list, this
   renders no link at all when a brand has neither site nor Instagram, rather
   than falling back to the Plum app. */
/* The offer gets its own line under the description, labelled, rather than a
   chip in the row of tags. A brand can give two — Early.fit discounts the GLP-1
   medication and the assessment — and two long chips wrapped badly and read as
   categories rather than as the offer. 73 of the 93 have a figure; the rest
   show no line at all. */
function eventHtml(ev) {
  const host = (() => { try { return new URL(ev.url).host.replace(/^www\./, ''); } catch { return ev.src || 'Open'; } })();
  const thumb = ev.img
    ? `<span class="thumb event-thumb" aria-hidden="true"><img src="${esc(ev.img)}" alt=""></span>`
    : `<span class="thumb pin-tile on-dark" style="background:var(--red)" aria-hidden="true">
        <span class="thumb-initials">${esc(initials(ev.n))}</span>
      </span>`;
  return `<div class="person event-row">
    ${thumb}
    <span class="person-text">
      <span class="card-name">${esc(ev.n)}</span>
      ${ev.when ? `<span class="event-when">${esc(ev.when)}</span>` : ''}
      ${ev.d ? `<span class="event-desc">${esc(ev.d)}</span>` : ''}
      ${ev.a ? `<span class="person-desc">${esc(ev.a)}</span>` : ''}
      ${ev.url ? `<a class="person-link" href="${esc(ev.url)}" target="_blank" rel="noopener">${esc(host)} ↗</a>` : ''}
    </span>
  </div>`;
}

/* ---------- About, Find your people, Upcoming events ---------- */
function openCliff(view = 'about') {
  if (!cliffEl) return;
  const about = document.getElementById('cliff-about');
  const peoplePane = document.getElementById('cliff-people');
  const eventsPane = document.getElementById('cliff-events');
  const title = document.getElementById('cliff-title');
  const labels = {
    about: 'About',
    people: INTENT_BY_K.people.verb,
    events: EVENTS.weekLabel || 'Upcoming events',
  };
  cliffEl.hidden = false;
  if (about) about.hidden = view !== 'about';
  if (peoplePane) peoplePane.hidden = view !== 'people';
  if (eventsPane) eventsPane.hidden = view !== 'events';
  if (title) title.textContent = labels[view] || labels.about;
  cliffEl.setAttribute('aria-label', labels[view] || labels.about);
  cliffEl.dataset.view = view;
  document.getElementById('open-cliff')?.setAttribute('aria-pressed', view === 'about' ? 'true' : 'false');
  document.getElementById('open-people')?.setAttribute('aria-pressed', view === 'people' ? 'true' : 'false');
  document.getElementById('open-events')?.setAttribute('aria-pressed', view === 'events' ? 'true' : 'false');

  if (view === 'people') fillPeople(document.getElementById('people-list'));
  if (view === 'events') {
    fillEvents(document.getElementById('events-list'), document.getElementById('events-blurb'),
      document.getElementById('events-contribute'));
  }
}
/* A community's kind (Running, Cycling…), from src/data/community-categories.json,
   matched on its name with brackets, punctuation and the words every name
   shares taken out; anything the table does not list is Other, and Other is
   left out of the communities altogether. */
const COMMUNITY_OTHER = 'Other';
const communityKey = (s) => String(s || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ')
  .replace(/\b(the|bangalore|bengaluru|mumbai|bombay|community|club|blr)\b/g, ' ').replace(/\s+/g, '').trim();
const COMMUNITY_INDEX = COMMUNITY_CATEGORIES.communities.map((c) => [communityKey(c.name), c.category]);
function communityCategory(r) {
  const k = communityKey(r.n);
  if (!k) return COMMUNITY_OTHER;
  const hit = COMMUNITY_INDEX.find(([t]) => t === k)
    || COMMUNITY_INDEX.find(([t]) => t && (k.startsWith(t) || t.startsWith(k)));
  return hit ? hit[1] : COMMUNITY_OTHER;
}
let peopleCategory = 'all';

/* The communities and the events, for the pane and for the list's own tabs.
   With `filters`, the communities carry a row of chips to show one kind. */
function fillPeople(box, { filters = false } = {}) {
  if (!box) return;
  const people = E.filter((r) => intentMeta(r)?.k === 'people' && communityCategory(r) !== COMMUNITY_OTHER)
    .sort((a, b) => String(a.n || '').localeCompare(String(b.n || '')));
  if (!filters) {
    box.innerHTML = people.map(personHtml).join('') || '<p class="blurb">No community listings yet.</p>';
    return;
  }
  const kinds = COMMUNITY_CATEGORIES.categories
    .map((k) => [k, people.filter((r) => communityCategory(r) === k).length])
    .filter(([, n]) => n);
  if (peopleCategory !== 'all' && !kinds.some(([k]) => k === peopleCategory)) peopleCategory = 'all';
  const chip = (k, label, n) => `<button type="button" class="people-chip" data-people-cat="${esc(k)}"${COMMUNITY_PAIRS[k] ? ` style="--c:${COMMUNITY_PAIRS[k][0]};--ink:${COMMUNITY_PAIRS[k][1]}"` : ''}
    aria-pressed="${peopleCategory === k}">${esc(label)} <em>${n}</em></button>`;
  const shown = peopleCategory === 'all' ? people : people.filter((r) => communityCategory(r) === peopleCategory);
  const flyers = BASEMAP === 'paper' && box.id === 's-people';
  box.innerHTML = `<div class="people-chips" role="group" aria-label="Kind of community">${
    chip('all', 'All', people.length)}${kinds.map(([k, n]) => chip(k, flyers ? shortCategory(k) : k, n)).join('')}</div>${
    flyers ? `<div class="flyers">${shown.map(flyerHtml).join('')}</div>`
      : shown.map(personHtml).join('') || '<p class="blurb">No community listings yet.</p>'}`;
}
/* A community as a flyer taped to the card: its name large, a line about it,
   what kind it is and where to find it, in one of the set days' clashing
   colour pairs and at a slight tilt of its own. The whole flyer is the link. */
const shortCategory = (k) => ({ 'Hiking & Outdoors': 'Hiking', 'Sports & Games': 'Sports', 'Queer Communities': 'Queer', 'Social & Creative': 'Social' })[k] || k;
/* Each kind of community keeps one of the set days' pairs, so a filter
   reads as a colour: running in periwinkle and lime, cycling in yellow and
   orange, and so on. */
const COMMUNITY_PAIRS = {
  Running: ['#948BF5', '#D7F78A'], Cycling: ['#EEE58A', '#E8794A'], 'Hiking & Outdoors': ['#2F6F6B', '#FFC2D1'],
  Climbing: ['#E8B931', '#A8324A'], 'Sports & Games': ['#F28C4B', '#2B44A8'], 'Queer Communities': ['#FFB3C7', '#2E8B57'],
  'Social & Creative': ['#BDEBC9', '#7B45C0'],
};
function flyerHtml(r) {
  let h = 0;
  for (const ch of String(r.n || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [bg, ink] = COMMUNITY_PAIRS[communityCategory(r)] || DAY_PAIRS[h % DAY_PAIRS.length];
  const tilt = ((h >> 4) % 31) / 10 - 1.5;
  /* Its website and its Instagram, each its own link where it has them. */
  const links = [
    r.w && [r.w, 'website'],
    r.ig && [igUrl(r.ig), r.ig.startsWith('@') ? r.ig : `@${r.ig}`],
    !r.w && !r.ig && isMapsUrl(r.gm) && [mapsUrlFor(r), 'Google Maps'],
  ].filter(Boolean);
  const about = aboutLine(r);
  return `<div class="flyer" style="--c:${bg};--ink:${ink};--tilt:${tilt.toFixed(1)}deg">
    <b>${esc(r.n)}</b>
    ${about ? `<span class="fl-about">${esc(about)}</span>` : ''}
    <small><span class="fl-kind">${esc(shortCategory(communityCategory(r)))}</span>${links.map(([u, l]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(l)} ↗</a>`).join('')}</small>
  </div>`;
}
document.getElementById('list-people')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-people-cat]');
  if (!btn) return;
  peopleCategory = btn.dataset.peopleCat;
  fillPeople(document.getElementById('list-people'), { filters: true });
});
function fillEvents(box, blurb, contribute) {
  if (blurb) blurb.textContent = EVENTS.blurb || '';
  if (contribute) {
    contribute.href = EVENTS.contributeUrl || SUGGEST_FORM;
    contribute.textContent = EVENTS.contributeLabel || 'Got something on? Add it';
  }
  if (!box) return;
  const list = Array.isArray(EVENTS.events) ? EVENTS.events : [];
  box.innerHTML = list.length
    ? list.map(eventHtml).join('')
    : '<p class="blurb">Nothing listed yet. Add something below.</p>';
}
function closeCliff() {
  if (cliffEl) cliffEl.hidden = true;
  ['open-cliff', 'open-people', 'open-events'].forEach((id) => {
    document.getElementById(id)?.setAttribute('aria-pressed', 'false');
  });
}
function toggleCliff(view) {
  if (cliffEl && !cliffEl.hidden && cliffEl.dataset.view === view) {
    closeCliff();
    return;
  }
  openCliff(view);
}
/* About: in the side panel on a desktop, beside the lists; the card on a phone. */
document.getElementById('open-cliff')?.addEventListener('click', () => {
  if (!SPLIT.matches) { toggleCliff('about'); return; }
  setListPane(document.getElementById('open-cliff')?.getAttribute('aria-pressed') === 'true' ? null : 'about');
});
document.getElementById('open-people')?.addEventListener('click', () => toggleCliff('people'));
document.getElementById('open-events')?.addEventListener('click', () => toggleCliff('events'));
document.getElementById('close-cliff')?.addEventListener('click', closeCliff);

const rgEl = document.getElementById('rg');
if (rgEl) {
  rgEl.innerHTML = '<option value="all">All nine zones</option>'
    + DB.corps.map(c => `<option value="${c.k}">${esc(c.label)} (${c.n})</option>`).join('')
    + '<option value="none">No fixed zone</option>';
}

const areaEl = document.getElementById('area');
const areaMobileEl = document.getElementById('area-mobile');
function fillAreaSelect(el) {
  if (!el) return;
  el.innerHTML = '<option value="all">Mumbai</option>'
    + (DB.areasByPins || []).map((a) => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
  el.value = state.area;
}
fillAreaSelect(areaEl);
fillAreaSelect(areaMobileEl);

/* The index keeps its own area, from the same list, starting on all of Mumbai. */
const indexAreaEl = document.getElementById('index-area');
fillAreaSelect(indexAreaEl);
if (indexAreaEl) {
  indexAreaEl.value = state.indexArea;
  indexAreaEl.onchange = () => { state.indexArea = indexAreaEl.value; renderIndex(); };
}

/* ---------- the prompt: "I want to _ in _" ----------
   The popup is a gate: you say what you came for, press Show me, and the same
   #prompt node moves into #promptdock on the right, where it keeps working as
   the filter. Moving one node rather than keeping two copies means one set of
   controls and no state to hold in step. The embed has no popup and ships the
   prompt already docked, so every lookup here tolerates a missing #intro.

   Activity is multi-select and place is single: you can want to move and eat
   healthy, but you are only ever in one part of town. Both lists write
   straight into the state the map already filters on — the activity rows are
   the old legend's [data-legend] buttons, so the existing click handler and
   count sync drive them untouched. */
const introEl = document.getElementById('intro');
const promptEl = document.getElementById('prompt');
const promptDock = document.getElementById('promptdock');
const intentBtn = document.getElementById('prompt-intent-btn');
const intentPanel = document.getElementById('prompt-intent-panel');
const areaBtn = document.getElementById('prompt-area-btn');
const areaPanel = document.getElementById('prompt-area-panel');
const areaFilter = document.getElementById('prompt-area-filter');

/* What the big red word says. Everything on is the default the map opens with,
   and it is called "be well" rather than "everything" because that is the
   sentence a visitor is completing. */
function intentSummary() {
  const picked = selectedMapIntents();
  if (picked.length >= MAP_INTENTS.length) return 'be well';
  const words = picked.map((k) => INTENT_BY_K[k]?.prompt).filter(Boolean);
  if (!words.length) return 'be well';
  if (words.length === 1) return words[0];
  if (words.length === 2) return `${words[0]} & ${words[1]}`;
  return `${words.slice(0, -1).join(', ')} & ${words[words.length - 1]}`;
}

function syncPromptLabels() {
  const iBtn = document.getElementById('prompt-intent-btn');
  const aBtn = document.getElementById('prompt-area-btn');
  if (iBtn) iBtn.textContent = intentSummary();
  if (aBtn) aBtn.textContent = state.area === 'all' ? 'Mumbai' : state.area;
  if (typeof renderSentence === 'function') renderSentence();
  const allOn = selectedMapIntents().length >= MAP_INTENTS.length;
  document.getElementById('prompt-all')?.setAttribute('aria-pressed', String(allOn));
  document.querySelectorAll('[data-area]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.area === state.area));
  });
}

/* Opens or closes a prompt list. The activity list is always out; this only moves the area list. */
function setPanel(panel, open) {
  if (!panel) return;
  /* The activities are always out and never close; the area list is the only
     one that opens and shuts. */
  if (panel === intentPanel) {
    panel.hidden = false;
    syncStack();
    return;
  }
  panel.hidden = !open;
  areaBtn?.setAttribute('aria-expanded', String(!!open));
  if (open && isNarrow() && !state.listMin) setListMinimized(true);
  /* On a desktop the list floats over the place list (prompt-map.css), so it
     is set just under its row, where it would have opened in the flow. */
  const row = areaBtn?.closest('.prompt-row');
  if (open && row) panel.style.top = `${row.offsetTop + row.offsetHeight}px`;
  if (open && areaFilter) {
    areaFilter.value = '';
    filterAreaList('');
    areaFilter.focus();
  }
  syncStack();
}

areaBtn?.addEventListener('click', () => setPanel(areaPanel, areaPanel?.hidden));

/* "be well" is the reset: picking it turns everything back on rather than
   adding an eleventh thing to the selection. */
document.getElementById('prompt-all')?.addEventListener('click', () => {
  setIntents(MAP_INTENTS.map((i) => i.k), { renderMap: true });
});

/* The activities are toggle buttons in a grid that is always out, so picking
   one leaves the rest to hand: several can be on at once. */

/* One place at a time, so a pick replaces rather than toggles. */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-area]');
  if (!btn) return;
  onAreaPicked(btn.dataset.area);
  syncPromptLabels();
  setPanel(areaPanel, false);
});

function filterAreaList(q) {
  const words = String(q || '').trim().toLowerCase();
  document.querySelectorAll('#prompt-area-list > li').forEach((li) => {
    const name = li.querySelector('[data-area]')?.dataset.area || '';
    const label = name === 'all' ? 'mumbai' : name.toLowerCase();
    li.hidden = !!words && !label.includes(words);
  });
}
areaFilter?.addEventListener('input', () => filterAreaList(areaFilter.value));

/* Two shuffles, one per line, so "surprise me" can be asked of either half.
   Area shuffle only lands on dense localities — thinner areas stay reachable
   from the list, but not from the dice. Both read the index for whichever
   layer is showing, so a shuffle with Plum Perks on never lands somewhere the
   map is then empty. 20 tries, then take what we have. */
const SHUFFLE_AREA_MIN = 15;
const shuffleScope = () => (state.perksOnly ? 'perks' : 'all');
const denseAreas = () => {
  const scope = shuffleScope();
  /* With the perks on, "dense" is 15 pins of anything; the pairing check below
     is what keeps the pick honest, and demanding 15 Perks pins in a locality
     would leave the dice with almost nothing to choose from. */
  return (DB.areasByPins || []).filter((a) => (DB.areaPinCounts?.[a] || 0) >= SHUFFLE_AREA_MIN
    && PINNED_AREA[scope].has(a));
};
const hasPlaces = (k, area) => {
  const scope = shuffleScope();
  if (k === 'all') {
    return area === 'all'
      ? (scope === 'perks' ? PINNED_ANY_PERK : PINNED_ANY)
      : PINNED_AREA[scope].has(area);
  }
  return PINNED[scope].has(`${k}\0${area}`);
};

/* Surprise me: an activity and a part of town in one press.
 *
 * Two dice asked the reader to shuffle half a question at a time, which is not
 * how anyone arrives at "somewhere to go". This picks the pair together, and
 * only a pair the map can answer — area first from the dense list, then an
 * activity that actually has pins there, so it never lands on an empty map.
 * 30 tries, then take what we have. */
/* Plans a day: in `only` if given (an area's name), else somewhere dense
   picked at random. Returns false, and leaves the map as it was, when no
   outing can be made there. */
function planDay(only = null) {
  const keys = MAP_INTENTS.map((i) => i.k);
  const areas = only ? [only] : denseAreas();
  const pickOf = (xs) => xs[Math.floor(Math.random() * xs.length)];
  /* An outing first: an area, something to move, play or work out at in it, and
     places to eat near that. */
  let plan = null, k = 'move', a = 'all';
  for (let i = 0; i < 40 && !plan; i++) {
    a = areas.length ? pickOf(areas) : 'all';
    /* Work out comes up about one outing in eight; move and play share the rest. */
    k = Math.random() < 0.125 ? 'workout' : pickOf(['move', 'play']);
    const anchors = E.filter((r) => r.lat != null && r.a === a && !r.out && INTENT_OF.get(r.id) === k && !TRAIL[r.id]);
    if (anchors.length) plan = planAround(pickOf(anchors));
  }
  if (!plan && only) return false;
  /* Failing that, the old shuffle: an activity and an area the map can answer. */
  if (!plan) {
    for (let i = 0; i < 30; i++) {
      a = areas.length ? pickOf(areas) : 'all';
      k = pickOf(keys);
      if (hasPlaces(k, a)) break;
    }
  }
  /* The intents go in without a draw of their own — onAreaPicked renders once,
     with both halves already set, rather than drawing the old area under the
     new activity on the way past. A plan turns on what its stops are, so
     every one of them is on the map, and the track's route with it. */
  /* The plan's stops show on the map even with Plum Perks on, so an outing
     around a partner keeps its other stops; Perks itself stays on. */
  state.planIds = new Set(plan ? plan.stops.map((r) => r.id) : []);
  state.planTitle = '';
  state.planStats = '';
  state.planBook = [];
  setIntents(plan ? [...new Set([k, ...plan.stops.map((r) => INTENT_OF.get(r.id)).filter(Boolean)])] : [k], { renderMap: false });
  onAreaPicked(a);
  syncPromptLabels();
  if (plan) {
    drawPlan(plan.stops);
    planFor = askedOf();
  }
  /* On a phone the activities fold away so the plan on the map is seen. */
  foldPrompt(true);
  return true;
}
document.getElementById('surprise')?.addEventListener('click', () => planDay());

/* Plan my healthy day, in the top bar: curated days (themed-days.json), each
   a main thing to do and what a person does after it, close by. Pick what you
   want to do or where, in either order: each side offers only what the other
   can answer, and the days that fit both are listed under them. "Or surprise
   me" is the old random plan, in the picked part of town when it can. */
const surprisePop = document.getElementById('surprise-pop');
const surpriseActs = document.getElementById('surprise-acts');
const surprisePlaces = document.getElementById('surprise-places');
const surpriseDays = document.getElementById('surprise-days');
const surpriseNote = document.getElementById('surprise-note');
const openSurpriseBtn = document.getElementById('open-surprise');
const DAYS = THEMED_DAYS
  .map((t) => ({ ...t, stops: t.stops.map((id) => BY_ID.get(id)).filter((r) => r?.lat != null),
    /* Stops to book ahead of turning up (a class, a float, a court). */
    book: (t.book || []).map((id) => BY_ID.get(id)).filter(Boolean) }))
  .filter((t) => t.stops.length >= 2);
/* "15 min walk · about 80 kcal", plus any leg too far to walk, as a ride. */
/* The set days in loud pairs, a ground and an ink that clash on purpose
   (yellow and orange, periwinkle and lime, maroon and green), each day keeping
   its own pair wherever it shows. */
const DAY_PAIRS = [
  ['#EEE58A', '#E8794A'], ['#948BF5', '#D7F78A'], ['#6E2F2F', '#B6F25A'], ['#FFB3C7', '#2E8B57'],
  ['#2F6F6B', '#FFC2D1'], ['#F28C4B', '#2B44A8'], ['#BDEBC9', '#7B45C0'], ['#2B44A8', '#F2E27C'],
  ['#9CE3FF', '#C2462A'], ['#E3C9FF', '#3C8A3C'], ['#E8B931', '#A8324A'], ['#FF8C7D', '#2B44A8'],
];
function dayTint(t) {
  let h = 0;
  for (const ch of t.title) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [bg, ink] = DAY_PAIRS[h % DAY_PAIRS.length];
  return `--c:${bg};--ink:${ink}`;
}
function dayStats(t) {
  const r = DAY_ROUTES[t.title];
  if (!r) return '';
  const bits = [];
  if (r.walkMin) bits.push(`${r.walkMin} min walk`);
  if (r.rideMin) bits.push(`${r.rideMin} min by auto`);
  if (r.kcal) bits.push(`about ${r.kcal} kcal`);
  return bits.join(' · ');
}
const daySel = { k: '', area: '' };
const daysFor = ({ k = daySel.k, area = daySel.area } = {}) =>
  DAYS.filter((t) => (!k || t.k === k) && (!area || t.area === area));
function fillSurprise() {
  if (!surpriseActs) return;
  const chip = (attr, value, label, on, icon = '') => `<button type="button" class="surprise-chip" ${attr}="${esc(value)}" aria-pressed="${on}">${icon}<span>${esc(label)}</span></button>`;
  const kinds = MAP_INTENTS.map((i) => i.k).filter((k) => daysFor({ k }).length);
  surpriseActs.innerHTML = chip('data-day-k', '', 'anything', !daySel.k)
    + kinds.filter((k) => daysFor({ k }).length && (!daySel.area || daysFor({ k, area: daySel.area }).length))
      .map((k) => chip('data-day-k', k, INTENT_BY_K[k]?.prompt || k, daySel.k === k,
        `<img src="${iconUrl(INTENT_BY_K[k], BASE, 'tile')}" alt="" style="--sq:${pinColour(INTENT_BY_K[k])}">`)).join('');
  const areas = [...new Set(daysFor({ area: '' }).map((t) => t.area))].sort((x, y) => x.localeCompare(y));
  surprisePlaces.innerHTML = chip('data-day-area', '', 'anywhere', !daySel.area)
    + areas.map((x) => chip('data-day-area', x, x, daySel.area === x)).join('');
  const days = daysFor();
  surpriseDays.innerHTML = days.map((t) => `<li><button type="button" class="surprise-day" data-day="${DAYS.indexOf(t)}">
      <span class="surprise-day-name">${esc(t.name)}</span>
      <span class="surprise-day-where">${esc(t.area)}</span>
      <span class="surprise-day-stops">${t.stops.map((r) => esc(r.n.replace(/\s+[—(].*$/, ''))).join(' <i aria-hidden="true">→</i> ')}</span>
      ${dayStats(t) ? `<span class="surprise-day-stats">${esc(dayStats(t))}</span>` : ''}
      ${t.book.length ? `<span class="surprise-day-book">Book ahead: ${t.book.map((r) => esc(r.n.replace(/\s+[—(].*$/, ''))).join(', ')}</span>` : ''}
    </button></li>`).join('');
}
function setSurpriseOpen(open) {
  if (!surprisePop) return;
  fillSurprise();
  surprisePop.hidden = !open;
  openSurpriseBtn?.setAttribute('aria-pressed', String(open));
  if (surpriseNote) surpriseNote.hidden = true;
}
/* A curated day on the map: drawn like a planned one, its stops the list. */
function showDay(t) {
  state.planIds = new Set(t.stops.map((r) => r.id));
  state.planTitle = `${t.name[0].toUpperCase()}${t.name.slice(1)} in ${t.area}`;
  state.planStats = dayStats(t);
  state.planBook = t.book.map((r) => r.n.replace(/\s+[—(].*$/, ''));
  setIntents([...new Set(t.stops.map((r) => INTENT_OF.get(r.id)).filter(Boolean))], { renderMap: false });
  onAreaPicked('all');
  syncPromptLabels();
  drawPlan(t.stops, DAY_ROUTES[t.title]?.path);
  planFor = askedOf();
  foldPrompt(true);
  if (isNarrow()) setListOpen(false);
}
/* Plan my day, from the sentence: the words, put in a day's order
   (inDayOrder), are its stops ("move then eat healthy"). A place for the first word in the part of town, then
   for each word after it the nearest place of that kind to the stop before,
   within PLAN_STEP_KM. Anywhere picks a busy part of town that can answer. */
const PLAN_STEP_KM = 2.5;
/* A day is made of things you go and do. Not appointments you would never
   fit into an outing (a nutritionist, a pharmacy) and not shops: eating
   healthy is a meal out, checking your health is a check-up or a session. */
const NOT_A_DAY = new Set(['Nutrition / Dietitian', 'Health food store', 'Pharmacy chain', 'Specialty clinic (dental)',
  'Sports / fitness retail', 'Sports / fitness retail (bike)', 'Wearable service center']);
const dayFit = (r, k) => (k === 'eat' ? isKitchen(r) : k === 'clear' ? isCalm(r) : !NOT_A_DAY.has(r.s))
  && !(r.tg || []).includes('delivery-only');
/* The order a day runs in, whatever order the words were picked: moving
   and working out first, then a check-up, then a meal, then winding down,
   and shopping last. Words of the same kind keep the reader's order. */
const DAY_ORDER = { move: 0, play: 0, workout: 0, people: 1, care: 2, hospital: 2, eat: 3, clear: 4, indulge: 4, gear: 5 };
const inDayOrder = (words) => words.map((k, i) => [DAY_ORDER[k] ?? 3, i, k]).sort((x, y) => x[0] - y[0] || x[1] - y[1]).map((x) => x[2]);
function planFromWords(words, area) {
  if (!words.length) return null;
  words = inDayOrder(words);
  const shuffle = (xs) => xs.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const placed = (r, k) => r.lat != null && !r.out && dayFit(r, k);
  const tryArea = (a) => {
    const anchors = shuffle(E.filter((r) => placed(r, words[0]) && r.a === a && INTENT_OF.get(r.id) === words[0])).slice(0, 12);
    for (const first of anchors) {
      const stops = [first];
      for (const k of words.slice(1)) {
        const prev = stops[stops.length - 1];
        const next = E.filter((r) => placed(r, k) && INTENT_OF.get(r.id) === k && !stops.includes(r))
          .map((r) => [kmBetween(r, prev), r]).filter(([d]) => d <= PLAN_STEP_KM).sort((x, y) => x[0] - y[0])[0];
        if (!next) break;
        stops.push(next[1]);
      }
      if (stops.length === words.length) return { stops, area: a };
    }
    return null;
  };
  if (area && area !== 'all') return tryArea(area);
  for (const a of shuffle(denseAreas()).slice(0, 25)) { const p = tryArea(a); if (p) return p; }
  return null;
}
/* A planned day on the map, the way a curated one is shown, then the lens. */
function showPlanned(stops, title, area = 'all') {
  state.planIds = new Set(stops.map((r) => r.id));
  state.planTitle = title;
  state.planStats = '';
  state.planBook = [];
  setIntents([...new Set(stops.map((r) => INTENT_OF.get(r.id)).filter(Boolean))], { renderMap: false });
  /* The sentence keeps the part of town the day is in. */
  onAreaPicked(area);
  syncPromptLabels();
  drawPlan(stops);
  planFor = askedOf();
  foldPrompt(true);
  /* Phone: the stops start behind their bar, so the circle has room. */
  if (isNarrow()) setListOpen(false);
  openLens(stops);
}

/* ---------- the lens ----------
   A planned day gets a screen of its own: the map outside a circle softens
   and blurs, the circle grows in as the camera flies to the day, and the
   stops' names run round its rim. A press outside the circle, or Escape,
   lets it go; the day stays drawn. */
/* var and a hoisted function: the framing helpers ask lensHolds() and may
   run before this point in the file has. */
var lensEl = null, lensAt = null;
function lensHolds() { return !!lensEl && !!state?.planIds?.size; }
if (window.CSS?.registerProperty) {
  try { CSS.registerProperty({ name: '--lr', syntax: '<length>', inherits: false, initialValue: '0px' }); } catch {}
}
function lensGeometry() {
  const W = mapEl.clientWidth, H = mapEl.clientHeight;
  const fr = mapEl.getBoundingClientRect();
  if (!isNarrow()) {
    const cardR = promptDock ? promptDock.getBoundingClientRect().right - fr.left : 0;
    const room = W - cardR;
    return { cx: cardR + room / 2, cy: H / 2, r: Math.max(0, Math.min(room / 2 - 48, H / 2 - 70, 340)), W, H };
  }
  /* Phone: the card is on the foot, so the circle sits in the room between
     the corner tiles and the card's tabs. When that room is too short for
     one, it keeps the screen's width anyway: its top and bottom pass behind
     the bar and the card, the blur still shows round its sides, and the day
     is fitted to the room that shows (room). */
  const top = cornerBottom() - fr.top + 30;
  const bottom = cardTopEdge() - fr.top - 30;
  const fit = Math.min(W / 2 - 22, (bottom - top) / 2 - 34);
  /* With room, the circle fits between them, names round its rim. */
  if (fit >= 64) return { cx: W / 2, cy: top + (bottom - top) / 2, r: fit, W, H };
  return { cx: W / 2, cy: top + (bottom - top) / 2, r: Math.max(0, W / 2 - 22), room: Math.max(30, (bottom - top) / 2 - 10), W, H, over: true };
}
let lensRun = 0;
function openLens(stops, path = null) {
  if (!map || !stops?.length) return;
  closeLens(true);
  /* A new day lets go of the last day's hold at once (its zoom floor and
     edges): kept, they cut the move to the new day short, leaving the
     camera near the old one with none of the new stops in the circle. */
  const run = ++lensRun;
  planBounds = null;
  planZoomLocked = false;
  map.setMaxBounds(null);
  map.setMinZoom(null);
  const g = lensGeometry();
  /* A phone has less room above the card; a smaller circle still reads. */
  if (g.r < 90 && !isNarrow()) return;
  lensAt = g;
  /* Between the names, the pin's own shape: a rounded square in the next
     stop's colour. The text keeps a wide gap there (em spaces), and once the
     ring is laid out a square is drawn into each gap, on the line's middle and
     turned with it. */
  const nameOf = (r) => r.n.replace(/\s+[—(].*$/, '').replace(/\s*\|.*$/, '');
  const GAP = '\u2003\u2003\u2003';
  const gaps = [];
  let at = 0;
  const names = stops.map((r, i) => {
    let out = '';
    /* Every name has its square before it, the first one included. */
    {
      const k = intentMeta(r)?.k;
      gaps.push({ at, colour: (k && paperColourOf(k)) || '#C4BBFF' });
      out += GAP;
      at += GAP.length;
    }
    const n = nameOf(r);
    at += n.length;
    return out + esc(n);
  }).join('');
  /* The ring's path starts at the foot of the circle, so names centred a little
     west of north have the whole of the left side to run into, and none is cut. */
  const R = g.r + 18;
  lensEl = document.createElement('div');
  lensEl.className = 'lens';
  lensEl.style.cssText = `--lx:${g.cx}px;--ly:${g.cy}px`;
  lensEl.innerHTML = `<svg class="lens-ring" viewBox="0 0 ${g.W} ${g.H}" aria-hidden="true">
      <defs><path id="lens-arc" d="M ${g.cx},${g.cy + R} a ${R},${R} 0 1,1 0,${-2 * R} a ${R},${R} 0 1,1 0,${2 * R}"/></defs>
      <g class="lens-words" style="transform-origin:${g.cx}px ${g.cy}px"><text text-anchor="middle"><textPath href="#lens-arc" startOffset="45%">${names}</textPath></text></g>
    </svg>`;
  mapEl.parentElement.insertBefore(lensEl, mapEl.nextSibling);
  /* A phone circle too big for its room goes without the names round its
     rim (they would run over the top bar): the stops are named in the list. */
  if (g.over) lensEl.classList.add('is-unnamed');
  const textEl = lensEl.querySelector('.lens-ring text');
  const words = lensEl.querySelector('.lens-words');
  if (textEl && words && gaps.length) {
    const fs = parseFloat(getComputedStyle(textEl).fontSize) || 20;
    const side = Math.round(fs * 0.78);
    gaps.forEach(({ at: i, colour }) => {
      try {
        const p0 = textEl.getStartPositionOfChar(i), p1 = textEl.getEndPositionOfChar(i + GAP.length - 1);
        const deg = textEl.getRotationOfChar(i + 1);
        const t = (deg * Math.PI) / 180;
        /* Up from the baseline by a little over a third of the type, so the
           square sits on the middle of the lowercase. */
        const h = fs * 0.34;
        const cx = (p0.x + p1.x) / 2 + Math.sin(t) * h, cy = (p0.y + p1.y) / 2 - Math.cos(t) * h;
        const sq = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        sq.setAttribute('class', 'lens-sq');
        sq.setAttribute('x', String(cx - side / 2)); sq.setAttribute('y', String(cy - side / 2));
        sq.setAttribute('width', String(side)); sq.setAttribute('height', String(side));
        sq.setAttribute('rx', String(side * 0.24));
        sq.setAttribute('transform', `rotate(${deg} ${cx} ${cy})`);
        sq.style.fill = colour;
        words.appendChild(sq);
      } catch { /* a gap the text never laid out gets no square */ }
    });
  }
  const quick = S_REDUCED();
  /* The blur closes in from the edges of the screen to the circle. */
  const far = Math.hypot(Math.max(g.cx, g.W - g.cx), Math.max(g.cy, g.H - g.cy)) + 20;
  lensEl.animate([{ '--lr': `${far}px` }, { '--lr': `${g.r}px` }], { duration: quick ? 0 : 1100, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' });
  lensEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: quick ? 0 : 450, fill: 'forwards' });
  lensEl.querySelector('.lens-words')?.animate([{ opacity: 0, transform: 'rotate(-28deg)' }, { opacity: 1, transform: 'none' }],
    { duration: quick ? 0 : 1000, delay: quick ? 0 : 450, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
  /* The day framed inside the circle itself: every stop (and the route
     between them) no further from the circle's centre than its radius less
     a pin and a margin, however far apart they are. */
  const s = Math.min(g.r, g.room ?? g.r) * 0.68;
  const pad = { left: Math.max(10, g.cx - s), right: Math.max(10, g.W - g.cx - s), top: Math.max(10, g.cy - s), bottom: Math.max(10, g.H - g.cy - s) };
  lensAt.pad = pad;
  const pts = [...stops.map((r) => [r.lon, r.lat]), ...(path?.length > 1 ? path : [])];
  const fitCircle = () => {
    const xy = pts.map((p) => map.project(p));
    const xs = xy.map((p) => p.x), ys = xy.map((p) => p.y);
    const mid = map.unproject([(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]);
    const c = map.project(mid);
    const far = Math.max(1, ...xy.map((p) => Math.hypot(p.x - c.x, p.y - c.y)));
    const room = Math.max(24, Math.min(g.r - 30, g.room ?? Infinity));
    const zoom = Math.min(16.2, map.getZoom() + Math.log2(room / far));
    return { center: mid, zoom, offset: [g.cx - g.W / 2, g.cy - g.H / 2] };
  };
  /* After drawPlan's own framing, which this replaces. */
  setTimeout(() => {
    map.setMaxBounds(null);
    map.setMinZoom(null);
    map.easeTo({ ...fitCircle(), bearing: map.getBearing(), duration: quick ? 0 : 1100, essential: true });
    const hold = () => {
      /* Only this day's move sets the hold, not one left over from a day
         already replaced; and only once the camera has come to rest (an
         earlier move cut short also ends with a moveend). */
      if (!state.planIds.size || run !== lensRun) return;
      if (map.isMoving()) { map.once('moveend', hold); return; }
      /* A move cut short by the next (the route's own framing, arriving a
         moment later) ends just before that one starts: look again shortly. */
      if (!hold.settled) { hold.settled = true; setTimeout(hold, 250); return; }
      hold.settled = false;
      if (map.isMoving()) { map.once('moveend', hold); return; }
      map.setMinZoom(map.getZoom());
      /* Zoomed in, the day can be looked round, but only a little way past it. */
      planBounds = padBounds(map.getBounds(), 0.15);
      map.setMaxBounds(planBounds);
      planZoomLocked = true;
      syncZoomUI();
    };
    map.once('moveend', hold);
  }, 80);
}
function closeLens(now = false) {
  if (!lensEl) return;
  const el = lensEl;
  lensEl = null;
  const r = lensAt?.r || 0;
  lensAt = null;
  if (now || S_REDUCED()) { el.remove(); return; }
  el.animate([{ '--lr': `${r}px`, opacity: 1 }, { '--lr': `${r * 1.6}px`, opacity: 0 }], { duration: 380, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' })
    .finished.then(() => el.remove());
  applyMaxBounds();
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && lensEl) closeLens(); });
window.addEventListener('resize', () => closeLens(true));
openSurpriseBtn?.addEventListener('click', () => setSurpriseOpen(surprisePop?.hidden));
document.getElementById('close-surprise')?.addEventListener('click', () => setSurpriseOpen(false));
surprisePop?.addEventListener('click', (e) => {
  const k = e.target.closest('[data-day-k]');
  const area = e.target.closest('[data-day-area]');
  const day = e.target.closest('[data-day]');
  if (k) { daySel.k = k.dataset.dayK === daySel.k ? '' : k.dataset.dayK; fillSurprise(); }
  else if (area) { daySel.area = area.dataset.dayArea === daySel.area ? '' : area.dataset.dayArea; fillSurprise(); }
  else if (day) { showDay(DAYS[Number(day.dataset.day)]); setSurpriseOpen(false); }
});
document.getElementById('surprise-random')?.addEventListener('click', () => {
  const area = daySel.area && denseAreas().includes(daySel.area) ? daySel.area : null;
  if (planDay(area) || planDay()) setSurpriseOpen(false);
  else if (surpriseNote) { surpriseNote.textContent = 'Couldn’t plan a day just now. Try one of the days above.'; surpriseNote.hidden = false; }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && surprisePop && !surprisePop.hidden) setSurpriseOpen(false); });

/* ---------- the sentence picker (brand-new) ----------
   The prompt as a sentence the reader builds: "I want to [eat organic]
   [work out] [+] in [Cubbon Park]". Each activity is a coloured word; press
   one and its groups pop out over it as bubbles that finish the phrase
   differently ("see a nutritionist", "shop organic"). Under it, the curated
   days that fit what is picked, and the way into Plum Perks. It lives inside
   the prompt's own box, so it docks and folds wherever the prompt does, and
   it drives the same state as the old controls. */
var SENTENCE_KINDS = MAP_INTENTS.map((i) => i.k).filter((k) => SUBCATEGORIES[k]);
var sentence = { open: '', areaQuery: '', tab: 'explore', plan: ['move', 'eat'], moreDays: true };
var sentenceEl = null;
const sayOf = (k) => {
  const g = state.subs[k] && SUBCATEGORIES[k].find((x) => x.k === state.subs[k]);
  return g ? g.say : INTENT_BY_K[k]?.prompt || k;
};
/* The paper map's colours for each activity, as its pins carry them (a
   function, so it is ready before the pin code further down runs). */
function paperColourOf(k) {
  return { move: '#9CE3FF', play: '#FF8C7D', workout: '#F2E27C', eat: '#90E07E', care: '#FFA8C2', clear: '#C4BBFF' }[k];
}
const tint = (k) => `--c:${(BASEMAP === 'paper' && paperColourOf(k)) || pinColour(INTENT_BY_K[k]) || '#DDD8EE'}`;

/* ---------- the sentence's motion ----------
   Bubbles come out of the word they belong to: each starts at that word's
   middle, small and clear, and springs out to its place, one after another,
   as if pulled from it; closing tucks them back in the same way. A word added
   from "+" comes out of the "+". */
const S_REDUCED = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const S_SPRING = 'cubic-bezier(.2,1.3,.35,1)';
const midOf = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
function pullOut(els, from, { delay = 0, stagger = 45, duration = 440 } = {}) {
  if (!from || S_REDUCED()) return;
  const o = midOf(from);
  els.forEach((el, i) => {
    const m = midOf(el.getBoundingClientRect());
    el.animate([
      { transform: `translate(${o.x - m.x}px, ${o.y - m.y}px) scale(.3)`, opacity: 0 },
      { transform: 'none', opacity: 1 },
    ], { duration, delay: delay + i * stagger, easing: S_SPRING, fill: 'backwards' });
  });
}
function tuckIn(els, to, done) {
  if (!els.length || !to || S_REDUCED()) { done(); return; }
  const o = midOf(to);
  let left = els.length;
  els.forEach((el, i) => {
    const m = midOf(el.getBoundingClientRect());
    el.animate([
      { transform: 'none', opacity: 1 },
      { transform: `translate(${o.x - m.x}px, ${o.y - m.y}px) scale(.3)`, opacity: 0 },
    ], { duration: 200, delay: (els.length - 1 - i) * 22, easing: 'cubic-bezier(.55,0,.8,.3)', fill: 'forwards' })
      .finished.then(() => { if (--left === 0) done(); });
  });
}
/* A word moved from where it was to where it is now (the intro's words
   travelling into the picker). */
function glideFrom(el, was, delay = 0) {
  if (!was || S_REDUCED()) return;
  const now = el.getBoundingClientRect();
  el.animate([
    { transform: `translate(${was.left - now.left}px, ${was.top - now.top}px) scale(${was.width / now.width}, ${was.height / now.height})`, transformOrigin: 'top left' },
    { transform: 'none', transformOrigin: 'top left' },
  ], { duration: 560, delay, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' });
}
const trayOf = (what) => (what === 'area' ? '.s-areas .s-find, .s-area-list .s-bubble' : '.s-tray .s-bubble');
function originOf(what) {
  if (!sentenceEl || !what) return null;
  const el = what === '+' ? sentenceEl.querySelector('.s-plus')
    : what === 'area' ? sentenceEl.querySelector('[data-s-area-open]')
      : sentenceEl.querySelector(`[data-s-word="${what}"]`);
  return el?.getBoundingClientRect() || null;
}
/* Between the small card and the full one: the card's edge travels from the
   old box to the new one, and what is on it fades in a moment later. */
function morphCard(before, grow) {
  if (!promptEl || S_REDUCED()) return;
  const after = promptEl.getBoundingClientRect();
  if (!before.width || !after.width) return;
  const TAB = 32;
  if (!grow) {
    /* Back to the small card: a sheet of the card's paper the size of the
       wide one shrinks onto it, then lifts away. */
    const ghost = document.createElement('div');
    ghost.className = 'morph-ghost';
    const box = (b) => ({ left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });
    Object.assign(ghost.style, box(before));
    document.body.appendChild(ghost);
    /* It lands on the card and the list under it together. */
    const sp = searchPanel && !searchPanel.hidden ? searchPanel.getBoundingClientRect() : null;
    const land = sp && sp.height ? { left: Math.min(after.left, sp.left), top: Math.min(after.top, sp.top),
      width: Math.max(after.right, sp.right) - Math.min(after.left, sp.left), height: Math.max(after.bottom, sp.bottom) - Math.min(after.top, sp.top) } : after;
    ghost.animate([box(before), box(land)], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' }).finished
      .then(() => ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' }).finished)
      .then(() => ghost.remove(), () => ghost.remove());
    setTimeout(() => ghost.remove(), 1200);
  }
  if (grow) {
    const from = `inset(${before.top - after.top - TAB}px ${after.right - before.right}px ${after.bottom - before.bottom}px ${before.left - after.left}px round 14px)`;
    promptEl.animate([{ clipPath: from }, { clipPath: `inset(${-TAB}px 0px 0px 0px round 14px)` }],
      { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' });
  }
  /* What fades in is the card's contents, never its tabs: they stay put. */
  const parts = sentenceEl?.querySelector('.s-pane') ? [sentenceEl.querySelector('.s-pane')]
    : [...(sentenceEl?.children || [])].filter((el) => !el.classList.contains('s-tabs'));
  parts.forEach((el) => el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
    { duration: 260, delay: grow ? 220 : 420, easing: 'ease-out', fill: 'backwards' }));
}
/* Explore and plan my day stand the same height on a desktop: with no day
   planned, the plan card reaches as far down as the explore card and its list. */
function syncPlanHeight() {
  if (!promptEl) return;
  /* Not while the perks drawer is open: it needs the room the tall card
     would take, and the card is measured against the bar's closed height. */
  const on = BASEMAP === 'paper' && window.matchMedia('(min-width: 821px)').matches && sentence.tab === 'plan' && !state.planIds.size
    && !perksDrawer?.classList.contains('is-open');
  frameEl?.classList.toggle('is-plan-tall', on);
  if (!on) { promptEl.style.minHeight = ''; promptEl.style.height = ''; promptEl.style.maxHeight = ''; return; }
  /* The explore list ends 61px above the frame's foot; the plan card grows
     until the perks bar hung under it ends there too. */
  const want = frameEl.getBoundingClientRect().bottom - 61;
  const top = promptEl.getBoundingClientRect().top;
  const bar = perksDrawer && !perksDrawer.hidden ? (pdHandle?.offsetHeight || perksDrawer.offsetHeight) - 1 : 0;
  /* A ceiling, not a size: a short list of days (one part of town) keeps
     the card short and the perks bar right under it; a long one fills it
     and scrolls. */
  promptEl.style.minHeight = promptEl.style.height = '';
  promptEl.style.maxHeight = `${Math.max(0, want - top - bar)}px`;
}
window.addEventListener('resize', () => syncPlanHeight());
/* Whether a card tab has been picked yet, and the tabs folded to icons. */
let tabPicked = false;
const foldedTabs = new Set();
let tabFolding = null;
/* Each tab's words keep their own width as the point the fold starts from. */
function foldTabEls(els) {
  const tabs = [...(els || [])].filter((t) => !t.classList.contains('is-iconic'));
  /* Set without a transition, or the words would first ease from the
     fallback width down to their own and the fold would start late. */
  tabs.forEach((t) => {
    const w = t.querySelector('.s-tab-words'), g = t.querySelector('.s-tab-glyph svg');
    if (w) { w.style.transition = 'none'; t.style.setProperty('--ww', `${w.scrollWidth}px`); }
    if (g) t.style.setProperty('--gw', `${g.getBoundingClientRect().width}px`);
  });
  if (!tabs.length) return;
  void tabs[0].offsetWidth;
  tabs.forEach((t) => { const w = t.querySelector('.s-tab-words'); if (w) w.style.transition = ''; });
  requestAnimationFrame(() => tabs.forEach((t) => t.classList.add('is-iconic')));
}
function foldTabs() {
  ['explore', 'plan', 'people', 'online'].forEach((k) => foldedTabs.add(k));
  foldTabEls(sentenceEl?.querySelectorAll('.s-tab'));
}
function renderSentence() {
  /* Called from syncPromptLabels, which can run before this block has. */
  if (!promptEl || !sentence) return;
  if (!sentenceEl) {
    sentenceEl = document.createElement('div');
    sentenceEl.className = 'sentence';
    sentenceEl.id = 'sentence';
    promptEl.prepend(sentenceEl);
    promptEl.classList.add('has-sentence');
  }
  /* In the order they were picked, so a word added goes on the end. */
  const chosen = selectedMapIntents().length >= MAP_INTENTS.length ? [] : [...state.intents].filter((k) => SENTENCE_KINDS.includes(k));
  /* Each word carries a small × in its corner, to take it out in one press. */
  const word = (k) => `<span class="s-chip" data-s-chip="${k}"><button type="button" class="s-word" data-s-word="${k}" style="${tint(k)}" aria-expanded="${sentence.open === k}">${esc(sayOf(k))}</button><button type="button" class="s-x" data-s-drop="${k}" aria-label="Take out ${esc(sayOf(k))}"><svg class="s-x-ic" viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5"/></svg></button></span>`;
  /* An activity's groups, popped out under the line to finish its phrase. */
  const subTray = (k) => `<div class="s-tray s-subs" role="group" aria-label="Finish the phrase">
      <button type="button" class="s-bubble" data-s-sub="${k}:" style="${tint(k)}" aria-pressed="${!state.subs[k]}">${esc(INTENT_BY_K[k].prompt)}</button>
      ${SUBCATEGORIES[k].map((g) => `<button type="button" class="s-bubble" data-s-sub="${k}:${g.k}" style="${tint(k)}" aria-pressed="${state.subs[k] === g.k}">${esc(g.say)}</button>`).join('')}
      <button type="button" class="s-bubble s-quiet" data-s-close="${k}">close</button>
    </div>`;
  const rest = SENTENCE_KINDS.filter((k) => !chosen.includes(k));
  const areaName = state.area === 'all' ? 'Mumbai' : state.area;
  const q = sentence.areaQuery.trim().toLowerCase();
  const areas = (DB.areasByPins || []).filter((a) => !q || a.toLowerCase().includes(q)).slice(0, q ? 24 : 12);
  /* Days whose main thing is what was picked come first, then days that take
     it in along the way (nearly every day has a meal in it). */
  const touches = (t) => t.stops.some((r) => chosen.includes(INTENT_OF.get(r.id)));
  const fits = DAYS.filter((t) => (!chosen.length || chosen.includes(t.k) || touches(t)) && (state.area === 'all' || t.area === state.area))
    .sort((x, y) => Number(chosen.includes(y.k)) - Number(chosen.includes(x.k)));
  const days = fits.length ? fits : DAYS;
  /* Folder tabs over the card: the sentence to explore with, a day to plan,
     and the communities and events, which open the card to the full screen. */
  /* Four folder tabs in words. */
  const plumMark = document.querySelector('#open-cliff .plum-mark')?.outerHTML || '<span>Plum</span>';
  const TAB_NAMES = [['explore', 'explore', 'explore'], ['plan', 'plan my day', 'plan'],
    ['people', 'communities', 'people'], ['online', 'online perks', '<span class="t-pre">online </span>perks']];
  /* Each tab carries its icon too: the words show first, and once someone has
     picked a tab and gone on to move the map, the tabs fold to their icons
     (foldTabs), each name sliding out under the pointer; a tab left for
     another folds on its own. */
  const TAB_ICONS = { explore: TAB_IC_EXPLORE, plan: TAB_IC_PLAN, people: TAB_IC_PEOPLE, online: TAB_IC_ONLINE };
  const tabs = `<div class="s-tabs" role="tablist">${TAB_NAMES.map(([k, long, short]) =>
    `<button type="button" class="s-tab${foldedTabs.has(k) && k !== tabFolding ? ' is-iconic' : ''}" role="tab" data-s-tab="${k}" aria-selected="${sentence.tab === k}" aria-label="${long}"><span class="s-tab-glyph" aria-hidden="true">${TAB_ICONS[k]}</span><span class="s-tab-words" aria-hidden="true"><span class="t-long">${long}</span><span class="t-short">${short}</span></span></button>`).join('')}</div>`;
  /* Plan my day: the same sentence, read as a day ("move then eat healthy"),
     the curated days as chips, and a surprise. */
  /* "move, eat healthy and check my health": commas between, "and" before the last. */
  const planWord = (k, i) => `${i ? (i === sentence.plan.length - 1 ? '<span class="s-say s-then">and</span>' : '<span class="s-say s-comma">,</span>') : ''}<span class="s-chip" data-s-chip="p-${k}"><button type="button" class="s-word" style="${tint(k)}" tabindex="-1">${esc(INTENT_BY_K[k]?.prompt || k)}</button><button type="button" class="s-x" data-s-pdrop="${k}" aria-label="Take out ${esc(INTENT_BY_K[k]?.prompt || k)}"><svg class="s-x-ic" viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5"/></svg></button></span>`;
  const planRest = SENTENCE_KINDS.filter((k) => !sentence.plan.includes(k));
  /* The days offered beside a plan follow its words and its area: a day whose
     main thing is the first word leads, then days that take in more of the
     words, in the order they were said. */
  const planScore = (t) => {
    const ks = t.stops.map((r) => INTENT_OF.get(r.id));
    const said = sentence.plan;
    let n = said.filter((k) => k === t.k || ks.includes(k)).length * 2;
    if (said[0] === t.k) n += 3;
    else if (said.includes(t.k)) n += 1;
    const order = said.map((k) => ks.indexOf(k)).filter((i) => i >= 0);
    if (order.length > 1 && order.every((v, i) => !i || v >= order[i - 1])) n += 1;
    return n;
  };
  const planDays = sentence.plan.length
    ? DAYS.filter((t) => (state.area === 'all' || t.area === state.area) && planScore(t) > 0)
      .sort((x, y) => planScore(y) - planScore(x))
    : days;
  const pdays = planDays.length ? planDays : days;
  const dayChips = (sentence.moreDays ? pdays : pdays.slice(0, 5));
  /* A part of town with no set days says so where the set days are. */
  const noDays = state.area !== 'all' && !DAYS.some((t) => t.area === state.area)
    ? `<p class="s-suggest">No set days in ${esc(state.area)} yet. <a href="${esc(SUGGEST_FORM)}" target="_blank" rel="noopener">Suggest a day ↗</a></p>` : '';
  const planHtml = `${tabs}
    <div class="s-line">${state.planIds.size ? '<button type="button" class="s-back" data-s-replan="1" aria-label="Back to plan my day">←</button>' : ''}<span class="s-say">Plan me a day to</span>${(() => {
      /* The + rides with the last word, so it never sits on a line alone. */
      const plus = planRest.length ? `<button type="button" class="s-word s-plus" data-s-plus="1" aria-expanded="${sentence.open === '+'}" aria-label="Add to the day">+</button>` : '';
      const words = sentence.plan.map(planWord);
      const last = words.pop();
      /* Nothing picked yet: "do something" stands in the gap, as "be well"
         does on Explore, and opens the same tray as the +. */
      if (!last) return '<button type="button" class="s-word s-all" data-s-plus="1">do something</button>';
      return words.join('') + `<span class="s-tail">${last}${plus}</span>`;
    })()}</div>
    ${sentence.open === '+' ? `<div class="s-tray" role="group" aria-label="Add to the day">${planRest.map((k) => `<button type="button" class="s-bubble" data-s-padd="${k}" style="${tint(k)}">${esc(INTENT_BY_K[k].prompt)}</button>`).join('')}</div>` : ''}
    <div class="s-line s-line-area"><span class="s-say">in</span><span class="s-chip"><button type="button" class="s-word s-place" data-s-area-open="1" aria-expanded="${sentence.open === 'area'}">${esc(areaName)}</button>${state.area !== 'all' ? '<button type="button" class="s-x" data-s-area="all" aria-label="Anywhere in Mumbai"><svg class="s-x-ic" viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5"/></svg></button>' : ''}</span>
      <button type="button" class="s-go" data-s-make="1" ${sentence.plan.length ? '' : 'disabled'}>${madeKey() && sentence.madeFor === madeKey() ? 'another day →' : 'make my day →'}</button></div>
    ${sentence.open === 'area' ? `<div class="s-tray s-areas">
      <input type="search" class="s-find" id="s-find" placeholder="Find a part of town" value="${esc(sentence.areaQuery)}" autocomplete="off" spellcheck="false" aria-label="Find a part of town">
      <div class="s-area-list">${areas.map((a) => `<button type="button" class="s-bubble s-quiet" data-s-area="${esc(a)}" aria-pressed="${a === state.area}">${esc(a)}</button>`).join('')}</div>
    </div>` : ''}
    <p class="s-note" id="s-plan-note" hidden></p>
    ${state.planIds.size ? dayBlockHtml() : ''}
    ${state.planIds.size ? '' : `
    <p class="s-or"><span>or</span></p>
    <p class="s-say s-say-block">I’d rather follow a day like</p>
    ${noDays}
    <div class="s-daychips${sentence.moreDays ? ' is-all' : ''}">${dayChips.map((t) => `<button type="button" class="s-daychip" data-s-day="${DAYS.indexOf(t)}" style="${dayTint(t)}" title="${esc(t.name)}, ${esc(t.area)}${dayStats(t) ? ` · ${esc(dayStats(t))}` : ''}">${esc(t.title)}</button>`).join('')}${pdays.length > dayChips.length ? `<button type="button" class="s-daychip s-quiet" data-s-moredays="1">${pdays.length - dayChips.length} more…</button>` : ''}</div>`}`;
  /* About: a short card like Explore and Plan. The P-heart is the way to
     plumhq.com; the story scrolls inside; the asks are chips at its foot. */
  const paneHtml = (k) => `${tabs}
    <div class="s-pane s-pane-${k}">
      ${k === 'people' ? `<img class="s-pane-art" src="${BASE_PATH}art/communities-dogs.png" alt="" aria-hidden="true" width="800" height="410">` : ''}
      ${k === 'people'
        ? `<div class="s-pane-head"><p class="s-kick">Communities</p><p class="s-big">Find your people</p><p class="s-pane-blurb">Clubs, rides and circles that meet across the city.</p></div><img class="s-pane-art-ph" src="${BASE_PATH}art/communities-dogs.png" alt="" aria-hidden="true" width="800" height="410"><div class="people-list s-people" id="s-people"></div>`
        : `<div class="s-pane-head"><img class="s-pane-art" src="${BASE_PATH}art/perks-house.png" alt="" aria-hidden="true" width="800" height="376"><p class="s-kick">Online perks</p><p class="s-big">Be well at home too</p><p class="s-pane-blurb">We\u2019ve partnered with some of India\u2019s best health and wellness brands to bring you great discounts through Plum Perks.</p>
          <p class="s-pane-cta"><a href="${esc(PLUM_APP)}" target="_blank" rel="noopener">Discover offers in the Plum app &#8599;</a><span class="s-pane-signup">Don\u2019t have Plum yet? <a href="${esc(PLUM_SIGNUP)}" target="_blank" rel="noopener">Sign up here</a>.</span></p><img class="s-pane-art-ph" src="${BASE_PATH}art/perks-house.png" alt="" aria-hidden="true" width="800" height="376">${onlineFindHtml()}${onlineChipsHtml(onlineQuery)}</div><div class="s-online">${onlineCardsHtml()}</div>`}
    </div>`;
  const html = sentence.tab === 'plan' ? planHtml
    : ['people', 'online'].includes(sentence.tab) ? paneHtml(sentence.tab)
    : `${tabs}
    <div class="s-line">
      <span class="s-say">I want to</span>
      ${chosen.length ? chosen.map(word).join('') : '<button type="button" class="s-word s-all" data-s-plus="1">be well</button>'}
      ${rest.length ? `<button type="button" class="s-word s-plus" data-s-plus="1" aria-expanded="${sentence.open === '+'}" aria-label="Add something to do">+</button>` : ''}
      <button type="button" class="s-fold mobile-only" data-s-fold="1" aria-label="Hide the sentence"><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5-5 5 5"/></svg></button>
    </div>
    ${chosen.includes(sentence.open) ? subTray(sentence.open) : ''}
    ${sentence.open === '+' ? `<div class="s-tray" role="group" aria-label="Add something to do">
      ${rest.map((k) => `<button type="button" class="s-bubble" data-s-add="${k}" style="${tint(k)}">${esc(INTENT_BY_K[k].prompt)}</button>`).join('')}
      ${chosen.length ? '<button type="button" class="s-bubble s-quiet" data-s-everything="1">anything at all</button>' : ''}
    </div>` : ''}
    <div class="s-line s-line-area">
      <span class="s-say">in</span>
      <span class="s-chip"><button type="button" class="s-word s-place" data-s-area-open="1" aria-expanded="${sentence.open === 'area'}">${esc(areaName)}</button>${state.area !== 'all' ? '<button type="button" class="s-x" data-s-area="all" aria-label="Anywhere in Mumbai"><svg class="s-x-ic" viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5"/></svg></button>' : ''}</span>
    </div>
    ${sentence.open === 'area' ? `<div class="s-tray s-areas">
      <input type="search" class="s-find" id="s-find" placeholder="Find a part of town" value="${esc(sentence.areaQuery)}" autocomplete="off" spellcheck="false" aria-label="Find a part of town">
      <div class="s-area-list">
        ${state.area !== 'all' ? '<button type="button" class="s-bubble s-quiet" data-s-area="all">all of Mumbai</button>' : ''}
        ${areas.map((a) => `<button type="button" class="s-bubble s-quiet" data-s-area="${esc(a)}" aria-pressed="${a === state.area}">${esc(a)}</button>`).join('')}
      </div>
    </div>` : ''}
`;
  /* The map redraws often; the sentence only when it has changed, so a
     bubble mid-way out is not swapped for a new one. */
  if (html === sentenceEl.__html) return;
  /* The card is changing under the hint: it goes. */
  if (beWellTipGo && sentenceEl.__html) { beWellTipGo(); beWellTipGo = null; }
  sentenceEl.__html = html;
  sentenceEl.innerHTML = html;
  const full = sentence.tab === 'people' || sentence.tab === 'online';
  const wasFull = !!frameEl?.classList.contains('is-card-full');
  const before = full !== wasFull ? promptEl.getBoundingClientRect() : null;
  frameEl?.classList.toggle('is-card-full', full);
  if (before) morphCard(before, full);
  frameEl?.classList.toggle('is-plan-tab', sentence.tab === 'plan');
  syncPlanHeight();
  /* The list hangs from the card's foot (--dock-h). The observer on the dock
     can report a frame or more late, which left a grown card (a day title on
     two lines) covering the list's first row; measure now, and again once any
     easing has settled. */
  syncStack();
  requestAnimationFrame(syncStack);
  setTimeout(syncStack, 400);
  /* The open shelf of days, and the communities and online panes, fade at
     their foot while there is more below. */
  const shelf = sentenceEl.querySelector('.s-daychips.is-all, .s-pane');
  if (shelf) {
    const mark = () => {
      const end = shelf.scrollTop + shelf.clientHeight >= shelf.scrollHeight - 4;
      shelf.classList.toggle('at-end', end);
    };
    shelf.addEventListener('scroll', mark, { passive: true });
    requestAnimationFrame(mark);
    setTimeout(mark, 400);
    /* The communities' filters stick just under the heading. */
    const head = shelf.querySelector('.s-pane-head');
    if (head) shelf.style.setProperty('--head-h', `${head.offsetHeight}px`);
  }
  frameEl?.classList.toggle('has-plan', state.planIds.size > 0);
  if (sentence.tab === 'people') fillPeople(sentenceEl.querySelector('#s-people'), { filters: true });
  const fx = sentence.fx;
  sentence.fx = null;
  if (fx?.word) {
    const w = sentenceEl.querySelector(`[data-s-word="${fx.word}"]`);
    if (w) pullOut([w], fx.from, { duration: 480 });
  }
  if (fx?.glide) {
    Object.entries(fx.glide).forEach(([key, r], i) => {
      const el = key === '+' ? sentenceEl.querySelector('.s-plus')
        : key === 'area' ? sentenceEl.querySelector('[data-s-area-open]') : sentenceEl.querySelector(`[data-s-word="${key}"]`);
      if (el) glideFrom(el, r, i * 30);
    });
  }
  if (fx?.pull && sentence.open) {
    pullOut([...sentenceEl.querySelectorAll(trayOf(sentence.open))], fx.pullFrom || originOf(sentence.open), { delay: fx.delay || 0 });
  }
  if (sentence.open === 'area') {
    const f = sentenceEl.querySelector('#s-find');
    if (f && !isNarrow()) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); }
  }
}
function setSentenceOpen(what) {
  const was = sentence.open;
  const next = was === what ? '' : what;
  const open = () => {
    sentence.open = next;
    if (next !== 'area') sentence.areaQuery = '';
    sentence.fx = next ? { pull: true } : null;
    renderSentence();
  };
  /* What is out goes back into its word first, then the next comes out. */
  if (was && sentenceEl) tuckIn([...sentenceEl.querySelectorAll(trayOf(was))], originOf(was), open);
  else open();
}
promptEl?.addEventListener('click', (e) => {
  if (!sentenceEl?.contains(e.target)) return;
  if (promptEl.classList.contains('is-folded')) { e.preventDefault(); foldPrompt(false); return; }
  const t = e.target.closest('button');
  if (!t) return;
  const d = t.dataset;
  /* In the order they were picked, so taking one out keeps the rest in place. */
  const chosen = () => (selectedMapIntents().length >= MAP_INTENTS.length ? [] : [...state.intents].filter((k) => INTENT_BY_K[k]?.map));
  if (d.sFold) { sentence.open = ''; renderSentence(); foldPrompt(true); }
  else if (d.sWord) setSentenceOpen(d.sWord);
  else if (d.sPlus) setSentenceOpen('+');
  else if (d.sAreaOpen) setSentenceOpen('area');
  else if (d.sPadd) { sentence.plan = [...sentence.plan, d.sPadd]; sentence.open = ''; sentenceEl.__html = ''; renderSentence(); }
  else if (d.sPdrop) {
    const chip = sentenceEl.querySelector(`[data-s-chip="p-${d.sPdrop}"]`);
    const drop = () => { sentence.plan = sentence.plan.filter((k) => k !== d.sPdrop); renderSentence(); };
    if (chip && !S_REDUCED()) chip.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(.2)', opacity: 0 }],
      { duration: 180, easing: 'cubic-bezier(.55,0,.8,.3)', fill: 'forwards' }).finished.then(drop);
    else drop();
  }
  else if (d.sMake) {
    /* Another day from the same words: a few tries for stops not already the
       day on the map; if there is no other, say so. */
    const was = [...state.planIds].join('>');
    let plan = planFromWords(sentence.plan, state.area);
    for (let i = 0; was && plan && i < 12 && plan.stops.map((r) => r.id).join('>') === was; i++) plan = planFromWords(sentence.plan, state.area);
    const note = sentenceEl.querySelector('#s-plan-note');
    if (was && plan && plan.stops.map((r) => r.id).join('>') === was) {
      if (note) { note.textContent = 'That’s the only day like this here. Try another part of town, or other words.'; note.hidden = false; }
      return;
    }
    if (!plan) { if (note) { note.textContent = 'Couldn’t find all of that close together there. Try another part of town, or fewer things.'; note.hidden = false; } return; }
    /* The sentence keeps the place the reader chose: "in Mumbai" stays
       Mumbai even though the day was found in one part of it. */
    showPlanned(plan.stops, `A day in ${plan.area}`, state.area);
    /* The button turns to "another day" while the words and the part of town
       are the ones this day was made from. */
    sentence.madeFor = madeKey();
    if (sentenceEl) sentenceEl.__html = '';
    renderSentence();
  }
  else if (d.sMoredays) { sentence.moreDays = true; renderSentence(); }
  else if (d.sLessdays) { sentence.moreDays = false; renderSentence(); }
  else if (d.peopleCat) { peopleCategory = d.peopleCat; fillPeople(sentenceEl.querySelector('#s-people'), { filters: true }); }
  else if (d.sAdd) {
    /* The new word comes out of the "+", and its own bubbles out of it. */
    sentence.fx = { word: d.sAdd, from: originOf('+'), pull: true, delay: 260 };
    sentence.open = d.sAdd;
    setIntents([...chosen(), d.sAdd], { renderMap: true });
  }
  else if (d.sEverything) { sentence.open = ''; state.subs = {}; setIntents(MAP_INTENTS.map((i) => i.k), { renderMap: true }); }
  else if (d.sDrop) {
    /* The word shrinks back into nothing (its bubbles first, if out), then
       the sentence closes up round where it was. */
    const k = d.sDrop;
    const chip = sentenceEl.querySelector(`[data-s-chip="${k}"]`);
    const drop = () => { sentence.open = ''; delete state.subs[k]; setIntents(chosen().filter((x) => x !== k), { renderMap: true }); };
    const shrink = () => {
      if (!chip || S_REDUCED()) { drop(); return; }
      chip.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(.2)', opacity: 0 }],
        { duration: 180, easing: 'cubic-bezier(.55,0,.8,.3)', fill: 'forwards' }).finished.then(drop);
    };
    if (sentence.open === k) tuckIn([...sentenceEl.querySelectorAll(trayOf(k))], originOf(k), shrink);
    else shrink();
  }
  else if (d.sClose) setSentenceOpen(d.sClose);
  else if (d.sTab) {
    /* Back to exploring from a planned day: the day is put away and the list
       shows everything in its part of town again. */
    if (d.sTab === 'explore' && state.planIds.size) putDayAway();
    /* The tab left is drawn as words once more, then folds on the next
       frame, so the change runs as an animation rather than a jump. */
    const left = sentence.tab !== d.sTab && !foldedTabs.has(sentence.tab) ? sentence.tab : null;
    if (left) { foldedTabs.add(left); tabFolding = left; }
    sentence.tab = d.sTab; sentence.open = ''; renderSentence();
    tabFolding = null;
    if (left) foldTabEls(sentenceEl?.querySelectorAll(`.s-tab[data-s-tab="${left}"]`));
    tabPicked = true;
    /* Picked, and then the pointer moves off the card: the tabs fold to
       their icons (as they do when the map is moved by hand). */
    promptDock?.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') foldTabs(); }, { once: true });
  }
  else if (d.sExit) {
    /* Out of the day altogether: the circle, the line and the numbers go, and
       the card is back on plan my day, ready for another. */
    putDayAway();
    sentence.tab = 'plan'; sentence.open = '';
    if (sentenceEl) sentenceEl.__html = '';
    renderSentence();
  }
  else if (d.sReplan) {
    /* Another day: the day is put away and the plan tab is as it was before
       one was made, with its words and part of town kept. */
    putDayAway();
    sentence.tab = 'plan'; sentence.open = ''; sentence.moreDays = true;
    if (sentenceEl) sentenceEl.__html = '';
    renderSentence();
    foldPrompt(false);
  }
  else if (d.sRandom) { if (planDay()) openLens([...state.planIds].map((id) => BY_ID.get(id)).filter(Boolean)); }
  else if (d.sSub !== undefined) {
    const [k, g] = d.sSub.split(':');
    if (g) state.subs[k] = g; else delete state.subs[k];
    sentence.open = '';
    closePlace();
    scheduleRender({ fit: false });
    renderSentence();
  }
  else if (d.sArea) { sentence.open = ''; sentence.areaQuery = ''; onAreaPicked(d.sArea); renderSentence(); }
  else if (d.sDay) { sentence.open = ''; const t = DAYS[Number(d.sDay)]; showDay(t); openLens(t.stops, DAY_ROUTES[t.title]?.path); }
  else if (d.sPerks) {
    state.perksOnly = !state.perksOnly;
    state.deliveryOnly = false;
    syncPerks();
    closePlace();
    openResultsList();
    scheduleRender({ fit: true });
  }
});
promptEl?.addEventListener('input', (e) => {
  if (e.target.id !== 's-find') return;
  sentence.areaQuery = e.target.value;
  const q = sentence.areaQuery.trim().toLowerCase();
  const list = sentenceEl.querySelector('.s-area-list');
  const areas = (DB.areasByPins || []).filter((a) => !q || a.toLowerCase().includes(q)).slice(0, q ? 24 : 12);
  if (list) list.innerHTML = areas.map((a) => `<button type="button" class="s-bubble s-quiet" data-s-area="${esc(a)}" aria-pressed="${a === state.area}">${esc(a)}</button>`).join('');
});
promptEl?.addEventListener('keydown', (e) => {
  if (e.target.id === 's-find' && e.key === 'Enter') {
    e.preventDefault();
    sentenceEl.querySelector('[data-s-area]:not([data-s-area="all"])')?.click();
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sentence.open) { sentence.open = ''; renderSentence(); } });
renderSentence();


/* The fold chevron, on the prompt's first line, for phones. */
{
  const row = promptEl?.querySelector('.prompt-row');
  if (row && !document.getElementById('prompt-fold')) {
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'prompt-fold'; b.className = 'prompt-fold mobile-only';
    b.setAttribute('aria-expanded', 'true'); b.setAttribute('aria-label', 'Hide the activities');
    b.innerHTML = '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5-5 5 5"/></svg>';
    b.addEventListener('click', () => foldPrompt(!promptEl.classList.contains('is-folded')));
    row.appendChild(b);
  }
}
function dockPrompt() {
  if (!promptEl || !promptDock || promptEl.parentElement === promptDock) return;
  promptDock.appendChild(promptEl);
  promptEl.classList.add('prompt-docked');
  /* The activity list stays open through the dock, as it is on the intro —
     the categories and their counts are the map's vocabulary — while 349
     areas stay behind a word. */
  setPanel(areaPanel, false);
  setPanel(intentPanel, true);
  /* On a phone the activities start folded away, under "I want to be well". */
  foldPrompt(true);
  syncStack();
}

/* Show me is the gate. The choices already applied as they were made — the map
   updates behind the popup — so this only dismisses and hands over the frame. */
/* The page slides in round the map as the intro goes: the map shrinks into its
   frame over INTRO_SLIDE_MS, resized every frame so it never stretches, and
   then eases onto the whole city at its new size. */
const INTRO_SLIDE_MS = 550;
function slideInPage() {
  if (!frameEl?.classList.contains('is-intro')) return;
  frameEl.classList.remove('is-intro');
  setTimeout(peekDrawer, INTRO_SLIDE_MS + 150);
  if (!map) return;
  const end = performance.now() + INTRO_SLIDE_MS + 50;
  const step = () => {
    map.resize();
    if (performance.now() < end) { requestAnimationFrame(step); return; }
    syncStack();
    lockZoomOut();
    if (!touched && state.area === 'all' && !state.query && state.view === 'map' && cityZoom != null) {
      map.easeTo({ ...cityCamera(), duration: 450 });
    }
    applyMaxBounds();
    syncRuler();
  };
  requestAnimationFrame(step);
}

/* ---------- the intro story ----------
   Four cards (WellnessMap.astro). Each moves the map so what it talks about
   sits in the card's window, and filters the map to it; the veil blurs the
   rest of the screen but for that window. The arrow steps through; on the
   last card it, the close button or Escape end the intro, which puts the map
   back on everything across the whole city and slides the page in. */
const storyVeil = document.getElementById('story-veil');
const storyWindow = document.getElementById('story-window');
const storyNext = document.getElementById('story-next');
const storySlides = [...document.querySelectorAll('.story-slide')];
const storyDots = [...document.querySelectorAll('.story-dot')];
let storyAt = 0;
/* The last card's Plum Perks chip opens the Plum app in the visitor's own
   store; a computer gets Plum's app page, which offers both. */
const PLUM_STORES = {
  ios: 'https://apps.apple.com/in/app/plum-health-benefits/id1616851078',
  android: 'https://play.google.com/store/apps/details?id=com.plumhq.employee.production',
};
{
  const appLink = document.getElementById('story-app');
  const ua = navigator.userAgent;
  if (appLink && /iPhone|iPad|iPod/.test(ua)) appLink.href = PLUM_STORES.ios;
  else if (appLink && /Android/.test(ua)) appLink.href = PLUM_STORES.android;
}

/* The veil's hole, cut to the window. */
function cutStoryWindow() {
  /* The card opening on arrival draws the hole itself (WellnessMap.astro). */
  if (!storyVeil || !storyWindow || window.__storyOpening) return;
  const w = storyWindow.getBoundingClientRect(), v = storyVeil.getBoundingClientRect();
  const b = parseFloat(getComputedStyle(storyWindow).borderTopWidth) || 0;
  const x1 = w.left - v.left + (parseFloat(getComputedStyle(storyWindow).borderLeftWidth) || 0);
  const y1 = w.top - v.top + b;
  const x2 = w.right - v.left - (parseFloat(getComputedStyle(storyWindow).borderRightWidth) || 0);
  const y2 = w.bottom - v.top - (parseFloat(getComputedStyle(storyWindow).borderBottomWidth) || 0);
  storyVeil.style.clipPath = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${x1}px ${y1}px, ${x2}px ${y1}px, ${x2}px ${y2}px, ${x1}px ${y2}px, ${x1}px ${y1}px)`;
}
/* Map padding that leaves only the window's inside for a fit. */
function storyPadding() {
  const w = storyWindow.getBoundingClientRect(), m = mapEl.getBoundingClientRect();
  const cs = getComputedStyle(storyWindow);
  const inset = (side) => parseFloat(cs[`border${side}Width`]) || 0;
  const pad = 14;
  return {
    top: Math.max(0, w.top - m.top + inset('Top') + pad),
    left: Math.max(0, w.left - m.left + inset('Left') + pad),
    right: Math.max(0, m.right - w.right + inset('Right') + pad),
    bottom: Math.max(0, m.bottom - w.bottom + inset('Bottom') + pad),
  };
}
function storyBounds(area) {
  if (!area) return CITY;
  const wards = ZONES.features.filter((f) => f.properties.area === area);
  if (wards.length) return geometryBounds(wards);
  const pts = E.filter((r) => r.a === area && r.lat != null).map((r) => [r.lon, r.lat]);
  return pts.length ? boundsOf(pts) : CITY;
}
function showStory(i) {
  /* The first card waits for the map to load, and the intro may have been
     left by then (Go to the map, Escape); a card must not set filters on the
     map the reader went on to. */
  if (!introEl || introEl.hidden || !storySlides.length) return;
  storyAt = Math.max(0, Math.min(i, storySlides.length - 1));
  storySlides.forEach((s, k) => { s.hidden = k !== storyAt; });
  /* Go to the map arrives with the second card, and stays once it has. */
  if (storyAt > 0) storyNext?.closest('.story-card')?.classList.add('is-past-first');
  storyDots.forEach((d, k) => {
    d.classList.toggle('is-on', k === storyAt);
    d.setAttribute('aria-current', String(k === storyAt));
  });
  const step = document.getElementById('story-step');
  if (step) step.textContent = `${storyAt + 1} of ${storySlides.length}`;
  const last = storyAt === storySlides.length - 1;
  if (storyNext) storyNext.textContent = last ? 'Show me' : 'Next';
  const { area, intents, perks, plan: planCard } = storySlides[storyAt].dataset;
  state.perksOnly = perks === '1';
  state.deliveryOnly = false;
  /* The Surprise me card shows an outing it planned, with just what its
     stops are switched on. */
  const outing = planCard === '1' ? storyPlanFor(area) : null;
  const outingKinds = outing && [...new Set(outing.stops.map((r) => INTENT_OF.get(r.id)).filter(Boolean))];
  /* The card filters by what, not where: the camera goes to the area, and
     the places of that kind around it stay on too, so the window is full of
     the icons the line is talking about rather than the two inside a ward. */
  state.intents = new Set(outingKinds || (intents ? intents.split(',') : MAP_INTENTS.map((x) => x.k)));
  setArea('all');
  syncIntentUI();
  syncPerks();
  render(true);
  if (!map) return;
  cutStoryWindow();
  /* The window is small, so the whole city needs to sit further out than the
     map's own zoom-out limit allows; the intro's end puts the limit back. */
  map.setMaxBounds(null);
  map.setMinZoom(6);
  /* An area is framed just past the last clustered zoom, so its places show
     as their own icons rather than as counts. */
  if (outing) {
    const pts = outing.stops.map((r) => [r.lon, r.lat]);
    setPuzzle('plan', pts, PLAN_STYLE);
    const at = storyAt;
    const circle = openStoryLens();
    walkRoute(outing.stops).then((rt) => {
      if (rt && storyAt === at && introEl && !introEl.hidden) {
        setPuzzle('plan', pts, { ...PLAN_STYLE, path: rt.path });
        if (circle) map.easeTo({ ...storyCircleFit([...pts, ...rt.path], circle), duration: 600 });
      }
    });
    if (circle) map.easeTo({ ...storyCircleFit(pts, circle), duration: 900 });
    else map.fitBounds(boundsOf(pts), { padding: storyPadding(), maxZoom: 15.5, duration: 900 });
    return;
  }
  closeStoryLens();
  clearPuzzle('plan');
  /* The Plum Perks card shows only the partners, few enough to stay stars
     much further out than the full map can: its clusters stop forming two
     levels sooner, and the camera goes out as far as that allows, up to the
     whole city. Where the city does not fit it centres on the middle partner
     (the median, which a few far-off ones cannot drag away). */
  const perkCard = perks === '1' && !area;
  setPlaceClusterZoom(perkCard ? STORY_PERK_CLUSTER_MAX : CLUSTER_MAX_ZOOM);
  if (perkCard) {
    const pts = E.filter((r) => r.lat != null && !r.out && hasPerkCallout(r));
    const mid = (k) => pts.map((r) => r[k]).sort((a, b) => a - b)[pts.length >> 1];
    const cam = map.cameraForBounds(CITY, { padding: storyPadding() });
    if (cam) {
      const center = pts.length ? [mid('lon'), mid('lat')] : cam.center;
      const zoom = Math.max(cam.zoom, STORY_PERK_CLUSTER_MAX + 1);
      map.easeTo({ center: zoom > cam.zoom ? center : cam.center, zoom, bearing: 0, pitch: 0, duration: storyMoved ? 900 : 0 });
      storyMoved = true;
      return;
    }
  }
  /* The first card on arrival is a jump: the map is already framed there,
     and a glide would only hold off the moment it settles. */
  map.fitBounds(storyBounds(area), { padding: storyPadding(), maxZoom: area ? CLUSTER_MAX_ZOOM + 1.3 : 12, duration: storyMoved ? 900 : 0 });
  storyMoved = true;
}
let storyMoved = false;
/* The planned-day card: as on the map, the day sits in a clear circle, and
   the window outside it takes the intro's own veil, exactly as dark as the
   map around the card (no names round the rim here). */
let storyLens = null;
function openStoryLens() {
  if (!storyWindow || !mapEl) return null;
  const W = storyWindow.clientWidth, H = storyWindow.clientHeight;
  const r = Math.min(W, H) / 2 - 18;
  if (r < 60) { closeStoryLens(); return null; }
  const fresh = !storyLens;
  if (fresh) {
    storyLens = document.createElement('div');
    storyLens.className = 'story-lens';
    storyLens.setAttribute('aria-hidden', 'true');
    storyWindow.appendChild(storyLens);
  }
  storyLens.style.background = getComputedStyle(storyVeil || storyWindow).backgroundColor;
  storyLens.style.setProperty('--lx', `${W / 2}px`);
  storyLens.style.setProperty('--ly', `${H / 2}px`);
  const far = Math.hypot(W, H) / 2 + 4;
  storyLens.animate([{ '--lr': `${fresh ? far : r}px` }, { '--lr': `${r}px` }],
    { duration: fresh && !S_REDUCED() ? 1000 : 0, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' });
  /* The circle's centre and radius on the map's own canvas. */
  const w = storyWindow.getBoundingClientRect(), m = mapEl.getBoundingClientRect();
  const cs = getComputedStyle(storyWindow);
  return { cx: w.left - m.left + (parseFloat(cs.borderLeftWidth) || 0) + W / 2, cy: w.top - m.top + (parseFloat(cs.borderTopWidth) || 0) + H / 2, r };
}
function closeStoryLens() {
  storyLens?.remove();
  storyLens = null;
}
/* Every stop (and the route) inside the circle, less a badge and a margin. */
function storyCircleFit(pts, { cx, cy, r }) {
  const xy = pts.map((p) => map.project(p));
  const xs = xy.map((p) => p.x), ys = xy.map((p) => p.y);
  const mid = map.unproject([(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]);
  const c = map.project(mid);
  const far = Math.max(1, ...xy.map((p) => Math.hypot(p.x - c.x, p.y - c.y)));
  /* The margin keeps a stop's number badge, up and left of its pin, inside too. */
  const zoom = Math.min(15.5, map.getZoom() + Math.log2(Math.max(40, r - 48) / far));
  /* No padding left over from the other cards' fits, so the offset is from
     the canvas's own centre. */
  return { center: mid, zoom, bearing: 0, pitch: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, offset: [cx - mapEl.clientWidth / 2, cy - mapEl.clientHeight / 2] };
}
/* The zoom up to which places gather into cluster bars; the intro's Plum
   Perks card lowers it while it is up. */
const STORY_PERK_CLUSTER_MAX = 10;
function setPlaceClusterZoom(z) {
  const src = map?.getSource('places');
  if (!src?.setClusterOptions || src._clusterMax === z) return;
  src._clusterMax = z;
  src.setClusterOptions({ cluster: true, clusterRadius: CLUSTER_RADIUS, clusterMaxZoom: z });
}
/* The intro card, in the middle of the screen, goes into the main card on
   the left (morphIntoCard): the card has kept its place all along. */
function endStory() {
  if (!introEl || introEl.hidden) return;
  closeStoryLens();
  /* Where the intro card was, so it can travel to the card it becomes. */
  const morphFrom = document.getElementById('story-card')?.getBoundingClientRect();
  const morph = BASEMAP === 'paper' && morphFrom && morphFrom.width > 0 && !S_REDUCED() && frameEl?.classList.contains('is-intro');
  if (morph) frameEl.classList.add('is-morph');
  introEl.hidden = true;
  setPlaceClusterZoom(CLUSTER_MAX_ZOOM);
  /* On a phone the activities start folded away. */
  foldPrompt(true);
  clearPuzzle('plan');
  state.intents = new Set(MAP_INTENTS.map((x) => x.k));
  setArea('all');
  state.perksOnly = false;
  state.deliveryOnly = false;
  syncIntentUI();
  syncPerks();
  closePlace();
  touched = false;
  if (!isNarrow()) openResultsList();
  render(true);
  /* The intro let the camera out further than the map allows; put it back. */
  lockZoomOut();
  if (frameEl?.classList.contains('is-intro')) slideInPage();
  else fitCity();
  if (morph) morphIntoCard(morphFrom);
  setTimeout(showBeWellTip, morph ? 1100 : 500);
}
/* The first card's "get healthy" is the sentence's own word: pressed, the
   intro goes to the map with that word's choices open, no bubble needed. */
/* The first card's "get healthy" opens the sentence's own choices right in
   the card, as bubbles under the line; picking one goes to the map with just
   that chosen. */
document.addEventListener('click', (e) => {
  const word = e.target.closest?.('[data-story-pick="all"]');
  const pick = e.target.closest?.('[data-story-kind]');
  if (pick) {
    beWellTipShown = true;
    const k = pick.dataset.storyKind;
    endStory();
    setTimeout(() => setIntents([k], { renderMap: true }), 900);
    return;
  }
  if (!word) return;
  const slide = word.closest('.story-slide');
  let tray = slide?.querySelector('.story-tray');
  if (tray) { tray.remove(); word.setAttribute('aria-expanded', 'false'); return; }
  tray = document.createElement('div');
  tray.className = 'story-tray';
  tray.innerHTML = SENTENCE_KINDS.map((k, i) => `<button type="button" class="s-bubble story-bubble" data-story-kind="${k}" style="${tint(k)};animation-delay:${i * 40}ms">${esc(INTENT_BY_K[k]?.prompt || k)}</button>`).join('');
  slide.appendChild(tray);
  word.setAttribute('aria-expanded', 'true');
});
/* Once, as the map opens: a small bubble on "be well" saying it can be
   changed. It goes at the first press anywhere, or after a while. */
/* var: the card first draws before this line has run. */
var beWellTipShown = false, beWellTipGo = null;
function showBeWellTip() {
  if (beWellTipShown || !frameEl || (introEl && !introEl.hidden)) return;
  const word = sentenceEl?.querySelector('.s-word.s-all');
  if (!word || !word.offsetWidth) return;
  beWellTipShown = true;
  /* A dashed ring round the word and a "tap me" tag on its corner, both
     held in the word's own chip so they move with it as the card settles. */
  const chip = word.closest('.s-chip') || word.parentElement;
  const ring = document.createElement('span');
  ring.className = 'bw-ring';
  const tip = document.createElement('span');
  tip.className = 'bw-tip';
  tip.setAttribute('role', 'status');
  tip.setAttribute('aria-label', 'Tap to pick what you want to do');
  tip.textContent = 'tap me';
  chip.append(ring, tip);
  /* Placed from the word's own box within its holder (made the reference). */
  if (getComputedStyle(chip).position === 'static') chip.style.position = 'relative';
  const at = (el) => { el.style.left = `${word.offsetLeft - 4}px`; el.style.top = `${word.offsetTop - 4}px`; };
  at(ring);
  ring.style.width = `${word.offsetWidth + 8}px`; ring.style.height = `${word.offsetHeight + 8}px`;
  tip.style.left = `${word.offsetLeft + word.offsetWidth - tip.offsetWidth + 16}px`;
  tip.style.top = `${word.offsetTop - tip.offsetHeight / 2 - 4}px`;
  frameEl.classList.add('is-nudge');
  const go = () => {
    tip.classList.add('is-out'); ring.classList.add('is-out'); frameEl.classList.remove('is-nudge');
    setTimeout(() => { tip.remove(); ring.remove(); }, 250);
    document.removeEventListener('pointerdown', go, true);
  };
  beWellTipGo = go;
  document.addEventListener('pointerdown', go, true);
  setTimeout(go, 8000);
}
/* The intro card does not vanish: its sheet of paper glides to the left and
   grows or shrinks into the main card, whose contents then fade in on it. */
function morphIntoCard(from) {
  /* Whatever happens to the animation, the card is never left hidden. */
  const settle = setTimeout(() => {
    frameEl.classList.remove('is-morph');
    document.querySelectorAll('.morph-ghost').forEach((g) => g.remove());
  }, 1400);
  /* The sheet is up the instant the intro goes, so nothing flashes empty. */
  const box = (b) => ({ left: `${b.left}px`, top: `${b.top}px`, width: `${b.right - b.left}px`, height: `${b.bottom - b.top}px` });
  const ghost = document.createElement('div');
  ghost.className = 'morph-ghost';
  Object.assign(ghost.style, box(from));
  document.body.appendChild(ghost);
  setTimeout(() => {
    const parts = ['#promptdock .prompt', '#search-panel', '#promptdock .s-tabs']
      .map((q) => document.querySelector(q)).filter((el) => el && !el.hidden)
      .map((el) => el.getBoundingClientRect()).filter((b) => b.width > 0 && b.height > 0);
    if (!parts.length) { frameEl.classList.remove('is-morph'); ghost.remove(); return; }
    const to = parts.reduce((u, b) => ({ left: Math.min(u.left, b.left), top: Math.min(u.top, b.top),
      right: Math.max(u.right, b.right), bottom: Math.max(u.bottom, b.bottom) }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
    const run = ghost.animate([box(from), box(to)], { duration: 650, easing: 'cubic-bezier(.65,0,.25,1)', fill: 'forwards' });
    run.finished.then(() => {
      frameEl.classList.remove('is-morph');
      frameEl.classList.add('is-morph-in');
      ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' }).finished.then(() => ghost.remove());
      setTimeout(() => frameEl.classList.remove('is-morph-in'), 400);
      clearTimeout(settle);
    });
  }, 90);
}
storyDots.forEach((d) => d.addEventListener('click', () => showStory(Number(d.dataset.story))));
storyNext?.addEventListener('click', () => {
  if (storyAt >= storySlides.length - 1) endStory();
  else showStory(storyAt + 1);
});
document.getElementById('story-close')?.addEventListener('click', endStory);
/* The intro sentence: each word goes to the map with the sentence started
   from it, and that word's choices open in the picker. A press off the card
   does nothing: the intro is left by its own buttons (or Escape). */
introEl?.addEventListener('click', (e) => {
  const w = e.target.closest('[data-si-k], [data-si-plus], [data-si-area]');
  if (!w) return;
  /* Where each of the intro's words sits now, so it can travel from there to
     its place in the picker. */
  const glide = {};
  introEl.querySelectorAll('[data-si-k]').forEach((b) => { glide[b.dataset.siK] = b.getBoundingClientRect(); });
  const plus = introEl.querySelector('[data-si-plus]'), place = introEl.querySelector('[data-si-area]');
  if (plus) glide['+'] = plus.getBoundingClientRect();
  if (place) glide.area = place.getBoundingClientRect();
  const words = [...introEl.querySelectorAll('[data-si-k]')].map((b) => b.dataset.siK);
  endStory();
  sentence.open = w.dataset.siK || (w.dataset.siPlus ? '+' : 'area');
  foldPrompt(false);
  sentence.fx = { glide, pull: true, delay: 420 };
  if (sentenceEl) sentenceEl.__html = '';
  setIntents(words, { renderMap: true });
  renderSentence();
});
document.addEventListener('keydown', (e) => {
  if (!introEl || introEl.hidden) return;
  if (e.key === 'Escape') endStory();
  if (e.key === 'ArrowRight') storyNext?.click();
  if (e.key === 'ArrowLeft' && storyAt > 0) showStory(storyAt - 1);
});
window.addEventListener('resize', () => {
  if (introEl && !introEl.hidden) { cutStoryWindow(); showStory(storyAt); }
});

promptEl?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (introEl) introEl.hidden = true;
  slideInPage();
  dockPrompt();
  closePlace();
  touched = false;
  if (!isNarrow()) openResultsList();
  render();
});

/* A click outside closes whichever list is open. */
document.addEventListener('click', (e) => {
  if (e.target.closest('.prompt-panel, .prompt-value')) return;
  if (areaPanel && !areaPanel.hidden) setPanel(areaPanel, false);
  if (intentPanel && !intentPanel.hidden) setPanel(intentPanel, false);
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (areaPanel && !areaPanel.hidden) setPanel(areaPanel, false);
  else if (intentPanel && !intentPanel.hidden) setPanel(intentPanel, false);
});

/* No popup (the embed) means nothing to gate: it is already docked in markup. */
if (!introEl && promptEl) dockPrompt();

function onAreaPicked(value) {
  setArea(value);
  closePlace();
  touched = true;
  if (isNarrow()) {
    /* On a phone the list stays as its bar along the bottom; an area with
       little or nothing in it opens the list, so the note saying so is seen,
       as it is on a desktop. */
    const pinned = filtered().filter((r) => r.lat != null && inPlace(r)).length;
    state.showList = true;
    state.listMin = !(value !== 'all' && pinned < 3);
    if (!state.listMin) foldPrompt(true);
  } else {
    openResultsList();
  }
  scheduleRender({ fit: true });
}
if (areaEl) areaEl.onchange = () => onAreaPicked(areaEl.value);
if (areaMobileEl) areaMobileEl.onchange = () => onAreaPicked(areaMobileEl.value);

syncIntentUI();

/* ---------- filtering ---------- */
/* Everything a search can match on: name, notes, tags, sub-category, intent,
   area and ward, who it suits, hours and price. */
const hayOf = (r) => [
  r.n, r.d, r.a, r.raw, r.b, r.t, r.p, LABELS[r.g], intentMeta(r)?.verb,
  ...(r.tg || []).map((t) => String(t).replace(/-/g, ' ')),
].filter(Boolean).join(' ').toLowerCase();
const HAY = new Map(E.map((r) => [r.id, hayOf(r)]));
const wordsOf = (q) => String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
const matchesQuery = (r, words) => !words.length || words.every((w) => HAY.get(r.id)?.includes(w));

/* Has the reader asked for something specific — a category, or a part of town?
 *
 * This is what decides whether Plum Perks is the whole map or the top of it.
 * As the opening view of the city it can be the whole map: 280 partners is a
 * showcase. As a filter it cannot, because 317 of the 463 category-and-area
 * combinations that hold pins hold no partner at all — two thirds of every
 * drill-down anyone can make returns an empty map. "Look after my mind in
 * Jayanagar" is one of them: eleven places there, none of them a partner.
 * So narrowing brings the rest of the slice back, and the partners keep the
 * top of the list and their gift on the map. */
const narrowed = () => state.area !== 'all'
  || selectedMapIntents().length < MAP_INTENTS.length;

/* The opening view is capped.
 *
 * All of it is 2,371 pins inside the boundary, which draws as one dark mass
 * over the centre and tells a reader nothing. 276 — every Plum Perks partner
 * and nothing else — was too thin to be worth looking at, and made every
 * category fuller than the view people land on. This is the middle: every
 * partner, then a spread of the rest up to the cap.
 *
 * The spread is round-robined across localities and then across categories,
 * so no one dense corner spends the budget before the rest of the city is
 * asked, and the map reads as a city rather than a pile. Verified first
 * inside each locality. Deterministic — the same map every time, and
 * Randomize is what varies it.
 *
 * Narrowing, searching or pressing Plum Perks all lift the cap: each of those
 * is a request for a specific answer, and a capped answer would be a wrong
 * one. */
const OPENING_CAP = 650;
let openingTotal = 0;

/* Every category spread evenly down the whole list.
 *
 * roundRobin deals one from each bucket in turn, which mixes only while
 * several buckets still have rows: with 2 perks and 86 routes it emits perk,
 * perk, and then 86 routes in a column. This places each row at its own
 * position within its own category instead, so a category of 90 falls every
 * tenth row of 900 and a category of 9 every hundredth, and the mix holds
 * from the first row to the last. */
function interleave(rows, key) {
  const buckets = new Map();
  for (const r of rows) {
    const k = key(r) || '';
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(r);
  }
  const placed = [];
  for (const q of buckets.values()) q.forEach((r, i) => placed.push([(i + 0.5) / q.length, r]));
  return placed.sort((a, b) => a[0] - b[0]).map(([, r]) => r);
}

function roundRobin(rows, key) {
  const buckets = new Map();
  for (const r of rows) {
    const k = key(r) || '';
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(r);
  }
  const queues = [...buckets.values()];
  const out = [];
  for (let more = true; more;) {
    more = false;
    for (const q of queues) if (q.length) { out.push(q.shift()); more = true; }
  }
  return out;
}

function openingSample(items) {
  /* Anything with a drawn line is kept whatever the cap says. A route is the
     one thing on this map that is not a dot — 84 of them, the runs and rides
     the city is actually organised around — and they were competing for the
     fill on equal terms with every clinic and cafe, so the opening view drew a
     handful of them and the rest only appeared once someone picked Move. Lines
     are not what makes a map look crowded; pins are. */
  const keep = [];
  const rest = [];
  for (const r of items) (hasPerkCallout(r) || TRAIL[r.id] ? keep : rest).push(r);
  if (keep.length + rest.length <= OPENING_CAP) return items;
  const byName = [...rest].sort((a, b) => ((b.v === 'Verified') - (a.v === 'Verified'))
    || String(a.n || '').localeCompare(String(b.n || '')));
  const spread = roundRobin(roundRobin(byName, (r) => r.a), (r) => INTENT_OF.get(r.id));
  return keep.concat(spread.slice(0, Math.max(0, OPENING_CAP - keep.length)));
}

/* Everything on, the whole city, no search: the one view the cap applies to. */
const openingView = () => !narrowed() && !state.perksOnly;

function pool(){
  const keys = selectedMapIntents();
  const all = !keys.length || keys.length >= MAP_INTENTS.length;
  /* Plum Perks on means partners only, in every view: it used to lift itself
     as soon as an activity or an area was picked, which filled the map with
     places that are not partners while the button still read on. */
  const perksRule = state.perksOnly;
  /* Delivery only is its own answer: the kitchens with no dine-in, whatever
     activities are picked, since all of them are eating. */
  if (state.deliveryOnly) return E.filter((r) => INTENT_OF.get(r.id) && r.tg?.includes('delivery-only'));
  return E.filter((r) => {
    const k = INTENT_OF.get(r.id);
    if (!k) return false;
    if (perksRule && !hasPerkCallout(r) && !state.planIds.has(r.id)) return false;
    if (!all && state.subs[k] && !state.planIds.has(r.id)) {
      const group = SUBCATEGORIES[k]?.find((x) => x.k === state.subs[k]);
      if (group?.tag ? !r.tg?.includes(group.tag) : (r.sc !== state.subs[k] && !r.scs?.includes(state.subs[k]))) return false;
    }
    return all || keys.includes(k);
  });
}

/* The place half of the filter, on its own so the legend can count by it. */
function inPlace(r){
  if (state.area !== 'all') return r.a === state.area;
  /* Corporation filter only when browsing citywide — never AND with area. */
  if (state.rg !== 'all' && (state.rg === 'none' ? !!r.rg : r.rg !== state.rg)) return false;
  /* “in Mumbai” = inside the city. Day trips stay out of the citywide browse. */
  return !r.out;
}

/* A search is a question about the whole city, not about whatever happens to be
   toggled on. Answering it inside the current category and area hid the very
   thing that was asked for: type the name of a place in Whitefield while
   browsing Play in Indiranagar and you got nothing back, with no hint that it
   existed. So a query is answered across every category, every area and every
   corporation — day trips included, since someone typing a name wants that
   place wherever it sits.

   The toggles still govern browsing. They stop governing the answer to a
   question. Entries with no mapped intent stay out either way: the parked
   categories have no pin, so there is nothing to show or fly to. */
function matching(words) {
  if (!words.length) {
    const here = pool().filter((r) => inPlace(r));
    openingTotal = 0;
    if (!openingView()) return here;
    const sample = openingSample(here);
    if (sample.length < here.length) openingTotal = here.filter((r) => r.lat != null).length;
    return sample;
  }
  return E.filter((r) => INTENT_OF.get(r.id) && matchesQuery(r, words));
}

function filtered(){
  return matching(wordsOf(state.query));
}

/* Pins per intent in the chosen area and search, whatever intents are on. */
function syncLegendCounts(){
  const words = wordsOf(state.query);
  const searching = words.length > 0;
  const counts = {};
  E.forEach((r) => {
    if (r.lat == null || !matchesQuery(r, words)) return;
    /* While searching these count the whole city, to match what the search
       actually returns — otherwise the per-category numbers contradict the
       results sitting under them. */
    if (!searching && !inPlace(r)) return;
    /* The perks layer filters the map, so the per-category numbers have to
       count the same thing. Otherwise the prompt offers "play 454" while the
       map behind it holds seven perk courts. */
    if (state.perksOnly && !searching && !hasPerkCallout(r)) return;
    const k = INTENT_OF.get(r.id);
    if (k) counts[k] = (counts[k] || 0) + 1;
  });
  document.querySelectorAll('[data-legend-count]').forEach((el) => {
    el.textContent = counts[el.dataset.legendCount] || 0;
  });
}

/* Coalesce rapid shuffle / filter clicks onto one map pass per frame. */
let renderRaf = 0;
let renderWantFit = false;
function scheduleRender({ fit = true } = {}) {
  if (fit) renderWantFit = true;
  if (renderRaf) return;
  renderRaf = requestAnimationFrame(() => {
    renderRaf = 0;
    const keep = !renderWantFit;
    renderWantFit = false;
    render(keep);
  });
}

/* ---------- map ----------
   Zooms are MapLibre's, one less than Leaflet's for the same view: tiles are
   512 pixels across. */
const [BS, BW, BN, BE] = DB.box;
const CITY = new LngLatBounds([BW, BS], [BE, BN]);
const TILE = 512;
const MIN_ZOOM = 9;
const MAX_ZOOM = 18;
/* Clusters dissolve above this zoom. Area framing lands ~13–14.5, so break at
   12 — citywide (≤12) stays clustered for load; neighbourhood views open with
   individuals instead of piles of 2–5. Supercluster uses floor(zoom), so the
   cutoff must sit below the area fit, not on it. */
/* Lowered to 10: the paper pins are small enough that a district view
   (zoom 11 and in) reads better as its places than as stacks. */
const CLUSTER_MAX_ZOOM = 10;
/* Pixel radius for clustering. Slightly tighter than 64 so mid-zoom neighbours
   split sooner without drawing every pin at city scale. */
const CLUSTER_RADIUS = 26;
/* When the list opens a pin, come in close enough that it stands alone. */
const PIN_FOCUS_ZOOM = 16;
/* Cap for framing an area or search. High enough that a trimmed local core
   (Kadubeesanahalli after dropping Balagere/Yemalur outliers) can fill the
   frame; fitBounds still pulls out for genuinely spread areas. */
const AREA_MAX_ZOOM = 15.25;
/* A picked area is framed 10% further out than its places' tight fit, so
   the neighbourhood around it shows and the pins are not hard against the
   edges: a 0.9 scale is log2(1/0.9), about 0.15 of a zoom level. */
const AREA_ZOOM_OUT = Math.log2(1 / 0.9);
const SEARCH_MAX_ZOOM = 15.5;
const FOCUS_ZOOM = 15;
const ZOOM_SNAP = 0.25;

const size = () => ({ x: mapEl.clientWidth, y: mapEl.clientHeight });
/* On a desktop the map is inset in the frame (prompt-map.css), so anything
   drawn in the frame from map coordinates is shifted by where the map sits. */
const SPLIT = window.matchMedia('(min-width: 821px)');
/* Just-the-map and the zoom: on the map's own corner when it has a frame of
   its own, in the bar on a phone, where the map is the whole screen. */
function placeMapControls() {
  const box = document.getElementById('mapctl');
  const clear = document.getElementById('t-clear');
  const zoom = document.querySelector('.zoom-group');
  const threeD = document.getElementById('t-3d');
  if (!box || !clear || !zoom || !topRight) return;
  const items = [clear, threeD, zoom].filter(Boolean);
  if (SPLIT.matches) box.append(...items);
  else document.getElementById('search')?.after(...items);
  syncStack();
}
placeMapControls();
SPLIT.addEventListener('change', placeMapControls);
const onFrame = (at) => {
  const p = map.project(at);
  return { x: p.x + mapEl.offsetLeft, y: p.y + mapEl.offsetTop };
};
const mercator = (lng, lat) => [
  (lng + 180) / 360,
  (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360,
];

function padBounds(b, ratio) {
  const w = (b.getEast() - b.getWest()) * ratio, h = (b.getNorth() - b.getSouth()) * ratio;
  return new LngLatBounds([b.getWest() - w, b.getSouth() - h], [b.getEast() + w, b.getNorth() + h]);
}
function boundsOf(points) {
  const b = new LngLatBounds();
  points.forEach((p) => b.extend(p));
  return b;
}
function geometryBounds(features) {
  const b = new LngLatBounds();
  features.forEach(({ geometry: g }) => {
    (g.type === 'MultiPolygon' ? g.coordinates.flat(2) : g.coordinates.flat(1)).forEach((p) => b.extend(p));
  });
  return b;
}

let map = null;
/* Set once OpenFreeMap has failed and plain OSM raster tiles stand in. */
let raster = false;
try {
  const introOpen = !!(introEl && !introEl.hidden && storyWindow);
  map = new GLMap({
    container: mapEl,
    style: glStyle(state.paint === 'regions'),
    bounds: CITY,
    /* Under the intro the map starts already framed in the card's window, so
       the first tiles asked for are the ones the card shows; it used to start
       on the whole page and then glide into the window, which asked for a
       second set of tiles and held the map back by about two seconds. */
    fitBoundsOptions: { padding: introOpen ? storyPadding() : 24 },
    minZoom: introOpen ? 6 : MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    /* The credit line lives at the foot of the About panel. */
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    renderWorldCopies: false,
    /* Clusters hand over to their pins (and back) with a short cross-fade
       rather than a cut. */
    fadeDuration: 320,
    crossSourceCollisions: false,
    refreshExpiredTiles: false,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  /* The stretches of road and footpath inside green areas, for the green
     edges and green paths there. Stamped with the build, as details.json is,
     so Webflow's four-hour cache cannot hand back a previous deploy's file. Low priority and not waited on: until they
     arrive, roads have no edge and paths are grey everywhere. */
  fetch(`${DATA_BASE}green-roads.json${DATA_V}`, { priority: 'low' })
    .then((r) => r.json())
    .then((fc) => setGreenRoads(map, fc, 'far'))
    .catch((e) => console.warn('Green roads:', e.message));
  /* The minor roads and footpaths are nearly all of that file's weight and
     only show from zoom 13, so they are fetched the first time the map comes
     in that close (a little before, so they are there as they fade in). */
  const NEAR_ZOOM = 12;
  const nearRoads = () => {
    if (map.getZoom() < NEAR_ZOOM) return;
    map.off('zoomend', nearRoads);
    fetch(`${DATA_BASE}green-roads-near.json${DATA_V}`, { priority: 'low' })
      .then((r) => r.json())
      .then((fc) => setGreenRoads(map, fc, 'near'))
      .catch((e) => console.warn('Green paths:', e.message));
  };
  map.on('zoomend', nearRoads);
  map.once('load', nearRoads);
  /* A handle for poking at the map from the console while developing. */
  if (import.meta.env.DEV) window.wellnessMap = map;
} catch (err) {
  map = null;
  console.warn('Map:', err.message);
  if (warnEl) {
    warnEl.innerHTML = '<b>This browser cannot draw the map.</b>It needs WebGL. The list and the index still work.';
    warnEl.classList.add('on');
  }
}

/* The place card when it is docked bottom-left rather than standing on a pin. */
function cardDocked() {
  return !!placeCard && !placeCard.hidden && !placeCard.classList.contains('is-floating');
}

/* Whichever card is docked bottom-left: the place card when it is docked there. */
function bottomPanel() {
  if (cardDocked()) return placeCard;
  if (searchPanel && !searchPanel.hidden) return searchPanel;
  return null;
}

/* The chrome's footprint, for framing: the toolbars across the top, a left
   column for the legend (and the list or card, when it docks there rather than
   spanning the bottom). On a phone the legend is too wide to sit beside the
   city, so the whole top-left stack comes off the top instead. */
/* Phone, paper: the foot of the corner tiles, and the top of the card's tabs
   (or of the card, while it has none), in page pixels. */
function cornerBottom() {
  const bar = document.getElementById('corner-bar');
  return bar && bar.offsetHeight ? bar.getBoundingClientRect().bottom : 0;
}
function cardTopEdge() {
  const tops = [promptDock, promptDock?.querySelector('.s-tabs')]
    .filter((el) => el && el.offsetHeight).map((el) => el.getBoundingClientRect().top);
  return tops.length ? Math.min(...tops) : window.innerHeight;
}
function fitPad(extra){
  const s = size();
  const panel = bottomPanel();
  const spans = !!panel && panel.offsetWidth >= s.x * .6;
  const pad = { top: extra, left: extra, right: extra, bottom: Math.max(extra, 72) };
  /* Desktop: the toolbar, prompt and list are beside the map, not over it. */
  if (SPLIT.matches && BASEMAP === 'paper') {
    /* The paper map runs edge to edge with the one card floating over its
       left; pins are framed in the room to the right of it. */
    const card = promptDock ? promptDock.offsetLeft + promptDock.offsetWidth : 0;
    return { top: extra, left: Math.max(extra, card + 24), right: extra, bottom: Math.max(extra, 24) };
  }
  if (SPLIT.matches) return { top: extra, left: extra, right: extra, bottom: Math.max(extra, 44) };
  if (s.x >= 600) {
    /* The scale and compass now sit top centre, so they are part of the
       top chrome a fit has to clear. */
    pad.top = Math.max(pad.top, Math.max(toolbarEl?.offsetHeight || 0, topRight?.offsetHeight || 0,
      scaleEl?.offsetHeight || 0) + 24);
    const listWidth = panel && !spans && !(state.listMin && panel === searchPanel) ? panel.offsetWidth : 0;
    pad.left = Math.max(pad.left, Math.max(legendEl?.offsetWidth || 0, listWidth) + 24);
    /* The prompt dock hangs down the right, so keep the pins clear of it. */
    pad.right = Math.max(pad.right, (promptDock?.offsetWidth || 0) + 24);
  } else if (BASEMAP === 'paper') {
    /* Phone, paper: the corner tiles across the top, the card (tabs and all)
       on the foot; the pins are framed in the room between. */
    const mt = mapEl?.getBoundingClientRect().top || 0;
    pad.top = Math.max(pad.top, (cornerBottom() - mt) + 16);
    const cardTop = cardTopEdge() - mt;
    if (cardTop > 0) pad.bottom = Math.max(pad.bottom, Math.min(s.y - cardTop + 16, Math.floor(s.y * 0.62)));
    return pad;
  } else {
    /* Phone: the prompt dock sits under Map/Grid; leave room above the map. */
    const dockH = promptDock?.offsetHeight ? promptDock.offsetHeight + 12 : 0;
    pad.top = Math.max(pad.top, Math.min(56 + dockH, Math.floor(s.y * 0.42)));
    /* The card and the bar under it (the list or the perks drawer) cover the
       top of the map; the pins are framed in what is left below them. */
    const mt = mapEl?.getBoundingClientRect().top || 0;
    const covered = [promptDock, searchPanel].filter((el) => el && !el.hidden && el.offsetHeight)
      .map((el) => el.getBoundingClientRect()).filter((b) => b.top - mt < s.y * 0.5)
      .reduce((m, b) => Math.max(m, b.bottom - mt), 0);
    if (covered) pad.top = Math.max(pad.top, Math.min(covered + 20, Math.floor(s.y * 0.55)));
    pad.bottom = Math.max(pad.bottom, 24);
  }
  if (spans) {
    const raw = panel.offsetHeight + 16;
    const sheet = state.listMin && panel === searchPanel
      ? panel.offsetHeight + 12
      : Math.min(raw, s.x < 600 ? Math.floor(s.y * 0.34) : 360);
    pad.bottom = Math.max(pad.bottom, sheet);
  }
  return pad;
}

/* MapLibre refuses a fit whose padding leaves no room, so shrink it instead. */
function safePad(p) {
  const s = size();
  const squeeze = (a, b, room) => {
    const over = a + b - (room - 40);
    return over > 0 ? [a - over * a / (a + b), b - over * b / (a + b)] : [a, b];
  };
  const [left, right] = squeeze(p.left, p.right, s.x);
  const [top, bottom] = squeeze(p.top, p.bottom, s.y);
  return { top: Math.max(0, top), left: Math.max(0, left), right: Math.max(0, right), bottom: Math.max(0, bottom) };
}

/* The edge of the map: the city and the greater area its places reach into
   (scripts/build-region.mjs). The map pans and zooms out only as far as this,
   with REGION_SLACK of room round it. */
const REGION = new LngLatBounds([REGION_BBOX[0], REGION_BBOX[1]], [REGION_BBOX[2], REGION_BBOX[3]]);
const REGION_SLACK = 0.08;

function applyMaxBounds() {
  if (!map) return;
  /* The intro's cards frame the city into a window off the map's middle, and
     an edge that holds the camera to the region would pull that framing
     back. Its end (endStory → lockZoomOut, slideInPage) puts the edge on. */
  if (introEl && !introEl.hidden) { map.setMaxBounds(null); return; }
  if (planBounds) { map.setMaxBounds(planBounds); return; }
  /* The map stops at its edge: the region with a little slack, so the edge
     line and some of the paper beyond it stay in view, and nothing of the
     rest of the world. It does not depend on where the camera is, so zooming
     out from a neighbourhood always reaches the whole region; the region
     takes in the city with room to spare, so the whole-city view is always
     reachable too. */
  map.setMaxBounds(fitAspect(padBounds(REGION, REGION_SLACK)));
}

/* Grows bounds along their short side until they match the map's shape. The
   region is a circle, and MapLibre will not zoom out past the point where the
   view leaves the bounds, so a square box in a tall window would stop the
   zoom with the circle's sides cut off; widened to the window's shape, the
   whole circle fits. */
function fitAspect(b) {
  const s = size();
  if (!s.x || !s.y) return b;
  const [x0, y0] = mercator(b.getWest(), b.getNorth());
  const [x1, y1] = mercator(b.getEast(), b.getSouth());
  let w = x1 - x0, h = y1 - y0;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  if (w / h > s.x / s.y) h = w * s.y / s.x; else w = h * s.x / s.y;
  const lng = (x) => x * 360 - 180;
  const lat = (y) => (360 / Math.PI) * Math.atan(Math.exp((180 - y * 360) * Math.PI / 180)) - 90;
  return new LngLatBounds([lng(cx - w / 2), lat(cy + h / 2)], [lng(cx + w / 2), lat(cy - h / 2)]);
}

/* Lets the bottom-left card size itself to the room under the top-left stack,
   and the prompt dock hang below the search and zoom row on the right. */
function syncStack(){
  frameEl?.style.setProperty('--stack', `${(topLeft?.offsetHeight || 0) + 12}px`);
  frameEl?.style.setProperty('--topright', `${topRight?.offsetHeight || 0}px`);
  frameEl?.style.setProperty('--dock-h', `${promptDock?.offsetHeight || 0}px`);
  /* On a phone the card sits on the screen's foot, the list under it: the
     card is hung from the list's height so the two stay joined. */
  frameEl?.style.setProperty('--sp-h', `${searchPanel?.offsetHeight || 0}px`);
}
/* The list hangs under the prompt on a desktop, and the prompt changes height
   as its lists open and close. */
if (window.ResizeObserver && promptDock) {
  const ro = new ResizeObserver(syncStack);
  ro.observe(promptDock);
  if (searchPanel) ro.observe(searchPanel);
}

function fitTo(bounds, { padding = fitPad(24), maxZoom = MAX_ZOOM } = {}){
  /* While a day's circle is up it owns the camera. */
  if (lensHolds()) return;
  if (!map || !bounds || bounds.isEmpty()) return;
  map.setMaxBounds(null);
  map.fitBounds(bounds, { padding: safePad(padding), maxZoom, animate: false });
  applyMaxBounds();
}

/* Frame a set of pins inside the chrome. Prefer the pin cloud itself over a
   fixed area scale — forcing ~2500% used to crop most of a locality off-screen.

   A few mis-areaed or corridor outliers (Kadubeesanahalli→Balagere/Yemalur)
   used to stretch the fit so the real neighbourhood looked empty. Frame the
   majority closest to the median instead; stragglers stay on the map off-screen. */
function medianCoord(vals) {
  const s = [...vals].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function majorityPoints(pts, frac = 0.85) {
  if (pts.length <= 4) return pts;
  const mlon = medianCoord(pts.map((p) => p[0]));
  const mlat = medianCoord(pts.map((p) => p[1]));
  const ranked = [...pts].sort((a, b) => {
    const da = (a[0] - mlon) ** 2 + (a[1] - mlat) ** 2;
    const db = (b[0] - mlon) ** 2 + (b[1] - mlat) ** 2;
    return da - db;
  });
  return ranked.slice(0, Math.max(3, Math.ceil(pts.length * frac)));
}
/* An area's view: framed on where most of its pins are. The pins nearest
   the middle of the cloud (nine in ten of them) set the frame; the odd one far
   out may fall off the edge, so the view is not pulled away from the cluster. */
const kmApart = (a, b) => {
  const t = Math.PI / 180;
  return Math.hypot((b[0] - a[0]) * Math.cos(((a[1] + b[1]) / 2) * t) * 111.32, (b[1] - a[1]) * 110.57);
};
function frameArea(pts, area) {
  if (lensHolds()) return;
  if (!map || !pts.length) return;
  const pc = [medianCoord(pts.map((p) => p[0])), medianCoord(pts.map((p) => p[1]))];
  const ranked = pts.map((p) => [kmApart(pc, p), p]).sort((x, y) => x[0] - y[0]);
  const keep = ranked.slice(0, Math.max(Math.min(3, ranked.length), Math.ceil(ranked.length * 0.9))).map(([, p]) => p);
  map.setMaxBounds(null);
  if (keep.length === 1) map.jumpTo({ center: keep[0], zoom: Math.min(AREA_MAX_ZOOM, PIN_FOCUS_ZOOM) });
  else map.fitBounds(padBounds(boundsOf(keep), 0.04), { padding: safePad(fitPad(36)), maxZoom: AREA_MAX_ZOOM, animate: false });
  applyMaxBounds();
}
function framePins(pts, maxZoom = AREA_MAX_ZOOM) {
  if (!map || !pts.length) return;
  focusPoints(majorityPoints(pts), maxZoom);
}

function focusPoints(pts, maxZoom = FOCUS_ZOOM){
  if (!map || !pts.length) return;
  map.setMaxBounds(null);
  if (pts.length === 1) map.jumpTo({ center: pts[0], zoom: Math.min(maxZoom, PIN_FOCUS_ZOOM) });
  else map.fitBounds(boundsOf(pts), { padding: safePad(fitPad(36)), maxZoom, animate: false });
  applyMaxBounds();
}

let cityZoom = null;
/* On desktop, Mumbai opens a touch closer than a full fit so the city reads
   at a comfortable size. 100% remains “city fills the frame”; the default is 140%. */
const CITY_DEFAULT_SCALE = 1.4;
/* The whole-city view. On the paper map's desktop the card floats over the
   map's left, so the city is framed in the room to the right of it rather
   than centred behind it. */
function cityCamera() {
  if (BASEMAP === 'paper' && SPLIT.matches && map) {
    const cam = map.cameraForBounds(CITY, { padding: fitPad(24) });
    if (cam) return { center: cam.center, zoom: cam.zoom };
  }
  /* On a phone the card covers the top of the map: the city is centred in
     the part below it, by moving the camera up half the difference. */
  const c = CITY.getCenter();
  if (BASEMAP === 'paper' && !SPLIT.matches && map && cityZoom != null) {
    const p = fitPad(24);
    const dy = (p.top - p.bottom) / 2 / (TILE * 2 ** cityZoom);
    const [, y] = mercator(c.lng, c.lat);
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * (y - dy)))) * 180) / Math.PI;
    if (Number.isFinite(lat)) return { center: [c.lng, lat], zoom: cityZoom };
  }
  return { center: c, zoom: cityZoom };
}
function fitCity() {
  if (lensHolds()) return;
  if (!map) return;
  lockZoomOut();
  if (BASEMAP === 'paper' && SPLIT.matches) {
    map.setMaxBounds(null);
    map.jumpTo(cityCamera());
    applyMaxBounds();
    syncZoomUI();
    return;
  }
  if (isNarrow() || cityZoom == null) {
    fitTo(CITY, { padding: fitPad(24) });
    return;
  }
  /* With the map in its own frame nothing covers it, so the whole city opens
     fitted and centred; over a full-bleed map it opens closer, nudged clear
     of the chrome on the left. */
  const split = SPLIT.matches;
  const z = split ? cityZoom : Math.round((cityZoom + Math.log2(CITY_DEFAULT_SCALE)) / ZOOM_SNAP) * ZOOM_SNAP;
  map.setMaxBounds(null);
  map.jumpTo({ center: CITY.getCenter(), zoom: z });
  if (!split) {
    /* Left chrome eats the west side; nudge the view west so the city sits a
       little right of centre and the east rim doesn’t feel empty. */
    const leftChrome = Math.max(legendEl?.offsetWidth || 0, 200) + 28;
    map.panBy([-Math.round(leftChrome * 0.55), 0], { animate: false });
  }
  applyMaxBounds();
  syncZoomUI();
}

/* Out to the whole region in view, and no further. */
/* On a local server only, the map is reachable from the console (and from
   the script that takes the 404 page's picture of it). Production builds
   drop this. */
if (import.meta.env.DEV) window.__map = () => map;
function lockZoomOut(){
  if (!map) return;
  /* While the intro is up its cards set the zoom limits themselves. */
  if (introEl && !introEl.hidden) return;
  const s = size();
  if (!s.x || !s.y) return;
  const p = fitPad(24);
  const w = Math.max(s.x - p.left - p.right, 160);
  const h = Math.max(s.y - p.top - p.bottom, 160);
  const fitZoom = (b) => {
    const [x0, y0] = mercator(b.getWest(), b.getNorth());
    const [x1, y1] = mercator(b.getEast(), b.getSouth());
    return Math.log2(Math.min(w / ((x1 - x0) * TILE), h / ((y1 - y0) * TILE)));
  };
  cityZoom = Math.floor(fitZoom(CITY) / ZOOM_SNAP) * ZOOM_SNAP;
  const min = Math.ceil(fitZoom(padBounds(REGION, REGION_SLACK)) / ZOOM_SNAP) * ZOOM_SNAP;
  map.setMinZoom(Math.min(Math.max(min, MIN_ZOOM - 2), FOCUS_ZOOM));
  syncZoomUI();
}

/* Looked up before the first fitCity(), which reads them via syncZoomUI(). */
const zoomIn = document.getElementById('z-in');
const zoomOut = document.getElementById('z-out');
const zoomPct = document.getElementById('zoom-pct');
syncStack();
fitCity();

legendToggle?.addEventListener('click', () => {
  setLegendCollapsed(legendEl?.classList.contains('is-open'));
  syncStack();
  requestAnimationFrame(() => {
    map?.resize();
    lockZoomOut();
    if (!touched && state.area === 'all' && !state.query && state.view === 'map') fitCity();
  });
});

/* ---------- zoom, scale and compass ----------
   The zoom readout is relative to the whole-city view: 100% is the city
   filling the frame. Desktop’s Mumbai default is 140% of that, centred. */
zoomIn?.addEventListener('click', () => map?.zoomIn());
zoomOut?.addEventListener('click', () => map?.zoomOut());
zoomPct?.addEventListener('click', () => fitCity());
document.getElementById('compass')?.addEventListener('click', () => fitCity());

function syncZoomUI(){
  if (!map) return;
  const z = map.getZoom();
  if (zoomIn) zoomIn.disabled = z >= map.getMaxZoom() - 1e-6;
  if (zoomOut) zoomOut.disabled = z <= map.getMinZoom() + 1e-6;
  if (zoomPct && cityZoom != null) zoomPct.textContent = `${Math.round(100 * 2 ** (z - cityZoom))}%`;
}

const rulerBar = document.getElementById('ruler-bar');
const rulerLabel = document.getElementById('ruler-label');
const NICE = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
function syncRuler(){
  if (!map || !rulerBar || !rulerLabel) return;
  const s = size();
  if (!s.x) return;
  /* The longest the bar may be: 60px keeps the compass card about half the
     zoom card's width; the bar snaps to the largest round distance under it. */
  const MAX = 60, y = s.y / 2;
  const metres = map.unproject([0, y]).distanceTo(map.unproject([MAX, y]));
  const nice = NICE.filter((v) => v <= metres).pop() || NICE[0];
  rulerBar.style.width = `${Math.max(8, Math.round((MAX * nice) / metres))}px`;
  rulerLabel.textContent = nice >= 1000 ? `${nice / 1000} km` : `${nice} m`;
}
map?.on('zoom', syncZoomUI);
map?.on('zoomend', syncRuler);
map?.on('moveend', syncRuler);

/* ---------- basemap ----------
   OpenStreetMap vector tiles from OpenFreeMap, styled in src/lib/basemap.js.
   If the vector tiles never arrive, plain OSM raster tiles stand in. */
const rasterStyle = () => ({
  version: 8,
  sources: { osm: { type: 'raster', tiles: [RASTER.url], tileSize: 256, maxzoom: RASTER.opts.maxZoom } },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
});

let painted = false, basemapErrors = 0;
map?.on('sourcedata', (e) => { if (e.sourceId === 'omt' && e.isSourceLoaded) painted = true; });
map?.on('error', (e) => {
  console.warn('Basemap:', e.error?.message || e);
  if (e.sourceId === 'osm' && warnEl) {
    warnEl.innerHTML = '<b>The basemap did not load.</b>The pins are still correct, '
      + 'but no tile server could be reached. Check that this page can request '
      + '<code>tiles.openfreemap.org</code> and <code>tile.openstreetmap.org</code>.';
    warnEl.classList.add('on');
  }
  if (!raster && !painted && e.sourceId === 'omt' && ++basemapErrors >= 4) {
    raster = true;
    map.setStyle(rasterStyle());
  }
});

/* Corporation colours on, as the map opens: each corporation is its own poster
   in its own hue. Off: the whole city in poster lavender. Only the vector
   basemap can do either. */
function paintMode(){
  const regions = state.paint === 'regions';
  if (map && !raster) {
    setTone(map, regions);
    setRoadRegions(map, regions);
    setSelectedArea(map, state.area, regions);
  }
  document.getElementById('l-regions')?.setAttribute('aria-pressed', regions);
  document.getElementById('m-regions')?.setAttribute('aria-pressed', regions);
}
['l-regions', 'm-regions'].forEach((id) => document.getElementById(id)?.addEventListener('click', () => {
  state.paint = state.paint === 'regions' ? 'plain' : 'regions';
  paintMode();
}));

/* Running and cycling routes are drawn from the first frame, and stay on
   under Move even after the toggle has been pressed off. */
function routesShown(){
  if (state.routesHidden) return false;
  return state.routes || (state.intents.has('move') && selectedMapIntents().length < MAP_INTENTS.length);
}
/* The routes to draw. They follow the place list, except that the Plum Perks
   filter does not apply to them: a route is not a business, so none of them
   is a partner, and filtering by partner emptied the map of every trail
   while the Trails toggle still said on. With Perks on, the routes are the
   ones the categories and the area would show anyway. */
function trailItems(items){
  /* Switched on in the key while nothing that has routes is asked for (say,
     just eat healthy), the routes come anyway: every one in the part of town. */
  if (state.routes && !state.planIds.size && !wordsOf(state.query).length && !items.some((r) => TRAIL[r.id])) {
    return E.filter((r) => TRAIL[r.id] && inPlace(r));
  }
  if (!state.perksOnly || wordsOf(state.query).length) return items;
  const keys = selectedMapIntents();
  const all = !keys.length || keys.length >= MAP_INTENTS.length;
  return E.filter((r) => TRAIL[r.id] && inPlace(r) && (all || keys.includes(INTENT_OF.get(r.id))));
}
function syncRoutes(){
  document.getElementById('l-routes')?.setAttribute('aria-pressed', state.routes);
  document.getElementById('m-routes')?.setAttribute('aria-pressed', state.routes);
  /* The key says what the map shows: trails come on by themselves with Move. */
  document.getElementById('k-routes')?.setAttribute('aria-pressed', routesShown());
  drawTrails(routesShown() ? trailItems(filtered()) : []);
}
['l-routes', 'm-routes'].forEach((id) => document.getElementById(id)?.addEventListener('click', () => {
  state.routes = !state.routes;
  syncRoutes();
}));

/* The key's switch turns off what is shown, Move's own trails included. */
document.getElementById('k-routes')?.addEventListener('click', () => {
  const on = !routesShown();
  state.routes = on;
  state.routesHidden = !on;
  syncRoutes();
});

/* Plum Perks, the one button. It puts the map on the partners and the list on
   the same answer — 277 with a pin, 93 without — and pressing it again is the
   way back to all 2,756 places, so the mode is never a room with no door. */
const listMode = () => (state.deliveryOnly ? 'delivery' : state.perksOnly ? 'perks' : 'all');
function syncPerks(){
  document.getElementById('open-perks')?.setAttribute('aria-pressed', state.perksOnly);
  /* The list's own All | Plum Perks | Delivery only toggle. */
  document.querySelectorAll('#list-mode [data-mode]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.mode === listMode()));
  });
  if (typeof renderSentence === 'function') renderSentence();
}
document.getElementById('list-mode')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-mode]');
  if (!btn || btn.dataset.mode === listMode()) return;
  state.perksOnly = btn.dataset.mode === 'perks';
  state.deliveryOnly = btn.dataset.mode === 'delivery';
  syncPerks();
  closePlace();
  openResultsList();
  /* Delivery only is fourteen kitchens across the city: frame them. */
  scheduleRender({ fit: state.deliveryOnly });
  if (state.view === 'index') renderIndex();
});
document.getElementById('open-perks')?.addEventListener('click', () => {
  state.perksOnly = !state.perksOnly;
  syncPerks();
  closePlace();
  openResultsList();
  scheduleRender({ fit: true });
  /* The grid is a view of the same data, so it answers to the same button. */
  if (state.view === 'index') renderIndex();
});

/* ---------- overlays: routes, metro, clusters and pins ----------
   GL layers over the basemap. Pin art is the SVG pins rasterised once; each
   cluster's count is drawn into its own pin image the first time it is needed. */
const TRAIL = {};
ROUTES.features.forEach(f => { TRAIL[f.properties.id] = f; });
/* Running loops and trails are cream, cycling rides a pale green and thinner,
   both on a casing in the dark purple of the map's names. */
/* The one white, as in wellness-map.css (--white). */
const WHITE = '#F5F4F0';
const ROUTE_COLOUR = WHITE;
const ROUTE_RIDE = '#EEFFCE';
const ROUTE_CASING = '#3F2F8F';
/* The chevrons along a route: a soft violet-grey, so they read without shouting. */
const ROUTE_ARROW = '#968FC0';
/* The Yellow Line's yellow disappears into the North-east zone's ground, so
   it is drawn a deeper mustard. */
const METRO_INK = { '#E2B100': '#B88600' };

const ICONS = `${BASE.replace(/\/?$/, '/')}icons/`;
/* Pin images (scripts/intent-badges.mjs) are 56×56 round badges, shown at
   three quarters of that and rasterised at twice that for sharp screens. The
   Plum Perks star is 74×74 on the same scale, so its body matches a badge's. */
const PIN_W = 42, PIN_H = 42, PIN_RATIO = 2;
/* The Perks star on the map, a step under the badge size it was drawn at. */
const STAR = 48;
/* A cluster is a plain disc: a cream middle in a pale lilac rim, with its
   count on it. CLUSTER_R is the disc's radius, rim included, on a 44px square. */
const CLUSTER_W = 44, CLUSTER_H = 44;
const CLUSTER_R = 20, CLUSTER_RIM = 2.2;
const CLUSTER_FILL = WHITE;
const CLUSTER_RIM_COLOUR = '#DDDBFF';
/* The count, in the purple the map's own street and area names are set in. */
const CLUSTER_INK = '#3F2F8F';
/* ---------- stripes ----------
   The map's lines and clusters as flat bands of colour, after a poster of
   striped columns: two colours alternating along a route,
   a cluster as a bar split by what is in it. */
/* Each category with a pin, by its pin slug, and that pin's colour. */
const BAR_COLOURS = [...new Map(INTENTS.filter((i) => pinColour(i)).map((i) => [i.icon, pinColour(i)])).entries()];
/* Each cluster counts its places by category as it is built. */
const CLUSTER_COUNTS = Object.fromEntries(BAR_COLOURS.map(([slug]) =>
  [`c-${slug}`, ['+', ['case', ['==', ['get', 'slug'], slug], 1, 0]]]));
/* A cluster's bar is named after its make-up, so one image serves every
   cluster with the same counts. */
const BAR_KEY = ['concat', 'bar', ...BAR_COLOURS.flatMap(([slug]) => ['-', ['to-string', ['get', `c-${slug}`]]])];
/* The bar: segments in each category's colour, top to bottom, edged in
   cream, its height by the count (a log scale, 24 to 50 px), and the count
   set in cream inside it, near the top. */
function barImage(counts) {
  const W = 26, H = 56, total = counts.reduce((a, b) => a + b, 0);
  const canvas = document.createElement('canvas');
  canvas.width = W * PIN_RATIO; canvas.height = H * PIN_RATIO;
  const g = canvas.getContext('2d');
  g.scale(PIN_RATIO, PIN_RATIO);
  const h = Math.min(50, 24 + Math.log2(Math.max(1, total)) * 3.2), bw = 19, x = (W - bw) / 2, top = (H - h) / 2;
  /* its flat side, like the pins' */
  g.save();
  g.shadowColor = 'rgba(35,34,30,.2)'; g.shadowBlur = 3; g.shadowOffsetY = 1.5;
  g.fillStyle = 'rgba(63,47,143,.4)';
  g.fillRect(x - 2, top - 2 + 1.2, bw + 4, h + 4);
  g.restore();
  g.fillStyle = WHITE;
  g.fillRect(x - 2, top - 2, bw + 4, h + 4);
  let y = top;
  counts.forEach((n, k) => {
    if (!n) return;
    const sh = (h * n) / total;
    g.fillStyle = BAR_COLOURS[k][1];
    g.fillRect(x, y, bw, sh + 0.5);
    y += sh;
  });
  g.font = `700 ${total > 99 ? 9.5 : 11}px 'DM Sans', ui-sans-serif, system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'top';
  g.lineWidth = 2.5; g.lineJoin = 'round'; g.strokeStyle = 'rgba(35,34,30,.35)';
  g.strokeText(String(total), W / 2, top + 3);
  g.fillStyle = WHITE;
  g.fillText(String(total), W / 2, top + 3);
  return g.getImageData(0, 0, canvas.width, canvas.height);
}
/* Every pin layer is drawn at this size, clusters and the active pin included;
   the active pin's lift and the hover grow are multiples of it. */
const PIN_SCALE = 0.95 * 0.975 * 0.95 * 0.92;
/* A badge is round, so it sits centred on its place rather than pointing at
   it; centring also lines the bigger star up without an offset of its own. */
/* On the paper map a cluster is a little pile of three white squares, the
   same for every cluster, with its count set beside it: it says "more here"
   without competing with the coloured pins. */
const PAPER_CLUSTER_EDGE = '#A8A39A';
function stackImage() {
  const S = 30;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S * PIN_RATIO;
  const g = canvas.getContext('2d');
  g.scale(PIN_RATIO, PIN_RATIO);
  /* back to front, each a step down and to the left */
  for (const [x, y] of [[12, 3], [8, 8], [4, 13]]) {
    g.beginPath(); g.roundRect(x, y, 13, 13, 3);
    g.fillStyle = WHITE; g.fill();
    g.lineWidth = 1.3; g.strokeStyle = PAPER_CLUSTER_EDGE; g.stroke();
  }
  return g.getImageData(0, 0, canvas.width, canvas.height);
}
const PAPER_CLUSTERS = BASEMAP === 'paper';
/* The paper map's lines. Trails: a dashed line in move's blue, rides in
   lavender, each starting at a small square like the pins. Metro: the real
   line colours softened to pastels on a white casing. A plan: charcoal dots,
   its stops numbered in small dark squares. */
const PAPER_LINES = BASEMAP === 'paper';
const PAPER_TRAIL = '#4FA9CC', PAPER_RIDE = '#8F84E8';
/* Routes on paper: a thin line rounded at every end and corner, in blue and
   white. Which way round is the line's edge and which its middle: here a
   white middle inside a blue edge. */
const TRAIL_BLUE = '#3F6CF2', TRAIL_EDGE = '#FFFFFF';
const TRAIL_OUTER = TRAIL_BLUE, TRAIL_INNER = TRAIL_EDGE;
const PAPER_METRO = { '#9B3FB5': '#C29BE2', '#23994A': '#7FCB8E', '#E2B100': '#EFD36B' };
const PAPER_INK = '#3A3730';
/* Names set along a line: spaced capitals that follow its curves and stay
   upright, on a thin white halo so they read across the roads. */
const LINE_TEXT = {
  'symbol-placement': 'line', 'text-font': ['Grenette Pro Regular'], 'text-size': 11,
  'text-letter-spacing': 0.28, 'text-keep-upright': true, 'text-max-angle': 35,
  'text-padding': 4,
};
const LINE_TEXT_PAINT = { 'text-halo-color': WHITE, 'text-halo-width': 1.4 };
function smallSquare(fill, edge, side = 10, r = 2.5) {
  const S = side + 4;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S * PIN_RATIO;
  const g = canvas.getContext('2d');
  g.scale(PIN_RATIO, PIN_RATIO);
  g.beginPath(); g.roundRect(2, 2, side, side, r);
  g.fillStyle = fill; g.fill();
  if (edge) { g.lineWidth = 1.3; g.strokeStyle = edge; g.stroke(); }
  return g.getImageData(0, 0, canvas.width, canvas.height);
}
const PIN_LAYOUT = {
  'icon-anchor': 'center',
  'icon-size': PIN_SCALE,
  'icon-allow-overlap': true,
  'icon-ignore-placement': true,
};
const EMPTY = { type: 'FeatureCollection', features: [] };
const NOT_CLUSTER = ['!', ['has', 'point_count']];
const INTERACTIVE = ['pins', 'pin-active', 'clusters', 'trail-line', 'trail-caps'];

let art = null;
let lastItems = [];
let lastPinned = [];

function loadPinArt(){
  /* One icon that drops on a busy connection used to take every pin with it,
     so each is tried a few times before giving up. */
  const once = (src) => new Promise((ok, fail) => {
    const el = new Image();
    el.onload = () => ok(el);
    el.onerror = () => fail(new Error(`Could not load ${src}`));
    el.src = src;
  });
  const image = (src, tries = 3) => once(src).catch((err) => {
    if (tries <= 1) throw err;
    return new Promise((ok) => setTimeout(ok, 400)).then(() => image(`${src.split('?')[0]}?r=${tries}`, tries - 1));
  });
  /* A category's icon that still fails costs only that category's pins. */
  const icons = (variant) => Promise.all(INTENTS.filter((i) => pinColour(i)).map((i) => image(iconUrl(i, BASE, variant))
    .then((el) => [i.icon, el])
    .catch((err) => { console.warn('Pins:', err.message); return null; })))
    .then((pairs) => Object.fromEntries(pairs.filter(Boolean)));
  const font = document.fonts?.load ? document.fonts.load('500 32px "DM Sans"').catch(() => null) : null;
  return Promise.all([
    icons('pin'),
    image(`${ICONS}perk-star-blank.svg`),
    image(`${ICONS}perk-gift.svg`),
    icons('cream'),
    Promise.race([font, new Promise((ok) => setTimeout(ok, 1500))]),
    icons('tile'),
  ]).then(([pins, starBlank, gift, cream, , tile]) => ({ pins, starBlank, gift, cream, tile }));
}

/* Pins have weight like the toggles' knobs: a flat side under each, its own
   shape in a deeper shade, PIN_DEPTH below it. */
const PIN_DEPTH = 3;
function pinImage(img, draw, w = PIN_W, h = PIN_H, side = null) {
  const canvas = document.createElement('canvas');
  canvas.width = w * PIN_RATIO;
  canvas.height = h * PIN_RATIO;
  const g = canvas.getContext('2d');
  if (side) {
    const t = document.createElement('canvas');
    t.width = canvas.width; t.height = canvas.height;
    const tg = t.getContext('2d');
    /* drawn a touch smaller, so the side shows only below the shape */
    const inset = canvas.width * 0.04;
    tg.drawImage(img, inset, inset, canvas.width - 2 * inset, canvas.height - 2 * inset);
    tg.globalCompositeOperation = 'source-in';
    tg.fillStyle = side; tg.fillRect(0, 0, t.width, t.height);
    g.save();
    g.shadowColor = 'rgba(35,34,30,.22)'; g.shadowBlur = 3 * PIN_RATIO; g.shadowOffsetY = 1.5 * PIN_RATIO;
    g.drawImage(t, 0, PIN_DEPTH * PIN_RATIO);
    g.restore();
  }
  g.drawImage(img, 0, 0, canvas.width, canvas.height);
  draw?.(g);
  return g.getImageData(0, 0, canvas.width, canvas.height);
}

/* A category's pin as a square: a rounded square in its colour, edged in
   cream like the round badge was, with the glyph in its own colours on it.
   The glyph crop is 48 of the badge's 56 units, so it is drawn at that share. */
/* A colour mixed 38% of the way to the page's near-black, for a pin's side. */
const deeper = (hex) => `#${[1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.62 + 0x23 * 0.38)
  .toString(16).padStart(2, '0')).join('')}`;
const SLUG_COLOUR = Object.fromEntries(INTENTS.filter((i) => pinColour(i)).map((i) => [i.icon, pinColour(i)]));
/* A colour taken most of the way down to black in its own hue, for the thin
   edge round a paper-map pin. */
const edgeOf = (hex) => `#${[1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.55)
  .toString(16).padStart(2, '0')).join('')}`;
/* On the paper map a place is a small flat square in its category's colour,
   with a thin edge in a deeper shade of it: no glyph, no rim, no shadow. The
   colour is the category; the prompt's icons carry the same colours. */
const PAPER_PIN = 25, PAPER_PIN_R = 5.5, PAPER_PIN_EDGE = 2.4;
/* The paper map's own set, lighter and brighter than the poster's so the
   squares sit on the grey without going muddy; each keeps its category's
   hue, so it still pairs with that category's icon. */
const PAPER_COLOUR = {
  move: '#9CE3FF', play: '#FF8C7D', 'work-out': '#F2E27C',
  'eat-healthy': '#90E07E', 'get-care': '#FFA8C2', 'clear-my-head': '#C4BBFF',
};
function paperPinImage(slug) {
  const canvas = document.createElement('canvas');
  canvas.width = PIN_W * PIN_RATIO;
  canvas.height = PIN_H * PIN_RATIO;
  const g = canvas.getContext('2d');
  const k = canvas.width / 56;
  const colour = PAPER_COLOUR[slug] || SLUG_COLOUR[slug] || '#998CFC';
  const side = PAPER_PIN * k, at = (canvas.width - side) / 2;
  g.beginPath(); g.roundRect(at, at, side, side, PAPER_PIN_R * k);
  g.fillStyle = colour; g.fill();
  g.lineWidth = PAPER_PIN_EDGE * k; g.strokeStyle = edgeOf(colour); g.stroke();
  return g.getImageData(0, 0, canvas.width, canvas.height);
}
function squarePinImage(slug) {
  if (BASEMAP === 'paper') return paperPinImage(slug);
  const canvas = document.createElement('canvas');
  canvas.width = PIN_W * PIN_RATIO;
  canvas.height = PIN_H * PIN_RATIO;
  const g = canvas.getContext('2d');
  const k = canvas.width / 56;
  /* A touch inside the badge's square, so a square reads no bigger than
     the round badge did. */
  const colour = SLUG_COLOUR[slug] || '#998CFC';
  /* Its side, a deeper shade of its colour, sitting below the cream rim so
     the square stands up off the map like the toggles' knobs. */
  g.save();
  g.shadowColor = 'rgba(35,34,30,.22)'; g.shadowBlur = 4 * k; g.shadowOffsetY = 2 * k;
  g.beginPath(); g.roundRect(2.5 * k, 5.2 * k, 49 * k, 49 * k, 9.5 * k);
  g.fillStyle = deeper(colour); g.fill();
  g.restore();
  /* A little larger than before, so a square reads as big as a Perks star. */
  g.beginPath(); g.roundRect(4 * k, 4 * k, 46 * k, 46 * k, 8 * k);
  g.fillStyle = colour; g.fill();
  g.lineWidth = 3 * k; g.strokeStyle = WHITE; g.stroke();
  g.drawImage(art.tile[slug], 6.4 * k, 6.4 * k, 41.2 * k, 41.2 * k);
  return g.getImageData(0, 0, canvas.width, canvas.height);
}

/* The star with no gift, and a category's cream glyph centred on its body.
   The glyph crop is 48 of the badge's 56 units; on the star it takes 34 of 74,
   centred where the drawn gift sits. */
/* Every mark in a star drawn to the same visible size: each image's ink is
   measured once, then scaled so its larger side is STAR_INK units of the
   star's 74 and centred on the star's body. The category glyphs and the gift
   came at different sizes inside their own boxes, so equal boxes did not
   look equal. */
const STAR_INK = 30, STAR_MID = { x: 37, y: 38 };
const INK = new WeakMap();
function inkBox(img) {
  if (INK.has(img)) return INK.get(img);
  const n = 160, c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, n, n);
  const { data } = g.getImageData(0, 0, n, n);
  let x0 = n, y0 = n, x1 = 0, y1 = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (data[(y * n + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  const box = x1 >= x0 ? { x: x0 / n, y: y0 / n, w: (x1 - x0 + 1) / n, h: (y1 - y0 + 1) / n } : { x: 0, y: 0, w: 1, h: 1 };
  INK.set(img, box);
  return box;
}
function drawInStar(g, img) {
  const k = (STAR * PIN_RATIO) / 74;
  const b = inkBox(img);
  const size = (STAR_INK * k) / Math.max(b.w, b.h);
  const x = STAR_MID.x * k - (b.x + b.w / 2) * size;
  const y = STAR_MID.y * k - (b.y + b.h / 2) * size;
  g.drawImage(img, x, y, size, size);
}
/* On the paper map a Plum Perks partner is the same small flat mark as any
   other place, but a red star: no glyph, no gift, the thin deeper edge. A
   star's points reach out past a square's corners, so it is drawn a little
   larger to read as the same size. */
const PAPER_STAR = '#A0558C';
const STAR_OUTER = 18;
/* A five-point star (outer radius 1) with its corners softened: each corner
   is cut back along both sides and joined by a curve, the points more than
   the notches. Sampled, so the same outline can fill a canvas or a clip. */
function roundStarPts(inner, tipCut = 0.34, notchCut = 0.18) {
  const v = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : 1;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    v.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  const out = [];
  for (let i = 0; i < 10; i++) {
    const p = v[i], a = v[(i + 9) % 10], b = v[(i + 1) % 10];
    const cut = i % 2 ? notchCut : tipCut;
    const to = (q) => { const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy); return [p[0] + (dx / l) * cut, p[1] + (dy / l) * cut]; };
    const s0 = to(a), s1 = to(b);
    /* Six samples a corner: sixty points, as many as the hover star's frames,
       so the one can turn into the other. */
    for (let j = 0; j < 6; j++) {
      const t = j / 5, u = 1 - t;
      out.push([u * u * s0[0] + 2 * u * t * p[0] + t * t * s1[0], u * u * s0[1] + 2 * u * t * p[1] + t * t * s1[1]]);
    }
  }
  return out;
}
function paperStarImage() {
  const canvas = document.createElement('canvas');
  canvas.width = PIN_W * PIN_RATIO;
  canvas.height = PIN_H * PIN_RATIO;
  const g = canvas.getContext('2d');
  const k = canvas.width / 56;
  const cx = canvas.width / 2, cy = canvas.height / 2 + 0.6 * k;
  /* Its points rounded well back, so it reaches a unit further out to read
     the same size. */
  const outer = STAR_OUTER * k, inner = 8.2 * k;
  g.beginPath();
  roundStarPts(inner / outer).forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](cx + x * outer, cy + y * outer));
  g.closePath();
  g.lineJoin = 'round';
  g.fillStyle = PAPER_STAR; g.fill();
  g.lineWidth = PAPER_PIN_EDGE * k; g.strokeStyle = edgeOf(PAPER_STAR); g.stroke();
  return g.getImageData(0, 0, canvas.width, canvas.height);
}
function starImage(glyph) {
  if (BASEMAP === 'paper') return paperStarImage();
  return pinImage(art.starBlank, (g) => { if (glyph) drawInStar(g, glyph); }, STAR, STAR, '#9E1426');
}
/* The star with its gift. No side of its own: it fades in and out over the
   star, whose side and shadow stay put under it. */
function giftStarImage() {
  if (BASEMAP === 'paper') return paperStarImage();
  return pinImage(art.starBlank, (g) => drawInStar(g, art.gift), STAR, STAR);
}

/* The swap. Cross-fading a paint property costs nothing per frame; rewriting
   icon-image on a timer would re-lay out every symbol on the map twice a
   minute. Honours prefers-reduced-motion by settling on the gift, which is the
   half a reader cannot get anywhere else on the map. */
/* Tried at 2s and at 0.5s on the live map. 2s was readable but slow enough to
   miss a cycle while panning; 0.5s read as the map flickering, and left a pin
   mid-dissolve — neither glyph — a third of the time. This sits between them. */
const PERK_SWAP_MS = 1400;
/* The fade has to finish well inside the interval or the two glyphs spend their
   whole life dissolved into each other and neither reads. A third of the beat
   fading leaves two thirds holding still, at any interval. */
const PERK_FADE_MS = Math.round(PERK_SWAP_MS * 0.3);
let perkSwapTimer = 0;
/* Both overlays run off one timer. Two intervals drift apart within a minute,
   and a map where half the swapping pins are mid-fade against the other half
   reads as noise rather than as one behaviour. */
const SWAP_LAYERS = ['perk-gift'];

function startPerkSwap() {
  clearInterval(perkSwapTimer);
  const live = () => SWAP_LAYERS.filter((id) => map?.getLayer(id));
  if (!live().length) return;
  const set = (on) => {
    live().forEach((id) => map.setPaintProperty(id, 'icon-opacity', unlessHidden(on ? 1 : 0)));
    perkMarkOn = on;
    frameEl?.querySelectorAll('.pin-hover').forEach((el) => el.classList.toggle('mark-off', !on));
  };
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    set(true);
    return;
  }
  let showMark = true;
  set(true);
  perkSwapTimer = setInterval(() => {
    if (!live().length) { clearInterval(perkSwapTimer); return; }
    /* Under the intro cards the partners hold still on the Plum Perks gift;
       the swap with their category's glyph starts once the map is the page. */
    if (introEl && !introEl.hidden) {
      if (!showMark) { showMark = true; set(true); }
      return;
    }
    showMark = !showMark;
    set(showMark);
  }, PERK_SWAP_MS);
}

/* The disc, the same for every cluster; the count goes over it on its own layer. */
function discImage() {
  const canvas = document.createElement('canvas');
  canvas.width = CLUSTER_W * PIN_RATIO;
  canvas.height = CLUSTER_H * PIN_RATIO;
  const g = canvas.getContext('2d');
  const c = canvas.width / 2;
  g.fillStyle = CLUSTER_RIM_COLOUR;
  g.beginPath(); g.arc(c, c, CLUSTER_R * PIN_RATIO, 0, Math.PI * 2); g.fill();
  g.fillStyle = CLUSTER_FILL;
  g.beginPath(); g.arc(c, c, (CLUSTER_R - CLUSTER_RIM) * PIN_RATIO, 0, Math.PI * 2); g.fill();
  return g.getImageData(0, 0, canvas.width, canvas.height);
}

/* A cluster's count in DM Sans, in purple, drawn over the disc (the cluster-counts layer). */
function clusterImage(n) {
  const canvas = document.createElement('canvas');
  canvas.width = CLUSTER_W * PIN_RATIO;
  canvas.height = CLUSTER_H * PIN_RATIO;
  const g = canvas.getContext('2d');
  g.font = `500 ${12 * PIN_RATIO}px 'DM Sans', ui-sans-serif, system-ui, sans-serif`;
  g.fillStyle = CLUSTER_INK;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(n), canvas.width / 2, canvas.height / 2);
  return g.getImageData(0, 0, canvas.width, canvas.height);
}

/* Cluster counts used to be baked ahead, 2 to 500, the first forty at once and
   the rest in idle time: about a second of main-thread work on every open.
   The count layer is hidden now that a cluster is a bar, so nothing asks for
   them; styleimagemissing still draws one if the layer ever comes back. */

/* A chevron pointing along the line it is placed on. */
function arrowImage() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 14;
  const g = canvas.getContext('2d');
  g.fillStyle = ROUTE_ARROW;
  g.beginPath();
  g.moveTo(11, 7);
  g.lineTo(3.5, 2.5);
  g.lineTo(3.5, 11.5);
  g.closePath();
  g.fill();
  return g.getImageData(0, 0, 14, 14);
}

const activeFilter = (on) => ['all', NOT_CLUSTER, [on ? '==' : '!=', ['get', 'id'], state.active || '']];
/* A partner pin is the same size as every other — the swap is the signal. */
const IS_PERK = ['==', ['get', 'perk'], 1];
/* Symbols draw in ascending sort key, so the partners take the higher key
   and are drawn last, over their neighbours. (With 0 for partners they sat
   under them, and only the gift layer above lifted them out, so each partner
   bobbed in front and behind as that layer faded on its timer.) */
const PERK_ON_TOP = ['case', IS_PERK, 1, 0];
/* The gift sits on the pin the reader is not looking at yet, so it is excluded
   while that pin is the active one — the enlarged active pin would show the
   gift at the wrong size on top of itself. */
const perkGiftFilter = () => ['all', NOT_CLUSTER, IS_PERK, ['!=', ['get', 'id'], state.active || '']];

function addOverlays(){
  if (!map || !art) return;
  /* After a hot reload the source already exists — still warm cluster pins. */
  if (map.getSource('places')) {
    startPerkSwap();
    return;
  }
  Object.entries(art.pins).forEach(([slug, img]) => {
    if (map.hasImage(`pin-${slug}`)) map.removeImage(`pin-${slug}`);
    map.addImage(`pin-${slug}`, art.tile?.[slug] ? squarePinImage(slug) : pinImage(img), { pixelRatio: PIN_RATIO });
    /* Replaced rather than skipped, so a hot reload picks up a changed glyph. */
    /* A partner is the Perks star: with the category's glyph in cream, and
       with its gift, cross-fading between the two. */
    const cuts = [
      ['-perkcat', starImage(art.cream[slug])],
      ['-perk', giftStarImage()],
    ];
    cuts.forEach(([suffix, data]) => {
      const id = `pin-${slug}${suffix}`;
      if (map.hasImage(id)) map.removeImage(id);
      map.addImage(id, data, { pixelRatio: PIN_RATIO });
    });
  });
  if (!map.hasImage('trail-arrow')) map.addImage('trail-arrow', arrowImage(), { pixelRatio: 2 });
  if (PAPER_CLUSTERS && !map.hasImage('cluster-stack')) map.addImage('cluster-stack', stackImage(), { pixelRatio: PIN_RATIO });
  /* The metro's stations are ink dots on its lines, like stops on a poster. */
  if (PAPER_LINES && !map.hasImage('metro-dot')) {
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d'); g.beginPath(); g.arc(8, 8, 5, 0, Math.PI * 2); g.fillStyle = '#1E1B18'; g.fill();
    map.addImage('metro-dot', g.getImageData(0, 0, 16, 16), { pixelRatio: 2 });
  }
  /* A route's ends: a small blue dot in the same white edge. */
  if (PAPER_LINES && !map.hasImage('trail-cap-run')) {
    const ring = () => {
      const c = document.createElement('canvas'); c.width = c.height = 28;
      /* Drawn at twice size: a blue dot whose white edge (1px) matches the line's. */
      const g = c.getContext('2d'); g.beginPath(); g.arc(14, 14, 5.6, 0, Math.PI * 2);
      g.fillStyle = TRAIL_INNER; g.fill(); g.lineWidth = 2.4; g.strokeStyle = TRAIL_OUTER; g.stroke();
      return g.getImageData(0, 0, 28, 28);
    };
    map.addImage('trail-cap-run', ring(), { pixelRatio: 2 });
    map.addImage('trail-cap-ride', ring(), { pixelRatio: 2 });
  }
  if (map.hasImage('cluster-disc')) map.removeImage('cluster-disc');
  map.addImage('cluster-disc', discImage(), { pixelRatio: PIN_RATIO });

  /* A map grid: lines every 0.01° (about a kilometre) of latitude and
     longitude over the city and a margin round it, faint and fine, under the
     names and everything drawn on the map. A test. */
  if (POSTER && !map.getSource('grid')) {
    const lines = [];
    const [w, sth, e, n] = [72.72, 18.85, 73.12, 19.36];
    for (let x = w; x <= e + 1e-9; x += 0.01) lines.push([[+x.toFixed(2), sth], [+x.toFixed(2), n]]);
    for (let y = sth; y <= n + 1e-9; y += 0.01) lines.push([[w, +y.toFixed(2)], [e, +y.toFixed(2)]]);
    map.addSource('grid', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: lines } } });
    map.addLayer({ id: 'map-grid', type: 'line', source: 'grid',
      paint: { 'line-color': '#3F2F8F', 'line-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.055, 14, 0.095], 'line-width': 0.6 } },
      LABEL_LAYERS.find((id) => map.getLayer(id)));
  }
  map.addSource('trails', { type: 'geojson', data: EMPTY, promoteId: 'id' });
  map.addSource('trail-caps', { type: 'geojson', data: EMPTY });
  map.addSource('metro', { type: 'geojson', data: METRO });
  map.addSource('metro-stations', { type: 'geojson', data: METRO_STATIONS });
  map.addSource('places', {
    type: 'geojson', data: EMPTY,
    cluster: true,
    clusterRadius: CLUSTER_RADIUS,
    clusterMaxZoom: CLUSTER_MAX_ZOOM,
    clusterProperties: CLUSTER_COUNTS,
  });

  const round = { 'line-cap': 'round', 'line-join': 'round' };
  const hovered = ['boolean', ['feature-state', 'hover'], false];
  const cycle = ['==', ['get', 'g'], 'cycle'];
  const metro = metroOn ? 'visible' : 'none';
  [
    /* A route is a striped band, a mid violet under and white blocks over
       it, butt-ended so the blocks are square. */
    { id: 'trail-casing', type: 'line', source: 'trails', layout: { 'line-join': 'round', 'line-cap': PAPER_LINES ? 'round' : 'butt' },
      /* On paper, the ink edge under the yellow. */
      paint: PAPER_LINES ? {
        'line-color': TRAIL_OUTER,
        'line-width': ['case', hovered, 7, 5.6],
      } : { 'line-color': '#6E62C4',
        'line-width': ['case', cycle, ['case', hovered, 5, 4], ['case', hovered, 6.5, 5.5]] } },
    { id: 'trail-line', type: 'line', source: 'trails', layout: { 'line-join': 'round', 'line-cap': PAPER_LINES ? 'round' : 'butt' },
      /* On paper, the yellow line itself. */
      paint: PAPER_LINES ? {
        'line-color': TRAIL_INNER,
        'line-width': ['case', hovered, 3.8, 2.6],
      } : {
        'line-color': WHITE,
        'line-width': ['case', cycle, ['case', hovered, 5, 4], ['case', hovered, 6.5, 5.5]],
        'line-dasharray': [1.8, 1.8],
      } },
    { id: 'trail-arrows', type: 'symbol', source: 'trails',
      layout: {
        ...(PAPER_LINES && { visibility: 'none' }),
        'symbol-placement': 'line', 'symbol-spacing': 160, 'icon-image': 'trail-arrow',
        'icon-allow-overlap': true, 'icon-ignore-placement': true,
      } },
    PAPER_LINES
      ? { id: 'trail-caps', type: 'symbol', source: 'trail-caps',
        layout: { 'icon-image': ['case', ['==', ['get', 'ink'], ROUTE_RIDE], 'trail-cap-ride', 'trail-cap-run'],
          'icon-allow-overlap': true, 'icon-ignore-placement': true } }
      : { id: 'trail-caps', type: 'circle', source: 'trail-caps',
        paint: {
          'circle-radius': 3,
          'circle-stroke-width': 2,
          'circle-color': ['case', ['==', ['get', 'kind'], 'end'], ROUTE_CASING, ['get', 'ink']],
          'circle-stroke-color': ['case', ['==', ['get', 'kind'], 'end'], ['get', 'ink'], ROUTE_CASING],
        } },
    ...(PAPER_LINES ? [{ id: 'trail-labels', type: 'symbol', source: 'trails', minzoom: 13.5,
      layout: { ...LINE_TEXT, 'text-field': ['upcase', ['get', 'name']], 'text-size': 9.5, 'symbol-spacing': 320,
        'text-offset': [0, -0.85] },
      paint: { ...LINE_TEXT_PAINT, 'text-color': TRAIL_BLUE } }] : []),
    { id: 'metro-casing', type: 'line', source: 'metro', layout: { ...round, visibility: metro },
      paint: { 'line-color': WHITE, 'line-width': PAPER_LINES ? 5 : 4.5, 'line-opacity': 0.95 } },
    { id: 'metro-line', type: 'line', source: 'metro', layout: { ...round, visibility: metro },
      paint: {
        'line-color': ['match', ['to-string', ['get', 'colour']],
          ...Object.entries(PAPER_LINES ? PAPER_METRO : METRO_INK).flat(), ['coalesce', ['get', 'colour'], '#3A3934']],
        'line-width': PAPER_LINES ? 2.6 : 2.2,
      } },
    /* On the paper map a line's name is set along it, in spaced capitals in a
       deeper shade of its colour, the way names follow the paths on a board
       game's tiles. */
    /* Each station an ink dot on its line. */
    ...(PAPER_LINES ? [{ id: 'metro-stations', type: 'symbol', source: 'metro-stations', minzoom: 11,
      layout: { visibility: metro, 'icon-image': 'metro-dot', 'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.55, 15, 1],
        'icon-allow-overlap': true, 'icon-ignore-placement': true } }] : []),
    ...(PAPER_LINES ? [{ id: 'metro-labels', type: 'symbol', source: 'metro',
      layout: { visibility: metro, ...LINE_TEXT, 'text-field': ['upcase', ['get', 'name']], 'symbol-spacing': 420 },
      paint: { ...LINE_TEXT_PAINT, 'text-color': ['match', ['to-string', ['get', 'colour']],
        ...Object.entries(PAPER_METRO).flatMap(([k, v]) => [k, edgeOf(v)]), '#5A5650'] } }] : []),
    /* A cluster is a bar split by its categories, its count beside it. */
    { id: 'clusters', type: 'symbol', source: 'places', filter: ['has', 'point_count'],
      layout: PAPER_CLUSTERS
        /* The stack alone: no count beside it. */
        ? { ...PIN_LAYOUT, 'icon-size': 1, 'icon-image': 'cluster-stack' }
        : { ...PIN_LAYOUT, 'icon-image': BAR_KEY } },
    { id: 'cluster-counts', type: 'symbol', source: 'places', filter: ['has', 'point_count'],
      layout: { ...PIN_LAYOUT, visibility: 'none', 'icon-image': ['concat', 'cluster-', ['to-string', ['get', 'point_count']]] } },
    { id: 'pins', type: 'symbol', source: 'places', filter: activeFilter(false),
      layout: {
        ...PIN_LAYOUT,
        'icon-image': ['get', 'icon'],
        'symbol-sort-key': PERK_ON_TOP,
      },
      /* Hidden and shown in one step under a lifted copy (hidePin). */
      paint: { 'icon-opacity-transition': { duration: 0, delay: 0 } } },
    /* The gift, over the partner pin's own glyph, cross-fading on a timer. */
    { id: 'perk-gift', type: 'symbol', source: 'places', filter: perkGiftFilter(),
      layout: {
        ...PIN_LAYOUT,
        /* On paper the partner's pin is already the star, and the gift is
           the same star: drawn twice, its edge doubled. So it is left off. */
        ...(BASEMAP === 'paper' && { visibility: 'none' }),
        'icon-image': ['concat', 'pin-', ['get', 'slug'], '-perk'],
        'symbol-sort-key': PERK_ON_TOP,
      },
      paint: { 'icon-opacity': 1, 'icon-opacity-transition': { duration: PERK_FADE_MS, delay: 0 } } },
    { id: 'pin-active', type: 'symbol', source: 'places', filter: activeFilter(true),
      layout: { ...PIN_LAYOUT, 'icon-image': ['get', 'icon'], 'icon-size': 1.3 * PIN_SCALE },
      /* On paper the picked pin is drawn as its gooey blob (gooFor) instead;
         the layer stays, invisible, so it can still be clicked. */
      ...(BASEMAP === 'paper' && { paint: { 'icon-opacity': 0 } }) },
  ].forEach((layer) => map.addLayer(layer));
  addPlumHQ();
  wireOverlayEvents();
  startPerkSwap();
  drawMap(lastItems);
}

/* ---------- Plum's office ----------
   Not a place to be well, so not in the list, the filters or the counts: a
   pin of its own, the heart from Plum's mark, always on the map. Its name
   under the pointer; a tap gives its line. */
const PLUM_HQ = {
  name: 'Plum HQ',
  /* Plum's office is in Bengaluru, off this map, so no pin. Set [lon, lat]
     to show one (Bengaluru's was [77.7324518, 12.9890782]). */
  at: null,
};
const hqEl = document.createElement('div');
hqEl.className = 'pin-label map-tip hq-tip';
hqEl.hidden = true;
frameEl?.appendChild(hqEl);
function showHQ(full) {
  const p = onFrame(PLUM_HQ.at);
  if (full !== undefined) {
    hqEl.classList.toggle('is-full', !!full);
    hqEl.innerHTML = full
      ? '<strong class="hq-name">Plum HQ</strong><span class="hq-line">India’s best employee health benefits partner (and amateur cartographer).</span>'
      : '<strong class="hq-name">Plum HQ</strong>';
  }
  hqEl.hidden = false;
  /* Beside the heart, as a place's name sits beside its pin. */
  hqEl.style.transform = `translate(${Math.round(p.x + 18)}px, ${Math.round(p.y)}px) translateY(-50%)`;
}
let hqPinned = false, hqMarker = null;
/* A marker rather than a map layer, so it can grow a little under the
   pointer (less than a place's pin does), its edge keeping its width. */
function addPlumHQ() {
  if (hqMarker || !PLUM_HQ.at) return;
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'hq-pin';
  el.setAttribute('aria-label', PLUM_HQ.name);
  el.innerHTML = PLUM_HEART;
  el.addEventListener('mouseenter', () => { if (!hqPinned) showHQ(false); });
  el.addEventListener('mouseleave', () => { if (!hqPinned) hqEl.hidden = true; });
  el.addEventListener('click', (e) => { e.stopPropagation(); hqPinned = true; showHQ(true); });
  hqMarker = new Marker({ element: el, anchor: 'center' }).setLngLat(PLUM_HQ.at).addTo(map);
  map.on('move', () => { if (!hqEl.hidden) showHQ(); });
  /* A click anywhere else puts the line away. */
  document.addEventListener('click', (e) => {
    if (hqPinned && !el.contains(e.target)) { hqPinned = false; hqEl.hidden = true; }
  });
}

/* ---------- hover labels ---------- */
const tipEl = document.createElement('div');
tipEl.className = 'pin-label map-tip';
tipEl.hidden = true;
frameEl?.appendChild(tipEl);
function showTip(text, at, lift) {
  const p = onFrame(at);
  tipEl.textContent = text;
  tipEl.hidden = false;
  tipEl.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y - lift)}px) translate(-50%, -100%)`;
}
function hideTip() { tipEl.hidden = true; }

/* ---------- hover lift ---------- */
/* A hovered pin grows by PIN_HOVER_LIFT over PIN_HOVER_MS, and shrinks back
   over the same when the pointer leaves. icon-size is a layout property, so
   animating it on the layer would re-lay the whole places source every frame
   and stutter. Instead a copy of the pin is drawn over it in the DOM, where a
   CSS transform runs smoothly, and removed once it has shrunk back. */
const PIN_HOVER_LIFT = 1.1;
const PIN_HOVER_MS = 300;
let perkMarkOn = true;
let lifted = null;
/* The map's own pin under a lifted copy is hidden while the copy is up. A
   round badge covers its original even turned, but a turned star leaves the
   original's points showing behind it. */
let hiddenPin = '';
const unlessHidden = (opacity) => ['case', ['==', ['get', 'id'], hiddenPin], 0, opacity];
function hidePin(id) {
  hiddenPin = id || '';
  if (map?.getLayer('pins')) map.setPaintProperty('pins', 'icon-opacity', unlessHidden(1));
  if (map?.getLayer('perk-gift')) {
    /* The gift's slow cross-fade is for its timer; a pin lifted for hover
       goes, and comes back, at once (or its star lingers beside the copy, or
       fades in after the copy has gone). The fade returns once drawn. */
    map.setPaintProperty('perk-gift', 'icon-opacity-transition', { duration: 0, delay: 0 });
    map.setPaintProperty('perk-gift', 'icon-opacity', unlessHidden(perkMarkOn ? 1 : 0));
    map.once('render', () => map.getLayer('perk-gift') && map.setPaintProperty('perk-gift', 'icon-opacity-transition', { duration: PERK_FADE_MS, delay: 0 }));
  }
}
function pinCanvas(id) {
  const img = map.getImage(id);
  if (!img) return null;
  const { width, height, data } = img.data;
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
  c.style.width = `${(width / img.pixelRatio) * PIN_SCALE}px`;
  c.style.height = `${(height / img.pixelRatio) * PIN_SCALE}px`;
  return c;
}
/* On paper a pin under the pointer, or picked, goes fluid: it grows a little
   and its edge shifts gently, the square's corners softening and firming in
   turn. A partner's star keeps its shape and only wavers at the edges. */
/* The star is drawn as an SVG outline whose points are moved each frame:
   many points sampled round the curve, the same number in every shape, so
   one eases into the next. It opens from the pin's crisp star into a fat,
   blunt one and then its edge keeps rippling. Its stroke does not scale, so
   it keeps the resting pin's width all through, as the squares' does. */
function starPts(inner, smooth, wobble = [], turn = 0, N = 60) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = (i % 2 ? inner : 1) * (1 + (wobble[i] || 0));
    const a = -Math.PI / 2 + turn + (i * Math.PI) / 5;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  const n = pts.length, P = (i) => pts[(i + n) % n];
  const out = [];
  const per = N / n;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
    const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * smooth, p1[1] + ((p2[1] - p0[1]) / 6) * smooth];
    const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * smooth, p2[1] - ((p3[1] - p1[1]) / 6) * smooth];
    for (let j = 0; j < per; j++) {
      const t = j / per, u = 1 - t;
      out.push([u * u * u * p1[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p2[0],
        u * u * u * p1[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p2[1]]);
    }
  }
  return out;
}
/* The resting star's own shape (inner radius 8.2 of STAR_OUTER), and the loose
   frames: symmetric, the star breathing (its inner points easing in and out)
   and turning a few degrees, so the outline stays clean rather than lumpy. */
const STAR_REST = roundStarPts(8.2 / STAR_OUTER);
/* Fat and soft, nearly round: a star only in its five gentle lobes. */
const STAR_LOOSE = [starPts(0.78, 1, [], 0), starPts(0.86, 1, [], 0.07), starPts(0.78, 1, [], 0), starPts(0.86, 1, [], -0.07)];
const STAR_OPEN_MS = 450, STAR_RIPPLE_MS = 3200;
{
  const tag = document.createElement('style');
  tag.textContent = '.goo-star{animation:star-in .45s cubic-bezier(.2,.8,.2,1) both}';
  document.head.appendChild(tag);
}
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const mixPts = (a, b, t) => a.map((p, i) => [p[0] + (b[i][0] - p[0]) * t, p[1] + (b[i][1] - p[1]) * t]);
/* Runs a star copy's edge until it leaves the page; el.settleStar(ms) eases
   it back into the resting star. */
function driveStar(el, poly) {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cur = STAR_REST, from = STAR_REST, phase = still ? 'done' : 'open', t0 = performance.now(), dur = STAR_OPEN_MS;
  const draw = (pts) => { cur = pts; poly.setAttribute('points', pts.map(([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`).join(' ')); };
  draw(STAR_REST);
  el.settleStar = (ms) => { from = cur; phase = 'close'; t0 = performance.now(); dur = ms; if (still) draw(STAR_REST); };
  const tick = (now) => {
    if (!el.isConnected && now - t0 > 200) return;
    const t = Math.min(1, (now - t0) / dur);
    if (phase === 'open') {
      draw(mixPts(STAR_REST, STAR_LOOSE[0], easeOut(t)));
      if (t >= 1) { phase = 'ripple'; t0 = now; }
    } else if (phase === 'ripple') {
      const f = (((now - t0) % STAR_RIPPLE_MS) / STAR_RIPPLE_MS) * 4, k = Math.floor(f);
      draw(mixPts(STAR_LOOSE[k], STAR_LOOSE[(k + 1) % 4], easeInOut(f - k)));
    } else if (phase === 'close') {
      draw(mixPts(from, STAR_REST, easeOut(t)));
      if (t >= 1) phase = 'done';
    }
    if (phase !== 'done') requestAnimationFrame(tick);
  };
  if (!still) requestAnimationFrame(tick);
}
function starGoo(size) {
  /* At rest exactly the map's star: its fill reaching STAR_OUTER of the pin's 56
     units, a 2.4-unit stroke on the line, round at the joins, and sitting
     0.6 units below the pin's centre. */
  const u = (size * PIN_SCALE) / 56;
  const el = document.createElement('div');
  el.className = 'goo-star';
  el.style.setProperty('--s', `${(2 * STAR_OUTER * u).toFixed(2)}px`);
  el.style.top = `${(0.6 * u).toFixed(2)}px`;
  el.innerHTML = `<svg viewBox="-1 -1 2 2" aria-hidden="true"><polygon fill="${PAPER_STAR}" stroke="${edgeOf(PAPER_STAR)}" stroke-width="${(PAPER_PIN_EDGE * u).toFixed(2)}" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
  driveStar(el, el.querySelector('polygon'));
  return el;
}
function gooFor({ k, perk, icon }, size) {
  if (Number(perk)) return starGoo(size);
  const c = paperColourOf(k) || '#C4BBFF';
  const g = document.createElement('div');
  g.className = 'goo';
  g.style.setProperty('--c', c);
  g.style.setProperty('--e', edgeOf(c));
  /* At rest it is exactly the map's pin, outline and all, so it grows out of
     the pin and shrinks back into it without a jump. */
  const u = (size * PIN_SCALE) / 56, edge = PAPER_PIN_EDGE * u;
  g.style.setProperty('--b', `${edge.toFixed(2)}px`);
  /* Its box counts the outline in (border-box), as the pin's outer edge does. */
  g.style.setProperty('--s', `${((PAPER_PIN + PAPER_PIN_EDGE) * u).toFixed(2)}px`);
  return g;
}
function liftPin(f, point) {
  const { id, icon, slug } = f.properties;
  if (lifted?.id === id) return;
  dropPin();
  const base = pinCanvas(icon);
  if (!base) return;
  const el = document.createElement('div');
  el.className = 'pin-hover';
  el.classList.toggle('mark-off', !perkMarkOn);
  el.style.setProperty('--pin-lift', PIN_HOVER_LIFT);
  el.style.setProperty('--pin-lift-ms', `${PIN_HOVER_MS}ms`);
  el.style.setProperty('--pin-mark-ms', `${PERK_FADE_MS}ms`);
  const art = document.createElement('div');
  art.className = 'pin-hover-art';
  if (BASEMAP === 'paper') art.append(gooFor(f.properties, base.width / PIN_RATIO));
  else art.append(base);
  /* The gift that swaps over a partner pin comes along, on the same beat as
     the one on the map. */
  if (BASEMAP !== 'paper') SWAP_LAYERS.filter((l) => map.getLayer(l)).forEach((l) => {
    if (!map.queryRenderedFeatures(point, { layers: [l] }).some((m) => m.properties.id === id)) return;
    const mark = pinCanvas(`pin-${slug}-perk`);
    if (mark) art.append(Object.assign(mark, { className: 'pin-hover-mark' }));
  });
  el.append(art);
  /* The name rides with the pin: it grows in beside it on the same beat as
     the lift, and goes with it when the pointer leaves. */
  const name = document.createElement('span');
  name.className = 'pin-name';
  name.textContent = f.properties.n;
  el.append(name);
  const p = onFrame(f.geometry.coordinates);
  /* Unrounded, so the copy sits exactly over the map's pin, which is drawn
     at its true, fractional spot. */
  el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
  frameEl?.appendChild(el);
  lifted = { id, el, at: f.geometry.coordinates };
  /* Its row in the list lights up with it. */
  cardsEl?.querySelectorAll('.prow.is-hot').forEach((x) => x.classList.remove('is-hot'));
  cardsEl?.querySelector(`.prow[data-id="${CSS.escape(id)}"]`)?.classList.add('is-hot');
  hidePin(id);
  /* Read layout once so the scale starts from 1 rather than landing on 1.1. */
  void el.offsetWidth;
  el.classList.add('is-lifted');
}
function dropPin() {
  if (!lifted) return;
  const { el } = lifted;
  lifted = null;
  cardsEl?.querySelectorAll('.prow.is-hot').forEach((x) => x.classList.remove('is-hot'));
  /* The fluid shape eases back to the plain pin rather than snapping. */
  const blob = el.querySelector('.goo, .goo-star');
  if (blob) {
    const cs = getComputedStyle(blob);
    const from = { width: cs.width, height: cs.height, margin: cs.margin, borderRadius: cs.borderRadius };
    const s = cs.getPropertyValue('--s');
    blob.style.animation = 'none';
    blob.animate([from, { width: s, height: s, margin: '0px', borderRadius: blob.classList.contains('goo') ? '24%' : cs.borderRadius }],
      { duration: PIN_HOVER_MS, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' });
    /* The star's rippling edge eases back into the resting star's points. */
    blob.settleStar?.(PIN_HOVER_MS);
  }
  el.classList.remove('is-lifted');
  setTimeout(() => {
    /* The map's pin comes back first, under the copy, and the copy goes only
       once the map has drawn it, so there is never a frame with neither. */
    if (!lifted) hidePin('');
    const done = () => requestAnimationFrame(() => el.remove());
    if (map && !lifted) { map.once('render', done); map.triggerRepaint(); setTimeout(done, 120); } else done();
  }, PIN_HOVER_MS);
}
/* A lifted pin keeps to its spot on every frame the map moves, so it never
   lags or jumps while the map pans or zooms under it. */
map?.on('move', () => {
  if (!lifted?.at) return;
  const p = onFrame(lifted.at);
  lifted.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
});
/* Straight away, for when the map moves out from under it or the pin is picked. */
function clearLift() {
  lifted = null;
  frameEl?.querySelectorAll('.pin-hover').forEach((el) => el.remove());
  hidePin('');
}

let overlayEvents = false;
function wireOverlayEvents(){
  if (overlayEvents) return;
  overlayEvents = true;
  const pointer = (on) => { map.getCanvas().style.cursor = on ? 'pointer' : ''; };
  ['pins', 'pin-active'].forEach((id) => {
    map.on('mousemove', id, (e) => {
      const f = e.features[0];
      pointer(true);
      /* The active pin is already lifted, and already named, so only the
         others grow and take their name on hover. */
      if (id === 'pins') liftPin(f, e.point);
    });
    map.on('mouseleave', id, () => { pointer(false); if (id === 'pins') dropPin(); });
    map.on('click', id, (e) => { clearLift(); select(e.features[0].properties.id, true); });
  });
  map.on('mouseenter', 'clusters', () => pointer(true));
  map.on('mouseleave', 'clusters', () => pointer(false));
  map.on('click', 'clusters', async (e) => {
    const f = e.features[0];
    const zoom = await map.getSource('places').getClusterExpansionZoom(f.properties.cluster_id);
    map.easeTo({ center: f.geometry.coordinates, zoom: Math.min(zoom, MAX_ZOOM), duration: 350 });
  });
  let hoverId = null;
  const setHover = (id) => {
    if (hoverId != null) map.setFeatureState({ source: 'trails', id: hoverId }, { hover: false });
    hoverId = id;
    if (id != null) map.setFeatureState({ source: 'trails', id }, { hover: true });
  };
  map.on('mousemove', 'trail-line', (e) => {
    const f = e.features[0];
    const r = BY_ID.get(f.properties.id);
    pointer(true);
    setHover(f.id);
    /* A pin on the route has the pointer first: its own name shows, not the route's. */
    const onPin = map.queryRenderedFeatures(e.point, { layers: ['pins', 'pin-active'].filter((l) => map.getLayer(l)) }).length;
    if (onPin) { hideTip(); return; }
    if (r) showTip(f.properties.km ? `${r.n} · ${f.properties.km} km` : r.n, [e.lngLat.lng, e.lngLat.lat], 14);
  });
  map.on('mouseleave', 'trail-line', () => { pointer(false); setHover(null); hideTip(); });
  ['trail-line', 'trail-caps'].forEach((id) => {
    map.on('click', id, (e) => select(e.features[0].properties.id, true));
  });
  /* A click on the map itself, rather than on anything drawn on it, closes the card. */
  map.on('click', (e) => {
    const layers = INTERACTIVE.filter((id) => map.getLayer(id));
    if (!layers.length || !map.queryRenderedFeatures(e.point, { layers }).length) closePlace();
  });
  map.on('movestart', (e) => {
    hideTip(); clearLift();
    /* Moved by hand after a tab was picked: the tabs fold to their icons. */
    if (tabPicked && e.originalEvent) foldTabs();
  });
}

/* Cluster counts are drawn on demand, once each. */
/* A cluster pin is named after its own count — cluster-1362 — and the counts
 * that have not been baked yet arrive here. Adding the image is only half of
 * it: the tile's symbol bucket was built while the image was missing, and it
 * does not pick one up afterwards. MapLibre fires styleimagemissing once per
 * id, so without a rebuild that cluster never paints at all.
 *
 * On a first open of the whole map that was the biggest cluster on the
 * screen: 1,362 places over the centre of the city, invisible, while the
 * eleven that did paint summed to 1,394 of 2,756. The count in the panel was
 * right and the map under it was missing half the pins.
 *
 * So: bake the image, then rebuild the source once, on the next frame. One
 * rebuild however many images a frame asks for, and only when something was
 * actually added. */
let clusterImagesAdded = false;
map?.on('styleimagemissing', (e) => {
  if (map.hasImage(e.id)) return;
  const bar = /^bar((?:-\d+)+)$/.exec(e.id);
  const n = /^cluster-(\d+)$/.exec(e.id);
  if (bar) map.addImage(e.id, barImage(bar[1].slice(1).split('-').map(Number)), { pixelRatio: PIN_RATIO });
  else if (n && art) map.addImage(e.id, clusterImage(Number(n[1])), { pixelRatio: PIN_RATIO });
  else return;
  if (clusterImagesAdded) return;
  clusterImagesAdded = true;
  requestAnimationFrame(() => {
    clusterImagesAdded = false;
    const places = map?.getSource('places');
    if (places) places.setData(placeFeatures(lastItems));
  });
});

/* ---------- routes ---------- */
/* ---------- connect the dots ----------
   Surprise me's plan is drawn like a connect-the-dots puzzle: its places are
   numbered, and a line is drawn joining them in order. Each puzzle is its own pair of sources (dots, and the line that joins
   them) under the pins, with its numbers over them. `join` is how much of the
   path is drawn, 0 to 1, and moving it draws the line on rather than cutting. */
const DOT_INK = '#3F2F8F';
const PUZZLES = {};
const lngLatDist = ([x1, y1], [x2, y2]) => {
  const k = Math.cos(((y1 + y2) / 2) * Math.PI / 180);
  return Math.hypot((x2 - x1) * k, y2 - y1);
};
/* The path's first `f` of its length. */
function pathUpTo(coords, f) {
  if (f >= 1) return coords;
  const seg = coords.slice(1).map((c, i) => lngLatDist(coords[i], c));
  let left = seg.reduce((a, b) => a + b, 0) * Math.max(0, f);
  const out = [coords[0]];
  for (let i = 0; i < seg.length; i++) {
    if (left >= seg[i]) { out.push(coords[i + 1]); left -= seg[i]; continue; }
    const t = seg[i] ? left / seg[i] : 0;
    out.push([coords[i][0] + (coords[i + 1][0] - coords[i][0]) * t, coords[i][1] + (coords[i + 1][1] - coords[i][1]) * t]);
    break;
  }
  return out.length > 1 ? out : [coords[0], coords[0]];
}
function puzzleLayers(key, o) {
  if (map.getSource(`puzzle-${key}`)) return;
  map.addSource(`puzzle-${key}`, { type: 'geojson', data: EMPTY });
  map.addSource(`puzzle-${key}-line`, { type: 'geojson', data: EMPTY });
  const under = map.getLayer('clusters') ? 'clusters' : undefined;
  map.addLayer({ id: `puzzle-${key}-join`, type: 'line', source: `puzzle-${key}-line`,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': o.ink, 'line-width': o.lineWidth || 2, ...(o.dotted && { 'line-dasharray': [0, 2] }), ...(o.dash && { 'line-dasharray': o.dash }) } }, under);
  if (o.dots !== false) {
    map.addLayer({ id: `puzzle-${key}-dots`, type: 'circle', source: `puzzle-${key}`,
      paint: { 'circle-radius': o.dotRadius || 3.4, 'circle-color': o.ink, 'circle-stroke-width': 1.5, 'circle-stroke-color': WHITE } }, under);
  }
  /* The numbers sit over everything, pins included, so a plan's 1-2-3 reads. */
  if (o.badge && o.square) {
    if (!map.hasImage('plan-badge')) map.addImage('plan-badge', smallSquare(o.badgeInk || o.ink, null, 22, 5), { pixelRatio: PIN_RATIO });
    map.addLayer({ id: `puzzle-${key}-badge`, type: 'symbol', source: `puzzle-${key}`,
      layout: { 'icon-image': 'plan-badge', 'icon-allow-overlap': true, 'icon-ignore-placement': true },
      paint: { 'icon-translate': o.badge } });
  } else if (o.badge) {
    map.addLayer({ id: `puzzle-${key}-badge`, type: 'circle', source: `puzzle-${key}`,
      paint: { 'circle-radius': 8.5, 'circle-color': o.ink, 'circle-stroke-width': 1.5, 'circle-stroke-color': WHITE,
        'circle-translate': o.badge } });
  }
  map.addLayer({ id: `puzzle-${key}-nums`, type: 'symbol', source: `puzzle-${key}`,
    layout: { 'text-field': ['get', 'no'], 'text-font': [o.square ? 'Grenette Pro Regular' : 'DM Sans Light'], 'text-size': o.textSize || 10.5,
      'text-allow-overlap': true, 'text-ignore-placement': true,
      ...(o.badge ? {} : { 'text-anchor': 'bottom-left', 'text-offset': [0.35, -0.2] }) },
    paint: o.badge
      ? { 'text-color': WHITE, 'text-translate': o.badge }
      : { 'text-color': o.ink, 'text-halo-color': WHITE, 'text-halo-width': 1 } });
}
/* Lays out a puzzle: `points` numbered from 1, `path` the line that joins
   them (the points themselves unless given), drawn on to `join`. */
function setPuzzle(key, points, o = {}) {
  if (!map?.isStyleLoaded?.() && !map?.getStyle?.()) return;
  const opts = { ink: DOT_INK, join: 1, ...o };
  puzzleLayers(key, opts);
  const path = opts.path || points;
  map.getSource(`puzzle-${key}`).setData({ type: 'FeatureCollection', features: points.map((c, i) => ({
    type: 'Feature', properties: { no: opts.numbered === false ? '' : String(i + 1) }, geometry: { type: 'Point', coordinates: c } })) });
  const was = PUZZLES[key]?.path === path ? PUZZLES[key].join : 0;
  PUZZLES[key] = { path, join: opts.join, raf: PUZZLES[key]?.raf };
  cancelAnimationFrame(PUZZLES[key].raf || 0);
  const line = map.getSource(`puzzle-${key}-line`);
  const draw = (f) => line.setData(path.length > 1 && f > 0
    ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pathUpTo(path, f) } } : EMPTY);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || opts.join === was) { draw(opts.join); return; }
  const from = was, to = opts.join, start = performance.now(), ms = opts.ms || 1100;
  const tick = (now) => {
    const t = Math.min(1, (now - start) / ms);
    draw(from + (to - from) * (1 - (1 - t) ** 3));
    if (t < 1) PUZZLES[key].raf = requestAnimationFrame(tick);
  };
  PUZZLES[key].raf = requestAnimationFrame(tick);
}
function clearPuzzle(key) {
  if (!PUZZLES[key]) return;
  cancelAnimationFrame(PUZZLES[key].raf || 0);
  delete PUZZLES[key];
  map?.getSource(`puzzle-${key}`)?.setData(EMPTY);
  map?.getSource(`puzzle-${key}-line`)?.setData(EMPTY);
}

/* Surprise me's plan, as an outing: one place to move or play, the nearest
   running track if there is one within PLAN_TRACK_KM, and the two nearest
   places to eat well after, numbered in that order and joined. */
const PLAN_TRACK_KM = 2;
const PLAN_EAT_KM = 2.5;
const kmBetween = (a, b) => lngLatDist([a.lon, a.lat], [b.lon, b.lat]) * 111;
/* Places to eat in a plan are healthy kitchens only: the eat category also
   holds nutritionists, dietitians and food shops, which are not somewhere to
   sit down to a meal. */
const isKitchen = (r) => r.g === 'healthy' && r.s !== 'Health food store' && !r.out;
/* A calm stop, for clearing the mind, is a clear-your-mind place that is not
   a therapist: breathwork, somatic or meditation sessions and the like. */
const NOT_CALM = /therap|counsel|psych|clinic|autism|aba\b|speech|diagnos|clinical/i;
const isCalm = (r) => INTENT_OF.get(r.id) === 'clear' && !r.out
  && !NOT_CALM.test(`${r.n} ${r.s || ''} ${(r.tg || []).join(' ')}`);
const PLAN_MAX = 4;
/* An outing around `anchor`, of two to four stops: the anchor; the nearest
   track if one is close; one healthy kitchen, always; then, if there is room
   and something near, perhaps a second kitchen and perhaps a calm place.
   `fixed` takes every extra that fits, so the intro's example never changes. */
function planAround(anchor, { fixed = false } = {}) {
  /* From the same area, so every stop is one the map is showing. */
  const near = (pick, km) => E.filter((r) => r.lat != null && r.id !== anchor.id && r.a === anchor.a && pick(r)
    && kmBetween(r, anchor) <= km)
    .sort((x, y) => kmBetween(x, anchor) - kmBetween(y, anchor));
  const kitchens = near(isKitchen, PLAN_EAT_KM);
  if (!kitchens.length) return null;
  const track = near((r) => !!TRAIL[r.id], PLAN_TRACK_KM)[0];
  const stops = [anchor, ...(track ? [track] : []), kitchens[0]];
  const extras = [kitchens[1], near(isCalm, PLAN_EAT_KM)[0]].filter(Boolean);
  if (!fixed) extras.sort(() => Math.random() - 0.5);
  extras.forEach((r) => { if (stops.length < PLAN_MAX && (fixed || Math.random() < 0.6)) stops.push(r); });
  /* With Plum Perks on, at least one stop is a partner: if none is, the
     kitchen is swapped for the nearest partner kitchen, else a partner calm
     place takes the last stop. */
  if (state.perksOnly && !stops.some(hasPerkCallout)) {
    const partner = near((r) => isKitchen(r) && hasPerkCallout(r), PLAN_EAT_KM * 2)[0]
      || near((r) => isCalm(r) && hasPerkCallout(r), PLAN_EAT_KM * 2)[0];
    if (!partner) return null;
    const k = stops.indexOf(kitchens[0]);
    if (isKitchen(partner)) stops[k] = partner;
    else if (stops.length < PLAN_MAX) stops.push(partner);
    else stops[stops.length - 1] = partner;
  }
  /* After the anchor (and the track), the rest in a day's order (a meal
     before winding down, DAY_ORDER), and within each kind the one that
     walks nearest next. */
  const rank = (r) => DAY_ORDER[INTENT_OF.get(r.id)] ?? 3;
  const head = stops.slice(0, track ? 2 : 1), rest = stops.slice(head.length);
  while (rest.length) {
    const from = head[head.length - 1];
    rest.sort((x, y) => rank(x) - rank(y) || kmBetween(x, from) - kmBetween(y, from));
    head.push(rest.shift());
  }
  return { stops: head, track: !!track };
}
/* The plan's line: on paper a red dash-dot, like a walked line on a poster,
   joining the places themselves (no dots of its own; the numbers stay ink). */
const PLAN_STYLE = PAPER_LINES
  ? { ink: '#F03A4B', badgeInk: PAPER_INK, dots: false, lineWidth: 3, dash: [4, 2.2, 0, 2.2], badge: [-14, -14], textSize: 14, square: true }
  : { ink: '#571541', dots: false, lineWidth: 3.5, dotted: true, badge: [-13, -13], textSize: 11 };
/* The intro's example outing: the first plan in `area` that takes in a
   track, else the first plan there at all, so the card shows the same one
   every time. */
function storyPlanFor(area) {
  const anchors = E.filter((r) => r.lat != null && r.a === area && !TRAIL[r.id]
    && ['move', 'play'].includes(INTENT_OF.get(r.id)));
  const plans = anchors.map((r) => planAround(r, { fixed: true })).filter(Boolean);
  return plans.find((p) => p.track) || plans[0] || null;
}
/* A day planned on the spot has no streets of its own, so they are asked
   for once it is drawn: the walk between its stops on OSRM's foot profile, run
   by FOSSGIS (the router scripts/themed-day-routes.mjs uses for the curated
   days). The straight joins show until the answer comes, and stay if it never
   does. Answers are kept, so a day redrawn is not asked for twice. */
const WALK_ROUTER = 'https://routing.openstreetmap.de/routed-foot/route/v1/driving';
const routeCache = new Map();
async function walkRoute(stops) {
  const key = stops.map((r) => r.id).join('>');
  if (routeCache.has(key)) return routeCache.get(key);
  const ask = (async () => {
    const res = await fetch(`${WALK_ROUTER}/${stops.map((r) => `${r.lon},${r.lat}`).join(';')}?overview=full&geometries=geojson&steps=false`);
    const body = await res.json();
    const route = body.code === 'Ok' && body.routes?.[0];
    if (!route) return null;
    /* The same sums as the curated days: a leg over 2 km is a ride, not a
       walk, timed at city speed (about 20 km/h) and left out of the calories. */
    let walkMin = 0, rideMin = 0;
    for (const leg of route.legs) {
      if (leg.distance > 2000) rideMin += Math.max(1, Math.round(leg.distance / 1000 / 20 * 60));
      else walkMin += Math.max(1, Math.round(leg.duration / 60));
    }
    return { path: route.geometry.coordinates, walkMin, rideMin, kcal: Math.round((3.5 * 70 * walkMin) / 60) };
  })().catch(() => null);
  routeCache.set(key, ask);
  return ask;
}
function drawPlan(stops, path = null) {
  if (!map || stops.length < 2) return;
  const pts = stops.map((r) => [r.lon, r.lat]);
  if (!(path?.length > 1)) {
    const ids = stops.map((r) => r.id).join('>');
    walkRoute(stops).then((rt) => {
      /* Only if this is still the day on the map. */
      if (!rt || [...state.planIds].join('>') !== ids) return;
      setPuzzle('plan', pts, { ...PLAN_STYLE, path: rt.path });
      /* The streets can run wider than the stops: the circle takes them all in. */
      if (lensAt?.pad) map.fitBounds(boundsOf(rt.path), { padding: lensAt.pad, maxZoom: 16.2, duration: S_REDUCED() ? 0 : 700 });
      if (!state.planStats) {
        const bits = [];
        if (rt.walkMin) bits.push(`${rt.walkMin} min walk`);
        if (rt.rideMin) bits.push(`${rt.rideMin} min by auto`);
        if (rt.kcal) bits.push(`about ${rt.kcal} kcal`);
        state.planStats = bits.join(' · ');
        if (sentenceEl) sentenceEl.__html = '';
        renderSentence();
      }
    });
  }
  /* A curated day carries its streets (scripts/themed-day-routes.mjs); a
     planned one is joined straight until its route comes back. */
  setPuzzle('plan', pts, path?.length > 1 ? { ...PLAN_STYLE, path } : PLAN_STYLE);
  /* Framed on the plan itself, close enough that its stops stand as pins
     rather than inside a cluster. */
  /* After the area's own framing, which is drawn on the next frame and would
     otherwise land on top of this one. */
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const cam = map.cameraForBounds(boundsOf(path?.length > 1 ? path : pts), { padding: fitPad(90) });
    if (cam) map.easeTo({ center: cam.center, zoom: Math.min(16, Math.max(CLUSTER_MAX_ZOOM + 1.4, cam.zoom)), duration: 900 });
  }));
}

function drawTrails(items){
  const lines = map?.getSource('trails');
  if (!lines) return;
  const features = items.map((r) => TRAIL[r.id]).filter(Boolean);
  lines.setData({ type: 'FeatureCollection', features });
  map.getSource('trail-caps').setData({
    type: 'FeatureCollection',
    features: features.flatMap((f) => {
      const c = f.geometry.coordinates;
      if (!c?.length) return [];
      const ink = f.properties?.g === 'cycle' ? ROUTE_RIDE : ROUTE_COLOUR;
      const cap = (point, kind) => ({
        type: 'Feature', properties: { id: f.properties.id, kind, ink }, geometry: { type: 'Point', coordinates: point },
      });
      return f.properties.loop ? [cap(c[0], 'start')] : [cap(c[0], 'start'), cap(c[c.length - 1], 'end')];
    }),
  });
}

/* ---------- the selected area ----------
   An area named like a ward gets that ward filled red on the basemap, under the
   roads (basemap.js). Every selected area gets its name on it. */
let areaMarker = null;

function drawSelection(pinned){
  lastPinned = pinned;
  if (map && !raster) setSelectedArea(map, state.area, state.paint === 'regions');
  areaMarker?.remove();
  areaMarker = null;
  if (!map || state.area === 'all') return;
  const wards = ZONES.features.filter((f) => f.properties.area === state.area);
  const b = wards.length ? geometryBounds(wards) : pinned.length ? boundsOf(pinned.map((r) => [r.lon, r.lat])) : null;
  if (!b || b.isEmpty()) return;
  const el = document.createElement('div');
  el.className = 'area-marker';
  el.innerHTML = `<div class="area-label">${esc(state.area)}</div>`;
  areaMarker = new Marker({ element: el, anchor: 'top' }).setLngLat([b.getCenter().lng, b.getNorth()]).addTo(map);
}

/* ---------- metro ----------
   Only the lines that are running (scripts/osm-metro.mjs), each in its own
   colour over a white casing. Off until the toolbar turns it on. */
let metroOn = false;
function toggleMetro(){
  metroOn = !metroOn;
  document.getElementById('l-metro')?.setAttribute('aria-pressed', metroOn);
  document.getElementById('m-metro')?.setAttribute('aria-pressed', metroOn);
  document.getElementById('k-metro')?.setAttribute('aria-pressed', metroOn);
  ['metro-casing', 'metro-line', 'metro-labels', 'metro-stations'].forEach((id) => {
    if (map?.getLayer(id)) map.setLayoutProperty(id, 'visibility', metroOn ? 'visible' : 'none');
  });
}
document.getElementById('l-metro')?.addEventListener('click', toggleMetro);
document.getElementById('m-metro')?.addEventListener('click', toggleMetro);
document.getElementById('k-metro')?.addEventListener('click', toggleMetro);

/* ---------- the place card ----------
   A portrait card that stands on its pin, pointer down, and follows the map as
   it pans and zooms. A place with no pin, or any place on a phone, docks it
   bottom-left instead, in place of the list. */
const CARD_LIFT = 66;   /* a selected pin's tip to just above its top, pointer included */
let cardAt = null;

function placeCardOnPin(){
  if (!map || !cardAt || placeCard.hidden) return;
  const p = onFrame(cardAt);
  placeCard.style.setProperty('--x', `${Math.round(p.x)}px`);
  placeCard.style.setProperty('--y', `${Math.round(p.y - CARD_LIFT)}px`);
}
map?.on('move', placeCardOnPin);
/* With a card open, a zoom keeps the card where it is: whatever the zoom is
   centred on (the pointer, a pinch, the buttons), the map is nudged back each
   frame so the card's pin stays at the point on screen it started from. */
let cardHold = null;
map?.on('zoomstart', () => {
  cardHold = cardAt && !placeCard.hidden && placeCard.classList.contains('is-floating') ? map.project(cardAt) : null;
});
map?.on('zoom', () => {
  if (!cardHold || !cardAt) return;
  const p = map.project(cardAt);
  const dx = p.x - cardHold.x, dy = p.y - cardHold.y;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
  const c = map.project(map.getCenter());
  map.setCenter(map.unproject([c.x + dx, c.y + dy]));
});
map?.on('zoomend', () => { cardHold = null; });

function openCard(at){
  cardAt = at;
  placeCard.classList.toggle('is-floating', !!at);
  placeCard.hidden = false;
  if (at) placeCardOnPin();
  else if (searchPanel) searchPanel.hidden = true;
  placeCard.querySelector('.pc-close')?.addEventListener('click', closePlace);
}
/* On a phone the card is a bottom sheet: a tap on its handle, or a swipe up, shows all
   of it; a swipe down shows less, then closes it. */
placeCard?.addEventListener('click', (e) => {
  if (e.target.closest('.pc-handle')) placeCard.classList.toggle('is-expanded');
});
{
  let startY = null;
  placeCard?.addEventListener('touchstart', (e) => {
    startY = e.target.closest('.pc-handle, .pc-top, .pc-head') ? e.touches[0].clientY : null;
  }, { passive: true });
  placeCard?.addEventListener('touchend', (e) => {
    if (startY == null) return;
    const dy = e.changedTouches[0].clientY - startY;
    startY = null;
    if (dy < -30) placeCard.classList.add('is-expanded');
    else if (dy > 40) {
      if (placeCard.classList.contains('is-expanded')) placeCard.classList.remove('is-expanded');
      else closePlace();
    }
  }, { passive: true });
}

function closePlace(){
  if (!placeCard || placeCard.hidden) return;
  const docked = cardDocked();
  placeCard.hidden = true;
  placeCard.classList.remove('is-expanded');
  /* A card on a pin may have panned past the city bounds; they close in again
     around wherever the map is now, so nothing jumps. */
  if (cardAt) applyMaxBounds();
  cardAt = null;
  if (docked && searchPanel) searchPanel.hidden = false;
  if (state.active) {
    state.active = null;
    setActivePin();
    markActiveRows(null);
  }
}

/* Where a place is, as the map draws it: the ward outline its pin sits
   inside, by that ward's area name. The sheet's own "raw" area is, for most
   rows, a copy of the place's name ("Fresh Vibes"), so it cannot be shown as
   an area. A place with no pin, or a pin outside every ward, falls back to
   the listing's area. Worked out once per place and kept. */
const AREA_AT = new Map();
const inRing = ([x, y], ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
function areaOfPlace(r) {
  if (!r) return '';
  if (AREA_AT.has(r.id)) return AREA_AT.get(r.id);
  let area = '';
  if (r.lat != null && ZONES?.features) {
    const pt = [r.lon, r.lat];
    const ward = ZONES.features.find((f) => {
      const g = f.geometry;
      const polys = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
      return polys.some((p) => p[0] && inRing(pt, p[0]) && !p.slice(1).some((hole) => inRing(pt, hole)));
    });
    area = ward?.properties?.area || '';
  }
  area = area || r.a || '';
  AREA_AT.set(r.id, area);
  return area;
}

/* The card leads with one line that says what the place is: the first
   sentence of its description, when that sentence is short enough to read as
   a verdict. The rest of the description follows it as before. */
/* Where the first sentence really ends: a full stop after "Dr", "St", "incl",
   a degree ("M.Sc.") or an initial ("B. R. Ambedkar", "B.K.S. Iyengar") is
   not the end of one. */
const NOT_AN_END = /(?:^|[\s(])(?:dr|dt|mr|mrs|ms|st|sr|jr|prof|no|nos|rd|opp|nr|vs|approx|incl|est|pvt|ltd|co|bldg|sec|mt|ft|e\.g|i\.e|etc|b\.?sc|m\.?sc|b\.?a|m\.?a|m\.?s|ph\.?d|(?:[a-z]\.){0,3}[a-z])\.$/i;
function firstSentence(text) {
  const re = /[.!?](?=\s+|$)/g;
  let m;
  while ((m = re.exec(text))) {
    const upTo = text.slice(0, m.index + 1);
    if (m[0] === '.' && NOT_AN_END.test(upTo)) continue;
    return upTo;
  }
  return text;
}
function splitVerdict(d) {
  const text = String(d || '').trim();
  if (!text) return ['', ''];
  /* One rule everywhere: the whole first sentence leads when it is short
     enough to read as a verdict; otherwise nothing leads and the whole
     description follows. A sentence is never cut in two. */
  const first = firstSentence(text);
  if (first.length >= 20 && first.length <= 170) return [first, text.slice(first.length).trim()];
  return text.length <= 170 ? [text, ''] : ['', text];
}
/* A chip with the category's own pin badge, in its colour, under the name. */
function categoryChip(meta) {
  const c = pinColour(meta) || meta.c || 'var(--text-3)';
  return `<span class="pc-chip" style="--cat:${c}"><img src="${iconUrl(meta, BASE, 'pin')}" alt="" width="16" height="16">${esc(meta.verb)}</span>`;
}
/* The sheet's hours, split at " · " into the hours themselves and the best
   time to go. */
const hoursOf = (t) => String(t || '').split(' · ')[0].trim();
const bestTimeOf = (t) => String(t || '').split(' · ').slice(1).join(' · ').trim();
/* A price is shown only if it reads as one: a few route rows carry what the
   route is good for ("Long runs, Route variation") in the price column. */
const PRICE_WORDS = /₹|rs\.?|inr|free|paid|fee|entry|ticket|membership|varies|pay|donation|\d/i;
const priceOf = (p) => (p && PRICE_WORDS.test(p) ? p : '');

function placeParts(r){
  const meta = intentMeta(r) || INTENT_BY_K.move;
  const [verdict, restOfDesc] = splitVerdict(r.d);
  const t = TRAIL[r.id];
  const perkPartner = isPerkPartner(r);
  const playo = !perkPartner && isPlayoVenue(r);
  const plumLink = `<a href="${esc(PLUM_APP)}" target="_blank" rel="noopener">Plum app</a>`;
  /* The Offer line names Plum itself, not the app, so the brand carries the
     link. Kept separate from plumLink, which the Playo line still uses. */
  const plumWord = `<a href="${esc(PLUM_APP)}" target="_blank" rel="noopener">Plum</a>`;
  /* Playo is where a Tier 2 venue is actually booked, so it is a link, not a
     word. The booking line lives here rather than in the description: the card
     escapes its prose, so a markdown link written into `d` renders as raw
     [text](url) — which is exactly what the first resolved batch did. */
  const playoLink = '<a href="https://playo.co" target="_blank" rel="noopener">Playo</a>';
  const facts = [
    areaOfPlace(r) && ['Area', areaOfPlace(r)],
    /* A route we could not trace has no honest distance to quote, so the fact
       reads "loop" rather than "undefined km loop". */
    t && ['Route', `${t.properties.km ? `${t.properties.km} km ` : ''}${t.properties.loop ? 'loop' : (t.properties.geom_type || 'point to point').replace(/-/g, ' ')}`],
    /* Route facilities, where the routes sheet knows them. */
    r.water && ['Water', r.water],
    r.toilets && ['Toilets', r.toilets],
    r.shade && ['Shade', r.shade],
    /* Hours and the best time to go are one field in the sheet ("5-10 AM ·
       Early morning"); shown apart so neither reads as part of the other.
       "After" (where to eat after a run) is left off: the description says it. */
    hoursOf(r.t) && ['Hours', hoursOf(r.t)],
    bestTimeOf(r.t) && ['Best time', bestTimeOf(r.t)],
    r.park?.sqm && ['Size', r.park.sqm.toLocaleString('en-IN') + ' m²'],
    priceOf(r.p) && ['Price', priceOf(r.p)],
    /* Location-complementing perk callout — partners vs enablers (Playo). */

    playo && ['Offer', `book on ${playoLink}, or see your offer in the ${plumLink}.`, true],
  ].filter(Boolean);
  /* No website link on a place card. Directions is the one thing a pin owes
     a reader who wants to go there, and for a partner the offer band is the
     one thing worth following — a site of their own is where you would pay
     full price for it. `w` stays in the data: the index and /list still read
     it, and the logo fetch keys on it. */
  const links = [];
  /* A place without a Google Maps link of its own still goes to Google Maps,
     dropped on its coordinates. */
  if (isMapsUrl(r.gm)) links.push(['Directions', mapsUrlFor(r)]);
  else if (t && trailMapsUrl(t)) links.push(['Route on Google Maps', trailMapsUrl(t)]);
  else if (r.lat != null) links.push(['Directions', mapsUrlFor(r)]);
  if (r.ig) links.push([r.ig, igUrl(r.ig)]);
  const tags = [
    calloutTag(r),
    ...(r.tg || [])
      .filter((x) => x !== 'plum-perks' && x !== 'playo')
      .slice(0, 3)
      .map((x) => tag(String(x).replace(/-/g, ' '))),
    statusTag(r),
  ].join('');

  return { meta, verdict, restOfDesc, perkPartner, playo, facts, links, tags };
}

/* The paper card: a square in the category's colour, the name in the serif,
   what it is in grey; then the place in quiet rows, its offer in red, and one
   dark button to go there. The same body fills the popup on a pin and the
   list row that opens in place. */
/* A description paragraph, its booking line (descHtml's desc-cta) lifted out
   into a paragraph of its own: the description is cut to a few lines, and
   the line to book must never be what is cut. */
/* A rating written into the description ("4.9 across 24 reviews.", "4.7/120
   reviews", "327 reviews at 4.8") is shown as Zomato shows one: the score in a
   green badge with a star, the count beside it, on a line of its own. Where it
   was a sentence by itself it leaves the prose; inside a longer sentence the
   prose is left alone. */
const RATING = /(?:Rated\s+(?:a\s+flat\s+)?)?(\d\.\d)\s*(?:across|\/)\s*([\d,]+)\+?\s*(?:Google\s+)?reviews?|([\d,]+)\+?\s*reviews?\s+at\s+(\d\.\d)/i;
function ratingOf(s) {
  const m = String(s || '').match(RATING);
  if (!m) return null;
  const score = Number(m[1] || m[4]), count = Number(String(m[2] || m[3]).replace(/,/g, ''));
  if (!(score > 0 && score <= 5) || !count) return null;
  return { score, count, m };
}
function ratingHtml({ score, count }) {
  const tone = score >= 4.5 ? 'top' : score >= 4 ? 'good' : score >= 3.5 ? 'fair' : score >= 3 ? 'meh' : 'low';
  return `<p class="pp-rating"><span class="rt-badge rt-${tone}" aria-label="Rated ${score.toFixed(1)} out of 5">${score.toFixed(1)}<i aria-hidden="true">★</i></span><span class="rt-count">${count.toLocaleString('en-IN')} ${count === 1 ? 'review' : 'reviews'}</span></p>`;
}
function descParas(cls, s) {
  const rt = ratingOf(s);
  let rating = '';
  if (rt) {
    rating = ratingHtml(rt);
    /* A rating that was a sentence of its own comes out of the prose. */
    const own = new RegExp(`(^|[.!?]\\s+)${rt.m[0].replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\s*[.;]?(?=\\s|$)`);
    s = String(s).replace(own, '$1').replace(/\s{2,}/g, ' ').trim();
  }
  if (!s) return rating;
  const html = descHtml(s);
  const m = html.match(/<span class="desc-cta">([\s\S]*)<\/span>$/);
  if (!m) return `<p class="${cls}">${html}</p>${rating}`;
  const rest = html.slice(0, m.index).trim();
  return `${rest ? `<p class="${cls}">${rest}</p>` : ''}${rating}<p class="desc-cta">${m[1]}</p>`;
}
function paperPlaceBody(r, p) {
  const offer = !p.noOffer && (p.perkPartner || p.playo) && hasPerkCallout(r)
    ? `<p class="pp-offer"><b>${esc(offersFor(r)[0] || 'An offer')}</b> with Plum Perks, in the <a href="${esc(PLUM_APP)}" target="_blank" rel="noopener">Plum app</a></p>`
    : '';
  const delivery = (r.tg || []).includes('delivery');
  const noPin = r.lat == null && r.c !== 'Communities' && !r.out
    ? (delivery ? '<p class="pp-nopin">Delivery only: order from it, there is no place to visit.</p>'
      : `<p class="pp-nopin">No exact pin for this one yet${r.a ? ` — the map shows ${esc(r.a)}` : ''}.</p>`) : '';
  return `
    ${p.verdict ? descParas('pp-verdict', p.verdict) : ''}
    ${offer}
    ${noPin}
    ${p.restOfDesc ? descParas('pp-desc', p.restOfDesc) : ''}
    ${p.facts.length ? `<dl class="pp-facts">${p.facts.map(([k, v, html]) => `<div><dt>${k}</dt><dd>${html ? v : esc(v)}</dd></div>`).join('')}</dl>` : ''}
    ${p.tags.trim() ? `<div class="pp-tags">${p.tags}</div>` : ''}
    <div class="pp-actions">
      ${p.links.map(([label, href], i) => `<a class="${i === 0 ? 'pp-go' : 'pp-link'}" href="${esc(href)}" target="_blank" rel="noopener">${esc(label)} <span aria-hidden="true">↗</span></a>`).join('')}
    </div>`;
}
function paperColourFor(meta) {
  return (meta && (paperColourOf(meta.k) || pinColour(meta))) || '#C4BBFF';
}

function showPlace(r){
  const { meta, verdict, restOfDesc, perkPartner, playo, facts, links, tags } = placeParts(r);
  openRow = '';
  cardsEl?.querySelectorAll('.prow.is-open').forEach((el) => shutRow(el, true));
  if (BASEMAP === 'paper') {
    placeCard.classList.add('is-pp');
    placeCard.style.setProperty('--c', paperColourFor(meta));
    /* The card: its name on a band of its colour; for a Plum Perks partner, the
       offer on a plum strip torn along its foot; then the place on paper. */
    const perk = (perkPartner || playo) && hasPerkCallout(r);
    placeCard.classList.toggle('has-rip', !!perk);
    placeCard.innerHTML = `
      <button type="button" class="pc-handle" aria-label="Show more of this place"></button>
      <div class="pp-head">
        <div class="pp-name">
          <h2 class="pp-title">${esc(r.n.replace(/\s+—\s+.*$/, ''))}</h2>
          <span class="pp-kind">${esc(LABELS[r.g] || r.s || meta.verb)}</span>
        </div>
        <button type="button" class="pc-close" aria-label="Close">×</button>
      </div>
      ${perk ? `<p class="pp-rip"><b>${esc(offersFor(r)[0] || 'An offer')}</b> with Plum Perks, in the <a href="${esc(PLUM_APP)}" target="_blank" rel="noopener">Plum app</a></p>` : ''}
      <div class="pp-body">${paperPlaceBody(r, { verdict, restOfDesc, perkPartner, playo, facts, links, tags, noOffer: true })}</div>`;
    openCard(r.lat != null && map && !isNarrow() ? [r.lon, r.lat] : null);
    return;
  }
  /* The card is printed in one ink, its category's colour (prompt-map.css). */
  placeCard.style.setProperty('--cat', pinColour(meta) || '#571541');
  placeCard.innerHTML = `
    <button type="button" class="pc-handle" aria-label="Show more of this place"></button>
    <div class="pc-top">
      <span class="pc-kind">${esc(LABELS[r.g] || meta.verb)}</span>
      <button type="button" class="pc-close">Close</button>
    </div>
    <div class="pc-head">
      ${thumbHtml(r, 'thumb pc-media')}
      <div class="pc-name">
        <h2 class="pc-title">${esc(r.n)}</h2>
        <div class="pc-chips">${categoryChip(meta)}</div>
      </div>
    </div>
    ${verdict ? descParas('pc-verdict', verdict) : ''}
    ${perkPartner || playo ? `<div class="pc-offer">
      <b>${offersFor(r).length
        ? offersFor(r).map(esc).join(', and ')
        /* The fallback already names the app, so the line under it drops the
           second mention rather than saying "Plum app" twice in one band. */
        : `<a href="${esc(PLUM_APP)}" target="_blank" rel="noopener">${esc(NO_FIGURE_OFFER)}</a>`}</b>
      <small>${offersFor(r).length
        ? `with Plum Perks, in the <a href="${esc(PLUM_APP)}" target="_blank" rel="noopener">Plum app</a>`
        : 'with Plum Perks'}</small>
    </div>` : ''}
    ${restOfDesc ? descParas('pc-desc', restOfDesc) : ''}
    ${facts.length ? `<dl class="pc-facts">${facts.map(([k, v, html]) => `<dt>${k}</dt><dd>${html ? v : esc(v)}</dd>`).join('')}</dl>` : ''}
    <div class="pc-tags">${tags}</div>
    <div class="pc-actions">
      ${links.map(([label, href], i) => `<a class="pc-link${i === 0 ? ' pc-directions' : ''}" href="${esc(href)}" target="_blank" rel="noopener">${esc(label)} ↗</a>`).join('')}
    </div>`;
  /* On a phone the card docks along the bottom, as it always has. */
  openCard(r.lat != null && map && !isNarrow() ? [r.lon, r.lat] : null);
}

/* Every pin, partners included, so the cluster counts stay honest. A partner's
   red icon and its `perk` flag ride on the feature, so it reads as one the
   moment its cluster breaks. */
function placeFeatures(items){
  return {
    type: 'FeatureCollection',
    features: items.reduce((out, r) => {
      if (r.lat == null) return out;
      const built = PLACE_FEATURE.get(r.id);
      if (built) out.push(built);
      return out;
    }, []),
  };
}

/* While a day is planned the map shows only its stops, and cannot zoom out
   past the day; putting the day away brings the rest back. */
var planZoomLocked = false, planBounds = null;
function drawMap(items){
  if (state.planIds.size) items = [...state.planIds].map((id) => BY_ID.get(id)).filter(Boolean);
  else if (planZoomLocked) { planZoomLocked = false; planBounds = null; lockZoomOut(); applyMaxBounds(); }
  lastItems = items;
  const places = map?.getSource('places');
  if (!places) return;
  places.setData(placeFeatures(items));
  drawTrails(routesShown() ? trailItems(items) : []);
  document.getElementById('k-routes')?.setAttribute('aria-pressed', routesShown());
}

function setActivePin(){
  if (!map?.getLayer('pins')) return;
  map.setFilter('pins', activeFilter(false));
  map.setFilter('pin-active', activeFilter(true));
  if (map.getLayer('perk-gift')) map.setFilter('perk-gift', perkGiftFilter());
  syncActiveName();
}
/* The picked pin keeps its name beside it until something else is picked or
   the card closes, and it arrives the way a hovered pin's does. */
const activeNameEl = document.createElement('span');
activeNameEl.className = 'pin-name pin-name-active';
activeNameEl.hidden = true;
frameEl?.appendChild(activeNameEl);
let activeNameAt = null;
function placeActiveName() {
  if (!activeNameAt || activeNameEl.hidden || !map) return;
  const p = onFrame(activeNameAt.at);
  activeNameEl.style.left = `${Math.round(p.x + activeNameAt.half + 6)}px`;
  activeNameEl.style.top = `${Math.round(p.y)}px`;
  if (activeGoo) activeGoo.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -50%)`;
}
var activeGoo = null;
function syncActiveName() {
  const r = state.active ? BY_ID.get(state.active) : null;
  if (!r || r.lat == null || !map) {
    activeGoo?.remove(); activeGoo = null;
    activeNameEl.classList.remove('is-on');
    activeNameEl.hidden = true;
    activeNameAt = null;
    return;
  }
  const icon = PLACE_FEATURE.get(r.id)?.properties.icon;
  const w = (map.getImage(icon)?.data.width || PIN_H * PIN_RATIO) / PIN_RATIO;
  activeNameAt = { at: spreadAt(r), half: (w * PIN_SCALE * 1.3) / 2 };
  if (BASEMAP === 'paper') {
    activeGoo?.remove();
    activeGoo = document.createElement('div');
    activeGoo.className = 'goo-at';
    const blob = gooFor(PLACE_FEATURE.get(r.id)?.properties || {}, w);
    blob.classList.add('goo-active');
    activeGoo.append(blob);
    frameEl?.appendChild(activeGoo);
  }
  activeNameEl.textContent = r.n;
  activeNameEl.classList.remove('is-on');
  activeNameEl.hidden = false;
  placeActiveName();
  void activeNameEl.offsetWidth;
  activeNameEl.classList.add('is-on');
}
map?.on('move', placeActiveName);

function syncSearchPanel(items){
  if (!searchPanel) return;
  if (!cardDocked()) {
    /* On phones the list stays tucked away until the menu opens it. */
    searchPanel.hidden = isNarrow() && !paperPhone() ? !state.showList : false;
  }
  setListMinimized(state.listMin);

  /* A Surprise me plan on the map is the list: its stops, in the order the
     day goes, and nothing else. */
  const plan = state.planIds.size
    ? [...state.planIds].map((id) => BY_ID.get(id)).filter(Boolean)
    : null;
  if (plan) items = plan;

  const pinned = items.filter((r) => r.lat != null).length;
  /* A search reads the whole city, so the heading has to say so rather than
     name the area the reader had picked — the results are no longer from it. */
  const searching = !!wordsOf(state.query).length;
  const areaName = searching || state.area === 'all' ? 'Mumbai' : state.area;
  /* The line over the list's All | Plum Perks names the place it covers. */
  const explore = document.getElementById('list-explore');
  if (explore) explore.textContent = `Explore in ${areaName}`;
  const phrase = formatIntentPhrase();
  /* The layer names itself in the heading only where it has something to
     name. Narrowed to a slice with no partner in it, "Plum Perks" is the
     first thing read above a list that contains none. */
  const perksHere = items.some(hasPerkCallout);
  const claimPerks = state.perksOnly && (!narrowed() || perksHere);
  const what = [
    state.query && `“${state.query}”`,
    !searching && claimPerks && 'Plum Perks',
    !searching && phrase,
  ].filter(Boolean).join(' · ');

  /* The brands with no pin, and the tabs that keep them out of the places.
     Not gated on the Perks layer any more: these 93 exist on no other surface,
     and hanging them off a filter that is now off by default would have hidden
     every one of them from the view most people only ever see. */
  const brands = brandCards(state.query);
  const tabsOn = !plan && (brands.length > 0 || state.listTab === 'online');
  if (!tabsOn) state.listTab = 'places';
  const online = tabsOn && state.listTab === 'online';
  if (resultsTabs) {
    resultsTabs.hidden = !tabsOn;
    resultsTabs.querySelectorAll('[data-list-tab]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.listTab === state.listTab));
    });
    /* The rows it will show, not the pins among them. 304 perk partners are
       listed here and 277 of them have coordinates; the tab counts what you
       get when you press it, and the line under it still counts pins. */
    setTabCount('places', items.length);
    setTabCount('online', brands.length);
  }

  /* On the online tab the sentence in the prompt is not the question being
     answered — these brands ship to the whole country — so the heading says
     what it is rather than repeating a category and an area that do not
     apply to a single row below it. */
  /* In a locality with the perks on, the heading is the reader's own patch
     rather than a place name they already picked from a list two inches away.
     Plum's wording — but only where there is a perk to head. A slice with no
     partner in it gets the ordinary heading, because "Plum Perks in my
     neighbourhood" over eleven clinics that carry none is a claim the list
     underneath immediately contradicts. */
  const neighbourhood = state.perksOnly && !searching && state.area !== 'all' && perksHere;
  if (resultsTitle) {
    resultsTitle.textContent = online
      ? 'Plum Perks online'
      : plan
        ? (state.planTitle || `Your day in ${areaName}`)
        : state.deliveryOnly
          ? `Delivery-only kitchens in ${areaName}`
        : neighbourhood
        ? 'Plum Perks in my neighbourhood'
        : (what ? `${what} in ${areaName}` : areaName);
  }
  const parts = [];
  if (online) parts.push(`${brands.length} brand${brands.length === 1 ? '' : 's'} · delivered anywhere in India`);
  else if (plan) parts.push(state.planStats ? `${plan.length} stops · ${state.planStats}` : `${plan.length} stops, in order`);
  /* Capped, the count says so. A bare "650 pins" over a city with 2,371 would
     be the map quietly under-reporting itself. */
  else if (pinned && openingTotal) parts.push(`${pinned} of ${openingTotal} pins`);
  else if (pinned) parts.push(`${pinned} pin${pinned === 1 ? '' : 's'}`);
  else parts.push(`${items.length} listed`);
  /* Whenever the list holds both, say how much of it is Perks. It is the only
     number on the page that answers "what is Plum actually getting me here",
     and with the layer off by default this is where that now gets said. */
  if (!online && !plan && !state.perksOnly && !state.deliveryOnly) {
    const perks = items.filter(hasPerkCallout).length;
    parts.push(perks ? `${perks} with Plum Perks` : 'no Plum Perks partners here yet');
  }
  if (resultsSub) resultsSub.textContent = parts.join(' · ');

  if (!cardsEl) return;
  /* Behind the intro gate the list is covered — skip building hundreds of rows
     on every shuffle click; Show me will render the list then. */
  if (introEl && !introEl.hidden) return;

  let notice = '';
  /* The line the Plum Perks pane used to carry, now that the cards live here.
     It heads the list because it is what the whole layer is for. Copy and link
     come from the sheet by way of perks.json, not from here. */
  if (state.perksOnly && PERKS.blurb) {
    notice += `<div class="notice"><a class="lnk" href="${esc(PERKS.ctaUrl)}"
      target="_blank" rel="noopener">${esc(PERKS.blurb)}</a></div>`;
  }
  if (plan && state.planBook?.length) {
    notice += `<div class="notice notice-book"><b>Book ahead:</b> ${state.planBook.map(esc).join(', ')}.</div>`;
  }
  const out = items.filter((r) => r.out).length;
  if (state.query) {
    notice += `<div class="notice">Matching <b>“${esc(state.query)}”</b>.
      <button type="button" class="lnk" id="clearQuery">Clear search</button></div>`;
  }
  /* A planned day names its own part of town. */
  if (state.area !== 'all' && !plan) {
    notice += `<div class="notice">Showing <b>${esc(state.area)}</b>.
      <button type="button" class="lnk" id="clearArea">All of Mumbai</button></div>`;
  }
  if (out) notice += `<div class="notice"><b>${out} fall outside the city limits.</b></div>`;
  if (noticeEl) noticeEl.innerHTML = notice;
  document.getElementById('clearArea')?.addEventListener('click', () => {
    setArea('all');
    openResultsList();
    render();
  });
  document.getElementById('clearQuery')?.addEventListener('click', () => {
    setQuery('');
    closeSearch(true);
  });

  /* A thin locality (under 3 pins in the list) is a gap we would like filled —
     same ask whether the list is empty or almost empty. A search with no hits
     is the reader's filter, so that stays the plainer note. */
  const researchGap = (area, empty) => `${empty ? `<p class="list-suggest list-none">Nothing in ${esc(area)} yet.</p>` : ''}${suggestLine()}${nearbyLine(area)}`;
  const thinArea = state.area !== 'all' && !state.query && pinned < 3 && !plan;

  if (online) {
    listItems = brands;
    listShown = 0;
    cardsEl.innerHTML = onlineChipsHtml(state.query) + (brands.length ? '' : `<div class="empty"><b>No brand matches that.</b>
      Try another word, or look in Mumbai.</div>`);
    fillList();
    return;
  }

  /* The list's All and Plum Perks are two halves: Plum Perks lists the
     partners (the filter has already narrowed items to them), All lists
     everything else. A search looks through all of it either way. */
  /* All still leads with up to two Plum Perks partners that fit the filters,
     pinned ones first, so the partners are seen without switching the tab;
     the rest of them stay on the Plum Perks tab. */
  /* On the paper map the partners have the red drawer at the list's foot;
     elsewhere All still leads with two of them. */
  fillPerksDrawer(items.filter(hasPerkCallout));
  if (!plan && !state.perksOnly && !state.deliveryOnly && !wordsOf(state.query).length) {
    /* Plain paper rows leave the partners to the drawer; the bands, like the
       map before them, lead with two partners and list everything else after.
       All of them are in the red drawer. */
    if (BASEMAP === 'paper' && !LIST_BANDS) items = items.filter((r) => !hasPerkCallout(r));
    else {
      const lead = items.filter(hasPerkCallout).sort((a, b) => (b.lat != null) - (a.lat != null)).slice(0, 2);
      items = lead.concat(items.filter((r) => !hasPerkCallout(r)));
    }
  }

  if (!items.length) {
    /* Reset the paging state as well as the markup. Clearing one without the
       other left listItems and listShown pointing at the previous, longer list,
       and the next scroll appended a page of it underneath "Nothing here yet". */
    listItems = [];
    listShown = 0;
    cardsEl.innerHTML = thinArea
      ? researchGap(state.area, true)
      : `<div class="empty"><b>Nothing here yet.</b>
          Try another search, another part of town, or ask for more than one
          thing at a time.</div>${BASEMAP === 'paper' ? suggestLine() : ''}`;
    return;
  }

  /* Everything that matches is in the list. It is drawn a page at a time as
     you scroll rather than all at once, because a thousand rows of markup is
     a second of layout the panel does not need to spend before showing you
     the first ten. This used to stop dead at 50 with a note saying the rest
     were not shown, which left most of the map unreachable from the list. */
  let placed = plan ? items : state.shuffle
    ? [...items].sort((a, b) => state.shuffle.get(a.id) - state.shuffle.get(b.id))
    : items;
  /* A mix of categories down the list, not a column of one colour.
     The rows arrive in whatever order the pool was built in, which puts all
     88 routes together — 87 of them the one category — so the list opened on
     a block of blue and read as "this map is routes" rather than "this map is
     everything". Ordered here rather than upstream because this is the one
     place every view's list passes through, whatever produced it.
     Not while searching: there the order carries meaning the reader asked
     for, and not for a planned day, whose order is the day's. */
  if (!plan && !state.query) placed = interleave(placed, (r) => INTENT_OF.get(r.id));
  /* The partners lead, in every view. Sorted, not filtered: everything is
     still there, the discounts are just not buried under forty gyms that have
     none. Stable, so whatever order they arrived in — including a shuffle or
     the mix above — survives inside each half. */
  if (!plan) {
    placed = [...placed]
      .map((r, i) => [r, i])
      .sort((a, b) => (hasPerkCallout(b[0]) - hasPerkCallout(a[0])) || (a[1] - b[1]))
      .map(([r]) => r);
  }
  listItems = placed;
  listShown = 0;
  /* A thin part of town asks for more, and points nearby, after its rows. */
  listNear = thinArea ? state.area : '';
  cardsEl.innerHTML = '';
  fillList();
}

/* The pinless brands, matched on the same words the search uses so typing
   narrows both halves of the list together. */
/* Online perks that fit no activity chip (pets, kids, magazines, home
   services: the sheet files them under Communities) go under misc. */
const MISC_GREY = '#D3CFC7';
const isMiscPerk = (p) => { const k = intentMeta(p)?.k; return !k || k === 'people'; };
/* Every activity a brand serves: its own first, then any it also serves. */
const perkKinds = (p) => [...new Set([intentMeta(p)?.k, ...(p.also || [])].filter(Boolean))];
/* An online perk, tapped: its offer lives in the Plum app, so a small
   window says how to get there. With Plum, open the app; without it, ask
   your company for Plum (a quote) or get Plum Personal. */
const PLUM_QUOTE = 'https://www.plumhq.com/get-quote';
const PLUM_PERSONAL = 'https://www.plumhq.com/personal';
let perkPop = null;
/* Laid out as the Online perks pane's own header: the brand and its offer,
   the plum button to the app, then the ways in for someone without Plum. */
function perkPopHtml({ brand, big, small }) {
  const ext = 'target="_blank" rel="noopener"';
  return `<p class="pp-kick">Plum Perks</p><h2 class="pp-title" id="perk-pop-title">${esc(brand || 'This offer')}</h2>
    <p class="pp-say">${/\d/.test(big || '') ? `${esc(big)} ${esc(small)}, waiting` : 'Waiting'} for you in the Plum app.</p>
    <p class="s-pane-cta pp-cta"><a href="${PLUM_APP}" ${ext}>Open the Plum app &#8599;</a></p>
    <p class="pp-signup">Don’t have Plum yet? Get it <a href="${PLUM_QUOTE}" ${ext}>through your company</a> or get <a href="${PLUM_PERSONAL}" ${ext}>Plum Personal</a>.</p>`;
}
function openPerkPop(card) {
  if (!perkPop) {
    perkPop = document.createElement('dialog');
    perkPop.className = 'perk-pop';
    perkPop.setAttribute('aria-labelledby', 'perk-pop-title');
    document.body.appendChild(perkPop);
    perkPop.addEventListener('click', (e) => {
      if (e.target.closest('.pp-x')) { perkPop.close(); return; }
      const r = perkPop.getBoundingClientRect();
      if (e.target === perkPop && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) perkPop.close();
    });
  }
  const info = { brand: card.querySelector('.cp-name')?.textContent.trim(), big: card.querySelector('.cp-stub b')?.textContent.trim(),
    small: card.querySelector('.cp-stub small')?.textContent.trim() };
  perkPop.innerHTML = `<button type="button" class="pp-x" aria-label="Close">×</button>${perkPopHtml(info)}`;
  if (!perkPop.open) perkPop.showModal();
}
document.addEventListener('click', (e) => {
  const card = e.target.closest?.('a.coupon');
  if (!card) return;
  e.preventDefault();
  openPerkPop(card);
});
function brandCards(query, { kind = onlineKind } = {}) {
  const words = wordsOf(query);
  return (PERKS.perks || [])
    .filter((p) => !words.length || words.every((w) => `${p.n} ${p.d} ${p.s} ${p.a} ${(p.tg || []).join(' ')}`
      .toLowerCase().includes(w)))
    .filter((p) => kind === 'all' || (kind === 'misc' ? isMiscPerk(p) : perkKinds(p).includes(kind)))
    .map((p) => ({ ...p, brand: true }));
}

/* The Online perks list narrowed by activity: a row of small chips, one per
   main activity that has a brand, each with its icon and how many. */
let onlineKind = 'all';
/* Online perks can be searched by brand, what it sells or its tags; the
   chips count within what the search leaves, and the two narrow together. */
let onlineQuery = '';
/* Set like the search tile in the corner bar: the card's paper, a fine edge,
   its magnifier in the tiles' grey, the map's type. */
const onlineFindHtml = () => `<label class="online-find"><span class="online-find-ic" aria-hidden="true">${document.getElementById('t-search')?.innerHTML || ''}</span><span class="sr-only">Search online perks</span>
  <input type="search" id="online-find" placeholder="Search brands, like protein or sleep" value="${esc(onlineQuery)}" autocomplete="off" spellcheck="false"></label>`;
function onlineCardsHtml() {
  const cards = brandCards(onlineQuery);
  return cards.length ? cards.map(onlineRowHtml).join('')
    : `<p class="online-none">No online perks match \u201c${esc(onlineQuery)}\u201d.</p>`;
}
document.addEventListener('input', (e) => {
  if (e.target.id !== 'online-find') return;
  onlineQuery = e.target.value.trim();
  /* The cards and the chips are redrawn; the field itself is left alone, so
     it keeps its focus and caret while you type. */
  const pane = e.target.closest('.s-pane');
  pane?.querySelector('.online-chips')?.replaceWith(Object.assign(document.createElement('div'), { innerHTML: onlineChipsHtml(onlineQuery) }).firstElementChild);
  const grid = pane?.querySelector('.s-online');
  if (grid) grid.innerHTML = onlineCardsHtml();
  if (sentenceEl) sentenceEl.__html = '';
});
function onlineChipsHtml(query = '') {
  const all = brandCards(query, { kind: 'all' });
  const count = (k) => all.filter((p) => perkKinds(p).includes(k)).length;
  /* Each activity's chip in its colour, as on the coupons' tags. */
  const colourOf = (k) => (k === 'all' ? '' : k === 'misc' ? MISC_GREY : (BASEMAP === 'paper' && paperColourOf(k)) || pinColour(INTENT_BY_K[k]) || '');
  const chip = (k, label, n, icon) => `<button type="button" class="online-chip" data-online-kind="${esc(k)}"${colourOf(k) ? ` style="--c:${colourOf(k)}"` : ''}
    aria-pressed="${onlineKind === k}">${icon || ''}${esc(label)}<em>${n}</em></button>`;
  return `<div class="online-chips" role="group" aria-label="Filter by activity">${
    chip('all', 'All', all.length)
    /* Buy gear has no pins any more, but online it is a real shelf, so its
       chip comes back here (and only here). */
    + [...MAP_INTENTS, INTENT_BY_K.gear].filter((i) => i && count(i.k)).map((i) => chip(i.k, onlineKindLabel(i), count(i.k),
      `<img src="${iconUrl(i, BASE, 'pin')}" alt="" width="14" height="14">`)).join('')
    + (all.some(isMiscPerk) ? chip('misc', 'Misc', all.filter(isMiscPerk).length) : '')
  }</div>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-online-kind]');
  if (!b) return;
  onlineKind = b.dataset.onlineKind;
  if (paneOnline && !paneOnline.hidden) fillOnlinePane();
  if (sentence.tab === 'online' && sentenceEl) { sentenceEl.__html = ''; renderSentence(); }
  if (state.listTab === 'online') syncSearchPanel(filtered());
});
function fillOnlinePane() {
  const box = document.getElementById('list-online');
  if (box) box.innerHTML = onlineChipsHtml('') + brandCards('').map(perkCardRow).join('');
}

/* One screenful and a bit, so the scroll never catches up with the drawing. */
const LIST_PAGE = 60;
/* How close to the end of the panel counts as "nearly there". */
const LIST_AHEAD = 600;
let listItems = [];
let listShown = 0;
let listNear = '';

/* Parts of town near a thin one that have more of what is asked, nearest
   first, so the reader can look there instead. */
const AREA_MIDDLE = (() => {
  const by = new Map();
  E.forEach((r) => { if (r.lat != null && r.a && !r.out) (by.get(r.a) || by.set(r.a, []).get(r.a)).push([r.lon, r.lat]); });
  return new Map([...by].map(([a, pts]) => [a, [medianCoord(pts.map((p) => p[0])), medianCoord(pts.map((p) => p[1]))]]));
})();
function nearbyAreas(area, n = 3) {
  const at = AREA_MIDDLE.get(area);
  if (!at) return [];
  const count = new Map();
  pool().forEach((r) => { if (r.lat != null && r.a && r.a !== area) count.set(r.a, (count.get(r.a) || 0) + 1); });
  return [...AREA_MIDDLE].filter(([a]) => a !== area && (count.get(a) || 0) >= 1)
    .map(([a, c]) => [kmApart(at, c), a]).sort((x, y) => x[0] - y[0]).slice(0, n).map(([, a]) => a);
}
const nearbyLine = (area) => {
  const [near] = nearbyAreas(area, 1);
  return near ? `<p class="list-suggest list-near">Would you like to search nearby in <button type="button" class="lnk-near" data-near-area="${esc(near)}">${esc(near)}</button> instead?</p>` : '';
};
const suggestLine = () => `<p class="list-suggest">Know somewhere we’ve missed? <a href="${esc(SUGGEST_FORM)}" target="_blank" rel="noopener">Suggest a place ↗</a></p>`;
function appendListPage() {
  if (!cardsEl || listShown >= listItems.length) return false;
  const next = listItems.slice(listShown, listShown + LIST_PAGE);
  listShown += next.length;
  cardsEl.insertAdjacentHTML(
    'beforeend',
    next.map((r) => (r.brand ? perkCardRow(r) : rowHtml(r))).join('')
      /* The foot of the list: somewhere we have missed. */
      + (listShown >= listItems.length && BASEMAP === 'paper' && !next.some((r) => r.brand) && !cardsEl.querySelector('.list-suggest') ? suggestLine() + (listNear ? nearbyLine(listNear) : '') : ''),
  );
  return true;
}

/* Draw pages until the panel has more than the reader can see, so a long
   flick or a short list both end up with something under the scrollbar. The
   loop is bounded: a filter matching everything is ~20 pages, and stopping at
   40 means a bug here cannot hang the tab. */
function fillList() {
  syncListBar();
  /* A panel with no height — the phone's sheet before it is opened, or a
     minimized list — reports no room, which would drain every page into the
     DOM at once. Draw one and wait until it is on screen to judge. */
  if (!resultsBody || !resultsBody.clientHeight) { appendListPage(); return; }
  for (let i = 0; i < 40; i++) {
    const room = resultsBody.scrollHeight - resultsBody.scrollTop - resultsBody.clientHeight;
    if (room > LIST_AHEAD) return;
    if (!appendListPage()) return;
  }
}

resultsBody?.addEventListener('scroll', fillList, { passive: true });
/* The list's scrollbar is hidden (a native one would eat into the bands), so
   a thin bar of our own rides down its edge while the list is being scrolled,
   then fades. */
{
  const bar = document.createElement('div');
  bar.className = 'list-scrollbar';
  bar.setAttribute('aria-hidden', 'true');
  resultsBody?.parentElement?.appendChild(bar);
  let quiet = 0;
  const place = () => {
    if (!resultsBody) return;
    const { scrollTop: t, scrollHeight: h, clientHeight: c, offsetTop: top } = resultsBody;
    if (h <= c + 2) { bar.classList.remove('is-on'); return; }
    const len = Math.max(28, (c * c) / h);
    bar.style.top = `${top + (t / (h - c)) * (c - len)}px`;
    bar.style.height = `${len}px`;
    bar.classList.add('is-on');
    clearTimeout(quiet);
    quiet = setTimeout(() => bar.classList.remove('is-on'), 900);
  };
  resultsBody?.addEventListener('scroll', place, { passive: true });
}

function zoneBoundsForArea(area){
  const wards = ZONES.features.filter((f) => f.properties.area === area);
  if (!wards.length) return null;
  const bounds = geometryBounds(wards);
  return bounds.isEmpty() ? null : bounds;
}

/* Pans, gently, just far enough that `at` sits inside the padded frame. */
function panInside(at, pad) {
  const s = size();
  const p = map.project(at);
  const clamp = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(Math.max(v, lo), hi));
  const x = clamp(p.x, pad.left, s.x - pad.right);
  const y = clamp(p.y, pad.top, s.y - pad.bottom);
  if (Math.abs(p.x - x) < 1 && Math.abs(p.y - y) < 1) return;
  map.panBy([p.x - x, p.y - y], { duration: 300 });
}

/* The picked place is marked in both lists: the main one and the Plum
   Perks drawer's. Picked on the map, its drawer row comes into view too. */
function markActiveRows(id, { reveal = false } = {}) {
  [cardsEl, pdBody].forEach((box) => box?.querySelectorAll('.card').forEach((el) => el.classList.toggle('is-active', !!id && el.dataset.id === id)));
  if (reveal && id && perksDrawer?.classList.contains('is-open')) {
    pdBody?.querySelector(`.card[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: S_REDUCED() ? 'auto' : 'smooth' });
  }
}
function select(id, fromMap){
  const r = BY_ID.get(id);
  if (!r) return;
  state.active = id;
  setActivePin();
  markActiveRows(id, { reveal: fromMap });
  /* Picked on the map: its row in the list comes into view, marked. */
  if (fromMap) {
    const row = cardsEl?.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
    row?.scrollIntoView({ block: 'nearest', behavior: S_REDUCED() ? 'auto' : 'smooth' });
  }
  showPlace(r);
  if (r.lat == null || !map) return;
  const at = [r.lon, r.lat];
  /* Keep the card standing on the pin clear of the chrome: the chrome's padding
     plus half the card either side, and the whole card above. The card stands
     above the pin, so where the whole left column leaves no room it clears just
     the legend; where even that cannot fit it only fits on screen. The city
     bounds would stop a pin by the edge from coming clear, so while its card is
     open the map may pan past them. */
  const reveal = () => {
    const s = size();
    const pad = fitPad(40);
    if (!placeCard.classList.contains('is-floating')) {
      panInside(at, pad);
      return;
    }
    const half = placeCard.offsetWidth / 2 + 12;
    const above = placeCard.offsetHeight + CARD_LIFT + 12;
    const legendRight = legendEl && getComputedStyle(legendEl).display !== 'none'
      ? legendEl.getBoundingClientRect().right - mapEl.getBoundingClientRect().left + 12
      : 0;
    const fits = (from) => from + pad.right + 2 * half < s.x - 40;
    const clearLeft = fits(pad.left) ? pad.left : legendRight && fits(legendRight) ? legendRight : 0;
    const clearRight = clearLeft ? pad.right : 0;
    if (!planBounds) map.setMaxBounds(null);
    panInside(at, {
      left: clearLeft + half,
      right: clearRight + half,
      top: Math.min(pad.top + above, s.y - pad.bottom - 40),
      bottom: pad.bottom,
    });
  };
  /* From the list, come in close enough that the pin stands clear of any cluster. */
  if (!fromMap && map.getZoom() < PIN_FOCUS_ZOOM) {
    if (!planBounds) map.setMaxBounds(null);
    map.jumpTo({ center: at, zoom: PIN_FOCUS_ZOOM });
  }
  reveal();
}

/* A plan stands until the reader asks the map something else: another
   activity, area, search or the Perks filter. Redraws of the same question
   (the map settling, the list filling) leave it be. */
let planFor = '';
const askedOf = () => JSON.stringify([[...state.intents].sort(), state.area, state.query, state.perksOnly, state.deliveryOnly]);
function render(keep){
  if (planFor && askedOf() !== planFor) { planFor = ''; clearPuzzle('plan'); state.planIds = new Set(); state.planTitle = ''; state.planStats = ''; state.planBook = []; closeLens(); }
  frameEl?.classList.toggle('has-plan', state.planIds.size > 0);
  const items = filtered();
  const pinned = items.filter((r) => r.lat != null);
  if (state.active && !items.some((r) => r.id === state.active)) closePlace();
  syncLegendCounts();
  syncSearchPanel(items);
  drawMap(items);
  drawSelection(pinned);
  if (!keep && state.view === 'map'){
    /* Frame the city on in-city pins only — never let day trips yank the camera. */
    const frame = (state.area === 'all' ? pinned.filter((r) => !r.out) : pinned);
    const pts = frame.map((r) => [r.lon, r.lat]);
    if (state.area !== 'all') {
      /* Fit the pin cloud (chrome-padded) so a shuffle/search reads full.
         Ward outline alone + a fixed ~2500% scale used to crop most pins. */
      const zb = pts.length ? null : zoneBoundsForArea(state.area);
      if (pts.length) frameArea(pts, state.area);
      else if (zb) fitTo(zb, { padding: fitPad(36), maxZoom: AREA_MAX_ZOOM });
      if (!pts.length && zb) map.jumpTo({ zoom: map.getZoom() - AREA_ZOOM_OUT });
      else if (!pts.length) fitCity();
    } else if (state.query && pts.length) {
      framePins(pts, SEARCH_MAX_ZOOM);
    } else if (!pts.length || selectedMapIntents().length >= MAP_INTENTS.length) {
      fitCity();
    } else {
      framePins(pts, SEARCH_MAX_ZOOM);
    }
  }
}

/* ---------- search ----------
   A button top-right that grows to the left into a field. Typing narrows the
   map, the list and the legend counts to entries whose name, notes, tags,
   sub-category, area or ward contain every word, and suggests areas, tags and
   places that exist. */
const searchEl = document.getElementById('search');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('t-search');
const suggestEl = document.getElementById('search-suggest');
const TAGS = [...new Set([
  ...MAP_INTENTS.map((i) => i.verb),
  ...Object.values(LABELS),
  ...E.flatMap((r) => r.tg || []).map((t) => String(t).replace(/-/g, ' ')),
])].filter(Boolean).sort((a, b) => a.localeCompare(b));
let searchTimer = 0;

/* Picking a search result while a wide pane (Communities, Online perks) has
   the card: the card goes back to Explore, so the list and the map it
   answers in are in view. Typing alone leaves the pane where it is. */
function leaveWidePane() {
  if (typeof sentence === 'undefined' || !['people', 'online'].includes(sentence.tab)) return;
  sentence.tab = 'explore';
  sentence.open = '';
  renderSentence();
}
function setQuery(q, { refit = true } = {}) {
  state.query = String(q || '').trim();
  if (searchInput && searchInput.value.trim() !== state.query) searchInput.value = state.query;
  searchEl?.classList.toggle('has-query', !!state.query);
  closePlace();
  if (isNarrow() && state.query) state.showList = true;
  openResultsList();
  render(!refit);
}

function openSearch() {
  searchEl?.classList.add('is-open');
  searchBtn?.setAttribute('aria-expanded', 'true');
  if (searchInput) { searchInput.tabIndex = 0; searchInput.focus(); }
}

function closeSearch(force = false) {
  if (!searchEl) return;
  if (suggestEl) suggestEl.hidden = true;
  if (!force && state.query) return;
  searchEl.classList.remove('is-open');
  searchBtn?.setAttribute('aria-expanded', 'false');
  if (searchInput) searchInput.tabIndex = -1;
}

function renderSuggest() {
  if (!suggestEl || !searchInput) return;
  const q = searchInput.value.trim().toLowerCase();
  if (!q) { suggestEl.hidden = true; return; }
  const has = (s) => String(s || '').toLowerCase().includes(q);
  const words = wordsOf(q);
  const count = matching(words).length;
  const areas = (DB.areasByPins || []).filter(has).slice(0, 4);
  const tags = TAGS.filter(has).slice(0, 6);
  const places = E.filter((r) => has(r.n)).slice(0, 5);
  const group = (title, rows) => (rows.length
    ? `<div class="sg-group"><span class="sg-title">${title}</span>${rows.join('')}</div>` : '');
  suggestEl.innerHTML = `
    <button type="button" class="sg-row sg-all" data-kind="query" data-value="${esc(searchInput.value.trim())}">
      Show ${count} match${count === 1 ? '' : 'es'} for “${esc(searchInput.value.trim())}”</button>
    ${group('Areas', areas.map((a) => `<button type="button" class="sg-row" data-kind="area" data-value="${esc(a)}">${esc(a)}</button>`))}
    ${group('Tags', tags.map((t) => `<button type="button" class="sg-row" data-kind="tag" data-value="${esc(t)}"><span class="tag">${esc(t)}</span></button>`))}
    ${group('Places', places.map((r) => `<button type="button" class="sg-row" data-kind="place" data-value="${esc(r.id)}">
      <span class="sg-name">${esc(r.n)}</span><span class="sg-sub">${esc(areaOfPlace(r))}</span></button>`))}`;
  suggestEl.hidden = false;
}

searchBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!searchEl.classList.contains('is-open')) openSearch();
  else if (searchInput.value.trim()) { clearTimeout(searchTimer); leaveWidePane(); setQuery(searchInput.value); suggestEl.hidden = true; }
  else closeSearch(true);
});
searchEl?.addEventListener('click', (e) => e.stopPropagation());
searchInput?.addEventListener('input', () => {
  renderSuggest();
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => setQuery(searchInput.value), 350);
});
searchInput?.addEventListener('focus', renderSuggest);
searchInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    clearTimeout(searchTimer);
    leaveWidePane();
    setQuery(searchInput.value);
    suggestEl.hidden = true;
  } else if (e.key === 'Escape') {
    e.stopPropagation();
    clearTimeout(searchTimer);
    if (state.query) setQuery('');
    searchInput.value = '';
    closeSearch(true);
    searchBtn?.focus();
  }
});
suggestEl?.addEventListener('click', (e) => {
  const row = e.target.closest('.sg-row');
  if (!row) return;
  const { kind, value } = row.dataset;
  clearTimeout(searchTimer);
  suggestEl.hidden = true;
  leaveWidePane();
  if (kind === 'area') {
    state.query = '';
    searchInput.value = '';
    searchEl.classList.remove('has-query');
    setArea(value);
    closePlace();
    openResultsList();
    render();
    closeSearch(true);
  } else if (kind === 'place') {
    goTo(value);
  } else {
    setQuery(value);
  }
});
/* A click anywhere else (a listing, the map, the card) empties the search
   and puts it away: the words go, and so does their filter. What was clicked
   stays open, the list closing round it rather than the place shutting. Not
   the click that just asked for the search: from the phone's menu the menu
   row is "anywhere else" by the time the event reaches the document. */
function resetSearch() {
  clearTimeout(searchTimer);
  const had = !!state.query;
  state.query = '';
  if (searchInput) searchInput.value = '';
  searchEl?.classList.remove('has-query');
  closeSearch(true);
  if (!had) return;
  render(true);
  cardsEl?.querySelector('.prow.is-open')?.scrollIntoView({ block: 'nearest' });
}
document.addEventListener('click', (e) => {
  if (e.target.closest('#search, [data-menu="search"]')) return;
  if (state.query || searchInput?.value.trim()) resetSearch();
  else closeSearch(false);
});

/* ---------- index ----------
   Every entry, grouped by intent, with its own filter box, area and one
   category at a time. Picking one returns to the map and shows it there, or
   just its card if it has no pin. */
let indexBuilt = false;

/* A small dot in the card's corner carries the category's colour. */
/* The chosen tab is red with its icon in cream, like every pressed control. */
function syncIndexFilters(){
  document.querySelectorAll('[data-index-intent]').forEach((btn) => {
    const on = btn.dataset.indexIntent === state.indexIntent;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    const img = btn.querySelector('img');
    const meta = INTENT_BY_K[btn.dataset.indexIntent];
    if (img && meta) img.src = iconUrl(meta, BASE, on ? 'cream' : 'mark');
  });
}

function renderIndex(){
  if (!indexBody) return;
  const words = wordsOf(indexSearch?.value);
  let shown = 0;
  const groups = [...INTENTS.map((i) => ({ i, rows: E.filter((r) => intentMeta(r)?.k === i.k) })),
    { i: null, rows: E.filter((r) => !intentMeta(r)) }];
  /* The Plum Perks button filters this grid the same way it filters the map.
     It used to be the one surface that ignored it: pressing Plum Perks moved
     the map, the list and the counts, and the index went on showing all 2,756.
     The brands with no pin are a section of their own, for the same reason
     they are a tab of their own in the list — they carry no area and answer
     no "what do you want to do", so they are not one more category. */
  const perksOn = state.perksOnly;
  const onlineTab = state.indexIntent === PERKS_ONLINE_KEY;
  const placesTab = state.indexIntent === PERKS_PLACES_KEY;
  /* brandCards, not matchesQuery: that one reads HAY, which is built from the
     map's entries and holds no key for a brand, so every search matched none
     of them. The list already had a matcher for these; this is it. */
  const brands = brandCards(indexSearch?.value, { kind: 'all' });

  const placeSections = (onlineTab || placesTab) ? '' : groups.map(({ i, rows }) => {
    if (state.indexIntent !== 'all' && i?.k !== state.indexIntent) return '';
    const found = rows
      .filter((r) => (state.indexArea === 'all' || r.a === state.indexArea)
        && (!perksOn || hasPerkCallout(r))
        && matchesQuery(r, words))
      .sort((a, b) => a.n.localeCompare(b.n));
    shown += found.length;
    if (!found.length) return '';
    return `<section class="index-section">
      <h3>${i ? `<img src="${iconUrl(i, BASE)}" alt="">${esc(i.verb)}` : 'Other'} <em>${found.length}</em></h3>
      <div class="index-grid">${found.map((x) => indexCardHtml(x, BASE, { openInMap: true })).join('')}</div>
    </section>`;
  }).join('');

  /* The partners you can walk into. Only under their own chip: they are in
     the category sections already, and printing them twice in one view would
     be the page arguing with itself. */
  let perkPlaceSection = '';
  if (placesTab) {
    const found = E.filter((r) => (state.indexArea === 'all' || r.a === state.indexArea)
      && matchesQuery(r, words) && hasPerkCallout(r));
    perkPlaceSection = perkPlacesSectionHtml(found, BASE, { openInMap: true });
    shown += found.length;
  }

  /* The brands ride along with everything, because unlike the places above
     they appear nowhere else on the page. An area picked in the grid is a
     Mumbai locality, which none of them have, so the section stands down
     rather than claiming to be in it. */
  const showBrands = (state.indexIntent === 'all' || onlineTab) && state.indexArea === 'all';
  const brandSection = showBrands ? perksSectionHtml(brands, BASE) : '';
  if (showBrands) shown += brands.length;

  indexBody.innerHTML = (placeSections + perkPlaceSection + brandSection)
    || `<p class="index-empty">Nothing matches.</p>`;
  if (indexSub) {
    const filtering = words.length || state.indexIntent !== 'all' || state.indexArea !== 'all' || perksOn;
    indexSub.textContent = filtering
      ? `${shown} of ${E.length + (PERKS.perks || []).length}`
      : `${COUNTS.total} entries · ${COUNTS.parks} public parks · ${COUNTS.verified} verified`;
  }
  syncIndexFilters();
  equaliseIndexCards();
}

/* Card heights live in index-cards.js, because /list draws the same grid and
   has to size it the same way. */
const measureIndexCards = mountIndexCards(indexBody, { visible: () => state.view === 'index' });
function equaliseIndexCards() { measureIndexCards(); }

function setView(view){
  state.view = view;
  const index = view === 'index';
  if (indexView) indexView.hidden = !index;
  frameEl?.classList.toggle('is-index', index);
  document.getElementById('v-map')?.setAttribute('aria-pressed', !index);
  document.getElementById('v-index')?.setAttribute('aria-pressed', index);
  if (index) {
    closeCliff();
    closeSearch(true);
    if (!indexBuilt) { renderIndex(); indexBuilt = true; }
    equaliseIndexCards();
  }
}

/* The middle of an area, from the places pinned in it: the median, so one
   stray pin cannot drag it. */
const AREA_CENTRE = (() => {
  const by = new Map();
  for (const x of E) {
    if (x.lat == null || !x.a) continue;
    const k = x.a.toLowerCase();
    if (!by.has(k)) by.set(k, []);
    by.get(k).push([x.lon, x.lat]);
  }
  const mid = (v) => { const s = [...v].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
  const out = new Map();
  by.forEach((pts, k) => { if (pts.length >= 2) out.set(k, [mid(pts.map((p) => p[0])), mid(pts.map((p) => p[1]))]); });
  return out;
})();
const areaCentre = (r) => AREA_CENTRE.get(String(r.a || '').toLowerCase())
  || AREA_CENTRE.get(String(r.a || '').split(/[,(/]/)[0].trim().toLowerCase()) || null;
function goTo(id){
  const r = BY_ID.get(id);
  if (!r) return;
  setView('map');
  const meta = intentMeta(r);
  if (!meta?.map || r.lat == null) {
    /* No pin of its own: go to its part of town, so a click still takes the
       reader somewhere, and the card says the spot is not mapped. */
    const near = r.lat == null && !(r.tg || []).includes('delivery') ? areaCentre(r) : null;
    if (near && map) map.flyTo({ center: near, zoom: Math.max(map.getZoom(), 14), duration: 900 });
    showPlace(r);
    return;
  }
  if (!state.intents.has(meta.k)) state.intents = new Set(MAP_INTENTS.map((i) => i.k));
  if (state.query && !matchesQuery(r, wordsOf(state.query))) {
    state.query = '';
    if (searchInput) searchInput.value = '';
    searchEl?.classList.remove('has-query');
  }
  /* A place past the city limits only shows when its own area is picked. */
  if (r.out) setArea(r.a);
  else if (state.area !== 'all' && state.area !== r.a) setArea('all');
  syncIntentUI();
  render(true);
  select(id, false);
}

let indexTimer = 0;
indexSearch?.addEventListener('input', () => {
  clearTimeout(indexTimer);
  indexTimer = setTimeout(renderIndex, 140);
});
indexBody?.addEventListener('click', (e) => {
  /* Only the button goes back to the map. A click anywhere on the card used to,
     which meant brushing one on the way down the grid threw you out of the page
     you were reading. index-cards.js handles Read more and stops there. */
  const go = e.target.closest('[data-open-map]');
  if (go) goTo(go.dataset.openMap);
});
document.getElementById('v-map')?.addEventListener('click', () => setView('map'));
document.getElementById('v-index')?.addEventListener('click', () => setView('index'));
document.getElementById('close-index')?.addEventListener('click', () => setView('map'));

/* Back to the top of the index. It shows once you are a screen down, because
   before that the way back is to stop scrolling. */
const indexTop = document.getElementById('index-to-top');
if (indexTop && indexBody) {
  const syncTop = () => indexTop.classList.toggle('is-on', indexBody.scrollTop > 600);
  indexBody.addEventListener('scroll', syncTop, { passive: true });
  indexTop.addEventListener('click', () => {
    indexBody.scrollTo({ top: 0, behavior: 'smooth' });
    indexTop.classList.remove('is-on');
  });
  syncTop();
}

/* ---------- index category tabs: All, or exactly one category ---------- */
document.getElementById('index-filters')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-index-intent]');
  if (!btn) return;
  state.indexIntent = btn.dataset.indexIntent;
  renderIndex();
});

/* ---------- mobile menu ---------- */
const chromeMenu = document.getElementById('chrome-menu');
const openMenuBtn = document.getElementById('open-menu');

function closeMenu() {
  if (chromeMenu) chromeMenu.hidden = true;
  openMenuBtn?.setAttribute('aria-expanded', 'false');
}
function openMenu() {
  if (chromeMenu) chromeMenu.hidden = false;
  openMenuBtn?.setAttribute('aria-expanded', 'true');
}
function closeLegendSheet() {
  legendEl?.classList.remove('is-sheet', 'is-open');
  setLegendCollapsed(true);
}

openMenuBtn?.addEventListener('click', () => {
  if (chromeMenu && !chromeMenu.hidden) closeMenu();
  else openMenu();
});
/* 3D: the city's buildings raised from OpenFreeMap's own heights, the map
   tilted to see them, and dragging with the right button (or two fingers
   on a phone) free to turn and tilt it further. Off, the map lies flat and
   north-up again, as it does everywhere else on the site. */
const BUILDINGS_3D = {
  id: 'buildings-3d', type: 'fill-extrusion', source: 'omt', 'source-layer': 'building', minzoom: 13,
  paint: {
    'fill-extrusion-color': '#DCD7CD',
    'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 14.5, ['coalesce', ['get', 'render_height'], 8]],
    'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
    'fill-extrusion-opacity': 0.82,
    /* No darkening toward the ground: with the soft light below, the sides
       read as a shade of the roofs rather than as hard shadow. */
    'fill-extrusion-vertical-gradient': false,
  },
};
/* MapLibre's default light (0.5) cuts the shaded walls close to grey; at
   this level they stay a lilac a step down from the roofs. */
const LIGHT_3D = { anchor: 'viewport', color: '#FFFFFF', intensity: 0.22, position: [1.15, 210, 30] };
function set3D(on) {
  state.threeD = on;
  document.getElementById('t-3d')?.setAttribute('aria-pressed', String(on));
  document.getElementById('k-3d')?.setAttribute('aria-pressed', String(on));
  if (!map) return;
  if (on) {
    if (!map.getLayer('buildings-3d') && map.getSource('omt')) {
      /* Under the area and street names, so they stay readable over the
         buildings, and over the roads. */
      const names = map.getStyle().layers.find((l) => LABEL_LAYERS.includes(l.id))?.id;
      map.addLayer(BUILDINGS_3D, names || (map.getLayer('trail-casing') ? 'trail-casing' : undefined));
    }
    map.setLight(LIGHT_3D);
    if (map.getLayer('buildings-3d')) map.setLayoutProperty('buildings-3d', 'visibility', 'visible');
    map.dragRotate.enable();
    map.touchPitch.enable();
    map.easeTo({ pitch: 55, zoom: Math.max(map.getZoom(), 14.5), duration: 900 });
  } else {
    if (map.getLayer('buildings-3d')) map.setLayoutProperty('buildings-3d', 'visibility', 'none');
    map.dragRotate.disable();
    map.touchPitch.disable();
    map.easeTo({ pitch: 0, bearing: 0, duration: 700 });
  }
}
document.getElementById('t-3d')?.addEventListener('click', () => set3D(!state.threeD));
document.getElementById('k-3d')?.addEventListener('click', () => set3D(!state.threeD));

/* The map block in the corner: one block, closed to its name, opening upward
   to the switches for trails, metro, 3D and the map on its own. */
{
  const key = document.getElementById('map-key');
  const toggle = document.getElementById('mk-toggle');
  toggle?.addEventListener('click', () => {
    const open = !key.classList.contains('is-open');
    key.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  });
  document.getElementById('k-full')?.addEventListener('click', () => {
    state.clearView = !state.clearView;
    syncClear();
  });
  /* Any of the map's switches is a reach for the map itself: the planned
     day's blur lifts (the day stays drawn) and a wide pane goes back to
     Explore, so the switch acts on the plain map. */
  document.getElementById('mk-body')?.addEventListener('click', (e) => {
    if (!e.target.closest('.mk-row')) return;
    if (lensEl) closeLens();
    /* ...and the day's hold on the camera goes with it. */
    if (planZoomLocked) { planZoomLocked = false; planBounds = null; lockZoomOut(); applyMaxBounds(); syncZoomUI(); }
    leaveWidePane();
  }, true);
}

/* The corner bar, top left: the Plum mark and "map". Each opens a window of
   its own in the card's style: the map's switches (lifted once from the old
   corner block, which a paper map no longer shows), and what this map is. */
{
  const bar = document.getElementById('corner-bar');
  const wins = { map: document.getElementById('win-map'), about: document.getElementById('win-about') };
  const mk = document.getElementById('mk-body');
  if (bar && mk) wins.map?.querySelector('.win-body')?.append(mk);
  /* Search joins the bar as its third tile: the field it already was (with
     its suggestions of areas, tags and places), opening out of the tile. */
  if (bar && searchEl && BASEMAP === 'paper') {
    bar.append(searchEl);
    searchEl.classList.add('cb-search');
  }
  const aboutBody = wins.about?.querySelector('.win-body');
  if (aboutBody) {
    const mark = document.querySelector('#open-cliff .plum-mark')?.outerHTML || '';
    aboutBody.innerHTML = `<div class="s-about-head">
      <a class="about-plum" href="https://www.plumhq.com" target="_blank" rel="noopener" aria-label="Plum, plumhq.com">${mark}</a>
      <p class="s-say s-about-say">made this map so you can find what is already around you.</p></div>
    <div class="s-about">${document.getElementById('cliff-about')?.innerHTML || ''}</div>`;
  }
  /* The Plum window: a home view (the sentence; the postcard too on a local
     server) whose parts open a page of their own, Back returning home.
     A form's Tally script is fetched the first time a form opens. */
  const pw = wins.about;
  if (pw) {
    const setLook = (k) => { pw.dataset.style = k === 'b' && pw.querySelector('.pw-card') ? 'b' : 'c'; };
    setLook(new URLSearchParams(location.search).get('plum'));
    let tally = false;
    const loadTally = () => {
      /* The frames get their address here, as the pane opens: Tally's own
         loader waits for a frame to scroll into view, which a frame in a
         window that just opened may never report. Its script stays for the
         height, which it sets from the form's own messages. */
      const fill = () => {
        pw.querySelectorAll('iframe[data-tally-src]:not([src])').forEach((f) => { f.src = f.dataset.tallySrc; });
        window.Tally?.loadEmbeds?.();
      };
      if (tally) { fill(); return; }
      tally = true;
      const sc = document.createElement('script');
      sc.src = 'https://tally.so/widgets/embed.js';
      sc.onload = fill; sc.onerror = fill;
      document.body.appendChild(sc);
    };
    /* "and team" opens a small box of credits under the sentence. */
    const team = pw.querySelector('.pw-team'), credits = pw.querySelector('#pw-credits');
    const showCredits = (on) => { if (!team || !credits) return; credits.hidden = !on; team.setAttribute('aria-expanded', String(on)); };
    const showPane = (k) => {
      showCredits(false);
      pw.classList.toggle('is-home', !k);
      pw.querySelectorAll('.pw-pane').forEach((p) => { p.hidden = p.dataset.pane !== k; });
      if (k === 'suggest' || k === 'partner') loadTally();
    };
    pw.addEventListener('click', (e) => {
      const look = e.target.closest('[data-look]');
      if (look) { setLook(look.dataset.look); return; }
      if (e.target.closest('.pw-team')) { showCredits(credits.hidden); return; }
      const nav = e.target.closest('[data-pw]');
      if (nav) showPane(nav.dataset.pw);
    });
    pw.addEventListener('pw-open', (e) => showPane(e.detail));
    /* Each opening starts at home. */
    bar?.querySelector('[data-win="about"]')?.addEventListener('click', () => showPane(''));
  }
  const openWin = (k) => {
    Object.entries(wins).forEach(([name, w]) => { if (w) w.hidden = name !== k; });
    bar?.querySelectorAll('[data-win]').forEach((b) => b.setAttribute('aria-expanded', String(b.dataset.win === k)));
    /* Where the map tile is, for the switches to sit centred under it. */
    const t = bar?.querySelector('[data-win="map"]')?.getBoundingClientRect(), f = frameEl?.getBoundingClientRect();
    if (t && f && wins.map) { wins.map.style.setProperty('--tile-cx', `${t.left - f.left + t.width / 2}px`); wins.map.style.setProperty('--tile-b', `${t.bottom - f.top}px`); }
  };
  /* Every link to the two forms, wherever it is on the map (the list's
     "Suggest a place", the perks drawer's "Become a Plum partner"), opens
     the form in the Plum window instead of on Tally's own page. */
  const FORMS = [[/tally\.so\/r\/gDEb24/, 'suggest'], [/tally\.so\/r\/mDeKVZ/, 'partner']];
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href]');
    if (!a || !wins.about || a.closest('#win-about')) return;
    const hit = FORMS.find(([re]) => re.test(a.href));
    if (!hit || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    openWin('about');
    wins.about.dispatchEvent(new CustomEvent('pw-open', { detail: hit[1] }));
  });
  bar?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-win]');
    if (!b) return;
    openWin(b.getAttribute('aria-expanded') === 'true' ? '' : b.dataset.win);
  });
  Object.values(wins).forEach((w) => w?.querySelector('.win-x')?.addEventListener('click', () => openWin('')));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') openWin(''); });
  /* A press anywhere outside the bar and its windows puts them away. */
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest?.('#corner-bar, .corner-win')) openWin('');
  });
}

/* Just the map: the chrome goes, the way back stays. One frame class does the
   hiding, the way is-index already does, so this does not have to know which
   pieces of furniture exist — anything added later is hidden by the stylesheet,
   not by this function. */
function syncClear(){
  /* On a desktop the map takes the whole window, but it should read as the
     cream page lifting off a map that was under it all along: no slide, no
     zoom, and every pin stays exactly where it was on screen. So the box
     changes in one step, and the camera is panned by however far the box's
     centre moved. */
  const before = mapEl?.getBoundingClientRect();
  /* remeasure() refits the city on any resize until the reader has moved
     the map; this resize is theirs, so it must leave the camera alone. */
  touched = true;
  if (mapEl) mapEl.style.transition = 'none';
  frameEl?.classList.toggle('is-clear', state.clearView);
  document.getElementById('t-clear')?.setAttribute('aria-pressed', String(state.clearView));
  document.getElementById('k-full')?.setAttribute('aria-pressed', String(state.clearView));
  /* The map's box changes when the panel beside it goes, and MapLibre only
     learns that if it is told. */
  map?.resize();
  const after = mapEl?.getBoundingClientRect();
  if (map && before && after) {
    const dx = (after.left + after.width / 2) - (before.left + before.width / 2);
    const dy = (after.top + after.height / 2) - (before.top + before.height / 2);
    if (dx || dy) map.panBy([dx, dy], { animate: false });
    /* A resize clears the canvas; draw now so no blank frame shows. */
    map.redraw?.();
  }
  if (mapEl) { void mapEl.offsetWidth; mapEl.style.transition = ''; }
}
document.getElementById('t-clear')?.addEventListener('click', () => {
  state.clearView = !state.clearView;
  syncClear();
});

document.getElementById('close-menu')?.addEventListener('click', closeMenu);
document.getElementById('legend-close')?.addEventListener('click', closeLegendSheet);
document.getElementById('results-close')?.addEventListener('click', () => {
  tuckList();
});

chromeMenu?.addEventListener('click', (e) => {
  const row = e.target.closest('[data-menu]');
  if (!row) return;
  const action = row.dataset.menu;
  closeMenu();
  if (action === 'search') openSearch();
  else if (action === 'surprise') setSurpriseOpen(true);
  else if (action === 'people') openCliff('people');
  else if (action === 'events') openCliff('events');
  /* Online perks: the list, opened on its Online half. */
  else if (action === 'online') {
    state.showList = true;
    if (searchPanel) searchPanel.hidden = false;
    setListMinimized(false);
    document.querySelector('[data-list-tab="online"]')?.click();
  }
  else if (action === 'about') openCliff('about');
});


document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (state.clearView) { state.clearView = false; syncClear(); return; }
  if (chromeMenu && !chromeMenu.hidden) closeMenu();
  else if (legendEl?.classList.contains('is-sheet')) closeLegendSheet();
  else if (cliffEl && !cliffEl.hidden) closeCliff();
  else if (state.view === 'index') setView('map');
  else if (isNarrow() && state.showList) {
    tuckList();
  }
  else closePlace();
});

/* ---------- start ---------- */

/* Reveal the map and the list together, once the map has actually drawn.
   Both are held at opacity 0 by wellness-map.css until this lands, so the page
   stops assembling itself in front of the reader — the toolbars are already
   there from the served HTML, and these two arrive as one fade behind the
   intro rather than popping in a second apart.

   'idle' is the right signal: it fires when the map has finished rendering and
   has no tiles outstanding. The timeout is the safety net — a tile server that
   never answers must not leave the map permanently invisible. */
function revealFrame() {
  frameEl?.classList.add('is-ready');
}
/* The map is "live" once its pins have drawn: the first time the places hold
   features and the map then goes idle. The timeout is the safety net. */
/* Next waits for the live map too (it is disabled in the markup): the cards
   after the first move the camera, and the picture cannot be moved. */
function goLive() {
  frameEl?.classList.add('is-live');
  if (storyNext) storyNext.disabled = false;
}
if (map) {
  const onPlaces = (e) => {
    if (e.sourceId !== 'places' || !e.isSourceLoaded) return;
    if (!map.querySourceFeatures('places').length) return;
    map.off('sourcedata', onPlaces);
    map.once('idle', goLive);
  };
  map.on('sourcedata', onPlaces);
} else {
  goLive();
}
setTimeout(goLive, 10000);
/* The perks layer starts on, so the controls have to say so from the first
   frame. syncPerks only ran inside the click handler, which meant the toolbar
   and the menu row both looked off while the map was already filtered. */
syncPerks();
/* Same reason as syncPerks: the layer starts on, so the toggle has to say so
   before anyone touches it — and the trails have to be drawn. */
syncRoutes();
if (map) {
  map.once('idle', revealFrame);
  map.once('idle', () => detailsGo());
  map.once('error', revealFrame);
} else detailsGo();
setTimeout(revealFrame, 6000);

if (map) {
  /* Every style load, the first and any raster stand-in, gets the finishing
     layers, the overlays and the current filters back. */
  /* Ready as soon as the style is in, not once every tile is: isStyleLoaded()
     stays false while tiles download, which would keep the pins off. */
  let styleReady = false;
  map.on('style.load', () => {
    styleReady = true;
    if (!raster) {
      /* The fillets recolour the poster's cream roads; on the paper map they
         would take the white roads and the grey ground for the same thing. */
      if (POSTER) addRoadFillets(map);
      /* Beyond the city limits, less colour and a touch of softness. */
      if (BASEMAP === 'paper') addOutsideVeil(map);
      /* After the fillets, so the picked area's streets keep their cream: the
         fillets pass recolours everything drawn before it. Before the labels,
         so street names still sit on top. */
      selectedRoadLayers().forEach((layer) => {
        if (!map.getLayer(layer.id)) map.addLayer(layer, LABEL_LAYERS[0]);
      });
      setSelectedArea(map, state.area, state.paint === 'regions');
      paintMode();
    }
    addOverlays();
    drawSelection(lastPinned);
  });
  loadPinArt()
    .then((loaded) => {
      art = loaded;
      if (styleReady) addOverlays();
    })
    .catch((err) => console.warn('Pins:', err.message));
}
paintMode();
render();
lockZoomOut();
syncRuler();
applyMaxBounds();

['pointerdown', 'wheel', 'touchstart'].forEach(ev =>
  mapEl.addEventListener(ev, () => { touched = true; }, {passive:true}));
let refitTimer = 0;
const remeasure = () => {
  syncStack();
  if (!map) return;
  map.resize();
  lockZoomOut();
  /* The intro's cards place the camera themselves, into their window. */
  const story = introEl && !introEl.hidden;
  /* Refitted once the box has settled, not on every frame of a resize: the
     side panel slides the map's edge in over half a second, and re-centring
     the city on each frame of that made the map judder. */
  clearTimeout(refitTimer);
  if (!story && !touched && state.area === 'all' && !state.query && state.view === 'map') refitTimer = setTimeout(fitCity, 140);
  applyMaxBounds();
  syncRuler();
};
window.addEventListener('load', remeasure);
window.addEventListener('orientationchange', remeasure);
if (window.ResizeObserver) {
  new ResizeObserver(remeasure).observe(mapEl);
  if (topLeft) new ResizeObserver(syncStack).observe(topLeft);
  if (topRight) new ResizeObserver(syncStack).observe(topRight);
} else {
  window.addEventListener('resize', remeasure);
}
setTimeout(remeasure, 300);

/* The long text lands: fill it into the listings and rebuild only what reads
   it (the search index, the list's rows, an open place card or side panel).
   Not render(): that redraws the map's pins too, and the map is revealed only
   once it has finished drawing, so a redraw here could hold that back. */
DETAILS.then((details) => {
  E.forEach((r) => { const d = details[r.id]; if (d) Object.assign(r, d); });
  E.forEach((r) => HAY.set(r.id, hayOf(r)));
  if (wordsOf(state.query).length) render(true);
  else syncSearchPanel(filtered());
  if (state.active && BY_ID.get(state.active)) showPlace(BY_ID.get(state.active));
  const open = listTabs?.querySelector('[aria-pressed="true"]')?.dataset.pane;
  if (open) setListPane(open);
  /* Links and descriptions arrive with the details: a pane already open
     (communities, online perks) is drawn again with them. */
  if (sentence.tab === 'people' || sentence.tab === 'online' || sentence.tab === 'about') { if (sentenceEl) sentenceEl.__html = ''; renderSentence(); }
}).catch((err) => console.warn('Details:', err.message));

/* The story starts once the map can move: its first card fits the whole city
   into the window. Last in the file, because the map is made above. */
/* The intro card opens once the map is halfway loaded: its style and first
   tiles are in. */
if (map) map.once('load', () => window.__openStory?.());
else window.__openStory?.();
/* A press on the map outside the lens's circle lets the lens go. */
if (map) map.on('click', (e) => {
  if (lensAt && Math.hypot(e.point.x - lensAt.cx, e.point.y - lensAt.cy) > lensAt.r) closeLens();
});
/* The first card is framed as the map loads, while the card is still shut and
   its window a sliver; once the window has opened, the city is framed into it
   again, as the window actually is. */
window.addEventListener('story-opened', () => {
  if (!map || !introEl || introEl.hidden || storyAt !== 0 || storySlides[0]?.dataset.area) return;
  map.fitBounds(CITY, { padding: storyPadding(), maxZoom: 12, duration: 500 });
});
if (introEl && storySlides.length) {
  cutStoryWindow();
  const start = () => showStory(0);
  if (!map) start();
  else if (map.loaded()) start();
  else map.once('load', start);
}
