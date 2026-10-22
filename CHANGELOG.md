# Changelog — Plum Perks on the map

Session: 15 Sep 2026

Goal: integrate Perks into the map as location callouts — not another unpinned “Find your people”-style scroll.

---

## Perks logic (tiers)

Perks only complement places we can put on the map. Brands without a Bengaluru pin stay in the existing Plum Perks cliff panel; they do not get a map callout yet.

### Tier 1 — Partner pins (own the place)

The brand *is* the place: Cult.fit, Amaha, Clove Dental, Apollo Pharmacy, Cloudnine, The Wellness Co., etc.

| Rule | Detail |
|---|---|
| Data flag | Entry `tg` includes `plum-perks` |
| Map | **92** pinned · **9** tagged but no coords · **101** tagged total |
| Pin colour | Plum-red cut of the intent icon (`pin-<slug>-perk`, `#FF4052`) |
| Beacon | Pulsing red radar under the pin (`perk-places` source, unclustered) |
| List thumb | Same plum-red fill |
| Card Offer | `get a discount on the [Plum app](https://www.plumhq.com/app)` |
| Tag | Red **Plum Perks** chip |

Helpers: `isPerkPartner(r)` → drives red pin, glow, and partner Offer copy.

### Tier 2 — Enabler pins (unlock an action on someone else’s place)

The perk is the booking / ordering layer across other venues. Only **Playo** is wired in this session.

| Rule | Detail |
|---|---|
| Who | Play venues bookable through Playo |
| Match | `tg`/`d` mentions Playo, **or** intent is `play` and glyph ∈ turf / court / racket sports (`PLAYO_G`) — pools & climbing excluded |
| Map | No red partner pin, no radar (those are Tier 1 only) |
| Card Offer | `get a discount on the [Plum app] through Playo.` |
| Tag | Same red **Plum Perks** chip |

Helpers: `isPlayoVenue(r)` · `hasPerkCallout(r) = partner ‖ Playo`.

**Other L2 candidates audited, not implemented:** Pharmeasy (pharmacy / labs), Dr Paws (at-home vet), Urban Company (area services). Hybrids (own places *and* enable an action) stay Tier 1 for pin colour; L2 copy can layer later.

### Deferred — no pin yet (real BLR presence, missing from entries)

Audited as ingest candidates; **not** added this session:

| Brand | Notes |
|---|---|
| **HUFT** | ~15+ stores/spas in BLR |
| **Vetic** | ~12–14 clinics |
| **1MG** | Pharmacy + lab stores |

Also deferred: non-location perk cards in a map-adjacent scroll (apps, D2C, citywide-only brands). They remain in the Plum Perks cliff.

---

## Session work

### Audits

1. **Pin ↔ perk overlap** — ~101 entries already perk-flagged; sheet vs map mismatches noted (e.g. Orange Health in sheet but unflagged on pins; Cult / Clove / Amaha strong on map, thin in sheet).
2. **“No pin” ≠ “no BLR stores”** — HUFT, Vetic, 1MG have physical Bengaluru locations and zero map entries.
3. **Tier 2 enablers** — Playo is the clear attach surface (~300+ play pins by glyph; ~19 already mention Playo). Pharmeasy / Dr Paws / Urban Company sketched, not wired.

### Product decisions

- Only call out perks that **complement a pin**.
- No new unpinned perk browser on the map surface.
- Partner vs enabler Offer copy differs; both link to the Plum app.

### UI / map implementation (`src/scripts/wellness-map.js`, `src/styles/wellness-map.css`)

- Plum-red partner pins + list thumbs.
- Place-card **Offer** row + linked “Plum app”.
- Red `.tag.red` **Plum Perks** chip (list + card); raw `plum-perks` / `playo` tags hidden from the chip row.
- Unclustered `perk-places` GeoJSON source so partner beacons never hide inside clusters.
- Pulsing circle radar (`perk-halo` / `perk-halo-soft`) sized larger than the pin body so the glow reads; respects `prefers-reduced-motion`.

