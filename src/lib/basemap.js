/* The basemap.
 *
 * OpenStreetMap data as vector tiles from OpenFreeMap (no key, no sign-up:
 * https://openfreemap.org), drawn by MapLibre GL with the style below inside a
 * Leaflet layer.
 *
 * BASEMAP below picks the style: the flat paper map (paperStyle), OpenFreeMap's
 * stock Positron, or the poster. Everything from here to the fallback note
 * describes the poster.
 *
 * The look is a transit poster's:a flat ground, chunky roads, periwinkle
 * water, blocks a shade deeper than the ground they sit on, and names set in
 * uppercase in the ground's own deep tone. Each corporation is its own poster
 * in its own hue (`c` and `tone` in corporations.json); with the corporation
 * colours off, which is how the map opens, the whole city is one lavender
 * poster. Picking an area fills its wards red, under the roads.
 *
 * Blocks are translucent black over the ground, which deepens any hue without
 * knowing which corporation a block is in. Names are per corporation: each
 * corporation gets its own label layers, filtered to what lies within it.
 * Streets and names only appear close in; names are off until toggled. Past
 * the city limits there is only a flat dark plum ground with cream roads on it. Every
 * line has round ends and joins, and road-fillets.js rounds the corners where
 * roads meet.
 *
 * Without WebGL, or if OpenFreeMap cannot be reached, the map falls back to the
 * OSM Foundation's raster tiles.
 */

import corporations from '../data/corporations.json';
import corporationAreas from '../data/corporation-areas.json';
import mask from '../data/mask.json';
/* OpenFreeMap's stock Positron style (https://tiles.openfreemap.org/styles/positron),
   saved as it was served so the style can be built without a round trip. */
import positron from '../data/positron.json';
/* The edge of the map: the city and the greater area its places reach into
   (scripts/build-region.mjs). Nothing is drawn beyond it. */
import region from '../data/region.json';

/* Which basemap the map draws:
   'paper'    — one flat warm grey, city and beyond, with paper-white roads,
                pastel green greenery and pastel blue water.
   'positron' — OpenFreeMap's default Positron, a plain light-grey street map.
   'poster'   — the transit-poster style below (lavender city, cream roads, plum
                beyond the limits), with road-fillets.js and the test grid. */
export const BASEMAP = 'paper';
export const POSTER = BASEMAP === 'poster';
/* The ward outlines arrive with the map's data file (src/pages/data/map.json.js)
   rather than inside the script, and wellness-map.js hands them over before it
   asks for a style. Read only inside functions, so nothing here needs them
   before then. */
let zones = { type: 'FeatureCollection', features: [] };
export function setZones(fc) { zones = fc; }

const OSM = '<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
export const VECTOR_CREDIT = '<a href="https://openfreemap.org">OpenFreeMap</a> '
  + '© <a href="https://www.openmaptiles.org/">OpenMapTiles</a> · Data © ' + OSM;
export const RASTER = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  opts: { maxZoom: 19, attribution: '© ' + OSM },
};

/* The poster lavender, for the whole city when corporation colours are off, and its names. */
export const DASH = { ground: '#C0B7FF', tone: '#3F2F8F' };
/* The dark plum is still the street names' ink; the ground beyond the city
   and behind the tiles is BACKDROP, which matches --ground in wellness-map.css. */
const OUTSIDE = '#2C0B21';
const BACKDROP = '#4E456A';
/* Everything on the ground is mixed this far towards white, so the pins stand
   out. road-fillets.js tells cream roads from ground by brightness, so the
   palest ground has to stay short of the cream. */
const LIGHTEN = 0.35;
export const soften = (hex, amount = LIGHTEN) => `#${[1, 3, 5].map((i) => {
  const v = parseInt(hex.slice(i, i + 2), 16);
  return Math.round(v + (255 - v) * amount).toString(16).padStart(2, '0');
}).join('').toUpperCase()}`;
const WATER = soften('#A7BCE0');
/* Softened, these land on #B8D19F for parks and grass and #ACCB93 for woods;
   the city's lavender above lands on #D6D0FF. */
