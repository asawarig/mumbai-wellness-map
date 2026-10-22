# Bengaluru Wellness Map — handoff

Paste this at the start of a new chat, with `bengaluru-wellness-map.zip` attached.

---

You are picking up an Astro + MapLibre map built by Plum's marketing team. It plots
2,610 wellness places across Bengaluru — gyms, clinics, courts, lakes, running
routes — filtered by nine categories and by area.

**Read `START-HERE.md` to run it, then `sources/entries/CHANGELOG.md` for the full
history.** This file is only the things that are not obvious from the code, and
that have already cost someone a day.

## Where it stands

| | |
|---|---|
| Entries | 2,610 |
| Categories | care 538 · work out 493 · play 471 · move 358 · eat 231 · mental health 217 · gear 88 · communities 57 |
| Parked, off-map | hospitals 91 · indulge 66 |
| Route lines | 87 (3 are straight-line placeholders) |
| Tagged `playo` | 166 |
| Tagged `plum-perks` | 101 |
| GitHub `main` | `25e443e` |
| Staging | https://bengaluru-wellness-map-main.vercel.app |
| Production | plumhq.com, via **Webflow Cloud** — deployed by hand, not from `main` |

Play is capped at **500 pins** by the owner. 471 used, **29 left**.

## Read this before you touch the repo

**Two deploy targets, and only one of them is real.** Vercel is staging and ships
`noindex`; the live site is Webflow Cloud at plumhq.com, mounted at
`/health-map/bengaluru`. A plain `npm run build` targets Webflow (Cloudflare
adapter). If a Webflow build log says `adapter: @astrojs/vercel`, stop — every
page will 404. Never set `BASE_PATH` on Vercel; Webflow injects it.

**Uncommitted work may be sitting in the working directory.** At the time of
writing, `src/components/AboutCopy.astro` and `src/scripts/wellness-map.js`
differ from `main` — deployed to Vercel, not branched. Diff against `main` before
assuming the repo is the truth.

## Eight things that will bite you

**1. Run the ingests in order, or you delete the routes.**
`ingest-entries.mjs` rewrites `entries.json` from scratch; the route scripts merge
on top of what it leaves. Running the first alone silently drops every traced
route. Always all four:

```bash
node scripts/ingest-entries.mjs
node scripts/ingest-routes.mjs
node scripts/ingest-running-routes.mjs
node scripts/ingest-perks.mjs
```

**2. Never write Markdown into a description (`d`).**
The place card escapes its prose, so `[Playo](https://playo.co)` renders as
literal bracket-and-parenthesis text. This shipped once across 55 venues. Links
belong in the structured Offer row, which generates the booking CTA for any row
tagged `playo`.

**3. Plum Perks and Playo are different claims. Do not re-merge them.**
- `isPerkPartner` (`plum-perks` tag) → plum-red pin, red **Plum Perks** chip,
  category glyph cross-fading with a gift.
- `isPlayoVenue` (`playo` tag) → keeps its category colour, blue **Playo** chip,
  cross-fades with Playo's roundel.
- `hasPerkCallout` is either, and is used *only* by the perks-only toggle.

They shared the red chip once, which asserted a partnership the data does not
support. A Playo venue is bookable on Playo; it is not a Plum partner branch.

**4. The pin swap interval is 1.4s and was arrived at empirically.**
2s was slow enough to miss a cycle while panning; 0.5s read as flicker and left
pins mid-dissolve. The fade is 30% of the beat, so two thirds is spent holding
still. Both swap layers run off **one** timer — two drift apart inside a minute
and the map reads as noise. Don't tidy any of this.

**5. `snap-routes.mjs`: a wrong line is worse than no line.**
Routing engines are the wrong tool for "the path around this lake" — OSRM routes
the *network*, so it goes out to the ring road and back, which produced lake
loops up to 5.6× their true length. It now asks Overpass for paths within a
corridor of the shoreline, seeded from every path near the gate, and falls back
to the shoreline itself.

A hard guard refuses any trace outside **0.5×–1.6×** of the stated distance.
**A `REJECT` line is correct behaviour, not a bug.** Do not widen it to make
something pass.

Overpass's limiter is **concurrency, not a quota** — two slots per IP, freed in
seconds, so there is no cooldown to sit out. Check with
`curl https://overpass-api.de/api/status` (send a User-Agent or it 406s).

