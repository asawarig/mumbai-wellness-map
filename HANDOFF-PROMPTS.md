# Prompts for ASA — Plum Perks on the Bengaluru Wellness Map

Use these with Claude (or Cursor) after reading [`CHANGELOG.md`](./CHANGELOG.md). Paste a prompt as-is, or swap in the brand / area you’re working on.

**Context to give once at the start of a chat:**

> Read `CHANGELOG.md` first. Perks on this map have three buckets: (1) **pure / partner** brands with storefronts, (2) **enabler** perks that unlock discounts across other pins (Playo), (3) **marketplace / D2C** with no place on this map — candidates to drop from map work. Goal: move as many mappable perks as possible onto pins. Design: glow currently looks too strong — mellow it. Partners already have a red tag + Offer row with Plum app link. We can remove the separate Perks folder once coverage is on the map.

---

## A. Orient & audit

### A1 — Read the changelog and summarise the job

```
Read CHANGELOG.md and skim src/scripts/wellness-map.js for isPerkPartner, isPlayoVenue, hasPerkCallout, perk-places, and the Offer row in showPlace.

Summarise in one page:
1. What’s already implemented for Tier 1 vs Tier 2
2. What’s deferred (HUFT / Vetic / 1MG, other enablers)
3. Exact counts for plum-perks tagged / pinned / unpinned
4. The top 5 open questions before we write more code

Don’t change code yet.
```

### A2 — Full perks coverage checklist

```
Compare sources/perks/plum_perks.csv (or src/data/perks.json) against map entries in src/data/entries.json / sources/entries.

Produce a table with columns: perk brand | tier (partner / enabler / marketplace) | in perks sheet? | pins on map (count) | flagged plum-perks? | BLR locations exist? | recommended action (ingest / flag / wire enabler / drop).

Call out every brand that has physical Bengaluru locations but zero or partial map coverage. Double- and triple-check — don’t trust “no pin” as “no store”.
```

### A3 — Marketplace / D2C drop list

```
From the perks list, identify marketplace / D2C / app-only brands that have no natural place on this location map. Propose a remove-from-map-work list with one-line rationale each. Don’t delete data yet — just the recommendation list, and note whether they should stay only in the Plum Perks cliff panel or leave the product surface entirely.
```

---

## B. Pure perks (partner pins)

### B1 — Ingest a missing partner brand (template)

```
Ingest [BRAND] as Tier 1 Plum Perks partner pins on the Bengaluru wellness map.

Requirements:
- One entry per physical BLR location (not a citywide card)
- Tag tg with plum-perks
- Correct intent / glyph / area
- Lat/lon from a reliable source; mark verification honestly
- Don’t create unpinned “brand cards”

First: list candidate locations you found and which are already on the map. Then propose the entry rows. Wait for approval before writing files.
```

**Swap in:** `HUFT` · `Vetic` · `1MG` · `Orange Health` (flag existing pins) · others from A2.

### B2 — Flag existing pins that are already partners

```
Find map entries that clearly belong to Plum Perks partner brands but are missing the plum-perks tag (e.g. Orange Health Labs). Propose a minimal patch: add the tag only — no copy rewrite unless needed. Show before/after counts of pinned plum-perks.
```

### B3 — Align sheet ↔ map flags

```
Reconcile plum_perks.csv with entry plum-perks tags. Report mismatches both ways (on map but not in sheet / in sheet but not on map). Propose the smallest set of edits to make the two sources agree for Tier 1 brands with BLR locations.
```

---

## C. Enabler perks

### C1 — Stress-test Playo wiring

```
Review the current Playo enabler logic (isPlayoVenue, PLAYO_G, Offer copy).

Questions to answer with evidence:
1. Are we over-tagging (pools, climbing, non-Playo sports)?
2. Are we under-tagging (venues people actually book on Playo)?
3. Is the Offer line clear vs Tier 1 partner copy?
4. Should Playo venues get any map treatment beyond the tag + Offer (e.g. subtle marker), or stay visually quiet so Tier 1 partners stay distinct?

Propose changes; don’t implement until I say go.
```

### C2 — Design the next enabler (template)