const GREEN = soften('#92B86B');
const WOOD = soften('#7FAF59');
/* Every road is drawn in this cream. road-fillets.js finds the roads by it and
   recolours the city's, so keep it the brightest colour on the map. */
export const ROAD = '#FFFAF2';
const EDGE = '#571541';
/* Map names are set in DM Sans Light, the page's sans. OpenFreeMap only serves
   its own fonts as glyphs, so these are built from Google's DM Sans (OFL) by
   scripts/build-glyphs.mjs and served from public/fonts. */
/* Light, not Thin: at Thin the I's stem is too fine for the glyph builder,
   which drew it zero pixels wide, so every I went missing from the names. */
const FONT = ['DM Sans Light'];
/* On the paper map area names are set like the names along the lines (spaced
   capitals, wellness-map.js LINE_TEXT) but a weight heavier, in a warm dark
   grey, so a place reads apart from a route without changing typeface. */
const AREA_FONT = ['Grenette Pro SemiBold'];
const AREA_INK = '#6E6860';
const glyphsUrl = () => {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
  return `${globalThis.location?.origin ?? ''}${base}fonts/{fontstack}/{range}.pbf`;
};

const PLACE_CLASSES = ['suburb', 'neighbourhood', 'quarter', 'village', 'town', 'hamlet'];
export const LABEL_LAYERS = corporations.flatMap((c) => [`place-labels-${c.k}`, `road-labels-${c.k}`]);

const inClass = (...classes) => ['in', ['get', 'class'], ['literal', classes]];
const notTunnel = ['!=', ['get', 'brunnel'], 'tunnel'];
const byZoom = (...stops) => ['interpolate', ['exponential', 1.5], ['zoom'], ...stops];
const round = () => ({ 'line-cap': 'round', 'line-join': 'round' });
const name = ['upcase', ['coalesce', ['get', 'name:en'], ['get', 'name']]];
const omt = (id, type, sourceLayer, extra) => ({ id, type, source: 'omt', 'source-layer': sourceLayer, ...extra });
const areaOf = (k) => corporationAreas.features.find((f) => f.properties.rg === k)?.geometry;
const cityRings = mask.features[0].geometry.coordinates.slice(1);
/* The city limits as [lng, lat] rings, for the veil beyond the city
   (outside-veil.js). */
export const CITY_RINGS = cityRings;
/* [west, south, east, north] of the map's edge, for the map's pan limits. */
export const REGION_BBOX = region.properties.bbox;
/* Everything beyond the map's edge, as one polygon with the region as a hole. */
const BEYOND = {
  type: 'Feature', properties: {},
  geometry: { type: 'Polygon', coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]], region.geometry.coordinates[0]] },
};

/* Roads, chunky: the arterials from afar, smaller streets only close in. All
   cream; road-fillets.js colours the city's, cut exactly at its edge. */
const ROADS = [
  { id: 'path', minzoom: 17, classes: ['path', 'track'], width: 1.5, dash: [2, 1.5] },
  { id: 'minor', minzoom: 15, classes: ['minor', 'service'], width: byZoom(15, 1.5, 18, 10) },
  { id: 'mid', minzoom: 12.5, classes: ['secondary', 'tertiary'], width: byZoom(12.5, 1, 15, 5, 18, 16) },
  { id: 'major', minzoom: 9, classes: ['motorway', 'trunk', 'primary'], width: byZoom(9, 1.2, 12, 3, 15, 9, 18, 26) },
];

function roadLayers(prefix = 'roads') {
  return ROADS.map((r) => omt(`${prefix}-${r.id}`, 'line', 'transportation', {
    minzoom: r.minzoom,
    filter: ['all', notTunnel, inClass(...r.classes)],
    layout: round(),
    paint: { 'line-color': ROAD, 'line-width': r.width, ...(r.dash && { 'line-dasharray': r.dash }) },
  }));
}

/* The picked area's streets, drawn a second time in cream over the ochre.
   These sit after the fillets pass, which is what keeps them cream: the pass
   recolours whatever is under it, so anything drawn before it comes out ochre
   like the rest. wellness-map.js adds them once the fillets exist. */