**Do not wait on it with `pgrep -f snap-routes.mjs`.** That matches any command
line *containing* the string — including the waiting shell, whose own command is
`until ! pgrep -f "snap-routes.mjs"`. The waiter waits on itself forever and
reports the job as running while nothing runs. Match the interpreter
(`pgrep -f "node .*snap-routes"`), and check it is actually working:

```bash
ps -o etime=,%cpu= -p $(pgrep -f "node .*snap-routes")
```

0.0% CPU with no open sockets means stuck, not busy.

**6. Playo's ratings are not Google's.**
Across 118 overlapping venues only 9 matched within 0.05; mean difference 0.45
stars, median review counts 230 (Google) vs 38 (Playo). Always resolve a venue
against Google Places and use those numbers.

**7. A broken page returns 200, not 500.**
The page's validator runs at *render* time, so `npm run build` passes and the
deploy looks green while every request returns **200 with an empty body**. Check
the size, never the status:

```bash
curl -s -o /dev/null -w 'http=%{http_code} size=%{size_download}\n' <url>/
```

A homepage under ~50 KB is a failure wearing a 200. `vercel logs <deployment-url>`
names the offending row directly.

**8. Clearing the Vite cache takes two steps, and the obvious one is wrong.**
`pkill -f "astro dev"` does **not** stop the dev server — Astro runs it as a
daemon that survives it, and deleting `.vite` under a running server leaves it
serving `The file does not exist at .../deps_ssr/...` forever:

```bash
npx astro dev stop
rm -rf node_modules/.vite
npm run dev
```

If it says `Dev server already running (pid N)`, the stop did not take —
`lsof -ti:4321 | xargs kill -9`, then start again.

## How to measure this map without fooling yourself

Every one of these produced a confident, wrong conclusion in one session.

- **A stale dev server renders the old code perfectly.** Restart it, with the
  cache cleared, before believing anything.
- **MapLibre does not paint in a background tab.** A screenshot of a hidden pane
  shows a dark canvas whether the map works or not. Front the tab first, and
  check `document.hidden` before trusting a screenshot.
- **`requestAnimationFrame` never fires in a hidden tab either.** Code that
  schedules work that way silently does nothing. `src/lib/index-cards.js` falls
  back to a timer when `document.hidden`, for exactly this reason.
- **`map.isStyleLoaded()` is false while tiles download.** It does not answer
  "has the style loaded". There is a comment in `wellness-map.js` saying so;
  it was ignored once and cost an afternoon.
- **A green status code is not a working page.** See #7.
- **Vercel occasionally answers a deploy with `Not authorized`** while
  `vercel whoami` is still fine. It is transient — retry, don't re-authenticate.

## Owner's standing rules

- Venues need **≥20 Google reviews and >4.0**. Absolute — do not include one
  below the line "for their call".
- **Exclude outright for any child-safety complaint.** Two venues have been
  removed under this rule (Smash Point, CricLife).
- **Report counts before running a large sweep**, not after.
- Flag judgement calls; do not resolve them silently.
- Copy is theirs. Do not normalise punctuation or reword without asking.

## Known data defects — not yours to fix, but don't be surprised

- **`plum_perks.csv` and the map rows are disjoint.** All 12 `perk_id` values
  referenced by pins are absent from the perks sheet, and all 93 sheet IDs are
  referenced by no pin. Only Plum can reconcile it.
- **31 unverified partners are withheld at ingest** (`SHIP_UNVERIFIED = false`),
  not filtered in the browser — `perks.json` ships inside the page bundle, so
  filtering client-side would still publish them.
- **`BLR-2687` Sportfit ECC sits 2 m from `BLR-1073` Cult Whitefield Swimming.**
  Same building, different Google listings, different categories. Both kept;
  open editorial call.
- **Five route rows have no ID in the sheet** — `RT-082`, `RT-083`, `RT-084`,
  `RT-086`, `RT-087`. They run on their own `RT-*` IDs because the IDs they
  originally claimed belong to Apollo Pharmacy branches.
  **Always cross-check a supplied `master_id` against the sheet before
  ingesting.** That collision would have overwritten seven pharmacy records with
  parks, and the file that caused it will do it again when regenerated.

## The map is slow, and here is the measured reason

Do not start this over from scratch; the numbers are already taken.