### Local run

- Dev server: `npm run dev` → **http://127.0.0.1:4321/**
- Hard refresh after glow/layer changes (overlay sources aren’t rebuilt on HMR).

---

## Counts (snapshot)

| Bucket | Count |
|---|---:|
| Entries with `plum-perks` | 101 |
| Of those, **pinned** (Tier 1 on map) | **92** |
| Of those, unpinned | 9 |
| Playo-enabled venues (glyph + explicit; Tier 2 callout) | ~300+ |

---

## Files touched

- `src/scripts/wellness-map.js` — perk helpers, red pins, Offer/tag, `perk-places` + pulse
- `src/styles/wellness-map.css` — `.tag.red`, fact-row link colour

---

## Follow-ups

- [ ] Ingest HUFT / Vetic / 1MG as Tier 1 pins
- [ ] Wire Pharmeasy (and other) Tier 2 Offers where the attach surface is clear
- [ ] Align `plum_perks.csv` ↔ entry flags (Orange Health, missing sheet rows for Cult / Clove / …)
- [ ] Optional: Playo deep links per venue (noted gap in categories wiring)

---

# Session: 16 Sep 2026 — perks claims narrowed, glow calmed

Picking up the follow-ups from 15 Sep.

## Closed

### Playo now claims only what the data says

`isPlayoVenue` fell back to "any Play venue whose glyph is a turf or a court".
That put a red **Plum Perks** chip on **308** venues, of which **290** had no
Playo signal at all — no tag, no mention in the description. Nobody had checked
those venues were on Playo, so the map was making a perk claim on a guess.

Now: explicit signal only (`tg` contains `playo`, or the description says so) →
**19 venues**. The uneven result is the point — Sporthood Turfpark Sarjapur keeps
its chip, Sporthood TurfPark HSR Extension does not, because the data says so for
one and not the other.

The sheet says the same thing in its own note on the Play category: the Playo
deep links are per-venue and it only has the brand URL. **A venue-ID map is what
would let this widen honestly**, and it is the only thing that would.

### The beacon no longer swallows the map

Two separate problems, both fixed:

| Was | Now |
|---|---|
| Perk pins on their own unclustered source, so all 92 rendered at city zoom with halos merging into one red blob | Beacon gated to `CLUSTER_MAX_ZOOM + 1`; below that a partner sits in a cluster like everything else |
| Perks pulled *out* of the clustered source, so **cluster counts under-reported by up to 92** | Every pin back in the clustered source; partners carry their red icon on the feature, so a partner still reads as one the moment the cluster breaks |

The duplicate `perk-pins` / `perk-pin-active` symbol layers are gone — the
clustered layers draw those pins now. Pulse slowed from a 1.3-second cycle to a
4-second breath, amplitude and opacity roughly halved. `prefers-reduced-motion`
still short-circuits it.

### Plum Perks pane: "Communities" → "Others"

That group holds pet care, elder care, kids' kits, magazines and home services —
everything that fits none of the other eight categories. Labelled for what it is,
in the pane only. The category keeps its own name everywhere else.

## Audited, and the answer is data we do not have

### Perk IDs do not join

**Every one of the 12 `perk_id` values the map references is absent from
`plum_perks.csv`**, and all 93 sheet IDs are referenced by no pin. The two
datasets are disjoint, so no pin can be joined to its perk record — offer terms,
verification, anything.

| perk_id | pins | example |
|---|---:|---|
| `PLUM-CULT` | 34 | Cult.fit Indiranagar — an admitted placeholder |
| `PLUM-008` | 10 | Clove Dental |
| `PLUM-002` | 10 | Apollo Pharmacy |
| `PLUM-023` | 8 | HealthKart |
| `PLUM-007` | 8 | Cloudnine |
| `PLUM-009` | 8 | Sabka Dentist |
| `PLUM-094` | 8 | The Sleep Company |
| `PLUM-013` | 5 | Amaha Health |
| plus `PLUM-006`, `010`, `012`, `062` | 10 | |