export const SELECTED_ROADS = ROADS.map((r) => `picked-${r.id}`);
export function selectedRoadLayers() {
  return roadLayers('picked').map((l) => ({ ...l, filter: NO_WARD }));
}

/* One MultiPolygon of every ward carrying this area's name, for `within`. */
function areaGeometry(area) {
  const polys = [];
  for (const f of zones.features) {
    if (f.properties?.area !== area) continue;
    const g = f.geometry;
    if (g?.type === 'Polygon') polys.push(g.coordinates);
    else if (g?.type === 'MultiPolygon') polys.push(...g.coordinates);
  }
  return polys.length ? { type: 'MultiPolygon', coordinates: polys } : null;
}

/* Which corporation an area sits in. No area in zones.json straddles two, so
   one answer is always the honest one; areas with no ward polygon (the map
   carries more names than the ward file does) have no shape to colour either. */
function areaCorp(area) {
  const ward = zones.features.find((f) => f.properties?.area === area);
  return corporations.find((c) => c.k === ward?.properties?.rg) || null;
}

/* Corporation colours on: each corporation's ground. Off: poster pink. */
export function groundColor(regions = true) {
  /* On Positron the city has no ground of its own until the colours are on. */
  if (!regions) return POSTER ? soften(DASH.ground) : 'rgba(0,0,0,0)';
  return ['match', ['get', 'rg'], ...corporations.flatMap((c) => [c.k, soften(c.c)]), soften(DASH.ground)];
}

/* Runs `fn` now if the style is ready, or as soon as it is. */
export function onStyle(glMap, fn) {
  try { fn(glMap); } catch { glMap.once('style.load', () => fn(glMap)); }
}

/* Most wards carry no area name, so "nothing selected" has to match nothing
   rather than match an empty name. */
const NO_WARD = ['boolean', false];
export const PICKED_OUTLINE = 'picked-outline';
export const PICKED_FILL = 'picked-fill';
const EMPTY_GEOJSON = { type: 'FeatureCollection', features: [] };
/* Picks out an area: an outline round it, and its streets in cream against
   the ochre of everywhere else. It used to flood the wards red, which buried the ground
   colour and the pins under the loudest thing on the map; the streets say the
   same thing and leave the rest of it legible. 'all' or nothing clears it.

   `within` only matches a line that lies wholly inside the polygon, so a
   street running out of the area keeps the ochre of the area it leaves for —
   which is the honest answer to where it stops being this neighbourhood. */
export function setSelectedArea(glMap, area, regions = true) {
  const geometry = area && area !== 'all' ? areaGeometry(area) : null;
  const within = geometry
    ? ['within', { type: 'Feature', properties: {}, geometry }]
    : null;
  /* The area wears its corporation: `c` over a ground already painted
     soften(c), so it reads as the same hue gone deeper rather than as a new
     colour laid on top, and `tone` — the shade that corporation's place names
     are set in — for the edge. Near-full strength, because at half it was only
     about a sixth of the way back from the ground's own tint and the shape was
     hard to find from across the city; the parks and water under it still come
     through, and the pins are drawn over it either way. With corporation colours switched off there is
     no corporation on show to match, so it takes the plum edge and a plum
     wash at 20%: enough to find the area on the one-colour city without
     bringing the palette back against the toggle. */
  const corp = regions ? areaCorp(area) : null;
  onStyle(glMap, (gl) => {
    SELECTED_ROADS.forEach((id, i) => {
      if (!gl.getLayer(id)) return;
      const r = ROADS[i];
      gl.setFilter(id, within ? ['all', notTunnel, inClass(...r.classes), within] : NO_WARD);
    });
    if (BASEMAP === 'paper') {
      /* On paper a picked area draws no border and no ground: the ward
         outlines never quite match where an area's places are, so the pins
         and the area's name say where it is instead. */
      if (gl.getLayer(PICKED_OUTLINE)) gl.setLayoutProperty(PICKED_OUTLINE, 'visibility', 'none');
      if (gl.getLayer('picked-outline-stripe')) gl.setLayoutProperty('picked-outline-stripe', 'visibility', 'none');
      if (gl.getLayer(PICKED_FILL)) gl.setPaintProperty(PICKED_FILL, 'fill-opacity', 0);
    } else {
    if (gl.getLayer(PICKED_OUTLINE)) {
      gl.setPaintProperty(PICKED_OUTLINE, 'line-color', corp ? corp.tone : EDGE);
    }
    if (gl.getLayer(PICKED_FILL)) {
      gl.setPaintProperty(PICKED_FILL, 'fill-color', corp ? corp.c : EDGE);
      gl.setPaintProperty(PICKED_FILL, 'fill-opacity', corp ? 0.8 : 0.2);
    }
    }
    const src = gl.getSource('picked');
    if (src) {
      src.setData(geometry
        ? { type: 'Feature', properties: {}, geometry }
        : EMPTY_GEOJSON);
    }
  });
}