```
Design Tier 2 map attach for [ENABLER] the way Playo works for play venues.

From CHANGELOG.md and the data: what pins does this unlock? What’s the Offer one-liner? What must we NOT do (no red partner pin unless the brand owns the place)?

Deliver: attach rule, copy, edge cases, and a yes/no on whether this enabler is worth wiring now vs drop.
```

**Swap in:** `Pharmeasy` · `Dr Paws` · `Urban Company` · others from audit.

### C3 — Enabler vs partner hybrids

```
List hybrid perks that both own places (Tier 1) and enable an action across other pins (Tier 2). For each, recommend: red pin + partner Offer only, or partner pin + secondary enabler copy on other venues. Keep the map from becoming a marketplace.
```

---

## D. Design — how perks look on the map

### D1 — Mellow the glow (priority)

```
The Plum Perks pin glow/pulse currently looks too strong / terrible. Mellow it.

Constraints:
- Partners must still read as distinct from normal pins at city zoom and street zoom
- Keep prefers-reduced-motion behaviour
- Don’t change Offer / tag / plum-red pin colour unless needed for balance
- Prefer subtle: softer opacity, smaller radius delta, slower pulse, or a static soft halo with very light motion

Implement, then tell me how to hard-refresh localhost to verify (perk layers don’t fully rebuild on HMR).
```

### D2 — Broader perks map language

```
Beyond glow + red pin + tag + Offer, brainstorm 3–5 additional map/UI treatments for Perks that fit this product (not a generic dashboard). Rank by impact vs clutter. Examples to react to: filter chip “Perks only”, legend note, cluster behaviour, list-row emphasis, share card. Recommend what to ship next vs never.
```

### D3 — Perks-only map mode

```
Add a lightweight way to focus the map on Plum Perks partner pins (Tier 1), without a separate Perks fold. Reuse existing chrome patterns. Tier 2 enabler venues: include, exclude, or secondary toggle? Propose UX first, then implement if straightforward.
```

---

## E. Cleanup & handoff hygiene

### E1 — Remove the separate Perks folder (when ready)

```
We want to remove the separate Perks folder / fold once perks live on the map.

1. Inventory what the current Plum Perks cliff / folder still uniquely provides
2. List blockers (unpinned D2C, enablers without attach rules, missing partner pins)
3. Propose a removal plan: what moves to map-only, what stays as a thin “all partners” index, what gets deleted
4. Don’t delete until the checklist is green
```

### E2 — Update the changelog after your work

```
Append a dated section to CHANGELOG.md covering what you changed: counts, new brands ingested, design tweaks to the glow, any new enabler rules, and remaining follow-ups. Match the existing tone and structure.
```

### E3 — Regression pass

```
After your changes, verify:
- Cult.fit (or another partner) shows red pin, mellow glow, Plum Perks tag, Offer + Plum app link
- A Playo-bookable turf shows tag + Playo Offer, NOT a red partner pin
- A normal non-perk pin is unchanged
- Marketplace-only brands still don’t spam the map as fake locations

Use the local map at http://127.0.0.1:4321/ (npm run dev). Report screenshots or clear pass/fail notes.
```

---

## F. Mega prompt (if they only paste one)

```
Read CHANGELOG.md end-to-end, then the perk helpers in src/scripts/wellness-map.js.

Job to be done:
1. Improve length and breadth of perks coverage on the map (partner pins + sensible enablers).
2. Check every perks brand for BLR locations missing from the map (HUFT, Vetic, 1MG, and anything else).
3. Mellow the perk pin glow — it currently looks too strong.
4. Keep marketplace / D2C brands off the map; don’t build another unpinned scroll.
5. Plan removal of the separate Perks folder once map coverage is solid.
6. Suggest any additional map UX for perks beyond glow / tag / Offer.

Work in this order: audit tables → design proposal for glow → implement glow mellow → propose ingest list for missing partners → wait for approval before large data writes.
Update CHANGELOG.md when done.
```

---

## Quick reference

| Tier | Meaning | Map treatment today |
|---|---|---|
| Pure / partner | Brand owns the storefront | Red pin + glow + tag + Offer |
| Enabler | Unlocks action on other pins | Tag + Offer (Playo only so far) |
| Marketplace | No place on this map | Don’t pin; drop from map work |

Counts (see changelog for date): **101** tagged `plum-perks` · **92** pinned · **9** unpinned.