Only Plum can close this — the partners sheet needs rows for the location
partners.

### Coverage: the three brands named were the right three

Checked all 93 sheet brands for a stated Bengaluru address. Genuinely pin-able
and missing: **HUFT** (~15 stores), **Vetic** (~12 clinics), **1MG** (own labs).
Two more are "sold-at" rather than places: **MuscleBlaze** (via HealthKart, which
already has 8 pins) and **Nuvie** (100+ retail, 200+ gyms) — Tier 2 attach
candidates, not pins.

The rest have no visitable address: Blinkit is dark stores, Samarth / Dr Paws /
Urban Company are at-home services, Mapmygenome / Nugenomics are sample
collection. None of the three carry coordinates in the sheet, so adding them is
~30 branches of geocoding, not a code change.

## Added after the above

### Plum Perks as a browsable layer

A toggle in the toolbar (tag glyph) and in the menu's Map layers group, reading
the same as the routes toggle because it is the same kind of thing — a lens over
the map, not a category of its own. It narrows `pool()`, which is the single
choke point every surface flows from, so the map, the list, the counts and the
legend all agree: **"Plum Perks in Bengaluru · 111 pins"**.

It narrows *on top of* the categories rather than replacing them, so Perks +
Eat healthy answers "which of these has an offer". 111 = 92 partners + 19 Playo
venues, exactly the set that carries a chip. Easy to roll back: one state flag,
one filter line, two buttons.

### The beacon is red throughout

The cream ring read as a second object drawn around the pin rather than a glow
behind it. Both circles are now `#FF4052` with a blur, the inner one denser.

### The Perks layer answers the whole question

The **Plum Perks** button is off the bottom dock — the toolbar toggle already
does that job. In its place, turning the layer on now adds the **62 brands with
no pin** to the left-hand list, under the 111 pinned places: "111 pins · 62
without a pin". They are the tail of the same answer rather than a separate
drawer, so the layer says what Plum gets you everywhere, not only where it
happens to sit on a street.

The pane's line came with them: **"Get discounts with our Perks partners on the
Plum app."**, linked to plumhq.com/app, heading the list whenever the layer is
on. Copy and link still come from `categories.csv` by way of `perks.json`, so
the sheet stays the one place that says it.

A brand row is an anchor, not a button — there is no pin to fly to, so it opens
the brand — and it carries no `data-id`, so the delegated card handler leaves it
alone. Search narrows both halves together.

**Bug found while testing, older than this change:** the empty-results path
cleared the list markup but left `listItems` and `listShown` pointing at the
previous, longer list, so the next scroll appended a page of stale rows
underneath "Nothing here yet" — 60 results for a search that matched none. Both
are reset now, and a search matching only a brand is no longer treated as empty.

**The Plum Perks pane is gone.** Its cards, its blurb and its link all live in
the list now, so removing it lost nothing — your colleague's "remove the sep
folder for perks", done. With it went `perkHtml`, `PERK_GROUP_LABEL` and the
pane's view in `openCliff`. `perks.json` stays: it feeds the list rows, the
blurb and the app link on place cards.

The menu had two Plum Perks entries — the pane and the layer toggle. It now has
one, renamed from "Plum Perks only" to **"Plum perks"**, which is what makes it
read cleanly on a phone where the toolbar is hidden and the menu is the only way
in.

### Reverted: Playo pin alternation, and back to 1.4s

Shipped a second alternation for Tier 2 — a Playo venue swapping its category
glyph for a tennis ball on the same timer, keeping its own colour — along with a
1s beat. On the live map the partner pins started blanking for a beat instead of
swapping in place, so the whole thing was reverted to the 1.4s version, which
was clean.

Not diagnosed. Three symbol layers were then drawing at the same point (pins,
perk-gift, playo-mark) and the likeliest culprit is symbol placement between
them rather than the timing, but that is a guess: the dev instance being probed
turned out to be a stale HMR map with no layers, so nothing was actually
measured. Anyone retrying this should reproduce it on a build first, not on the
dev server.