/* Ground and name colours together, so a corporation's names stay in its tone. */
export function setTone(glMap, regions) {
  onStyle(glMap, (gl) => {
    gl.setPaintProperty('corp-ground', 'fill-color', groundColor(regions));
    corporations.forEach((c) => {
      const tone = BASEMAP === 'paper' ? AREA_INK : regions ? c.tone : DASH.tone;
      /* Place names follow their corporation; street names stay dark ink so
         they can be read against the road. */
      gl.setPaintProperty(`place-labels-${c.k}`, 'text-color', tone);
    });
  });
}

function labelLayers(regions) {
  return corporations.flatMap((c) => {
    const paper = BASEMAP === 'paper';
    const tone = paper ? AREA_INK : regions ? c.tone : DASH.tone;
    const within = ['within', { type: 'Feature', properties: {}, geometry: areaOf(c.k) }];
    return [
      /* Area names are always on; there is no toggle. They stay off the
         whole-city view, where they would bury the pins, and come in just past
         it, with a halo so they stay readable over the roads they cross. */
      omt(`place-labels-${c.k}`, 'symbol', 'place', {
        minzoom: 10.5,
        filter: ['all', inClass(...PLACE_CLASSES), within],
        layout: {
          ...(paper
            ? { 'text-field': ['upcase', name], 'text-font': AREA_FONT, 'text-max-width': 10, 'text-letter-spacing': 0.24,
              'text-size': ['interpolate', ['linear'], ['zoom'], 10.5, 9, 13, 10.5, 17, 12.5] }
            : { 'text-field': name, 'text-font': FONT, 'text-max-width': 9, 'text-letter-spacing': 0.06,
              'text-size': ['interpolate', ['linear'], ['zoom'], 10.5, 10, 13, 11.5, 17, 13.5] }),
        },
        paint: {
          'text-color': tone, 'text-halo-color': paper ? PAPER : ROAD, 'text-halo-width': paper ? 1.2 : 0.7, 'text-halo-blur': 0.3,
          /* Fade in over the first zoom level rather than popping on. */
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 10.5, 0, 11.5, 1],
        },
      }),
      /* Street names are read against the road they sit on, which is now a
         mid-tone ochre — the corporation tone on it was too close in value to
         make out. Ink is the map's darkest plum and the halo is the road's
         own cream, wide enough to carry the letters across the ground when a
         name runs off the end of its street. */
      omt(`road-labels-${c.k}`, 'symbol', 'transportation_name', {
        minzoom: 15,
        filter: within,
        layout: {
          'symbol-placement': 'line',
          'text-field': name, 'text-font': FONT, 'text-letter-spacing': 0.04,
          'text-size': ['interpolate', ['linear'], ['zoom'], 15, 10, 18, 13],
        },
        paint: {
          'text-color': OUTSIDE,
          'text-halo-color': ROAD,
          'text-halo-width': 1,
          'text-halo-blur': 0.2,
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.75, 1],
        },
      }),
    ];
  });
}

