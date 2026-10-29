# Mumbai Wellness Map

An interactive map of places, routes, clinics, kitchens and communities for
looking after yourself in Mumbai, built as an [Astro](https://astro.build)
site. Built by the marketing team at [Plum](https://plumhq.com).

It is a copy of the [Bengaluru Wellness Map](https://www.plumhq.com/health-map/bengaluru),
with the city swapped. Most of this README was written for Bengaluru and still
describes the code accurately; where it names Bengaluru's data, read Mumbai's.

## Mumbai: what changed, what is still to do

**Changed**

- **City outline**: the BMC area, which OpenStreetMap has as Mumbai City
  District (relation 7964376) plus Mumbai Suburban District (7964375). The
  outline is the two joined along their shared border.
- **"Corporations" are BMC's six zones** (OSM relations 7888964–7888969).
  The code still calls them corporations. Keys, names and colours are in
  `src/data/corporations.json`: `South` (Zone 1, South Mumbai), `Central`
  (Zone 2), `West` (Zone 3, Bandra–Andheri), `NorthWest` (Zone 4,
  Goregaon–Dahisar), `East` (Zone 5, Kurla–Chembur–Govandi), `NorthEast`
  (Zone 6, Ghatkopar–Bhandup–Mulund). Use these keys in an entry's `rg`.
- **Navi Mumbai** (Navi Mumbai Municipal Corporation, OSM relation 13180880)
  is the seventh zone, key `NaviMumbai`, across Thane Creek. Kharghar,
  Panvel and Ulwe are Panvel Municipal Corporation and are not on the map.
  The OSM areas every build script uses are in `scripts/city.mjs`.
- **Thane** (Thane Municipal Corporation, OSM relation 7120000: Thane city,
  Ghodbunder Road, Kalwa, Mumbra, Diva) is the eighth zone, key `Thane`.
- **Mira-Bhayandar** (Mira-Bhayandar Municipal Corporation, OSM relation
  13180677: Mira Road, Bhayandar, Kashimira, Uttan) is the ninth zone, key
  `MiraBhayandar`.
- **Wards** are BMC's 24 administrative wards (A Ward … T Ward), each labelled
  with the neighbourhoods it is known by.
- **Metro**: the running Mumbai Metro lines and stations from OSM.
- **Parks**: Mumbai's public parks, gardens and maidans from OSM
  (`node scripts/osm-parks.mjs`), in place of Bengaluru's BBMP register.
  Named ones of 500 m² or more; society gardens, school grounds, clubs and
  generic names ("park 1") are left out. Fix a wrong one in OSM and rerun.
- **Green roads**: rebuilt over Mumbai's parks and forests.
- All the on-page text says Mumbai.
- **The logos say "Be well, Mumbai"** (`public/be-well-logo*.svg`). "Be Well,"
  is the original hand lettering. "Mumbai" is set in Kalam Bold (Indian Type
  Foundry, SIL Open Font License) in the long and short logos, and in
  Grenette Pro with the original's letter spacing in the plain one, both
  converted to outlines. A hand-lettered "Mumbai" from the designer would
  match the brush strokes better.

**Cleared, waiting for Mumbai data**

- Places (`sources/entries/healthmap_v8_recategorised.csv`, header only)
- Routes (`sources/routes/*.csv`, header only)
- Communities (`src/data/community-categories.json`), themed days
  (`src/data/themed-days.json`), map ornaments (`src/data/ambient.json`)

**Kept as they were**

- Plum Perks partner brands and the online Plum events, which are not
  tied to a city. One perk, Praan Health, is listed at Koramangala.
- **All the other artwork**, which is still Bengaluru's as a placeholder: the
  hero, the stamp, the vignettes, the 404 map and the share image
  `og-be-well-bengaluru-3.jpg`. Their alt text still says Bengaluru because
  it describes the images. Change both together.
- The Plum HQ pin is hidden, since it is in Bengaluru (`PLUM_HQ` in
  `src/scripts/wellness-map.js`).
- The disclaimers still name the courts at Bengaluru, since that is
  Plum's legal seat and not the map's city.

## What it is

The map fills the window. Everything else — the search, the filters, the count
and the list — sits in one rounded card floating over it on the left, clear of
every edge, with the filters and the result count pinned to the top of the card
while the list scrolls underneath. The map is drawn from OpenStreetMap data in its
own palette, after a transit poster: the whole city is one flat lavender
ground with blocks a shade deeper (or, with Corporation colours on, each of the
five Greater Bengaluru Authority city corporations in its own hue), roads are
chunky, rounded where they meet, and inside the city a deeper, pinker tone of
the ground they cross (cream outside it), water is periwinkle, and
past the city limits everything but the roads is dark plum. Streets and names
only appear close in.

Filtering is done with the pins themselves rather than with words: a row of
category glyphs, each carrying its category's colour as a dot, and under it the
sub-category glyphs — the exact icons the pins on the map are drawn with. What
each one means is in its tooltip. That is the same pair of cues a pin gives
you: colour for the category, glyph for the sub-category.

- **395 entries** across six categories and 30 sub-categories, each with a
  hand-drawn icon.
- **319 have a pin.** 40 have no fixed address (run clubs, accounts to follow)
  and 36 sit outside the city limits (day trips, outbound cycling routes). Both
  groups stay in the list rather than being deleted.
- **Trails can be drawn as lines** rather than pins, start to finish. See
  [Adding routes](#adding-routes).
- **Corporation colours** switches between each corporation in its own hue and
  the whole city in poster lavender, which is how the map opens.
- **Picking an area** puts its name on the map. Areas that share a name with a
  ward (about 65) also get that ward filled red, under the roads.
- **Zooming out stops at the whole city**, with room around it for the
  controls.
- **The toolbar** (top left) zooms, switches between the map and an **index**
  of every entry (grouped by intent and searchable), and toggles running and
  cycling routes (also shown whenever Move is picked), running metro lines,
  the corporation colours and place names.
- **The legend** (under the toolbar) picks the area, counts the pins per intent
  in it, and filters by intent.
- **The list** (bottom left) shows a photo per place and has a **Randomize**
  button. Picking a pin or a result opens a place card with its photo, notes,
  tags and links. **Find your people** (bottom right) opens **Communities**,
  which lists the clubs and accounts, each with a line about it and a link to
  its site or Instagram.
- **Pins stay clustered** until street level (zoom 17).
- **Metro and Parks** are two reference layers over the top: the Namma Metro
  alignment, and 610 of BBMP's parks with their hours and amenities. Both
  switch off.

Two routes are built:

| Route | For |
|---|---|
| `/` | The standalone page, with the wordmark, canonical URL and social meta |
| `/embed` | The same map for an iframe: `noindex`, and it fills whatever height the frame gives it |

## Run it

Needs Node 22.12 or newer.

```bash
npm install
npm run dev      # http://localhost:4321 — fast, but not production routing
npm run preview  # builds, then runs the real Cloudflare Worker on :8787
```

`npm run preview` is the one that matters before a deploy. It runs the same
worker Webflow Cloud runs, which is the only local setup that reproduces how
requests are actually routed. `npm run dev` is fine for editing content, but it
does not run the flattening hook and does not reflect production routing.

To see the file layout a mounted deployment produces:

```bash
BASE_PATH=/health-map/mumbai npm run build
```

Every asset URL in the code is built from `import.meta.env.BASE_URL`, so the
whole map moves under the mount path with nothing else to change. Note that
`wrangler dev` serves from the root, so a build with `BASE_PATH` set renders
unstyled locally — the page asks for `/health-map/mumbai/…` while the assets
sit at `/…`. That is a local-only artefact of there being no mount prefix.
Check status codes locally, appearance in production.

## How Webflow Cloud serves this

**Read this before changing how anything is served.** Getting this page to load
took two failed deploys; three behaviours interact, and fixing one in isolation
re-breaks another. The same ground cost real time on `plumhq.com/ai-secure`
before this.

### 1. No page may be a static HTML file

Webflow forces a trailing slash onto every static HTML asset it serves, and
then 301s that slash straight back off at its own edge:

```
/health-map/mumbai/embed   -> 307 -> /health-map/mumbai/embed/   (Cloudflare asset handler)
/health-map/mumbai/embed/  -> 301 -> /health-map/mumbai/embed    (Webflow's edge)
```

That is an unbreakable loop, and it is what made the first two deploys hang
rather than load. Two things about it, both measured on the live deploy rather
than assumed:

- **The Webflow 301 is behaviour, not cache.** Verified with a cache-busting
  query string returning `cf-cache-status: MISS`. There is no cache purge that
  fixes it.
- **It is not about directory indexes, and renaming does not help.** The first
  attempt set `build.format: 'file'` so `/embed` was written as `embed.html`
  rather than `embed/index.html`, on the theory that the asset handler only
  treats a *directory index* as a directory. It does not: on the live deploy
  all four `.html` pages 307'd, while the one worker-rendered page answered
  200. Webflow's asset config forces the slash on any HTML asset, whatever it
  is called.

`wrangler.json` sets `html_handling: "drop-trailing-slash"`, which would
disable the 307, **but Webflow overrides the whole `assets` block**, so it
never takes effect in production. It is kept only so `npm run preview` behaves
like production locally.

**The fix:** every page is rendered by the worker, so no HTML asset exists for
the handler to act on. `output: 'server'` in `astro.config.mjs` makes on-demand
the default, so no page carries a `prerender` declaration — and
`src/pages/index.astro` spells out `prerender = false` because it is the route
the whole thing turns on. **Adding `prerender = true` to any page puts that
page back in the loop.** This is the only reason the app needs a server output
and the Cloudflare adapter at all; nothing here is dynamic.

`trailingSlash: 'never'` keeps Astro pointing the same way as Webflow, so the
two layers never redirect against each other. `build.format` is deliberately
unset: with no static HTML in the output, there is nothing for it to name.

The cost is that every page render runs the worker. For this app that is
cheap — the worker gzips to about 0.5 MB against a 3 MB limit, and the heavy
part (the map data, the tiles) was always client-side anyway.

### 2. Webflow overrides `base`, so the build flattens its own output

Astro copies the client build into a subdirectory named after `base`. Webflow
then serves `dist/client` from the mount path, applying the prefix a second
time:

```
disk dist/client/health-map/mumbai/X  ->  URL /health-map/mumbai/health-map/mumbai/X   (wrong)
disk dist/client/X                       ->  URL /health-map/mumbai/X                        (wanted)
```

Setting `base: '/'` fixes this locally and is silently discarded in production —
**Webflow injects the mount path as `base` at build time.** So instead,
`flattenBaseDir` in [`astro.config.mjs`](astro.config.mjs) moves
`dist/client/<mount path>/*` up in an `astro:build:done` hook. That runs inside
`astro build`, so it applies however Webflow invokes the build; a `postbuild`
npm script would not.

The directory it flattens is read from the **resolved** config, not a constant,
so it always matches whatever `base` the build actually ran with — including the
one Webflow injects. Changing the mount path in the Webflow dashboard therefore
needs no change here. It also walks up and removes every level it emptied, so a
mount path of two or more segments (`/health-map/mumbai` is two) does not
leave an orphan directory behind.

### 3. Verifying a deploy

A deploy that silently did not happen looks identical to one that did.
[`public/build.json`](public/build.json) exists so that is checkable: bump
`"build"` in any commit that touches routing or the build, then confirm the
number being served is the one you expect *before* concluding anything about a
fix.

```bash
curl -sS https://www.plumhq.com/health-map/mumbai/build.json
```

Then the actual health check:

```bash
curl -sS -o /dev/null -w "%{http_code} hops=%{num_redirects}\n" -L \
  https://www.plumhq.com/health-map/mumbai
```

- `200 hops=0` — healthy.
- A large hop count, or the browser saying too many redirects — the loop is
  back. Something is being served as a static HTML file; check that no page has
  gained a `prerender = true`, and that `find dist/client -name '*.html'` after
  a build returns nothing.
- `404` — check whether `/health-map/mumbai/health-map/mumbai/` responds.
  If it does, the flattening hook did not run.

## Publishing it on Webflow Cloud

Webflow Cloud builds this repo and serves it from a path on the Webflow site
itself, so the map lives at `plumhq.com/<mount path>` rather than on a separate
domain. [`webflow.json`](webflow.json) names the framework;
[`wrangler.json`](wrangler.json) configures the local worker.

1. **Create the app.** In the Webflow site settings, Webflow Cloud → Install
   the GitHub App → pick this repository, then create an environment: a branch
   (`main`) and a **mount path** (`/health-map/mumbai`).
2. **Set `SITE_URL`** on the environment (Environment → Variables) to the
   published address (`https://www.plumhq.com`). That is the only thing the
   build cannot work out on its own; it feeds the canonical and `og:url` tags
   on the standalone page. Without it those tags are left out rather than
   pointing somewhere wrong.
3. **Deploy.** Pushing to the branch builds and deploys. Webflow Cloud needs
   Node 22.12 or newer, which `package.json` declares.
4. **Publish the Webflow site** once, so the mount path starts serving.
5. **Check it** with the two commands under
   [Verifying a deploy](#3-verifying-a-deploy).

The map is then at `https://www.plumhq.com/health-map/mumbai` and the
iframe copy at `https://www.plumhq.com/health-map/mumbai/embed` — **no
trailing slash**, on either.

## Putting the map inside a Webflow page

Webflow's Embed element caps out at 50,000 characters, and this page is a good
deal larger than that, so it goes in as an iframe pointing at the published
site rather than as pasted markup. That is also what you want for a page you
keep adding to: you republish here, and every Webflow page showing the map
updates without anyone touching Webflow.

1. **Copy [`webflow/embed-snippet.html`](webflow/embed-snippet.html)** into a
   Webflow Embed element (Add panel → Components → Embed).
2. **Change the `src`** in the snippet to your published URL, keeping the
   `/embed` path and **no trailing slash** — a slash costs the frame a 301 on
   every load.
3. Publish the Webflow site. Embeds do not render in the Designer canvas —
   use Preview or the published page to see it.

Two things worth knowing:

- **The frame decides the height.** The map fills it, so a frame that is too
  short shows a cramped map rather than a scrollbar. The snippet uses `82vh`
  with a `620px` floor, and the whole screen on a phone — the filter bar takes
  several rows at that width, so there is less room than you would think.
  Inside the frame the list scrolls in its own box rather than the frame
  scrolling, so a swipe on the map or the list does what you expect and a swipe
  anywhere else moves the Webflow page.
- **`?chrome=off`** hides the map's own wordmark, for a Webflow section that
  already has a heading above the frame. Drop it to keep the wordmark. The
  credit line at the bottom stays either way — it carries the data sources and
  the "not medical advice" note.

Serving the map from the same origin as the Webflow page also means no
`X-Frame-Options` trouble, which is what makes a frame come up blank on other
hosts.

## Adding entries

Edit [`src/data/entries.json`](src/data/entries.json) and rebuild. A listing is
one object in that array:

```json
{
  "id": "BLR-396",
  "n": "Name as it should read on the card",
  "c": "Activities",
  "g": "swim",
  "a": "Indiranagar",
  "lat": 12.971891,
  "lon": 77.641151,
  "rg": "Central",
  "d": "One or two sentences. This is the card blurb and the popup text.",
  "gm": "https://maps.app.goo.gl/…",
  "w": "https://…",
  "ig": "@handle",
  "p": "₹₹",
  "b": "Beginners, Solo",
  "t": "Mon–Sat, 6:00–21:00",
  "tg": ["indoor", "beginner-friendly"],
  "src": "Where you got this",
  "v": "Verified"
}
```

Only `id`, `n` (name), `c` (category) and `g` (sub-category) are required.
Everything else fills in as empty, and an entry with no `lat`/`lon` still
appears in the list, without a pin.

| Field | Notes |
|---|---|
| `c` | One of the six categories in [`src/lib/categories.js`](src/lib/categories.js) |
| `g` | A sub-category key from the same file. A new one fails the build until it is added there with a label and an icon — that is deliberate |
| `a` | The area. A new area appears in the Area dropdown by itself, under its corporation |
| `rg` | `Central`, `North`, `East`, `South` or `West`. Leave it out for an online community or anywhere past the city boundary |
| `lat` / `lon` | Copy from Google Maps at six decimal places. Three decimals is about 110 m of error, which is enough to put a lake pin on dry land |
| `out` | `1` for somewhere beyond the gazetted boundary. It stays in the list, without a pin |
| `v` | `Verified`, `Needs check` or `Community-reported`. Drives the coloured dot on the card |

**The build checks your work.** `npm run build` (and every save under
`npm run dev`) runs [`src/lib/validate.js`](src/lib/validate.js), which stops
with the entry id and the reason on a duplicate id, an unknown category or
sub-category, a sub-category filed under the wrong category, half a coordinate
pair, or a coordinate that lands outside Greater Bengaluru without `"out": 1`.

The area dropdown, the per-corporation counts and the tallies in the header and
footer are all counted from the data at build time, so adding a listing is one
edit in one file.

## The metro and the parks

Two reference layers, neither of which is an entry.

**The metro** is the Namma Metro lines that are running, straight from
OpenStreetMap:

```bash
node scripts/osm-metro.mjs
```

[The script](scripts/osm-metro.mjs) takes OSM's `route=subway` relations for
Namma Metro and keeps only track tagged `railway=subway`; track still being
built is tagged `railway=construction`, so a line appears once OSM shows it
open. It writes `src/data/metro.json`, one feature per line in the line's
colour. Re-run it when a line opens.

**The parks** are built from KML by
[`scripts/kml-to-geojson.mjs`](scripts/kml-to-geojson.mjs), which also still
writes an older, uncoloured `metro.json` from a rail KML — re-run
`osm-metro.mjs` after it. The KMLs themselves are not committed, the same way
the entry spreadsheet is not.

**The parks** come from BBMP's own register, which is a working document rather
than a clean dataset, and the script has to be defensive about it:

- **Coordinates.** Some have lost their decimal point (`77331399`), some have
  latitude and longitude the wrong way round. Both are repaired. 672 rows still
  do not land anywhere in Bengaluru — around 500 of them sit in a cluster near
  Harohalli, some 40 km southwest — and those are dropped rather than guessed
  at. 610 of the 1,282 rows survive with a position that can be trusted.
- **Personal details.** The register carries the maintenance contractors' names
  and mobile numbers, and in 101 rows someone has typed them into the
  opening-hours column. Nothing matching a phone number reaches the page, and
  the script exits rather than write a file containing one. If you re-run it
  against a newer export and it refuses, that guard is the reason.
- **Names.** 147 rows are named after the work order rather than the park
  ("Maintenance Of Park in ward no-174 ... (FOODYS PARK)"). Where one ends in a
  bracketed name, that is used.

## Adding routes

Entries whose shape matters can be drawn as a line instead of a pin. Add a
GeoJSON `LineString` feature to
[`src/data/routes.json`](src/data/routes.json), with the entry's id and the
distance in its properties:

```json
{
  "type": "Feature",
  "properties": { "id": "BLR-152", "km": 4.2, "loop": true },
  "geometry": { "type": "LineString", "coordinates": [[77.5929, 12.9763], "…"] }
}
```

A loop gets one marker; a point-to-point route gets **A** at the start and
**B** at the finish. Coordinates are `[longitude, latitude]`, GeoJSON's order,
which is the reverse of the `lat`/`lon` fields on an entry.

Mumbai's lines come from
[`sources/routes/mumbai-routes.csv`](sources/routes/mumbai-routes.csv): each
route's start, turn points and end, traced by `scripts/snap-routes.mjs`
against OpenStreetMap (FOSSGIS foot and bike routing for roads and seafronts,
Overpass footways and park or lake outlines for loops). Every trace was looked
at on a map; rows marked `hold` were traced wrong and stay as pins. When
Overpass is down, `--cached-only` redraws everything it has already answered.

**Do not import routes from MapMyRun, Strava or Komoot.** Those are user
uploads under terms that do not allow republishing the geometry. The best
source is the club that runs the route, which also comes with permission.

## The basemap and the boundaries

The basemap is OpenStreetMap data served as vector tiles by
[OpenFreeMap](https://openfreemap.org) (free, no key), drawn by MapLibre GL
with the style in [`src/lib/basemap.js`](src/lib/basemap.js). Everything on
the map is MapLibre too: routes, metro, clusters and pins are GL layers added
in `wellness-map.js`, so panning and zooming stay on the GPU, and the credit
line sits at the foot of the About panel. Each corporation's ground (`c`) and
name colour (`tone`) live in
`corporations.json`; blocks are translucent black over the ground, which is how
one style deepens every corporation's own hue. Change those, or any other
colour in the style. Without WebGL, or if OpenFreeMap is unreachable, the map falls
back to the OSM Foundation's raster tiles.

MapLibre parses tiles in a web worker it finds by a path computed at runtime,
which bundlers cannot follow. That is why `astro.config.mjs` keeps MapLibre out
of Vite's dependency optimiser and the map script hands MapLibre a worker URL
that Vite has bundled.

The city outline, the five corporation outlines and the ward polygons all come
from OpenStreetMap too, and are baked into `src/data/` rather than fetched by
the page:

```bash
node scripts/osm-boundaries.mjs
```

[The script](scripts/osm-boundaries.mjs) lists the wards through Overpass,
fetches simplified polygons from Nominatim (assembling any ward Nominatim has
not indexed yet from Overpass), and rewrites `zones.json`,
`corporation-areas.json`, `mask.json`, `city.json` and the areas in
`corporations.json`. Re-run it when the boundaries change in OSM. It also lists every entry whose `rg` disagrees
with the corporation its pin falls in; it does not edit `entries.json`.

## Pins, marks and thumbs

Each map intent has one hand-drawn pin in `public/icons/intent-pin/`, and every
place on the map is its intent's pin. The legend, the chips and the index
headings use the glyph alone in the pin's colour; index cards put the glyph in
its own colours on a tile of the pin's colour. Both are cut from the pins, so to
change an icon, replace the pin SVGs and re-run:

```bash
node scripts/intent-pins.mjs "path/to/Map icons svg pin"
```

File names become slugs (`work out.svg` → `work-out`) and must match `icon` in
`src/lib/intents.js`. Communities has no pin and keeps its older icon.

List rows and the place card show the glyph in cream on the place's brand
colour when its name carries a well-known brand (`src/lib/brands.js`, picked by
eye from the logos), and on its intent's pin colour otherwise. Communities
keeps tinted tiles with initials. No Google or scraped photos.

## Where the data comes from

| What | Source | Licence |
|---|---|---|
| The entries | Compiled by hand | Ours |
| Metro lines | OpenStreetMap Mumbai Metro route relations, running track only | ODbL |
| Parks | OpenStreetMap parks, gardens and maidans (scripts/osm-parks.mjs) | ODbL |
| City, corporation and ward boundaries | OpenStreetMap relation 7902476 and the admin boundaries inside it | ODbL |
| Basemap | OpenStreetMap vector tiles via OpenFreeMap (OpenMapTiles schema) | ODbL, free with attribution |
| Underlying map data | OpenStreetMap contributors | ODbL |

The code is MIT; the data is not all ours to relicense.

## Known issues

- **Some entries name the wrong corporation.** Their `rg` was set against the
  July 2025 draft boundaries, and the map now draws OpenStreetMap's. The pins
  are in the right place; the corporation filter and the popup label are what
  is off. `node scripts/osm-boundaries.mjs` lists them.
- **22 coordinates need a look.** Five pairs are the same place entered twice,
  Sankey Tank appears twice 500 m apart, and two entries share coordinates
  despite being different businesses. 346 entries carry a Google `place_id`, so
  one pass through the Places API would settle all of them.
- **Some jogging loops are filed as Communities**, not under Running & trails:
  Agara Lake, Ulsoor Lake, Sankey Tank, Lalbagh and Cubbon Park. The search says
  when a filter is hiding matches, but the underlying fix is to let an entry
  carry more than one sub-category.
- **Two entries are filed oddly**: one gym sits under Activities rather than
  Health investments, and four entries still have placeholder Google Maps URLs.

## Layout

```
sources/                     CSV / GeoJSON inputs for the ingest scripts
src/
  data/
    entries.json         the listings — this is the file you edit
    events.json          curated weekly events slot
    corporations.json    the five GBA corporations: label, ground and name colours, area
    city.json            the city's bounding box and area
    zones.json           one polygon per ward, with its corporation (OSM)
    corporation-areas.json  the five corporations, for the ground colours (OSM)
    mask.json            the city cut out of a rectangle: the red ground outside it
    routes.json          traced trails, keyed by entry id
    metro.json           the running Namma Metro lines, one per colour (OSM)
    parks.json           BBMP parks: where, when open, what is in them
    park-amenities.json  amenity keys -> the words in the popup
    icons.json           30 sub-category icons as SVG paths
    labels.json          sub-category keys -> the words on the card
    intent-pins.json     each intent pin's colour (scripts/intent-pins.mjs)
    perks.json           Plum Perks partner brands: cards, never pins
  lib/
    categories.js        the six categories and their sub-categories
    db.js                data -> one database, with areas and counts derived
    validate.js          the build-time check on entries.json
    basemap.js           the poster-style MapLibre style, the raster fallback
    road-fillets.js      a GPU pass that rounds the corners where roads meet, sized by zoom
    brands.js            brand colours for the places list, matched on names
  components/
    WellnessMap.astro    the markup, and where the styles and script come in
  scripts/
    wellness-map.js      filters, list, cards and the MapLibre map with its pins and routes
  styles/
    wellness-map.css     tokens (Notion-style), list rows, the place card, map labels
    prompt-map.css       the chrome over the map: sentence, menus, list, About
  layouts/BaseLayout.astro
  pages/
    index.astro          / — every page renders in the worker, never prerendered
    embed.astro          /embed — the iframe version for Webflow
scripts/ingest-entries.mjs   places CSV -> entries.json
scripts/ingest-perks.mjs     Plum Perks CSV -> perks.json
scripts/ingest-routes.mjs    routes CSV -> entries + provisional lines
scripts/ingest-running-routes.mjs  running-routes pack -> entries + lines
scripts/snap-routes.mjs      provisional lines -> OSM / OSRM traces
scripts/kml-to-geojson.mjs   the two KML sources -> metro.json and parks.json
scripts/osm-boundaries.mjs   OpenStreetMap -> zones, corporation areas, mask, city box
scripts/osm-metro.mjs        OpenStreetMap -> metro.json (running lines only)
scripts/intent-pins.mjs      the intent pins -> their marks, tiles and intent-pins.json
webflow/embed-snippet.html   copy-paste into a Webflow Embed element
webflow.json                 tells Webflow Cloud this is an Astro app
wrangler.json                the local worker; Webflow overrides the assets block
public/build.json            bump it to prove a deploy actually landed
public/events/               weekly-event cover art
astro.config.mjs             trailingSlash, server output, adapter, flattenBaseDir
```
