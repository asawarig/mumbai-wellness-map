# Pin minimums by area (editorial targets)

Citywide floor: **≥ 750 pinned places**.  
Full matrix (all areas to recipe): **~1,200**.  
Fill **A + B first** — that alone clears 750.

Numbers are **pinned places** (coords required). Find your people is out of scope.

## Tier recipe (per intent)

| Intent | Hero (A) | Strong (B) | Solid (C) | Thin (D) |
|---|---:|---:|---:|---:|
| move | 4 | 3 | 1 | 0 |
| play | 4 | 3 | 1 | 0 |
| workout | 6 | 4 | 2 | 1 |
| eat | 5 | 3 | 2 | 0 |
| indulge | 2 | 1 | 0 | 0 |
| reset | 2 | 1 | 0 | 0 |
| clear | 2 | 2 | 1 | 0 |
| care | 3 | 2 | 1 | 1 |
| gear | 3 | 2 | 1 | 0 |
| wearable | 1 | 1 | 0 | 0 |
| **Total min** | **32** | **22** | **9** | **2** |

### Roll-up
| Tier | Areas | Pins |
|---|---:|---:|
| A hero | 12 | 384 |
| B strong | 23 | 506 |
| **A+B (ship floor)** | **35** | **890** |
| C solid | 44 | 396 |
| D thin | 13 | 26 |
| **All areas** | **92** | **1,312** |

### How tiers were called
- **A — Hero:** hip wellness / going-out corridors people try first
- **B — Strong:** established neighbourhoods with real gym / café / sports life
- **C — Solid:** lived-in residential, worth covering but not flagship
- **D — Thin:** periphery — care + one workout until demand shows up

**Move / Play are non‑negotiable on A and B** (min 4 / 3). That’s the Indiranagar failure mode.

See `pin-minimums-by-area.csv` for every area.