/* The map's own sources, shared by both basemaps. */
function ownSources() {
  return {
    corps: { type: 'geojson', data: corporationAreas },
    zones: { type: 'geojson', data: zones },
    edge: {
      type: 'geojson',
      data: { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: cityRings } },
    },
    /* The picked area's outline. Empty until an area is picked. */
    picked: { type: 'geojson', data: EMPTY_GEOJSON },
  };
}

const pickedFill = () => ({
  id: PICKED_FILL, type: 'fill', source: 'picked',
  paint: { 'fill-color': EDGE, 'fill-opacity': 0 },
});
const cityEdge = (color = EDGE, width = 0.75) => ({
  id: 'city-edge', type: 'line', source: 'edge', layout: round(),
  paint: { 'line-color': color, 'line-width': width },
});
const pickedOutlines = () => [
  {
    id: PICKED_OUTLINE, type: 'line', source: 'picked', layout: { 'line-join': 'round', 'line-cap': 'butt' },
    paint: {
      'line-color': EDGE,
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 14, 4.5, 18, 6],
      'line-opacity': 0.95,
    },
  },
  {
    id: 'picked-outline-stripe', type: 'line', source: 'picked', layout: { 'line-join': 'round', 'line-cap': 'butt' },
    paint: {
      'line-color': '#F8A800',
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 14, 4.5, 18, 6],
      'line-dasharray': [1.6, 1.6],
    },
  },
];

/* Positron as OpenFreeMap serves it, with the map's own layers slotted in:
   the corporation ground just over the background (clear until Colours is
   on), and the picked area, city edge and the poster's names (hidden, kept as
   the anchor wellness-map.js inserts its layers before) under Positron's
   labels. Its labels are set in the page's DM Sans, since the style can only
   load glyphs from one place and the pins' numbers need DM Sans. */
function positronStyle(regions) {
  const layers = positron.layers.map((l) => ({
    ...l,
    ...(l.source === 'openmaptiles' && { source: 'omt' }),
    ...(l.layout?.['text-font'] && { layout: { ...l.layout, 'text-font': FONT } }),
  }));
  const firstLabel = layers.findIndex((l) => l.type === 'symbol');
  const [background, ...ground] = layers.slice(0, firstLabel);
  const hiddenNames = labelLayers(regions).map((l) => ({ ...l, layout: { ...l.layout, visibility: 'none' } }));
  return {
    version: 8,
    glyphs: glyphsUrl(),
    sprite: positron.sprite,
    sources: {
      ne2_shaded: positron.sources.ne2_shaded,
      omt: { ...positron.sources.openmaptiles, attribution: VECTOR_CREDIT },
      ...ownSources(),
    },
    layers: [
      background,
      { id: 'corp-ground', type: 'fill', source: 'corps', paint: { 'fill-color': groundColor(regions) } },
      ...ground,
      pickedFill(),
      ...hiddenNames,
      cityEdge(),
      ...pickedOutlines(),
      ...layers.slice(firstLabel),
    ],
  };
}

/* ---------- the paper map ----------
   Flat and quiet: the whole ground one warm grey, inside the city and out,
   with the roads as paper-white channels through it. The only colours are
   pastel green for greenery and pastel blue for water, each with its own
   deeper line for anything round or across it. Rail and the city's edge, the
   lines that used to be black, are the ground's grey taken a step darker, so
   they read without shouting. A fine film grain lies over the whole map
   (#map::after in prompt-map.css). */
export const PAPER = '#F5F4F0';
const GROUND = '#DEDBD3';
/* Beyond the city limits the ground is a lighter grey. The greens and blues
   out there keep their fills here; the veil over them (outside-veil.js)
   takes their saturation down. */
const OUTSIDE_GROUND = '#F3F2EE';
/* Beyond the map's edge: the page's white, so the map sits on it as a disc.
   Matches --ground in wellness-map.css, the frame behind the map. */
