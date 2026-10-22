# Source data

Inputs for the ingest scripts. Baked outputs live in `src/data/`.

| Path | Used by |
|---|---|
| `entries/healthmap_v8_recategorised.csv` | `node scripts/ingest-entries.mjs …` |
| `routes/wellness-map-routes-v2.csv` | `node scripts/ingest-routes.mjs` / `snap-routes.mjs` |
| `routes/running-routes.{csv,geojson}` | `node scripts/ingest-running-routes.mjs` — running, cycling and track rows; the CSV is the full `routes.csv`, the GeoJSON still covers only the original 64 |
| `intents/intents.csv` | Reference taxonomy (see `ICONOGRAPHY.md`) |
| `entries/categories.csv` | The v8 category spec; `ingest-perks.mjs` reads the Plum Perks blurb from it |
| `perks/plum_perks.csv` | `node scripts/ingest-perks.mjs` |
| `events/events_this_week.csv` | Nothing yet — `src/data/events.json` is still hand-written |

`ingest-entries.mjs` rewrites `src/data/entries.json` from scratch, and the two
route scripts merge into the file it leaves behind. Run them in that order or
the route rows disappear:

    node scripts/ingest-entries.mjs
    node scripts/ingest-routes.mjs
    node scripts/ingest-running-routes.mjs

Do not commit handoff zips or `.cache/` (snap Overpass/OSRM responses).