### Settled: the partner pin alternates its glyph

Normal size, plum red, and the glyph cross-fades between the category's and the
gift every **1.4 seconds**, the fade derived from the interval at 30% so a
third of each beat moves and two thirds hold still.

Tried at 2s and 0.5s on the live map first. 2s read well but was slow enough to
miss a cycle while panning. 0.5s read as the map flickering — and with a fade
that long relative to the beat, a pin spent a third of its life mid-dissolve
showing neither glyph. Tying the fade to the interval fixed the smearing; 1.4s
fixed the rest. Measured on the running timer: 1401, 1408, 1405 ms. Red is constant, so a partner is always identifiable
by colour; the glyph is the only thing that moves, and it says the two things a
partner needs to say without asking one 46px pin to say both at once.

Built as two images per slug — `pin-<slug>-perkcat` (red, category glyph kept)
and `pin-<slug>-perk` (red, gift) — with the gift on its own layer above the
pin, cross-fading `icon-opacity`. That is a **paint** property: it costs nothing
per frame. Rewriting `icon-image` on a timer would have re-laid out every symbol
on the map every two seconds instead.

The gift layer excludes the active pin, which renders enlarged from
`pin-active`; overlaying a normal-size gift on it would sit wrong.
`prefers-reduced-motion` settles on the gift and never animates.

### Superseded: the partner pin is a gift box

Settled form: the pin shape in plum red, carrying the **gift instead of its
category glyph**. One mark per pin.

The glyph is not erased, it is painted over — every pixel keeps its alpha and
takes red, so the old glyph goes red-on-red while the shape's anti-aliased edge
stays soft. The gift lands where that glyph was: measured off the art, the
category glyphs sit in a band from 11 to 24 down the 46x48 pin. The gift is
square where a dumbbell is wide and short, so it takes 16 units centred on
(23, 16.5) — 19 ran its base into the taper.

A partner pin therefore no longer says what kind of place it is, only that it is
a partner. That is the trade: the list row, the chip and the place card all still
carry the category, and on the map one clear mark beat two competing ones.

### Superseded: size and a badge, instead of the glow

The pulsing halo is gone — layers, source, animation loop and the zoom gate with
it. A partner pin is now drawn **1.2x** and given a `symbol-sort-key` so it
renders above its neighbours, which is what makes the size difference legible
where pins crowd. Nothing animates.

The gift from the toolbar icon rides on a cream disc at the pin's shoulder. It
needed room the 46x48 pin does not have: dropped inside, the badge sat on the
category glyph and erased it. So the perk canvas grows `PERK_PAD` on each side
and on top, with the pin drawn inset — padding the sides equally keeps the
image's bottom centre exactly where the tip was, which is the point
`icon-anchor: 'bottom'` pins to, so a badged pin lands on the same spot as any
other. The category glyph survives, so a partner still says what kind of place
it is as well as whose it is.

**Bug found while doing it, from the 15 Sep code:** the recolour kept pixels
passing `r>245 && g>240 && b>230` and repainted the rest. Move's glyph is
`253,244,219` — blue 219 — so it failed, got repainted, and **every Move partner
pin had no shoe at all**, just a red blob. Threshold loosened to
`r>235 && g>225 && b>195`, which clears every pin's glyph and stays well off the
body fills (135,206,84 · 244,189,60 · 255,114,145).

## Open

- [ ] Geocode and ingest HUFT / Vetic / 1MG (~30 branches)
- [ ] Partners sheet: add rows for the 12 referenced `perk_id`s; replace `PLUM-CULT`
- [ ] Playo venue-ID map, to widen Tier 2 beyond the 19 on evidence
- [ ] Decide the marketplace question: of 62 perks shown, 39 are D2C/marketplace,
      13 app/service, 10 have BLR presence
- [ ] 31 partners still held back as unverified; 16 carry "verify" placeholder copy

---

# Session: 16 Sep 2026 — route snaps, and the distances the revert left behind

## The 12 placeholders were not all the same problem

