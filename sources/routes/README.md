# Bengaluru Running Routes — build folder

**87 routes** — 78 running, 8 cycling, 1 athletics track. Replaced 2026-09-16 with the
full `routes.csv` (88 rows); the folder is no longer running-only.

`ingest-running-routes.mjs` reads the `route_type` column, so a `cycle` row becomes
a Cycling route (mode `Cycle`) and a `track` row an athletics track, rather than
everything landing as a run.

One row from `routes.csv` was dropped and seven had their `master_id` changed before
ingest — `RT-082`–`RT-088` claimed ids the sheet has since given to Apollo Pharmacy
branches. See `sources/entries/CHANGELOG.md` for the detail.

---

## ⚠️ Read this before rendering

**No route in this folder contains a traced path.** Nothing here is GPX-derived.

| Geometry | Count | What it actually is |
|---|---|---|
| `Point` | 47 | A verified start or centre coordinate from Google Places. **No path at all.** |
| `LineString` | 17 | A **2-point anchor estimate** read off the Strava heatmap. Start and end only — no intermediate vertices, no road-following. |

**Do not use for turn-by-turn navigation.** The LineStrings are accurate to roughly a city block. A runner
following them literally would cut across buildings. They are good enough to show *where* a route runs and
roughly how it's oriented — nothing more.

To get real geometry you need **GPX export from Strava** or an OSM routing pass. Both are out of scope for the
pipeline that produced this.

---

## Files

| File | What it is |
|---|---|
| `running-routes.csv` | All 64 routes, full attributes |
| `running-routes.geojson` | Same, as a FeatureCollection. Per-feature `geometry_precision` states what each geometry is |
| `needs-field-data.csv` | The 58 routes with known gaps, and which fields are missing |

---

## Data completeness — most of it is empty

| Field | Populated |
|---|---|
| name, area, coordinates | 64/64 |
| shape (loop / linear) | ~58/64 |
| surface | **30/64** |
| **distance_km** | **10/64** |
| rating / reviews | 18/64 |

**`distance_km` and `surface` were only filled where a source explicitly stated them.** Nothing was estimated.
A route's length is the single thing a runner will trust the map on — a wrong 4 km is worse than a blank.

`needs-field-data.csv` names exactly what's missing per route. **Strava GPX would fill distance and elevation
for most of them in one pass.**

---

## Two populations in this file

**Places-verified (44).** Lakes, parks, tracks with a Google listing. Carry rating and reviews, passed the
quality floor, coordinates accurate to ~20 m. `geometry_source = places-verified-point`.

**Strava heatmap road segments (20).** Street routes with **no Places entity** — they cannot be found any
other way. No rating, `quality_band = curated`, `verified = Needs check`.
`geometry_source = strava-heatmap-estimate`. These carry `heat_rank` (dark / medium) as a usage proxy.

The road segments matter because in several areas they are the only running supply: **the darkest heat in
Indiranagar is the street grid, not the parks**, and Vasanth Nagar has almost no park options at all.

---

## Quality floor applied

Parks and lakes: **rating ≥4.0 AND reviews ≥50.** Lower rating bar than the rest of the map, higher review
bar to compensate — parks and businesses are different rating populations (park median 4.30, clinic median 4.90).

**This floor did heavy work in the east corridor.** Seven lakes there were rejected — six on rating, for
sewage. Doddanekundi (3.8/257), Nallurahalli (3.8/159), Kaggadasapura (3.6/99), Mullur (3.4/53) all carry
named Strava segments and are run daily. **Popularity and quality are independent signals.** The heatmap says
people go there; the reviews say raw sewage.

Road segments are exempt from the floor — no rating exists — hence `Needs check`.

---

## Known issues

- **17 LineStrings are 2-point only.** They will render as straight lines between endpoints, not as paths
- **Doddanekundi Lake is a watch-list item.** 2.4 km paved loop, open gym, heavy birdlife, rejected at 3.8
  purely on sewage. Re-check annually — if remediated it's a strong route
- **Coverage is uneven by design.** Cooke Town has 0, Kundalahalli/Fraser Town/Varthur have 1. In most cases
  this reflects real supply, not missing data
- Cycling routes and the athletics track live in the parent `routes.csv`, not here