const BEYOND_FILL = PAPER;
/* The ground's grey, a step darker: every line that was black. */
export const INK = '#D3D0C8';
/* Every green: parks, grass, woods, farmland. */
const PAPER_PARK = '#E5FECC';
const PAPER_WOOD = PAPER_PARK;
const PAPER_FARM = PAPER_PARK;
const WATER_FILL = '#DBFAFF';
/* Any line round or across the greens, and round or across the water. */
const EDGE_GREEN = '#B3ECBC';
const EDGE_BLUE = '#A9E5FF';

/* A layer that comes in at a zoom fades in rather than popping on: from
   FADE_LEAD before its zoom to FADE_SPAN after that start, on an ease-in-out
   curve so it neither starts nor lands with a jolt. fadeFrom is the zoom the
   layer must be switched on from for the fade to show. */
const FADE_LEAD = 0.5;
const FADE_SPAN = 2.75;
/* A strong ease-in-out: it lingers near clear at the start, which reads as a
   short delay, and eases slowly into full strength at the end. */
const FADE_EASE = ['cubic-bezier', 0.65, 0, 0.35, 1];
const fadeFrom = (zoom) => zoom - FADE_LEAD;
const fadeIn = (zoom) => ['interpolate', FADE_EASE, ['zoom'],
  fadeFrom(zoom), 0, fadeFrom(zoom) + FADE_SPAN, 1];

const flatFill = (id, sourceLayer, color, extra = {}) => omt(id, 'fill', sourceLayer, {
  ...extra, paint: { 'fill-color': color },
});
const inkLine = (id, sourceLayer, width, extra = {}, color = INK) => omt(id, 'line', sourceLayer, {
  ...extra, layout: round(), paint: { 'line-color': color, 'line-width': width },
});

/* The roads: paper, with no edge, widest last so a main road runs clean
   through the smaller streets that meet it. */
const PAPER_ROADS = [
  { id: 'minor', minzoom: 13, classes: ['minor', 'service'], stops: [13, 0.8, 15, 3, 18, 14] },
  { id: 'mid', minzoom: 11, classes: ['secondary', 'tertiary'], stops: [11, 1, 14, 3.5, 18, 20] },
  { id: 'major', minzoom: 8, classes: ['motorway', 'trunk', 'primary'], stops: [8, 1, 12, 3, 15, 8, 18, 28] },
];
function paperRoads() {
  return PAPER_ROADS.map((r) => omt(`road-${r.id}`, 'line', 'transportation', {
    minzoom: fadeFrom(r.minzoom), filter: ['all', notTunnel, inClass(...r.classes)],
    layout: round(),
    paint: { 'line-color': PAPER, 'line-width': byZoom(...r.stops), 'line-opacity': fadeIn(r.minzoom) },
  }));
}

/* Roads and footpaths through green areas. The tiles cannot tell a road it is
   in a park and MapLibre cannot cut a line at a polygon's edge, so the pieces
   inside green areas are cut ahead of time (scripts/osm-green-areas.mjs →
   public/data/green-roads.json), each tagged with the class it is drawn as.
   Inside a green area a road gets a thin green edge under its white, and a
   footpath is drawn green over its grey; outside, roads have no edge and
   paths stay grey, so no green line ever lies on grey ground. Empty until
   that file arrives. */
const EMPTY_LINES = { type: 'FeatureCollection', features: [] };
let greenRoadData = EMPTY_LINES;
/* How far the green edge shows past each side of a road. */
const GREEN_EDGE_WIDTH = 1;
/* MapLibre only takes a zoom curve at the top of a width, so the edge gets
   its own curve: the road's stops, each widened by the two edges. */