11 of the 12 carried `source: reverted:foot-around-water-overlong` — the lake
loops the old OSRM strategy drew 2.7x–5.6x too long, reverted to geometry of
**two identical coordinates**. A zero-length `LineString` passes the
`coordinates.length >= 2` filter at the end of `snap-routes.mjs`, so it counts
toward "80 route lines" while drawing nothing. Only `RT-055` was a real
straight line. Five more queued routes — `BLR-1036`, `BLR-1675`, `RT-066`,
`RT-084`, `RT-087` — were not in `routes.json` at all. 17 rows needed a snap,
not 12.

**The revert took the line and left the number.** Where the sheet had no
distance to fall back to, `properties.km` was still the discredited trace, and
`properties.km` is what the card and the hover tip render. `BLR-1194` — a
football ground its own description calls "roughly 200-metre perimeter", tagged
`200m` — was shipping **5.49 km**. Also `BLR-2557` 4.95, `BLR-2560` 5.49,
`RT-057` 7.22. All four went out on the deployed build.

This does not clear itself. `ingest-running-routes.mjs` seeds `routesById` from
the existing `routes.json`, and a point-only loop takes a branch that never
calls `.set` or `.delete` on it, so the stale feature is carried straight
through `newFeatures` and re-emitted. The bad number survives every ingest.

## The guard cannot see the rows that need it most

`snap-routes.mjs` refuses a trace outside 0.5x–1.6x of the sheet's distance —
but the check is `if (expectKm && ...)`, and `expectKm` is 0 for the eight
queued rows the sheet states no distance for. Those rows are unguarded, and
they are exactly the rows that produced the overlong traces.

The first run showed it. 15 of 17 traced, no `REJECT` — and three were wrong:

| Route | Trace | Nearest point to its own start |
|---|---|---|
| `RT-087` BDA Sculpture Park | `water-ring` 1.23 km | **653 m** |
| `RT-057` Defence Colony grid loop | `water-ring` 3.18 km | **574 m** |
| `BLR-1194` AECS football ground | `lakeside-paths` 1.01 km | **337 m** |

Defence Colony is a street grid with no water in it at all. `waterRingNear`
picks the *nearest* ring in range, but nearest is not near, and `orientToStart`
then rotates the result to its closest vertex — which makes a trace of
somewhere else look deliberate.

**Fix: anchor the trace to the pin, not to a distance.** A loop is entered
where its pin is. Every trace the sheet could vouch for came back within
**103 m** of its start; the three bad ones sat at 337, 574 and 653. `ANCHOR_M`
is 250 m — inside the 300 m the file already treats as a too-far gap in
`ringFrom`, and generous against a 103 m worst case among the good ones. The
distance tolerance was **not** touched.

Re-run with the anchor: 12 traced, 5 keep their pin, **no wrong lines**.

| | |
|---|---|
| Route lines | 80 → **82** |
| Placeholders | 12 → **2** (`BLR-1194`, `RT-057`) |
| Cards quoting a fabricated distance | 4 → **0** |

`BLR-2557` and `BLR-2560` now have real traced geometry, so their numbers are
genuine. `BLR-1194` and `RT-057` could not be traced honestly, so their `km`
and stale `snapped_km` were removed — and both render sites in
`wellness-map.js` were guarded, or a blanked distance reads "undefined km".
Verified on a built Worker, not the dev server: the card reads "loop", and
Chelekere reads "1.2 km loop".

## Open

- [ ] `BLR-1194` and `RT-057` still have zero-length geometry. The filter keeps
      them because it tests `length >= 2`, not that the points differ — they are
      counted as lines and draw nothing. A route that cannot be drawn should
      stay a pin.
- [ ] `RT-066`, `BLR-1675` have no mapped path in OSM; `BLR-1036` and `RT-057`
      are road loops and `PATHS` excludes residential roads by design.
- [ ] Page title still reads "2689 places to move, eat and **reset**" — the
      count is stale against 2,539 entries and reset left in the v8 recategorisation.