**The client ships a 4 MB JavaScript bundle** (975 KB gzipped) and it is not
mostly code — the whole dataset is inlined into it: `entries.json` 1,949 KB,
`zones.json` 572 KB, routes 180 KB, parks 88 KB, metro 63 KB. Consequences: the
engine parses ~3 MB of data *as JavaScript* rather than `JSON.parse`; it shares a
cache key with the code, so a one-line CSS change invalidates the dataset for
every returning visitor; and every visitor downloads ward polygons they only need
if they pick an area.

**A pin needs 15% of `entries.json`** — `id`, `n`, `lat`, `lon`, `cat`, `g`, or
295 KB. The other 85% is descriptions (459 KB), tags (199 KB), Google Maps URLs
(169 KB), addresses (162 KB) and hours (99 KB), read only when a card opens.

**The blocker for splitting it:** the search index is built at module scope over
the descriptions, tags, hours and price, so a naive pins/details split breaks
search until the details land.

**PR #13 attempted this and is still open and unmerged.** It worked, and it broke
the map twice in testing — both times from moving map construction earlier than
things that assumed they ran after it:

- `setWorkerUrl()` must be called **before** `new Map()`. MapLibre hands it to the
  tile-decoding worker; a map built first gets no worker and decodes no tiles —
  a live canvas, correct size, clusters computed, drawing nothing.
- `style.load` **fires once**. Construct the map a data-fetch earlier and the
  handler that adds the pins is attached after it has already fired, so the pins
  never appear. `isStyleLoaded()` is not a usable catch-up check (see above);
  record the event from a listener registered in the same tick as construction.

If it is picked up again, land it in small independently verifiable steps.

## Startup cost that was fixed, for reference

`warmClusterImages()` baked every cluster count from 2 to 500 at startup — 499
canvases, each drawn, lettered, read back with `getImageData` and uploaded as a
GPU texture. **~480 ms of blocking main-thread work** at the moment the map draws
its first frame, of which **28 of 499** were ever used on a first view. Now the
first 40 bake immediately (~38 ms) and the rest wait for `requestIdleCallback`;
`styleimagemissing` covers anything asked for in between, which is the same path
that always handled counts above 500.

The page also used to assemble itself in front of the reader — toolbars from the
served HTML, list panel at ~1 s, map at ~3 s, each popping with no transition.
Both are now held at `opacity: 0` and faded in together on MapLibre's `idle`,
with an `error` hook and a 6 s timeout so a dead tile server cannot leave the map
invisible.

## Open, in rough priority order

1. **Webflow production is behind.** `main` is `25e443e`; plumhq.com is on
   whatever was last deployed by hand.
2. **plumhq.com's root `robots.txt` needs the sitemap line.** A crawler only
   reads `robots.txt` from the host root, and this app is mounted at
   `/health-map/bengaluru`, so the one it serves is never fetched. Add
   `Sitemap: https://www.plumhq.com/health-map/bengaluru/sitemap.xml` to the root
   file, or submit the sitemap in Search Console.
3. The page title still reads "places to move, eat and **reset**". Reset stopped
   being a category in the v8 recategorisation.
4. `/list` is **3.28 MB** — every entry server-rendered with full descriptions,
   plus 3,001 `Place` nodes of JSON-LD. That is the point of the page for
   crawlers, but it is heavy on mobile data.
5. Three routes still carry placeholder geometry; OSM has no mapped path around
   them.
6. 39 of 62 perks are D2C brands with no physical place. Removing them from map
   work was offered and never actioned.
7. HUFT / Vetic / 1MG are blocked: the map has no sub-category a pet shop or a
   vet can live in.
8. 29 Play slots remain under the cap. `docs/playo-sweep-handoff-prompt.md` is
   the prompt for producing more, and already carries the fixes for the mistakes
   earlier batches made.

## Environment

- **Node ≥22.12.** There may be no system Node — check before assuming.
- **`gh` may be at `~/.local/bin/gh`, not on PATH.** Auth needs the browser flow
  or a classic token: a **fine-grained PAT cannot see a private repo owned by
  someone else**, even when you are a collaborator, and reports the repo as 404
  with no pending invitation — which looks exactly like never being invited.
- `.vercel/` is deliberately **not** in the zip: it holds the owner's project and
  org IDs and would let the holder deploy into their account.