const widened = (stops, by) => stops.map((v, i) => (i % 2 ? v + by : v));
function greenRoadEdges() {
  return PAPER_ROADS.map((r) => ({
    id: `road-green-edge-${r.id}`, type: 'line', source: 'green-roads', minzoom: fadeFrom(r.minzoom),
    filter: ['==', ['get', 'c'], r.id],
    /* Butt ends, so an edge stops flat at the park's boundary rather than
       bulging past it. */
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: {
      'line-color': EDGE_GREEN,
      'line-width': byZoom(...widened(r.stops, GREEN_EDGE_WIDTH * 2)),
      'line-opacity': fadeIn(r.minzoom),
    },
  }));
}
function greenPaths() {
  return [{
    id: 'path-green', type: 'line', source: 'green-roads', minzoom: fadeFrom(15),
    filter: ['==', ['get', 'c'], 'path'],
    layout: { 'line-cap': 'butt', 'line-join': 'round' },
    paint: { 'line-color': EDGE_GREEN, 'line-width': 1, 'line-opacity': fadeIn(15) },
  }];
}
/* Hands over the clipped road pieces; kept, so any later style carries them.
   They come in two parts (the main roads first, the minor roads and paths
   when the map is zoomed in), each added to what is already there. */
const greenParts = {};
export function setGreenRoads(glMap, data, part = 'far') {
  greenParts[part] = data.features || [];
  data = { type: 'FeatureCollection', features: Object.values(greenParts).flat() };
  greenRoadData = data;
  /* The file can arrive before the style has made its sources; then it waits. */
  const src = glMap.getSource('green-roads');
  if (src) src.setData(data);
  else glMap.once('style.load', () => glMap.getSource('green-roads')?.setData(data));
}

/* The city's parks are grass in OpenMapTiles, told apart by subclass; the park
   layer itself holds only the protected areas. */
const PARK_FILTER = ['in', ['get', 'subclass'], ['literal', ['park', 'garden', 'recreation_ground']]];

function paperStyle(regions) {
  /* Area names show, set in the paper map's spaced capitals; street names
     stay off, so the roads read as clean white channels. */
  const hiddenNames = labelLayers(regions).map((l) => (l.id.startsWith('place-labels')
    ? l : { ...l, layout: { ...l.layout, visibility: 'none' } }));
  return {
    version: 8,
    glyphs: glyphsUrl(),
    sources: {
      omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: VECTOR_CREDIT },
      'green-roads': { type: 'geojson', data: greenRoadData },
      outside: { type: 'geojson', data: mask },
      beyond: { type: 'geojson', data: BEYOND },
      ...ownSources(),
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': GROUND } },
      /* Under the greens and water, so only the ground beyond the city lightens. */
      { id: 'outside', type: 'fill', source: 'outside', paint: { 'fill-color': OUTSIDE_GROUND } },

      flatFill('farm', 'landcover', PAPER_FARM, { filter: inClass('farmland') }),
      flatFill('green', 'landcover', PAPER_PARK, { filter: inClass('grass', 'wetland') }),
      flatFill('green-spaces', 'landuse', PAPER_PARK, {
        filter: inClass('cemetery', 'pitch', 'stadium', 'track', 'playground', 'theme_park', 'zoo'),
      }),
      flatFill('wood', 'landcover', PAPER_WOOD, { filter: inClass('wood') }),
      /* Parks over the woods inside them, so a park reads as one place. */
      flatFill('park', 'landcover', PAPER_PARK, { filter: PARK_FILTER }),
      flatFill('protected', 'park', PAPER_PARK),
      flatFill('water', 'water', WATER_FILL, { filter: notTunnel }),

      inkLine('water-edge', 'water', 1, { filter: notTunnel }, EDGE_BLUE),
      /* Every green is outlined, not only the parks. */
      inkLine('green-edge', 'landcover', 0.8, { filter: inClass('grass', 'wetland', 'wood', 'farmland') }, EDGE_GREEN),
      inkLine('green-spaces-edge', 'landuse', 0.8, {
        filter: inClass('cemetery', 'pitch', 'stadium', 'track', 'playground', 'theme_park', 'zoo'),
      }, EDGE_GREEN),
      inkLine('protected-edge', 'park', 0.8, {}, EDGE_GREEN),
      inkLine('waterway', 'waterway', byZoom(12, 1, 18, 5), { filter: notTunnel }, EDGE_BLUE),

      /* Corporation colours, when on, wash over the ground. */
      {
        id: 'corp-ground', type: 'fill', source: 'corps',
        paint: { 'fill-color': groundColor(regions), 'fill-opacity': 0.35 },
      },
      pickedFill(),

      inkLine('rail', 'transportation', byZoom(10, 0.6, 16, 1.5), {
        filter: ['all', notTunnel, inClass('rail', 'transit')],
      }),
      /* Footpaths in the darker grey, and green where they cross a green area. */
      {
        ...inkLine('path', 'transportation', 1, {
          minzoom: fadeFrom(15), filter: ['all', notTunnel, inClass('path', 'track')],
        }),
        paint: { 'line-color': INK, 'line-width': 1, 'line-opacity': fadeIn(15) },
      },
      ...greenPaths(),
      ...greenRoadEdges(),
      ...paperRoads(),

      /* No edge: the map carries on past the region on every side. The
         camera is still held to the region (wellness-map.js applyMaxBounds),
         so the rest of the world never comes into view. */

      ...hiddenNames,
      cityEdge('#B5AFA4', 1.6),
      ...pickedOutlines(),
    ],
  };
}

/* `regions`: open with the corporation colours on rather than the plain city. */
export function glStyle(regions = false) {
  if (BASEMAP === 'poster') return posterStyle(regions);
  if (BASEMAP === 'positron') return positronStyle(regions);
  return paperStyle(regions);
}

function posterStyle(regions = false) {
  return {
    version: 8,
    glyphs: glyphsUrl(),
    sources: {
      /* The Leaflet layer reads its credit line from the sources. */
      omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: VECTOR_CREDIT },
      outside: { type: 'geojson', data: mask },
      ...ownSources(),
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': BACKDROP } },
      { id: 'corp-ground', type: 'fill', source: 'corps', paint: { 'fill-color': groundColor(regions) } },
      /* Blocks a shade deeper than the ground: lots, campuses, yards. */
      omt('blocks', 'fill', 'landuse', {
        filter: inClass('commercial', 'retail', 'industrial', 'garages', 'railway', 'school', 'university',
          'college', 'hospital', 'military'),
        paint: { 'fill-color': '#000000', 'fill-opacity': 0.045 },
      }),
      omt('aeroway', 'fill', 'aeroway', {
        filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#000000', 'fill-opacity': 0.05 },
      }),

      /* Greenery, flat. */
      omt('green', 'fill', 'landcover', {
        filter: inClass('grass', 'wood', 'farmland', 'wetland'),
        paint: { 'fill-color': ['match', ['get', 'class'], 'wood', WOOD, GREEN] },
      }),
      omt('green-spaces', 'fill', 'landuse', {
        filter: inClass('cemetery', 'pitch', 'stadium', 'track', 'playground', 'theme_park', 'zoo'),
        paint: { 'fill-color': GREEN },
      }),
      omt('park', 'fill', 'park', { paint: { 'fill-color': GREEN } }),

      omt('water', 'fill', 'water', { filter: notTunnel, paint: { 'fill-color': WATER } }),
      omt('waterway', 'line', 'waterway', {
        filter: notTunnel, layout: round(), paint: { 'line-color': WATER, 'line-width': byZoom(12, 1, 18, 8) },
      }),

      /* Buildings only right up close. */
      omt('buildings', 'fill', 'building', {
        minzoom: 16, paint: { 'fill-color': '#000000', 'fill-opacity': 0.06 },
      }),

      /* Past the city limits: one flat red ground, with only the roads on it. */
      { id: 'outside', type: 'fill', source: 'outside', paint: { 'fill-color': BACKDROP } },

      /* The picked area's ground, under the roads: deep enough to find the
         neighbourhood at a glance, and out of the way of everything drawn
         after it — streets, names, routes and pins all stay legible over it.
         Empty until an area is picked, so the paint here is only a default. */
      pickedFill(),

      ...roadLayers(),

      ...labelLayers(regions),

      /* The same hairline as the outline on the cluster pins, at every zoom. */
      cityEdge(),

      /* The picked area, drawn round, in blocks of yellow so it reads as a
         two-colour band. Over everything, because knowing where the
         neighbourhood ends is the point of picking one. */
      ...pickedOutlines(),
    ],
  };
}
