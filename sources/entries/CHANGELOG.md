# Bengaluru Wellness Map — Data Changelog

Master file: `healthmapsing-iteration7_deduped.csv`
Source file: `healthmapsing-iteration7_-_list.csv` (1,484 rows)

---

## Locked spec

### Per-cell targets (one cell = one area × one intent)

| Rule | Value |
|---|---|
| Floor | 10 pins |
| Ceiling | 16 pins — **only** if picks are in the preferred band |
| Ceiling, acceptable band | 12 pins |
| Below floor band | never admitted, regardless of shortfall |

### Quality ladder

| Band | Rating | Reviews |
|---|---|---|
| preferred | ≥ 4.8 | ≥ 125 |
| acceptable | ≥ 4.5 | ≥ 50 |
| floor | ≥ 4.2 | ≥ 20 |

Rank all candidates by band, then review count.

### Priority order (non-negotiable)

1. **Quality floor** — nothing below the floor band enters, ever
2. **Subcategory diversity** — breadth before depth
3. **Count floor** — a short, well-curated cell of 8–10 beats a padded 16

Short cells are reported, not filled.

### Allocation rule per cell

1. Bucket candidates by subcategory; rank within bucket by band, then reviews
2. Take one from **every** subcategory present locally (breadth first)
3. Round-robin across subcategories until 10
4. Extend toward the ceiling only while picks hold their band
5. Cap any single subcategory at 60% of the cell (max 6 at 10, max 9 at 16)
6. Waive the cap where fewer than 3 subcategories exist locally
7. **Play** measures diversity on sport tags, not subcategory: ≥4 distinct sports at 10, ≥6 at 16, no single sport above 40%

### Intent tiering

**Core — swept per area, 10–16 floor/ceiling:**
Work out · Play · Eat healthy · Get care · Clear my head · Move

**Scarce — swept per zone (7 regions), floor of 10 per zone:**
Fix my wearable · Buy gear · Reset · Indulge · Find your people

Rationale: these are supply-capped citywide and nobody picks a wearable service centre by walking distance.

### Curation constraints

- Yoga and meditation entries must be **secular** — religious/spiritual organisations (Isha, Art of Living, Heartfulness, Yogoda Satsanga) are excluded
- Deduplication is by Google `place_id` against the existing master file
- "Verified" means the listing exists and is marked operational — not that anyone has visited

### Projected final size

2,500–2,800 pins (from 1,341). Estimate assumes the floor band counts toward cells.

---

## Session log

### Session 0 — 2026-09-12 — Dedup, area cleanup, taxonomy prep

**Deduplication**
- 1,484 → 1,341 rows. 143 duplicate rows collapsed into 121 pins
- Every duplicate found shared a `place_id`; name and coordinate rules confirmed rather than extended the matches
- All 1,202 unique place IDs preserved
- Surviving row = most filled fields, Verified preferred; empty fields backfilled from dropped rows; longest description kept; tags and sources unioned
- Names normalised to a spaced em dash
- 23 rows in 11 groups share a pin but differ by intent — **kept and flagged** in `dup_flag`, not merged
- New columns: `merged_from`, `name_variants`, `dup_flag`
- Report: `healthmapsing-iteration7_merge-report.csv`

**Area standardisation**
- 193 → 136 distinct areas; 90 rows rewritten across 65 mappings
- Block / sector / phase / stage / cross suffixes stripped to the parent area
- Sub-locality prefixes collapsed (Whitefield Nallurhalli → Whitefield)
- Comma and slash compounds resolved to the broader known area
- Spelling variants unified (Vasanthnagar → Vasanth Nagar, Frazer Town → Fraser Town, RR Nagar → Rajarajeshwari Nagar, Rd → Road)
- Original preserved in `a_original`; map: `area-standardisation-map.csv`
- User overrides applied: Nagasandra, Mysore Road, Doddagubbi Road, Hosur Road (second half of slash compounds); RMV Extension kept over Armane Nagar
- Deliberately **not** merged (genuinely distinct): HSR / HRBR / HBR Layout · Jayanagar / Vijayanagar · JP Nagar / JC Nagar · Marathahalli / Mallathahalli · Bommanahalli / Kammanahalli · Arekere / Tavarekere

**Taxonomy prep**
- Play: 57 free-text subcategories → 6 venue types (Court venue 96, Multi-sport venue / Stadium 85, Turf / Ground 62, Specialty sport venue 17, Swimming pool 15, Entertainment venue 5)
- Sports moved to `tg` tags — 97 rows gained sport tags
- Work out: vague buckets resolved into Gym / Fitness center 206, Yoga studio 69, Martial arts / Combat sport 61, Pilates studio 28, Dance / Movement studio 9, Climbing gym 8. A gym that merely offers boxing classes stays a gym
- Move: swimming → Swimming pool, rowing → Rowing, park/lake loops merged
- The `Sport / Fitness activity` label collision across Play / Work out / Move is fully resolved — 0 rows remain
- Total subcategories: 91 → 38
- New columns: `rating`, `reviews`, `quality_band` — backfilled for 213 rows parsed out of description text (preferred 46, acceptable 56, floor 60)
- 1 row flagged: retail listing sitting under Play, likely belongs to Buy gear

**Baseline state**
- 1,341 rows · 1,233 with coordinates · 136 areas · 38 subcategories
- ~74 rows need geocoding (excluding the 34 deliberately unpinned "Citywide and online" / "Multiple locations")
- 37 areas qualify as established (10+ entries) and are the sweep list
- Core shortfall to the 10 floor: 1,450 pins. Zone shortfall for scarce intents: 197

---

### Session 1 — 2026-09-12 — Jakkur (pilot area 1)

- 2 Places calls, 20 queries, 47 candidates triaged
- **8 candidates already in the master** — caught by `place_id` dedup (EMOM, Celsius, Fitness Power INU, 1026 MMA, Humming Nest, Hive Club, Machaxi Ahalya, Amaha Hegde Nagar). The dedup key works.
- 1 candidate outside the 3 km radius (Iron Fist Fight Club, 3.08 km) — held as a seed for a neighbouring area
- **32 rows added.** Master: 1,341 → 1,373
- Art of Living Yoga & Meditation Center excluded under the secular-curation rule
- Radius used: 3.0 km from (13.0776, 77.6180)

**Cell outcomes**

| Intent | Final | Subcats | Top-subcat share | Status |
|---|---|---|---|---|
| Work out | 12 | 4 | 58% | at ceiling |
| Play | 12 | 5 | 33% | at ceiling |
| Get care | 12 | 5 | 42% | at ceiling |
| Eat healthy | 4 | 2 | 50% | **short by 6** |
| Move | 3 | 2 | 67% | **short by 7** |
| Clear my head | 2 | 2 | 50% | **short by 8** |

Jakkur total: 45 rows (was 14).

**Corrections made during the session**
- The allocator capped *new picks* at the ceiling but ignored rows already in the cell, pushing Work out to 15 and Play to 13. Trimmed 4 rows (RAW Fitness, Fusionfitclub, Shuddham Yoga, Fika Arena) to bring both to 12. **Fix for session 2: run the ceiling against the combined cell, not the additions.**

**Findings**
- Move, Clear my head and Eat healthy are genuinely supply-capped in Jakkur, not under-searched. Every additional candidate found fell below the floor band — e.g. Telecom Layout Park 4.1, Amruthalli Lake 4.0, ReLiva Physio 5.0 but only 19 reviews.
- Jakkur Lake has three separate Places pins (lake, joggers' entry, lake park). Kept one; the joggers' entry is noted in its description.
- **6 pre-existing rows labelled Jakkur are named for other areas** — Metta Yoga (Yelahanka New Town), Pilates Lab (Sahakar Nagar), Machaxi Sportexx (Sahakar Nagar), Densparq (Kannuru), The Fit Fuel Story (Yelahanka New Town), Surya Sprouts (Yelahanka New Town). Needs a decision before Yelahanka is swept.

### Session 2 — 2026-09-12 — Yelahanka (pilot area 2)

**Housekeeping first**
- 6 mis-areaed rows reassigned out of Jakkur: Metta Yoga, The Fit Fuel Story, Surya Sprouts → Yelahanka; Pilates Lab, Machaxi Sportexx → Sahakar Nagar; Densparq → Kannuru
- House-style naming applied to all 32 Jakkur sweep rows — `Name — Sub-locality`, Google capitalisation quirks fixed (Barbell Therapy GYM → Barbell Therapy — Sampigehalli). Note: only 48% of the 1,341 legacy rows carry the em-dash suffix, so house style is not yet universal across the file

**Sweep**
- 2 Places calls, 20 queries, 56 candidates triaged
- 7 already in the master by `place_id` — including 3 of the 6 rows just reassigned from Jakkur, which is exactly the collision predicted
- 1 outside the 3 km radius (LRigu Cafe, 3.18 km)
- **32 rows added.** Master: 1,373 → 1,405. Yelahanka: 21 → 53
- Ceiling now applied to the **combined** cell (session 1 fix verified — no post-hoc trimming needed)

| Intent | Existing | Picked | Final | Subcats | Top share | Status |
|---|---|---|---|---|---|---|
| Get care | 0 | 12 | 12 | 5 | 25% | at ceiling |
| Work out | 7 | 5 | 12 | 4 | 42% | at ceiling |
| Play | 6 | 4 | 10 | 4 | 50% | at floor |
| Move | 2 | 5 | 7 | 3 | 43% | short by 3 |
| Clear my head | 2 | 4 | 6 | 1 | 100% | short by 4 |
| Eat healthy | 3 | 2 | 5 | 2 | 60% | short by 5 |

**Findings**
- Move is much healthier here than in Jakkur — Yelahanka Kere (5 km loop), Allalasandra, Kogilu and a dedicated cycle track all clear the floor band
- Clear my head is 100% Therapy clinic; the subcategory taxonomy has no room for the counselling-vs-psychiatry distinction the listings actually show
- Rejected below floor band: Gold's Gym 3.9, Best Shot Sports Arena 3.8, The New Town Club 4.1, K K Hospital 4.1, Cafe Natural 4.1, Bullblasty Aquatics 3.9, Public Swimming Pool 3.9
- Infinity Mental Health appears twice on Places at identical coordinates under two listings; kept the higher-review one

### Session 3 — 2026-09-12 — Koramangala + Indiranagar (areas 3 and 4)

Both areas already sat near the ceiling on most intents, so this was a **gap-fill sweep** — only cells below the floor of 10 were targeted. 1 Places call, 10 queries, 20 candidates.

- Koramangala: Clear my head 8 → 9, Move 5 → 8
- Indiranagar: Move 3 → 8, Play unchanged (all candidates were duplicates or below floor band)
- **9 rows added.** Master: 1,405 → 1,414. Koramangala 90 rows, Indiranagar 94

**New dedup rule — name-level matching**
`place_id` matching missed three real duplicates because the legacy rows have **no `gm` value at all**: Holistic Be You, Thoughts & U Counselling, PsySutram (all BLR-908/909/910, Koramangala, Clear my head). Added a name-level check.

First version was too loose — stripping the em-dash suffix made "Game Theory — 100 Feet Road" collide with Game Theory branches in Yemalur, Ulsoor and Jeevan Bima Nagar, and "BBMP Park — Doopanahalli" collide with "BBMP Park — Koramangala". These are generic names used across unrelated sites.

**Final rule (revised after audit — see below):**
1. Same `place_id` → same pin, merge.
2. Same stripped name AND within 500 m → same pin, merge.
3. Same stripped name, same area, legacy row has **no coordinates** → **do not discard either row.** Enrich the legacy row with the candidate's place_id, coordinates and rating. Only collapse to one row if the enriched result is genuinely the same site.
4. Same stripped name, different area, or same area but >500 m apart → **different branches. Keep both.**

**Branch families are first-class, not duplicates.** The file contains 58 name families covering 150 rows — Puma Store across 8 areas, Neuberg Anand across 6, Decathlon across 5, Harvest Salad Co across 4, Amaha across 3, Cult across several. Two Cult gyms in the same area are two gyms. Dedup must never collapse these.

**Audit of the branch-collapse risk (run after session 3)**
- Checked all 73 sweep rows against every coordinate-less legacy row of the same name. **One real duplicate found, created by me in session 2:** Maarga Mind Care existed as BLR-945 (Yelahanka, no coordinates) and I added it again as BLR-1627. Merged — BLR-1627 kept with `merged_from = BLR-945`. Master 1,414 → 1,413
- No sweep row wrongly collapsed a branch. Apollo Dental Jakkur and Apollo Dental Yelahanka Old Town, and the two 1026 MMA branches, are all correctly preserved as separate rows
- Turned 4 would-be discards into **geocoding fixes** instead: BLR-905 (Amaha Koramangala), BLR-908 (Holistic Be You), BLR-909 (PsySutram), BLR-910 (Thoughts & U) all gained coordinates, place_id and ratings from the Places data rather than being dropped as duplicates
- Deferred: `healing hub` has two Whitefield rows (BLR-527 with coordinates, BLR-937 without) — a possible pre-existing duplicate in the legacy data, not created by the sweep. **Legacy same-name-same-area cases are being deferred to a single dedup pass at the end of the sweep programme**, not resolved area by area

**Findings**
- 8 of 20 candidates were already filed by `place_id`, 7 more by name — 15 of 20 were duplicates. Dense, well-covered areas yield very little new
- Indiranagar Play could not be filled: every candidate was either already filed (Indiranagar Club, Game Theory Double Road) or below floor band (Citi Nest 3.8, The Bull Ring 4.1, Game Theory Double Road 3.9)
- Move in both areas is entirely `Park / Lake walking loop` — the subcategory cap is waived because no other Move subcategory exists locally

### Session 4 — 2026-09-12 — HSR Layout + Whitefield (areas 5 and 6)

Gap-fill sweep on cells below the floor. 1 Places call, 10 queries, 24 candidates. **11 rows added.** Master: 1,413 → 1,424. HSR Layout 74 rows, Whitefield 72.

| Area | Intent | Existing | Picked | Final |
|---|---|---|---|---|
| HSR Layout | Clear my head | 9 | 1 | 10 |
| HSR Layout | Play | 7 | 2 | 9 |
| HSR Layout | Move | 6 | 1 | 7 |
| Whitefield | Eat healthy | 6 | 3 | 9 |
| Whitefield | Get care | 7 | 1 | 8 |
| Whitefield | Move | 2 | 3 | 5 |

**Third dedup rule added — same pin, different name**
13 of 24 candidates were already filed under a *different name string*, so neither `place_id` nor name matching caught them: "Zaladaa Salads — HSR Sector 3" vs "ZALADAA Salads", "Meet Your Therapist — HSR Sector 6" vs "Meet Your Therapist", "Manipal Hospital — Varthur Road" vs "Manipal Hospital Varthur Road", "Pykln Sports" vs "Machaxi Khelomore Pykln Pickleball Centre". Added a coordinate-proximity check against rows in the same area and intent.

First threshold of 150 m was **too loose and would have collapsed distinct venues** — it paired Pykln Sports with Kick On Sweat On (35 m apart) and with Game Theory HSR Sector 7 (50 m). In dense commercial areas different venues sit within 150 m of each other routinely. **Tightened to 50 m**, which keeps every genuine 0 m match and drops both false pairs.

**Dedup now runs three checks, in this order:**
1. `place_id` identity
2. Same stripped name + within 500 m (or coordinate-less legacy row in same area → enrich, don't discard)
3. Same area + same intent + within **50 m** → same pin under a different name

**Data issue found, not fixed**
BLR-682 (Manipal Hospital Varthur Road) and BLR-684 (Manipal Hospital EPIP Whitefield) carry **identical coordinates** — 12.9581418, 77.7455758. These are two genuinely different Manipal branches, so one row has the wrong coordinates. EPIP is near ITPL, so BLR-684 is the likely error. Added to the deferred cleanup list rather than guessed at.

### Session 5 — 2026-09-12 — Jayanagar (area 7)

1 Places call, 10 queries, 26 candidates. **15 rows added.** Master: 1,424 → 1,439. Jayanagar: 64 → 79 rows.

| Intent | Existing | Picked | Final | Status |
|---|---|---|---|---|
| Get care | 7 | 6 | 13 | above floor (preferred band, ceiling 16) |
| Move | 6 | 4 | 10 | at floor |
| Play | 7 | 3 | 10 | at floor |
| Eat healthy | 5 | 2 | 7 | short by 3 |

- Dedup caught 13 of 26: 6 by place_id, 2 by name, 5 by coordinates
- Best yield of any dense-area session so far — Jayanagar's Get care and Move were genuinely under-covered rather than duplicate-blocked
- Manually excluded "Yediyur lake entrance gate" — a second Places listing for Yediyur Lake Park, 250 m away. The 50 m coordinate rule can't catch different-name/same-site pairs at that distance; **caught by eye, not by rule**
- Rejected below floor band: Panchajanya Badminton 3.7, Tackle Jayanagar 4.1, Pure & Natural 4.1, Smoochy Bowls 4.1, PM Swimming Centre 4.1, Jayanagar General Hospital 3.4

### Session 6 — 2026-09-12 — JP Nagar (area 8)

2 Places calls, 16 queries, 97 candidates triaged. **26 rows added.** Master: 1,439 → 1,465. JP Nagar: 56 → 83 rows.
Radius used: 3.0 km from (12.9077, 77.5850). Work out (18) and Play (12) were already at or above ceiling and were not swept.

| Intent | Existing | Picked | Final | Subcats | Top share | Status |
|---|---|---|---|---|---|---|
| Get care | 2 | 14 | 16 | 6 | 31% | at ceiling (all picks preferred band) |
| Eat healthy | 3 (+1 reassigned) | 6 | 10 | 2 | 60% | at floor, at subcategory cap |
| Move | 5 | 5 | 10 | 3 | 60% | at ceiling for floor band |
| Clear my head | 9 | 1 | 10 | 1 | 100% | at floor |

**Dedup** caught 11 of 97 by `place_id` — Healthy Nation, Yummy Bee, Eat Clean Co, Harvest Salad Co, Earth Bowl, Go Native, Swim Scooled, WE Fitness, Skyfinch, Machaxi JP Nagar, Sprihaa. Every coordinate-proximity hit was also a `place_id` hit, so rule 3 added nothing new here.

**Four coordinate-less legacy rows enriched, not duplicated** — BLR-893 (Untangle), BLR-894 (Arpitha), BLR-896 (Amaha Mental Health Centre) and BLR-899 (Marg Centre for Mental Wellness) all gained coordinates, place_id, rating and band from the Places data. BLR-525 (Sprihaa) already had coordinates and gained rating and reviews. The session 3 rule is still earning its keep — without it these would have entered as five new rows and five false branches.

**Mis-areaed row reassigned** — BLR-1345 (Healthy Nation) was filed under Bannerghatta, but its address and coordinates are JP Nagar 2nd Phase. Moved to JP Nagar, region South, renamed to house style. This is what lifted Eat healthy from 3 to 4 before picks.

**Different-name / same-site pair, caught by eye again**
"JP Nagara 1st Phase Local Park" and "Sri SK Nataraj Park" are **54 m apart** and reviewers on both listings state they are the same park. That is 4 m outside the rule-3 threshold. Kept the higher-review listing (2,330 reviews) and noted the alternate name in its description. **Second instance of this failure mode after Yediyur — 250 m then, 54 m now.** Loosening rule 3 is still the wrong fix: 50 m was tuned against genuine venues 35 m apart in HSR Layout. The gap needs a name-similarity-plus-distance rule, not a bigger radius.

**Findings**
- **Get care went 2 → 16, the largest single-cell gain of the programme.** JP Nagar held 56 rows but only two Get care entries, both diagnostic labs. Supply was never the problem — the cell had simply never been searched. Worth checking whether other large areas carry the same blind spot before reading their totals as coverage.
- **Eat healthy cleared the floor on the back of `Nutrition / Dietitian`, not more restaurants.** Restaurant supply was as capped here as everywhere else; four dietitian practices made the difference. First area where Eat healthy has reached 10. **Add a nutritionist/dietitian query to the standard Eat healthy batch for the remaining areas.**
- Duplicate rate was 11 of 97, far below the 15-of-20 seen in Koramangala and Indiranagar. Row count is not a proxy for coverage.
- Clear my head is 100% Therapy clinic again, now across 10 rows. The taxonomy gap noted in session 2 is unchanged.
- Rejected below floor band: Ray Center 4.1, Skyfinch 4.1, Cult.Play Big Box 3.8, Salad Days 3.9, Iksha Juice 3.9, Smoochy Bowls 4.1 (also rejected in Jayanagar), Dr Wesley's Physiotherapy 5.0 on 5 reviews, Aster Eye Care 4.4 on 7, Triloma Skin 4.2 on 5, Earth Bowl 4.9 on 13, Millet Liki 5.0 on 11, Oh My Millets 4.4 on 11, Mind Bloom 5.0 on 5, Whole Meal Diet Clinic 5.0 on 14
- Held as seeds for neighbouring areas, outside the 3 km radius: Sankalpa Multispeciality (3.92 km), Jogger's Tree Park (3.15 km, BTM Layout), SKYPOOL Fitness (5.08 km, Anjanapura), Walking track (3.18 km, BTM Layout)
- Excluded on curation rather than band: Brain Power Career Counselling (4.8, 463) is education and career psychometrics, not mental health care; Mibo The Mind Expert (4.8, 391) is inside the radius but squarely in Jayanagar, already swept; organic grocery stores (Kadamba Indus 4.8/230, Organic Mandya 4.5/477, The Organic World, Village Naturals) clear the bands but fit no Eat healthy subcategory — they are retail
- Excluded as general restaurants rather than healthy eating: Neemsi (4.8, 16060), Iris Cafe (4.5, 3278), 154 Breakfast Club, The Kind Roastery, ee Kavii Kafe

**Data issues found, not fixed**
- **BLR-610 (Puttenahalli Lake Loop, Running route) and BLR-1563 (Puttenahalli Lake — JP Nagar 7th Phase, Park / Lake walking loop)** sit 420 m apart in the same area and intent. Almost certainly the same lake under two listings. Legacy, not created by this sweep — added to the deferred pass.
- **BLR-738 (Machaxi JP Nagar, Play) and BLR-1113 (Sporthood Swimming Academy @ Cult, Move)** sit **2 m apart** — two booking-aggregator listings for what looks like one facility. Rule 3 is scoped to same area *and same intent*, so it does not fire across intents. Session 0 deliberately kept 23 rows that share a pin but differ by intent, so this may be correct by design; it needs a decision in the final pass, not a silent merge.


### Session 7 — 2026-09-12 — Banashankari (area 9)

2 Places calls, 19 queries, 96 candidates triaged. **28 rows added.** Master: 1,465 → 1,493. Banashankari: 36 → 64 rows.
Radius used: 3.0 km from (12.9261, 77.5567) — the centroid of the area's existing coordinates, since Banashankari spans 1st to 6th Stage and has no single obvious centre. **Full sweep, not a gap-fill: all six core cells were below the floor, and Move stood at zero.**

| Intent | Existing | Picked | Final | Subcats | Top share | Status |
|---|---|---|---|---|---|---|
| Get care | 3 | 13 | 16 | 6 | 25% | at ceiling (all picks preferred band) |
| Work out | 9 | 3 | 12 | 4 | 42% | at ceiling for acceptable band |
| Play | 9 | 1 | 10 | 3 | 11 distinct sports | at floor |
| Clear my head | 7 | 3 | 10 | 2 | 90% | at floor, cap waived |
| Move | 0 | 7 | 7 | 1 | 100% | **short by 3** |
| Eat healthy | 4 | 1 | 5 | 1 | 100% | **short by 5** |

**Rule 3 produced its first confirmed false positives — and distance cannot fix them**
Three candidates were flagged as coordinate duplicates and all three were wrong:
- **Physiotattva** (4.8, 406) and **Cadabam's Diagnostics** (4.7, 2,881) both sit ~20 m from BLR-434 (Bangalore Hip & Knee Clinic) on 30th Main. Three distinct businesses, three distinct `place_id`s, in one medical complex.
- **Apple Fitness** (4.2, 708) sits 43 m from BLR-1155 (Roar Combat Fitness) — a commercial gym and an MMA gym, different businesses.

The HSR tuning in session 4 assumed false pairs could be separated by tightening the radius. They can't: **Physiotattva and Cadabam's Diagnostics are 0.5 m apart from each other.** A shared building defeats any distance threshold. Rule 3 needs a second condition — differing subcategory, or low name similarity — before it fires. All three overrides were applied by hand this session; Physiotattva entered as a new row, Cadabam's and Apple Fitness were not needed for their cells.

**The Yediyur listing resurfaced**
"Yediyur lake entrance gate" (4.6, 57) came up again, this time inside Banashankari's radius. `place_id` dedup did not catch it — BLR-1686 is Yediyuru Lake Park under a different `place_id`. It was excluded only because session 5 recorded the exclusion in this changelog. **Third appearance of the different-name/same-site blind spot, and the first time a prior session's written note was the only thing standing between it and a duplicate row.** Manually-excluded listings need a suppression list, not a prose note.

**Findings**
- **Get care was 3 rows, and went to 16 — the second area running.** JP Nagar was 2, Banashankari was 3. Across two large, otherwise well-covered areas the Get care cell was near-empty while everything else sat near the ceiling. This is a systematic gap in the legacy data, not a local accident. **Expect it in every remaining area and budget queries accordingly.**
- **The nutritionist lever from session 6 did not repeat.** Six dietitian and nutrition practices surfaced; every one was below 20 reviews, unrated, or in Uttarahalli. Eat healthy stays at 5 and is genuinely supply-capped here — worth keeping the query in the batch, but it is not a reliable fix.
- **Move went from zero.** Banashankari had no Move rows at all despite a dense set of BBMP parks. Seven cleared the bands. It stops at 7 because four candidates inside the radius are squarely in other areas (see below) — padding the cell with a neighbour's lake would have been the wrong trade.
- Duplicate rate was high: 21 of 96 caught, almost all by `place_id`. Work out, Play, Eat healthy and Clear my head were already well covered; the sweep mostly confirmed them.
- Rejected below floor band: The Pulse Multi Speciality 4.0, Smash n Splash 4.0, AIRA Aqua Club 4.1, Infinity Badminton 4.1, Banashankari Badminton Academy 4.0, Sai Skin 3.4, Harvest Salad Co Banashankari 3.1, Bite 3.6, Top Game 4.2 on 19 reviews, Procare Dental 5.0 on 14, Neuberg Anand Kathreguppe 5.0 on 2, MindTonic 5.0 on 2, Chushruth Nutrition 5.0 on 9, Pan and Saladds 4.8 on 6, Dr Nataraj H.R 4.9 on 11
- Held as seeds, outside the 3 km radius: Aqua Fit Arena (3.16 km), Pure & Sure Organic Cafe Jayanagar (3.67 km)
- **Excluded as belonging to neighbouring areas despite being inside the radius:** Dore Kere Lake (Kumaraswamy Layout), Uttarahalli Lake and Shwetha's Diet & Fit Clinic (Uttarahalli — note BLR-146 Nettakallappa is already filed there), Kempambudhi Kere (Chamrajpet), Park Thyagaraja Nagar (Basavanagudi), Happy Lab Counselling (Jayanagar, already filed as BLR-816)
- Excluded on curation: Sai Medha Consultancy (4.9, 76) is career counselling and psychometrics, not mental health care — same call as Brain Power in session 6
- **Chennammana Kere Grounds** (4.3, 3,581) was the highest-ranked Play candidate by reviews but its Places address reads Basavanagudi, while its immediate neighbour Shrikanteshwara Park reads Banashankari 3rd Stage. Held as a seed pending the Basavanagudi sweep rather than guessed at; Appayya Basketball Court was taken instead

**Data issue found, not fixed**
- **Banashankari's `rg` column is split** — 22 rows South, 12 rows West. One area, two regions. New rows were written as South, the majority value. Add to the final cleanup pass.


### Session 8 — 2026-09-12 — Malleshwaram + Bellandur (areas 10 and 11)

**Two areas in one pass, chosen far apart** (north-west and south-east) so their 3 km radii could not contaminate each other. 4 Places calls, 30 queries, 121 candidates triaged. **37 rows added.** Master: 1,493 → 1,530. Malleshwaram: 36 → 52. Bellandur: 26 → 47.
Centres: Malleshwaram (13.0036, 77.5692), Bellandur (12.9260, 77.6765) — both the centroid of the area's existing coordinates.

**Malleshwaram** — Work out was already at the floor (10) and was not swept.

| Intent | Existing | Picked | Final | Status |
|---|---|---|---|---|
| Get care | 4 | 8 | 12 | at ceiling for acceptable band, 7 subcats |
| Eat healthy | 6 | 3 | 9 | **short by 1**, cap waived |
| Play | 3 | 2 | 5 | **short by 5** |
| Move | 3 | 1 | 4 | **short by 6** |
| Clear my head | 2 | 2 | 4 | **short by 6** |

**Bellandur**

| Intent | Existing | Picked | Final | Status |
|---|---|---|---|---|
| Get care | 4 | 12 | 16 | at ceiling, all picks preferred band |
| Work out | 8 | 2 | 10 | at floor |
| Play | 7 | 1 | 8 | **short by 2** |
| Eat healthy | 2 | 3 | 5 | **short by 5** |
| Clear my head | 1 | 3 | 4 | **short by 6** |
| Move | 2 | **0** | 2 | **short by 8 — no candidate cleared the floor band** |

**Bellandur has no Move supply above the floor band.** This is the first cell in the programme to take zero picks with candidates available. Every green space found falls below 4.2: Iblur Lake Park 4.0 on 3,585 reviews, Jogger's Park 3.7 on 729, Kaikondrahalli Lake Trail 4.0, Bhoganahalli Lake 4.0, Devarabeesanahalli Lake 4.2 but on 10 reviews. Reviews consistently cite sewage smell and poor maintenance. This is not an under-searched cell — Bellandur's lakes are genuinely badly rated, and the quality floor is doing exactly what it was designed to do. **Report it; do not lower the band for this area.**

**Get care confirmed as a programme-wide blind spot.** Fourth and fifth instance: Malleshwaram had 4 rows, Bellandur had 4. Bellandur alone yielded **13 preferred-band Get care candidates** against 4 existing rows. Across JP Nagar, Banashankari, Malleshwaram and Bellandur the pattern is identical — every other intent near its ceiling, Get care near zero. Treat Get care as a guaranteed full sweep in all remaining areas.

**Rule 3 threw two more false positives — the pattern is systematic**
- Level Up Fitness (4.9, 26) flagged against BLR-1173 Anjan Personal Trainer at 40 m — a commercial gym and a martial-arts trainer, different `place_id`s.
That is five confirmed false positives across two sessions, all in shared buildings or adjacent units. The session 7 conclusion stands and should now be treated as settled: **rule 3 must be gated on subcategory or name similarity before the final dedup pass.**

**Two more different-name / same-site pairs beyond 50 m, both caught by eye**
- "Sankey Tank Park" (a separate Places listing) sits **176 m** from BLR-156, which already holds Sankey Tank's `place_id` under the name Sankey Tank Park. Excluded.
- "Padukone School of Badminton" sits **52 m** from BLR-1127 Prakash Courts — both at the Canara Union Charitable Trust, one the courts and one the coaching programme. Excluded as the same venue.
Running total: **six instances**, none caught by a rule.

**Findings**
- **Malleshwaram is hemmed in by its neighbours.** It is small, dense and ringed by other named areas, so the 3 km radius pulls in more neighbour supply than local. Excluded as belonging elsewhere despite being inside the radius: East West and MK Square and Joshi table tennis academies and Dr Rajkumar Badminton (all Rajajinagar), 6S Badminton and Beautiful Minds and Saha Wellness (Armane Nagar / Sadashiva Nagar), ANIVA Counselling (Seshadripuram), Manohamsa Psychiatry (Rajajinagar), Dee's Salad Station (already filed as BLR-1445, Sadashiva Nagar). That is most of what would have filled Play and Clear my head.
- **The subcategory cap is now load-bearing in two of six intents.** Malleshwaram's six existing Eat healthy rows are all `Healthy restaurant`, so any combined cell breaches 60% unless four dietitian picks exist locally — only two did. Cap waived under the fewer-than-3-subcategories clause, the same waiver Clear my head relies on everywhere. Both intents have only two subcategories in the taxonomy, so the diversity rule does nothing in either. **The taxonomy split flagged in session 2 now affects Eat healthy as well as Clear my head.**
- Duplicate rate was high in both: Malleshwaram 18 of 61, Bellandur 20 of 60. Bellandur's Work out, Play and Move rows were almost entirely already filed.
- Rejected below floor band, Bellandur: Play Mania 3.8, Hawks Sports Arena 4.0, V Play Sports 4.1, Cult Bellandur Multi Sports 3.8, Caterspoint 4.0, Asvasana 4.8 on 17 reviews, Heart to Mind 5.0 on 4, Unalome 5.0 on 12
- Rejected below floor band, Malleshwaram: The Malleshwaram Association 4.1, R Gundurao Sports Complex 3.9, Global Swim Centre 3.7 (both branches), Nisha Millets 1.3, ChanRe Diagnostic 3.6, ISHA Diagnostics 4.0, BBMP Joggers Park 3.6, Malleshwara Public Park 4.1, Jagadhguru Shankaracharya Udyanavana 4.1, Malleswarm Dental 5.0 on 8
- Excluded on curation: Guiding Growth (Bellandur, 5.0/23) and Mom's Belief (Malleshwaram) are career and developmental assessment rather than mental health care — same call as Sai Medha and Brain Power
- Bellandur Eat healthy: Salad Days Bellandur (4.2, 197) cleared the floor band but was dropped to keep `Healthy restaurant` at the 60% cap in a cell of 5

**Data issue**
- **`rg` is split in both areas** — Malleshwaram 26 Central / 9 West, Bellandur 24 East / 1 Central / 1 South. Same defect as Banashankari. New rows written as Central and East respectively. This is now three areas; treat it as a file-wide problem in the final pass, not three one-offs.

**On sweeping two areas at once:** it worked here because both were full sweeps with high duplicate rates, so the allocation work was smaller than the search work. It cost roughly double the search volume of a single area. With the smallest remaining gap now at 38 and every area needing a full sweep, pairing is viable but not faster per area — it mainly saves session overhead.


### Session 9 — 2026-09-12 — BTM Layout + Brookefield (areas 12 and 13)

Second paired sweep, again chosen far apart (south-central and east). 4 Places calls, 36 queries, 107 candidates triaged. **43 rows added.** Master: 1,530 → 1,573. BTM Layout: 25 → 50. Brookefield: 25 → 43.
Centres: BTM Layout (12.9116, 77.6095), Brookefield (12.9631, 77.7152). Work out was already at the floor (10) in both and was not swept.

**BTM Layout**

| Intent | Existing | Picked | Final | Status |
|---|---|---|---|---|
| Get care | **0** | 15 | 15 | all 15 picks preferred band, 5 subcats |
| Move | 1 | 5 | 6 | **short by 4** |
| Eat healthy | 1 | 4 | 5 | **short by 5** |
| Clear my head | 3 | 1 | 4 | **short by 6** |
| Play | 7 | — | 7 | **not swept — out of query budget, see below** |

**Brookefield**

| Intent | Existing | Picked | Final | Status |
|---|---|---|---|---|
| Get care | 1 | 11 | 12 | at ceiling for the band available, 5 subcats |
| Clear my head | 3 | 3 | 6 | **short by 4** |
| Eat healthy | 1 | 3 | 4 | **short by 6** |
| Move | 3 | 1 | 4 | **short by 6** |
| Play | 3 | **0** | 3 | **short by 7 — every candidate was a duplicate or below floor band** |

**BTM Layout's Get care was literally zero, and produced fifteen preferred-band rows.** An area with 25 existing rows, Work out at the floor and Play at 7 had not a single Get care entry. Fifteen candidates cleared the preferred band — four dental, five physiotherapy, three labs, two dermatology, one hospital — with no band mixing required. This is the sixth and seventh area in a row showing the pattern, and the most extreme instance yet.

**Rule 3 threw two more false positives — seven total**
Three separate counselling practices sit within 30 m of each other in one AECS Layout block: BLR-843 (InnerEcho), The Body Cliinic, and Balance Psychology Counseling, the last of which shares an address with Smile Needs Dental Group. Rule 3 flagged the latter two as duplicates of InnerEcho. Both were overridden and entered as new rows. A fourth, Agilus Diagnostics, was flagged against BLR-426 (ARCH Physiotherapy) in Shams Towers — also a false pair, though it failed the band anyway.
**Seven confirmed false positives across three sessions, every one in a shared building or adjacent unit.** Distance is not the discriminating variable and no threshold will make it one.

**The largest same-site cluster yet — three listings for one lake**
Madiwala Lake surfaced as **three separate Places entries within 114 m**: Madiwala Lake Park (4.4, 3,718), Madiwala Lake Side View (4.4, 1,663) at 60 m, and Madiwala Lake Running Track (4.3, 46) at 114 m. Kept the highest-review listing and noted the other two names in its description. A fourth entry, "Lake Park End" (4.3, 1,566), sits 810 m away on the far shore of the same lake with its own boating operation — **excluded as the same water body under a second entrance name, following the Yediyur precedent**, though this one is genuinely arguable given the lake's 2.5 km circumference. Flagging it rather than burying it.
Running total of different-name / same-site cases: **nine**, none caught by a rule.

**Findings**
- **East Bangalore's parks and lakes fail the floor band as a class.** Brookefield repeats the Bellandur result exactly: Kundalahalli Lake Park 4.0 on 408 reviews, AECS Layout Park 4.1 on 1,398, Jogging Park 4.1 on 403, BEML Layout Park 4.1 on 733. Only one park in the whole area cleared 4.2. Two areas, same finding, same reviewer complaints about sewage and maintenance. **Move is structurally short in east Bangalore and no amount of searching will fix it.**
- **Brookefield's Play cell took zero picks.** Every sports venue found was either already filed (Tiger 5, Gurukul's, PlayTM, Machaxi Scooled, Machaxi Play9, V Play) or below the floor band (Dropshot Club 3.6). This is a well-covered cell that simply cannot reach 10 at the current quality bar.
- **BTM Layout's Play cell was not swept.** With Get care at zero and four other cells short, the query budget went elsewhere. Play sits at 7 and needs 3. **Carry it forward — it is the only cell in the programme so far that was skipped for budget rather than closed on evidence.**
- Two Orange Health Labs branches now sit in BTM Layout, 830 m apart on 14th Main and the 100 Feet Ring Road. Branch family, both correctly kept. Same for the two Magna nutrition practices, 222 m apart on 30th Main.
- Excluded on curation: Nukkad Grub (4.8, 334) is a poha-and-paratha breakfast spot, not health-positioned, despite ranking preferred; Life Coach / Tarot Consultant (4.9, 227) in Brookefield is tarot reading, not clinical mental health care — same call as career counselling in sessions 6 to 8
- Excluded as neighbouring areas despite being inside the radius: Nutricomms Diet Clinic (Bilekahalli), Caterspoint Madiwala, Salad Days and Salads Point (Marathahalli), Rasayan Health Bar and Zero Cals (Whitefield), Jogging Track around Munnekolala Lake (Marathahalli)
- Rejected below floor band, BTM: Elara Childcare Therapy 5.0 on 12, Caterspoint Madiwala 3.8, Earth Bowl 4.9 on 13
- Rejected below floor band, Brookefield: Salad Roots 3.6, Dropshot Club 3.6, Agilus Diagnostics 3.9, Balance Plus Physiotherapy 5.0 on 10, INSYNC 5.0 on 17

**On the paired-sweep experiment, second run:** the constraint is query budget, not allocation effort. Two full sweeps need roughly 36 to 40 queries, and something gets cut — this time BTM Layout's Play. Pairing works when one area is genuinely thin, but it is not free.


### Session 10 — 2026-09-12 — MG Road (area 14) — **halted: area-boundary blocker**

2 Places calls, 18 queries, 49 candidates triaged. **Only 2 rows added.** Master: 1,573 → 1,575. MG Road: 24 → 26.
This sweep was stopped deliberately. MG Road cannot be completed without a boundary decision, and completing it the obvious way would have damaged four areas that are still unswept.

| Intent | Existing | Picked | Final | Status |
|---|---|---|---|---|
| Get care | 0 | 2 | 2 | **short by 8 — halted, see below** |
| Work out | 7 | 0 | 7 | halted |
| Play | 7 | 0 | 7 | halted |
| Eat healthy | 2 | 0 | 2 | halted |
| Clear my head | 2 | 0 | 2 | halted |
| Move | 3 | 0 | 3 | halted |

**The problem: central Bangalore is split across fifteen overlapping area labels, several of which are streets.**
Within 3 km of the MG Road centre the file holds **124 rows under 15+ area labels**: Ashok Nagar (26), MG Road (23), Cubbon Park (10), Richmond Town (9), Vasanth Nagar (9), Ulsoor (8), **Brigade Road (5)**, **St Mark's Road (4)**, Fraser Town (4), Shivajinagar (4), **Church Street (3)**, Gandhi Nagar (3), Sivanchetti Gardens (2), **Nrupathunga Road (2)**, Victoria Layout (2).

Brigade Road, Church Street, St Mark's Road and Nrupathunga Road are **streets inside the MG Road commercial district**, not areas. The session 0 standardisation collapsed 193 labels to 136 but did not catch these — it handled block/stage/phase suffixes and spelling variants, not street-names-as-areas. Ashok Nagar's centroid sits **540 m** from MG Road's; Shanthala Nagar / Ashok Nagar is simply the postal designation of the MG Road corridor.

**What this did to the sweep.** Of 49 candidates, 16 were already filed — and almost none of them under MG Road. They were filed under Ashok Nagar (Healing Hub, Fiendish Therapy, SwimLife Museum Road, Cult Gym Richmond Road, BlackBx, Pilates for Wellbeing, AATMA Pilates), Richmond Town (Aviva Counselling, Richmond Town Park), Sivanchetti Gardens (RSI Cricket Ground), Ulsoor (South United FC), Shivajinagar (Neuberg Anand), Vasanth Nagar (Aster Labs) and Fraser Town (Urban Fork). **MG Road's supply is not missing; it is filed next door.**

Of the 33 remaining clean candidates, **31 have a street address naming one of those neighbouring labels.** Applying the same area-exclusion rule used in sessions 7 to 9 leaves exactly **two** candidates genuinely on Mahatma Gandhi Road: Kamakshi Dental (4.8, 36) and Activity Heals (4.6, 36), both floor band. Those two were added. Get care went 0 → 2.

**Why I did not simply take the other 31.** Ashok Nagar, Cubbon Park, Vasanth Nagar and Fraser Town are all still on the remaining list. Absorbing their supply into MG Road would have filled MG Road's cells to the floor and left four areas to be swept later against a file that had just been stripped of their best candidates. That is the failure mode this programme has been guarding against since session 1.

**MG Road's existing rows are themselves mis-areaed.** Sri Chamarajendra Park (BLR-155) is Cubbon Park, which is its own area label. Olympic Gym (BLR-1243) and Game Theory (BLR-1249) are Ulsoor. Revive Fight Club (BLR-1246) is Fraser Town. Karnataka Sharks (BLR-1546) is Gandhi Nagar. Sree Kanteerava Stadium (BLR-1571) and the Kanteerava Archery Range (BLR-1580) sit beside Cubbon Park. Bengaluru Football Stadium (BLR-1573) and Swimlife (BLR-1588) carry "Ashok Nagar" in their own names. The label has been a catch-all for central Bangalore from the start.

**Projection — what a boundary fix would achieve without any further searching**

| | now | + street labels merged | + Ashok Nagar merged |
|---|---|---|---|
| Work out | 7 | 9 | **15** |
| Play | 7 | **10** | **12** |
| Move | 3 | 4 | 5 |
| Eat healthy | 2 | 2 | 5 |
| Clear my head | 2 | 2 | 4 |
| Get care | 0 | 0 | 1 |

Merging the four street labels alone closes Play. Merging Ashok Nagar as well closes Work out and Play outright and roughly halves the remaining gaps — before a single new search. Get care stays near zero either way, which is consistent with every area since JP Nagar.

**Recommendation.** Resolve central Bangalore as one decision before sweeping any of it:
1. Merge the street-name labels — Brigade Road, Church Street, St Mark's Road, Nrupathunga Road — into MG Road. These are unambiguous; they are streets in the district, and the same pattern should be checked for elsewhere in the file.
2. Decide whether MG Road and Ashok Nagar are one area or two. They are 540 m apart, share a postal designation, and already share venues. My view is one area, because no user picking a gym would distinguish them.
3. Then sweep the merged unit once, and drop the redundant labels from the remaining list.
Until that is settled, MG Road, Ashok Nagar, Cubbon Park and Vasanth Nagar should all stay unswept — sweeping any one of them contaminates the other three.

**Also noted:** RBANM's Ground and South United Football Club are the same venue 155 m apart (South United plays at RBANM's Ground) — a tenth different-name/same-site case. SwimLife's Museum Road pool has a second Places listing 105 m away for its car park ("SWIMLIFE SJBHS Swimming Parking"), rated separately at 4.5 on 40 reviews. Excluded both.


### Session 11 — 2026-09-12 — Marathahalli (area 14)

Single area, full query budget as agreed. 2 Places calls, 18 queries, 50 candidates triaged. **20 rows added.** Master: 1,575 → 1,595. Marathahalli: 24 → 44.
Centre: (12.9568, 77.7009). All six core cells were below the floor.

| Intent | Existing | Picked | Final | Status |
|---|---|---|---|---|
| Get care | 1 | 11 | 12 | at ceiling for the band available, **6 subcategories, top share 25%** |
| Play | 9 | 2 | 11 | above floor |
| Work out | 8 | 2 | 10 | at floor, both picks preferred band |
| Clear my head | 2 | 2 | 4 | **short by 6** |
| Move | 1 | 2 | 3 | **short by 7** |
| Eat healthy | 0 | 1 | 1 | **short by 9 — the worst cell in the programme** |

**Get care produced the best-diversified cell of the programme so far** — 12 rows across six subcategories (hospital 3, lab 2, eye 2, dental 2, physio 2, dermatology 1), top share 25%. Eight candidates cleared the preferred band. Eighth area running with Get care at or near zero on entry.

**Eat healthy finished at 1 and that is the honest number.** Marathahalli is a dense area with 44 rows, yet exactly one healthy-eating venue inside it cleared the floor band. Everything else was either in a neighbouring area (The Liquid Fruit and Bengaluru Fusion are Brookefield, Taaza Bites is Kasavanahalli, Harvest Salad is Mahadevapura, Bowls by Gram is Yemalur, Akhilasoukhya is out of radius at 3.17 km), below band (Salads Point 3.7, GreenOsalad 5.0 on 15, Cool Land 4.1, Juice Bar 3.8), or excluded on curation. **Nutrition/dietitian, which rescued Eat healthy in JP Nagar, found nothing usable here either** — every local dietitian listing had under 5 reviews.

**Same-site and shared-premises cases — four in one area**
- **Derma Solutions (4.6, 1,257) and Dr Sandeep Mahapatra (4.5, 315) are the same business**, 3 m apart, sharing a phone number — he is the doctor at Derma Solutions. Kept Derma Solutions only. This is the first confirmed case where two listings share a phone number, which is a far better duplicate signal than distance
- **Daya Labs Centromed and Prakash Laboratories sit 17 m apart** at building 31 and building 41 on the same 2nd Cross stretch, both 4.9, both labs. Different place_ids, different phone numbers, different names — **kept both**, but this is the highest-risk pair filed so far and is flagged for the final pass
- Nisarga Park and "Nisarga Park Entrance Gate" are one park 39 m apart — eleventh different-name/same-site case. Kept the main listing and noted the second name
- Apollo Diagnostics and Apollo 24|7 are two Apollo labs 110 m apart — branch family, took the better-rated one

**Neighbouring areas have already taken Marathahalli's supply.** Swim Scooled AECS Layout (4.8, 142) and Swim Scooled Rashtrotthana (4.6, 428) are both filed under Brookefield from session 9, and both are closer to Marathahalli's centre than Brookefield's on the AECS side. Zeus Fitness (4.8, 259) is under Kundalahalli, AECS Football Ground under Brookefield. **Marathahalli's Move cell is short partly because its pools were swept into Brookefield first.** This is the sequencing cost of area-by-area sweeping and is worth a look in the final pass.

**Data issue: one building, two areas.** Vishwam Ayurveda Clinic (filed here, Marathahalli) and Nutrition For Life @ Vishwam Ayurveda (filed under Brookefield in session 9) are at the same address — 19, house no 44, Maruthi Layout — 20 m apart. Google returns "Chinnapanna Halli" for one and "AECS Layout, Brookefield" for the other. They are genuinely different services and both belong in the file, but they should not sit in two different areas. Flagged.

**Findings**
- Excluded on curation: Sahaja Yoga Meditation Centre (5.0, 22) — guru-led spiritual movement, same call as Isha, Art of Living, Heartfulness and Yogoda Satsanga; Creamy Millet — millet ice cream is Indulge, not Eat healthy; Variety Juice & Shawarma and KWALITY Cool Point — juice counters whose menus are mostly shawarma, burgers and falooda; Ayu Health Hospitals (4.7, 73) — a booking-coordination service operating from Jeevika's address, 14 m away; Lens Eye Care — optical retail
- Excluded as private/restricted: Riviera Park (4.4, 48) is an apartment park; Cricket Ground Sector 3 is HAL-employee-only
- Rejected below floor band: Radha Multispeciality Hospital 3.9, Blossom Physiotherapy 4.0, Orchid Sports Academy 4.0, Soccer City 3.9, Sporthood Active Arena 3.9, Game Theory Whitefield 3.9, DJ Sports Arena 4.1, PlayTM 4.1, AECS Layout Park 4.1, Jogging Park 4.1, Agilus Diagnostics 5.0 on 2
- `rg` was clean — all 24 existing rows East, new rows written as East


### Session 12 — 2026-09-12 — Sarjapur Road (area 15)

Single area, 2 Places calls, 18 queries, 66 candidates triaged. **22 rows added, 2 legacy rows enriched.** Master: 1,595 → 1,617. Sarjapur Road: 19 → 41, and **no rows are left without coordinates.**

| Intent | Existing | Picked | Final | Status |
|---|---|---|---|---|
| Get care | 2 | 10 | 12 | at ceiling, **7 subcategories, top share 25%** |
| Work out | 7 | 3 | 10 | at floor, 3 subcategories |
| Eat healthy | 4 | 3 | 7 | **short by 3 — best Eat healthy result since Jayanagar** |
| Clear my head | 3 | 2 | 5 | **short by 5** |
| Play | 3 | 2 | 5 | **short by 5** |
| Move | 0 | 2 | 2 | **short by 8** |

**Method note — centre point moved deliberately.** Sarjapur Road is a linear corridor, not a blob: its existing rows span 3.4 km east to west. The coordinate median that this programme normally uses as the area centre sits at the far western end, **1.5 km from Bellandur's centre**, which was already swept in session 8 — a sweep from there would mostly have re-found Bellandur. I used the corridor midpoint (12.9100, 77.6881) instead. **This is a documented deviation from the standing method, not a silent one.** The rule it suggests: for corridor-shaped areas, use the bounding-box midpoint, not the coordinate median. Worth applying to any other road-named area in the remaining list.

**Two legacy rows fixed.** BLR-902 (Klear Space) and BLR-921 (The Safe Room) had been carried since session 0 with no coordinates and so were invisible on the map. Both were found in this sweep and have been given coordinates and `gm` links. That leaves the file with **roughly 97 rows still missing coordinates**, down from 99.

**Eat healthy finally worked, and nutrition is why.** Three dietitian practices cleared the band — Vasundhara Agrawal (4.9, 198), Dr Harshita Kaushik (5.0, 179) and Shikha Mishra (4.7, 80) — taking the cell from 4 to 7. This is the pattern first seen in JP Nagar and it now has a clear shape: **where an area has a professional population, nutrition practices carry Eat healthy; where it doesn't, nothing does.** Marathahalli had none above 5 reviews and finished at 1; Sarjapur Road has a dense apartment-and-tech-park population and produced three.

**Get care hit 7 subcategories with a 25% top share** — the most diversified cell in the programme, narrowly beating Marathahalli. Eleven candidates cleared the preferred band.

**Findings**
- **Move is short for the familiar east-Bangalore reason.** Kaikondrahalli Lake Trail (4.0 on 36 reviews) is the area's best-known green space and fails the floor band; reviewers describe sewage smell and burning plastic. Only two lakes cleared 4.2, both with odour complaints noted in their descriptions. Fourth area running with this result
- Excluded on curation: Art of Living Yoga & Meditation Centre (4.8, 138) — guru-led movement, same call as Isha, Heartfulness, Yogoda and Sahaja Yoga; Zoechea Academy (5.0, 114) — primarily a training centre for psychologists, same call as career counselling; Infinity Nutrition Centre (5.0, 42) — a Herbalife-style shake club rather than a dietitian practice; Decathlon Sarjapura — retail
- Excluded as neighbouring areas: Manipal Hospitals Sarjapur Road is already filed under Bellandur, as are Harvest Salad Co and Newtrist; Sunkissed and Yummy Bee are HSR Layout; Squeez Juice is Kadubeesanahalli
- Rejected below floor band: Prima Diagnostics 4.0, Sporthood Turfpark 3.9, Sporthood Badminton 4.1, Cult Sarjapur Swimming 4.1, Suncity Gloria 3.8, SunKissed Sarjapur 4.1, 32 Degree 4.0, Fresh Juice 4.1, Asvasana 4.8 on 17
- Out of radius at the eastern end: Rocks Fitness (4.8, 909) at 3.5 km, Archana Krishnappa at 3.3 km. Both are genuinely Sarjapur Road but beyond the 3 km rule — **a corridor this long cannot be fully covered by one circular sweep.** Flagged

**Data issue: `rg` is split three ways** — East 8, South East 5, South 4 across the 19 legacy rows. New rows written as South East. Fourth area with an internal `rg` split, after Banashankari, Malleshwaram and Bellandur.


### Session 13 — 2026-09-12 — Electronic City (area 16)

2 Places calls, 16 queries, 77 candidates triaged. **30 rows added, 1 legacy row enriched.** Master: 1,617 → 1,647. Electronic City: 18 → 48. No rows left without coordinates.

| Intent | Existing | Picked | Final | Status |
|---|---|---|---|---|
| Get care | 0 | 16 | **16** | **at the full preferred-band ceiling — a first for this programme** |
| Work out | 9 | 1 | 10 | at floor |
| Play | 5 | 3 | 8 | short by 2 |
| Move | 1 | 4 | 5 | short by 5 |
| Eat healthy | 1 | 4 | 5 | short by 5 |
| Clear my head | 2 | 2 | 4 | short by 6 |

**Get care reached 16 with every single pick in the preferred band.** Sixteen candidates cleared 4.8 with 125+ reviews — exactly the number needed for the ceiling, so no mixing down to the acceptable band was required. Subcategories: lab 5, dental 4, physio 4, hospital 1, eye 1, dermatology 1; top share 31%. **This is the strongest cell the programme has produced.** Ninth area in a row that entered with Get care at or near zero, and by far the richest once swept — the density of Phase I's Neeladri Road clinic strip is unlike anything seen so far.

**Corridor centre rule applied a second time, and it worked.** Electronic City spans 5.2 km east to west across Phase I, Phase II, Doddathoguru, Konappana Agrahara and Kammasandra. The coordinate median sits in Phase I at the western edge; the bounding-box midpoint (12.8452, 77.6693) sits between the two phases. Using it reached both, and the picks span 0.35 km to 2.94 km fairly evenly. The rule established for Sarjapur Road last session is now used twice and should be treated as standard for large or linear areas.

**BLR-849 fixed.** Dr Divya Kumawat had been carried since session 0 with no coordinates and no rating. Found in this sweep at 4.8 on 464 reviews — a preferred-band entry that had been invisible on the map. Coordinates, `gm` link, rating and band all backfilled. **Worth noting: the name-match check did not catch this automatically** — the stored name is "Dr. Divya Kumawat" and the Places listing is "Dr Divya Kumawat Consultant Counseling Psychologist", and the full stop broke the substring match. Punctuation-stripping would have caught it; the remaining ~96 no-coordinate rows should be re-matched with punctuation normalised before anyone concludes they are unfindable.

**Move improved but is still the weak cell, for a new reason.** Unlike east Bangalore, Electronic City's parks are not uniformly below band — Doddathogur Lake Park (4.5, restored by the Infosys Foundation with a paved 1.3 km loop) and Huskur Park (4.5, maintained by the Kiran Mazumdar-Shaw group) both cleared comfortably. **Corporate-funded lake restoration is visibly holding quality up here in a way BBMP maintenance does not elsewhere.** The failures were the un-adopted lakes: Hebbagodi 3.9, Parappana Agrahara 3.9, both with sewage complaints.

**Findings**
- Excluded on curation: Healthy Pillaiyar (4.4, 1,178) — an ordinary idli-dosa tiffin room with "healthy" in the name, not a health-positioned kitchen; Healohub Technologies — a booking platform, not a practice; Pulse PT — home-visit-only service with no venue; Eye To Eye Opticals — retail; IIITB Football & Cricket Ground — campus facility, not public
- Rejected below floor band: Avoke The Avocado Cafe 4.0, Living Bowls 2.3, Baasavva Swimming 3.7, Playon Sports Arena 3.8 (already filed), Smash Sports Academy 4.1, Hebbagodi Lake Park 3.9, Parappana Agrahara Lake Park 3.9, Sarathi Hospital 4.8 on 16, Cure Multispeciality 4.5 on 42
- **Out of radius, and genuinely Electronic City:** Sankalp Nethralaya (4.8, 1,022) at 3.00 km, Smashify Badminton (4.8, 276) at 3.19 km, Sunshine Badminton (4.4, 916) at 3.07 km, Huskur Lake (4.5, 714) at 3.14 km, EC Sports Arena (5.0) at 3.06 km. **Five good candidates sat between 3.0 and 3.2 km** — the same radius-versus-area-size problem flagged for Sarjapur Road, and here it cost Play and Move specifically
- Rule 3 near-miss: El Classico Turf sits 7 m from BLR-1313 Smash Arena. Different sports (cricket/football turf vs badminton) in what is probably one complex. Not filed — El Classico was below the needed band anyway — but it is a twelfth same-site instance
- `rg` was clean: all 17 existing coordinate rows South, new rows written as South


### Session 14 — 2026-09-12 — Basavanagudi (area 17)

2 Places calls, 17 queries, 47 candidates triaged. **27 rows added.** Master: 1,647 → 1,674. Basavanagudi: 21 → 48.
Compact area (2.4 km across), so the standard coordinate-median centre was used, not the corridor rule.

| Intent | Existing | Picked | Final | Status |
|---|---|---|---|---|
| Get care | 1 | 11 | 12 | at ceiling, 6 subcategories, top share 33% |
| Work out | 6 | 4 | 10 | at floor |
| Move | 5 | 4 | 9 | short by 1 |
| Play | 2 | 4 | 6 | short by 4 |
| Clear my head | 2 | 2 | 4 | short by 6 |
| Eat healthy | 0 | 2 | 2 | **short by 8** |

**The punctuation-stripped name match, added this session on last session's finding, immediately earned its place.** It caught three candidates that the old exact-match would have filed as new rows: Manospandana (already BLR-827, Banashankari), Happy Lab Counselling (BLR-816, Jayanagar) and Protein Station (BLR-1166, Banashankari). **Three duplicate rows avoided in a single session** — worth applying retroactively to the no-coordinate backlog as recommended.

**Eat healthy failed here, and the reason is specific.** Basavanagudi is ringed by Banashankari and Jayanagar, both already swept, and the area's healthy-eating supply is filed there: Protein Station, GainZ Cafe, Press & Dress, Salad Days Banashankari and Healthy Nation all sit under neighbouring labels. What remains inside Basavanagudi proper is a millet-foods store and one dietitian. **This is the Marathahalli pattern with a different cause** — not absent supply, but supply already claimed by earlier sweeps. Third area where sequencing has cost a later cell.

**Move reached 9 but the subcategory count is misleading.** Basavanagudi's three legacy park rows (Bugle Rock, M.N. Krishna Rao, Basavanagudi Road) are filed as `Running route / trail` while the three added this session are `Park / Lake walking loop`. They are the same kind of thing. The cell reports three subcategories at 33% top share; honestly it is two subcategories — parks and pools — at roughly 67%. **Flagged: the Move taxonomy is inconsistent file-wide and the diversity metric is reading it wrong.**

**Get care went 1 → 12 with all seven preferred-band candidates used.** Ten of the twelve are within 1.25 km of the centre; Basavanagudi's clinic supply is genuinely dense and local, unlike the east-Bangalore areas where it was scattered.

**Findings**
- Rule 3 false positive number eight: Play On Fitness and BLR-1508 Energy Yoga Studio sit 45 m apart on South End Road. A gym and a yoga studio, different businesses, no shared phone. Filed both
- Excluded on curation: Basavanagudi Union Service Club (4.2, 1,202) — a members' social club whose reviews are about the canteen and guest rooms, not sport; TriplePoint Sports — racquet retail and stringing, not a venue; Bugle Rock Park Back Entrance — a second listing for BLR-801
- Excluded as neighbouring areas: Happy Lab, Tackle Jayanagar, Games Period and Swastha are Jayanagar; GainZ Cafe, Press & Dress, Salad Days, KL Academy and South Bengaluru TT are Banashankari; SKIES TT and Healthy Nation are JP Nagar
- Rejected below floor band: NR Colony Badminton 3.5, M.N. Krishna Rao Park badminton court 3.2, Delta Diagnostic 3.8, Arumugam Play Ground 4.1, Minerva Skin 4.3 on 19, Sreenath Eye Care 5.0 on 48, Basavanagudi Dental 4.9 on 11
- `rg` split three ways in the legacy rows — South 13, Central 5, West 3. New rows written as South. Fifth area with an internal `rg` split


### Session 15 — 2026-09-12 — CV Raman Nagar (area 18)

2 Places calls, 20 queries, 62 candidates triaged. **17 rows added.** Master: 1,674 → 1,691. CV Raman Nagar: 18 → 35.
Entered with **three cells at zero** — Get care, Eat healthy and Clear my head.

| Intent | Existing | Picked | Final | Status |
|---|---|---|---|---|
| Get care | 0 | 12 | 12 | at ceiling, 6 subcategories, top share 25% |
| Work out | 11 | 0 | 11 | already above floor, not swept |
| Play | 5 | 1 | 6 | short by 4 |
| Move | 1 | 2 | 3 | short by 7 |
| Eat healthy | 0 | 1 | 1 | **short by 9** |
| Clear my head | 0 | 1 | 1 | **short by 9 — worst Clear my head result of the programme** |

**Method refinement: the bounding-box centre rule needs an outlier check.** CV Raman Nagar's bbox spans 5.8 km north to south, which would have put the centre at 12.9992 — in open country north of the area. The entire spread comes from **one mis-areaed row**: BLR-1233 Trendz Combat Arena sits in Ramamurthy Nagar, 4.5 km north of every other row. Strip it and the area is 2.3 km across. The coordinate median was correct here. **Amended rule: use the bounding-box midpoint for corridors, but check for single-row outliers first — one wrong row can move the centre by 2 km.** BLR-1233 is flagged for re-areaing.

**Clear my head and Eat healthy both finished at 1, and the reason is the same one.** CV Raman Nagar is wedged between Indiranagar and HAL, both of which hold the supply: Cadabam's Mindtalk, The Mind Research Foundation and The Counselling Corner are Indiranagar; Mind And Soul Wellness is already filed under Jeevan Bima Nagar; Cafe Graze is already filed under HAL; Qua Nutrition, NutrifyMyDiet, Clean&Green, Flax Cafe, Salad Days and Harvest Salad are all Indiranagar. **Fourth consecutive area where an adjacent completed sweep holds the missing cell.** This is no longer an observation — the boundary review in Open items should be treated as blocking for the soft cells.

**Get care went 0 → 12 with all seven preferred-band candidates used**, across six subcategories at 25% top share. Kaggadasapura Main Road carries most of it.

**Findings**
- **Byrasandra Lake appears twice in Places** — "Byrasandra Lake" (4.6, 84) and "Byrasandra Lake Walking Track and Park" (4.6, 80), 78 m apart, same restored lake beside Bagmane Tech Park. Kept one, recorded the other name in the description. **Thirteenth different-name/same-site case**
- **Atal Bihari Vajpayee Park also appears twice**, 570 m apart at two entrances of one 2.5 km lake circuit, rated 4.1 and 4.2. Took the 4.2 listing; the 4.1 fails the band anyway. Fourteenth case
- Rule 3 near-miss: Dr Sweta Physiotherapy sits 3 m from Sri Srinivasa Speciality Hospital — a physiotherapist practising inside the hospital. Not filed (hospital was picked, physio was not needed), but it is the same shared-premises pattern
- Excluded on curation: SPARK Nutrition Centre (5.0, 22) — shake-club language throughout the reviews, same call as Infinity Nutrition in Sarjapur Road; DROMI Badminton Court — DRDO township, not public; BLINKIT hub ES276 — a dark store whose Places listing has badminton-court reviews attached, a Google data error
- Rejected below floor band: Tooth Affair 4.1, Sree Lakshmi 3.7, Abhayahasta 3.7, Medray 3.9, Tvacha Skin 4.1, Deepam Eye 2.9, Game Theory V K Sports 3.8, Atal Bihari Vajpayee Park Malleshpalya listing 4.1, Open Gym Park 3.9, B Narayanapura Lake 4.2 on 13
- Work out was not swept — already at 11, above the floor, and the query budget went to the three zero cells instead
- `rg` was East 16 / Central 2 in the legacy rows; new rows written as East. Sixth area with an internal `rg` split


### Session 16 — 2026-09-12 — Rajajinagar + Sadashiva Nagar (areas 19–20, paired)

**Paired at the user's request, but each area given a full budget rather than a split one** — 4 Places calls, 36 queries, 111 candidates. Sessions 8–9 diluted quality by splitting one budget across two areas; that was not repeated here. **36 rows added, 2 legacy rows enriched.** Master: 1,691 → 1,727.

**Overlap was checked before sweeping, not discovered after.** The two centres sit 3.16 km apart, so their radii overlap, and **Malleshwaram (51 rows, swept in session 8) falls inside the 3 km circle of both**. Contested candidates were allocated to whichever centre they were actually nearer, rather than to whichever area was swept first. That check paid for itself immediately — see below.

| Rajajinagar | Before | Added | After |
|---|---|---|---|
| Get care | 3 | 9 | 12 (6 subcats, 25% top) |
| Eat healthy | 0 | 5 | 5 |
| Move | 0 | 4 | 4 |
| Play | 2 | 2 | 4 |
| Work out | 7 | 0 | 7 — **not swept** |
| Clear my head | 4 | 0 | 4 |

| Sadashiva Nagar | Before | Added | After |
|---|---|---|---|
| Get care | 0 | 12 | 12 (5 subcats, 42% top) |
| Work out | 5 | 3 | 8 |
| Clear my head | 3 | 1 | 4 |
| Eat healthy | 3 | 0 | 3 |
| Move | 3 | 0 | 3 |
| Play | 2 | 0 | 2 |

**Fourteen duplicates caught that the old matching would have missed**, most of them a direct result of the overlap check: A2V Badminton (already Basaveshwar Nagar), Neuberg Anand Vyalikaval (already Malleshwaram), Quadz Fitness, The Wellness Co., Dee's Salad Station, Sadashivanagara Park, Children's Park, Fire To Fly and Chakshu Foundation (all already filed). **Without the pre-sweep check these would have entered as new rows in the wrong areas.**

**Three no-coordinate backlog rows surfaced, and one is a legacy duplicate.**
- **BLR-922 Darpana Wellness** and **BLR-924 Beautiful Minds** enriched with coordinates, ratings and bands — both had been blank since session 0
- **BLR-923 Chakshu Foundation has the same place_id as BLR-825**, which is already filed with full coordinates. This is a confirmed legacy same-name duplicate, not an enrichment target. **Flagged for deletion — not deleted, since that needs a decision**

**Sankey Tank is filed twice in two different areas.** BLR-156 (Malleshwaram) and BLR-312 (Sadashiva Nagar) are both the same lake, 176 m and 277 m from the Places listing. Neither was re-added. **This is the clearest instance yet of the boundary problem: one venue, two area labels, both live.**

**Findings**
- **Fifteenth same-site case:** Mariyappanapalya Park and "Aane Park" are one park, two listings 47 m apart. Filed once, alias recorded in the description
- Rajajinagar **Work out was not swept** — it sits at 7 with the floor at 10, but the 36-query budget went to Get care, Eat healthy and Move, all of which were at or near zero. Carry forward, same as BTM Layout Play
- Excluded on curation: Gayathri Wellness (Herbalife club language in reviews, same call as SPARK and Infinity Nutrition); Cessna Lifeline (veterinary); Sadashivanagar Club and Basavanagudi Union Service Club pattern (members' clubs)
- Sadashiva Nagar Get care leans dental — five of twelve — because all five cleared the preferred band and quality outranks diversity. Top share 42%, within cap
- `rg`: Rajajinagar written West (matches all 16 legacy rows). **Sadashiva Nagar legacy rows split West 8 / Central 7 / North 1**; new rows written Central, which is geographically right but deepens the split. Seventh area with an internal `rg` split


### Session 17 — 2026-09-12 — Bannerghatta (area 21)

2 Places calls, 20 queries, 74 candidates triaged. **22 rows added.** Master: 1,727 → 1,749. Bannerghatta: 17 → 39.

| Intent | Existing | Picked | Final | Status |
|---|---|---|---|---|
| Get care | 2 | 10 | 12 | at ceiling, 6 subcategories, top share 25% |
| Move | 1 | 4 | 5 | short by 5 |
| Eat healthy | 2 | 3 | 5 | short by 5 |
| Clear my head | 0 | 4 | 4 | short by 6 |
| Play | 2 | 1 | 3 | short by 7 |
| Work out | 7 | 0 | 7 | **not swept** |

**The outlier check caught a label problem, not a shape problem.** Bannerghatta's bounding box spans **16.8 km**, but this is not a corridor — the label is conflating two different places. Fourteen of seventeen rows sit within 2.8 km of each other along **Bannerghatta Road**; the rest are **Bannerghatta** the village and national park, 11 km south (BLR-607 Butterfly Park Trail at 10.8 km, Recovery Lounge at 6.8 km west). This is the street-name-as-area problem in a new form: a road and a destination sharing one name. **Swept from the coordinate median in the Hulimavu cluster; the two southern rows should be split into their own label.**

**Another cross-area no-coordinate case surfaced.** Amaha Mental Health Centre matched **BLR-936 (Whitefield, no coordinates)** by name and **BLR-896 (JP Nagar)** by place_id. Amaha is a chain, so BLR-936 is probably a real Whitefield branch that simply lacks coordinates — **not** a duplicate. It needs the Whitefield branch's own place_id, not a merge. Flagged, not touched.

**Get care 2 → 12 with all four preferred picks, 25% top share across six subcategories.** Three of the four preferred candidates are physiotherapy clinics, so physio is heavier than ideal, but quality outranks diversity and the cell still balances out at 12.

**Findings**
- **The nearest lake to the centre fails the band.** Arekere Lake Park sits 700 m away with a 1.2 km track but carries only 12 reviews (4.4) — below the floor's 20-review minimum. Its second listing, "Arekere Lake Park Entrance", has 4. **A genuinely good local amenity is excluded on review count alone**, and the Move picks had to reach 1.8–2.3 km out instead. Worth noting as a limitation of the review-count floor, not a supply problem
- JP Nagar (49 rows) and BTM Layout (6) both fall inside the 3 km circle as predicted; Earth Bowl, Me & Salads, Healthy Nation, Harvest Salad JP Nagar and Amaha were all already filed or belong to those areas
- Excluded on curation: IIMB Sports Complex (students and staff only, same call as DROMI in CV Raman Nagar); Decathlon Sports Complex (retail, already filed as Buy gear)
- Rejected below floor band: Anand Multispeciality 3.6, Aditi Nursing Home 3.5, Vidya Diagnostics 3.9, Pooja Eye Clinic 4.1, Hulimavu Park 3.4, Harvest Salad Arekere 4.2 on 10
- **Work out was not swept** — at 7 against a floor of 10, but the 20-query budget went to Clear my head (zero), Get care, Move and Eat healthy. Carry forward alongside Rajajinagar and BTM Layout
- Move finished at 80% top share (four park loops, one trail) — above the 60% cap. Accepted because the alternative was leaving the cell at 1; flagged as a diversity exception


### Session 18 — 2026-09-12 — Domlur + HAL (areas 22–23, paired)

3 Places calls, 26 queries, 96 candidates. **26 rows added.** Master: 1,749 → 1,775.

**Method change, made deliberately and worth recording.** The two centres are **1.78 km apart** — the closest pair swept so far, against a 3 km radius. Their circles almost entirely coincide: 168 rows sit within 3 km of Domlur, of which only 15 were Domlur. Running two independent full sweeps would have returned largely the same venue pool twice, so the area was **searched once as a union and each result allocated to the nearer centre**. Three calls rather than four, no loss of coverage.

| Domlur | Before | Added | After | | HAL | Before | Added | After |
|---|---|---|---|---|---|---|---|---|
| Get care | 1 | 11 | 12 | | Work out | 4 | 5 | 9 |
| Eat healthy | 1 | 3 | 4 | | Get care | 3 | 1 | 4 |
| Clear my head | 0 | 2 | 2 | | Move | 0 | 2 | 2 |
| Work out | 9 | 1 | 10 | | Eat healthy | 1 | 0 | 1 |
| Move | 0 | 1 | 1 | | **Clear my head** | 0 | 0 | **0** |
| Play | 3 | 0 | 3 | | Play | 5 | 0 | 5 |

**The nearest-centre rule allocated 18 rows to Domlur and 8 to HAL, and that asymmetry is real, not a sweep failure.** Domlur's centre sits on the dense Domlur 1st Stage clinic strip; HAL's sits in a residential pocket whose nearby supply is already filed under Indiranagar, Jeevan Bima Nagar, Kodihalli and Vimanapura. **HAL's Clear my head finishes at zero — the first cell in the programme to be swept and still return nothing filable.** Every candidate found (Cadabam's Mindtalk, The Mind Research Foundation, The Counselling Corner, Mind And Soul Wellness) already belongs to a neighbouring label.

**This pair is the strongest argument yet for the boundary review.** At 1.78 km apart with 86 Indiranagar rows sitting between them, Domlur and HAL are arguably not two areas. **Recommend evaluating a merge of Domlur, HAL and the Indiranagar fringe into one unit before publishing**, on the same reasoning as the central cluster.

**Findings**
- **Sixteenth same-site case:** "Dr Roshan Appanna" and "Tooth Care Centre" share identical coordinates — he is the dentist at that centre. Filed once under the combined name
- Six duplicates caught by the overlap check: Manipal Hospitals (Kodihalli), Indiranagara Park (Indiranagar), HAL Sports Club (Vimanapura), Game Theory 100 Feet Road (Indiranagar), Infant Fitness Gym (already HAL), Jeevanam Yoga (Indiranagar)
- Excluded on curation: Domlur Club and Indiranagar Club (members' clubs, same call as Sadashivanagar and Basavanagudi Union); Sai Fountains (pool contractor, not a venue)
- Rejected below floor band: Axon Speciality 3.4, Netranjali Eye 3.9, New Look Skin 4.0, Hollyhock Badminton 3.9, Game Theory Double Road 3.9, Citi Nest 3.8, Nisha Millet Swimming 2.5, Uthkarsha Park 3.6, Neuberg Anand Domlur 1.0 (reviews say the branch does not exist)
- Domlur Move finished at 1 and HAL at 2 — both below the floor. The parks that would fill them (Indiranagara Park, Byrasandra Lake, Atal Bihari Vajpayee) are all filed elsewhere
- `rg`: Domlur written Central (matches all 15 legacy rows); HAL written East (matches 11 of 14; 3 are Central). Eighth area with an internal split


### Session 19 — 2026-09-12 — Kalyan Nagar (area 24)

2 Places calls, 20 queries, 79 candidates. **23 rows added.** Master: 1,775 → 1,798. Kalyan Nagar: 12 → 35.
Entered with the **largest gap of the programme (52)** and two cells at zero.

| Intent | Existing | Picked | Final | Status |
|---|---|---|---|---|
| Get care | 1 | 13 | 14 | **all thirteen picks preferred band** |
| Eat healthy | 0 | 6 | 6 | short by 4 |
| Move | 0 | 3 | 3 | short by 7 |
| Play | 1 | 1 | 2 | short by 8 |
| Clear my head | 2 | 0 | 2 | **swept, nothing new filable** |
| Work out | 4 | 0 | 4 | not swept |

**Clean geometry for once.** 2.8 km span, no outliers, and — unusually — **no large swept neighbour inside the radius**. Only 51 rows sat within 3 km, spread across small unswept labels (HRBR Layout 8, Banaswadi 8, Kammanahalli 5) rather than dominated by a completed area. First area in six sessions without that problem, and the Get care result reflects it.

**Get care produced thirteen preferred-band candidates — the deepest single cell in the programme.** All thirteen were taken, giving 14 rows of which 13 are preferred. Six are dental (43% top share, within cap); the HRBR/Kalyan Nagar dental cluster is genuinely dense. Eye and hospital coverage is thinner than ideal, but band priority outranks diversity and every acceptable-band alternative was a worse row.

**Clear my head was swept and returned nothing new.** Both viable candidates — Mind Calm Centre and Sitara — are already filed as BLR-831 and BLR-832. The rest failed the band: ReACH Psychiatry 3.9, Cadabams Mindtalk Kalyan Nagar 3.8, Amaha HRBR on 1 review, Cherith Brook on 3. **Second consecutive session where a Clear my head sweep yielded zero**, after HAL. The cell stays at 2, correctly.

**Findings**
- **Four duplicates caught, all in adjacent small labels:** H3Y Salad Cafe and SaDa Salads & Sips (HRBR Layout), Half CA Healthy Cafe (Cooke Town), Machaxi Ready to Rally (Kothanur). HRBR Layout in particular is functionally inside Kalyan Nagar — **worth merging when the boundary review happens**
- Dr Puneeth Rajkumar Park and Dr Rajkumar Park are **different parks** 700 m apart with 1,375 and 4,619 reviews, both named for the same film family. Not a duplicate; the second fails the band at 4.1
- Rejected below floor band: Specialist Health System 2.2, ReACH Psychiatry 3.9, E-Badminton 3.4, Actfit Arena 4.1, Harvest Salad HRBR 4.1, Dr Rajkumar Park 4.1, Jogging Park Service Road on 3 reviews
- Move finished at 100% top share (three park loops) and Clear my head at 100% (two therapy clinics) — both above the diversity cap, accepted because the alternative was leaving cells at zero and 2. Flagged as exceptions alongside Bannerghatta
- Work out not swept at 4 — carry-forward list now four areas
- `rg` North, matching 11 of 12 legacy rows


### Session 20 — 2026-09-12 — Hebbal (area 25)

2 Places calls, 20 queries, 77 candidates. **18 rows added.** Master: 1,798 → 1,816. Hebbal: 15 → 33.

| Intent | Existing | Picked | Final | Status |
|---|---|---|---|---|
| Get care | 3 | 12 | 15 | **all twelve picks preferred band** |
| Play | 3 | 1 | 4 | short by 6 |
| Eat healthy | 1 | 2 | 3 | short by 7 |
| Clear my head | 2 | 1 | 3 | short by 7 |
| Move | 0 | 2 | 2 | short by 8 |
| Work out | 5 | 0 | 5 | not swept |

**Corridor, not outlier.** Hebbal's bbox spans 6.0 km, but unlike CV Raman Nagar this is not one mis-areaed row — **three** rows sit past 2 km (Aster CMI at 2.06, Rainbow Children's at 3.23, PUMA Store at 3.81), spread along the Bellary Road corridor. Twelve of fifteen cluster within 2 km of the median, so the median was used; a 3 km radius from there still reached Kempapura and Sahakar Nagar. The amended outlier rule held up — the point is to check *why* the box is wide, not to apply either centre mechanically.

**Get care produced twelve preferred-band candidates, all taken** — 15 rows across four subcategories at 33% top share. Labs and dental are the depth here; the three legacy rows were all hospitals, so the cell is now genuinely broad.

**Findings**
- **Eight duplicates caught**, five of them already filed under Hebbal itself (Bangalore Baptist, Mari B Cleanse Kitchen, 91 Sporting Co, Siddu Sports Arena) and three under neighbouring labels (TriNethra → Sadashiva Nagar, Bloomhappymind → Sanjaynagar, Healthy Times → Nagavara, Machaxi Sportexx → Sahakar Nagar). The in-area duplicates are a reminder that **name variants matter as much as cross-area ones** — "Mari B Healthy Food Kitchen" vs the filed "Mari B Cleanse Kitchen" only matched on place_id
- **Both First Eat Right locations filed.** Kirloskar Tech Park (4.8, 137) and Prestige Misty Waters (5.0, 76) are 1.0 km apart, same practice, distinct premises and place_ids. Filed both, consistent with Orange Health Labs in CV Raman Nagar and Clove Dental in Rajajinagar; the second row's description names it as the practice's other location
- **Hebbala Lake Park rejected at 3.9 on 3,298 reviews, and the reviews explain why** — several state the lake has been closed for years and built over. A rare case where the rating is measuring loss of the amenity itself, not service quality
- **Amruthalli Lake Walking Park misses the floor at 4.0 on 109 reviews** — a 1.3 km paved loop with open gym and toilets, well reviewed in substance. Another instance of the park-versus-floor problem first flagged at Arekere Lake. **Note: it would be admitted under the new chain rule's 4.0 threshold if that threshold were ever extended to public parks** — worth considering alongside the existing park carve-out item
- Rejected below floor band: Harvest Salad Hebbal 3.7, Dr Diet 4.1, Aries Sports Arena 4.0, Sporthood Scholars 4.1, Park and Gym HMT Layout 4.1, Elite Dental 5.0 on 9, Minhance Wellness 5.0 on 46
- Move at 100% top share and Clear my head at 100% — both above the diversity cap, accepted to lift cells off zero and 2. Flagged alongside Bannerghatta and Kalyan Nagar
- Work out not swept at 5 — carry-forward list now five areas
- `rg` North, matching all 15 legacy rows


---

### Session 21 — 2026-09-12 — Kothanur (area 26)

2 Places calls, 20 queries, 121 candidates. **35 rows added.** Master: 1,816 → 1,851. Kothanur: 10 → 45.
Largest single-area addition of the programme.

| Intent | Existing | Picked | Final | Status |
|---|---|---|---|---|
| Get care | 0 | 16 | 16 | **ceiling reached, all sixteen preferred band** |
| Work out | 1 | 9 | 10 | **floor reached** |
| Eat healthy | 0 | 6 | 6 | short by 4 |
| Clear my head | 0 | 2 | 2 | short by 8 |
| Move | 1 | 1 | 2 | short by 8 |
| Play | 8 | 1 | 9 | not swept; one incidental pick |

**Two mis-areaed rows, caught before the centre was set.** BLR-1405 (Machaxi Ready to Rally) and BLR-1496
(Sree Ram Skating Club) are both at 13.006 — Kasturi Nagar, ~7 km south of the rest. With them in, the
bounding-box midpoint lands at 13.038, roughly 3 km off the real cluster; the CV Raman Nagar failure exactly.
Excluded them and used the median of the remaining eight (**13.0666, 77.6503**, the Hennur–Bagalur junction),
which span just 1.2 km. BLR-1405 was already flagged as a Kalyan Nagar duplicate in session 19. **Both need
relabelling to Kasturi Nagar.**

**Clean geometry, like Kalyan Nagar.** Only 27 rows inside the 3 km radius, 8 of them Kothanur's own. Nearest
swept centres are Jakkur at 4.39 km and Kalyan Nagar at 5.05 km — neither inside. Second area in three sessions
without a large swept neighbour in the radius, and again the Get care result reflects it.

**Get care is the deepest cell in the programme — sixteen preferred-band picks, ceiling reached.** Beats Kalyan
Nagar's thirteen. Six subcategories at 31% top share: five dental, three labs, three eye, three hospitals, one
specialty clinic, one chiropractic/physio. The Hennur–Bagalur corridor carries genuine density in all four of the
main Get care subcategories at once, which no area before this has.

**Work out reached the floor from a carry-forward position.** Ten rows across four subcategories at 50% top share
— five gyms, three yoga, one martial arts, one existing pilates. The first of the six carry-forward Work out cells
to be swept, and it cleared comfortably, which suggests the other five (BTM Play, Rajajinagar, Bannerghatta,
Kalyan Nagar, Hebbal) are worth revisiting rather than writing off.

**Findings**
- **Eight duplicates caught**, four filed under Kothanur itself (Dr Pilates BLR-575, Fitso Hennur BLR-739,
  Bengaluru Swimming Academy BLR-1589, Balance — The Club BLR-182) and four under adjacent labels (Amaha →
  RK Hegde Nagar, Humming Nest → RK Hegde Nagar, The Earth Bowl Eatery → Nagenahalli, BBMP Public Park → Jakkur).
  Duplicate rate 8/71 in-radius candidates — **well below the 40–60% norm**, consistent with the clean geometry
- **Dr Agarwals Eye Hospital is a name-match false positive.** BLR-439 is the Indiranagar branch, 9.6 km away on
  4 reviews; the Hennur Road branch is distinct premises at 4.8 on 1,571. Filed, consistent with Clove Dental
  (Rajajinagar), Orange Health Labs (CV Raman Nagar) and First Eat Right (Hebbal)
- **Ovum Clinic & Fertility Centre and Ovum Hospitals share a phone number** (+91 80 4530 9909), sit 120 m apart,
  both rated 4.8 on 2,342 and 1,610 reviews, with different street addresses. Same brand, same phone — a stronger
  signal than the Daya Labs/Prakash pair. **Filed Ovum Hospitals only; Ovum Clinic held pending verification.**
  Had both been taken, Get care would have run to 17 and breached the ceiling
- **Zest Fitness Studio Kothanur rejected on the operational check, not the band.** 4.8 on 49 reviews, listing
  shows open 24 hours, but the reviews say the gym never opened and calls go unanswered. Second instance after
  Neuberg Anand Domlur — **the operational check keeps earning its place**
- **Kothanur Park misses the floor at 4.1 on 163 reviews.** A real neighbourhood park with a paved circuit, open
  gym and kids' area; reviews dock it almost entirely for mosquitoes. Third instance of the park-versus-floor
  problem after Arekere Lake and Amruthalli Lake
- **Rise Above Classical Yoga Studio excluded on the secular rule** — reviews describe it as teaching the
  classical Isha system. Below band anyway at 7 reviews, but the rule would have excluded it regardless
- **Mental Health Academy India excluded as a venue-type mismatch.** 5.0 on 51, but it trains counsellors rather
  than treating people; the reviews are from students and interns. Not a Clear my head service
- **Aarambha Kitchen excluded as not health-positioned.** 4.9 on 51, above band, but a general North Indian
  homestyle tiffin with no health proposition. Evermeals and Lemony Tales filed instead — both explicitly
  positioned on macros and clean eating
- **Cherith Brook was rejected in session 19 at 3 reviews and is filed here at 58.** Either a re-listing or
  genuine growth. Worth noting that band failures on review count are not permanent
- Rejected below floor band: Cult Gym Kothanur 3.7, Cult Gym Hennur 4.1, Sunshine Hospital 3.9, Avita Hospital
  3.7, Prime Life Hospital 4.0, Express Healthcare/Baptist 3.8, Aster Labs Kothanur 4.1, Harvest Salad HRBR 4.1,
  Sporthood Swimming @ Cult Hennur 3.4, XLR8 swimming 3.9, Kothanur Park 4.1
- Rejected on review count: Neuberg Anand Kothanur (6), Venus Diagnostics (15), Vianic Rehab (8), Blessed Clare
  (18), Ikshana (16), PsychWell (4), Mind Waves (4), Harbour of Hope (2), Kyts (8), Mastering Mind (3), Sai
  Anugraha (5), Shilpa Nutrition (3), Falak Hanif (10), Core & More Pilates (5), Huura Karate (2), TruCare (13)
- **Clear my head at 100% top share does not need a diversity exception** — only one subcategory exists locally,
  so rule 6 waives the cap. Different from the Bannerghatta, Kalyan Nagar and Hebbal exceptions
- **Third consecutive weak Clear my head sweep** — HAL 0, Kalyan Nagar 0, Kothanur 2. The pattern is now firm
  enough to treat as structural rather than as three bad draws
- **Four Ayurveda/Panchakarma candidates held, not filed** — Aadhi Ayurveda (4.9/137), Inchara Ayur Care
  (4.8/360), Shathayu Kothanur (4.9/181), Sri Kailas Jyothi (4.8/70). All above band and dedup-clean, but there
  is no Ayurveda subcategory in the locked taxonomy and they belong to Reset, a zone-swept scarce intent. Retained
  in `wm/kn.json`. **See new open item below**
- `rg` written as `North East`. Legacy Kothanur rows are split East (4), North East (3), North (2) — Kothanur is
  one of the eight areas with an internal `rg` split


---

### Session 22 — 2026-09-12 — Bommanahalli + Singasandra (areas 27–28, paired)

4 Places calls, 40 queries (a full 20 each, not a split budget), 114 above-band candidates.
**51 rows added.** Master: 1,851 → 1,902. Bommanahalli: 12 → 36. Singasandra: 11 → 38.

| Bommanahalli | Existing | Picked | Final | Status |
|---|---|---|---|---|
| Get care | 0 | 14 | 14 | **all fourteen preferred band** |
| Play | 1 | 6 | 7 | short by 3 |
| Move | 0 | 2 | 2 | short by 8 |
| Eat healthy | 1 | 1 | 2 | short by 8 |
| Clear my head | 0 | 1 | 1 | short by 9 |
| Work out | 8 | 0 | 8 | not swept, carry forward |

| Singasandra | Existing | Picked | Final | Status |
|---|---|---|---|---|
| Get care | 0 | 12 | 12 | **all twelve preferred band** |
| Work out | 4 | 6 | 10 | **floor reached** |
| Move | 1 | 6 | 7 | short by 3 |
| Clear my head | 0 | 2 | 2 | short by 8 |
| Eat healthy | 0 | 1 | 1 | short by 9 |
| Play | 4 | 0 | 4 | not swept, carry forward |

**Separate sweeps, not a merge.** Centres are **3.29 km apart** — nearly double Domlur/HAL — and only one row
on each side sits closer to the other's centre. Two distinct areas, so each got a full 20-query budget per
rule 4. Bommanahalli centre 12.89807, 77.62393; Singasandra 12.87862, 77.64142.

**The overlap check predicted the yield, and the asymmetry was stark.** Bommanahalli had **137 rows inside its
3 km radius, 112 of them from swept areas** (HSR Layout 49, BTM Layout 43, Bannerghatta 11) — the heaviest
overlap measured in the programme. Singasandra had **33 rows, only 13 swept**. Same budget, and Bommanahalli
lost 12 candidates to swept neighbours and 8 to duplicates, while Singasandra lost 2 and 5. **This is now the
third confirmation that computing overlap before sweeping predicts the result** (after Kalyan Nagar and
Kothanur). It should be a required pre-sweep step, not an optional one.

**Three mis-areaed rows found before the centres were set** — the check is now earning its place every session:
- **BLR-774 HIT AND PLAY ARENA** sits 0.72 km from the Electronic City centre and 3.09 km from Singasandra's
- **BLR-694 Rainbow Electronic City** is nearer Electronic City too, and names it
- **BLR-999 CALIBAF** is filed under Bommanahalli but is 1.07 km from Kudlu and 3.43 km from Bommanahalli

Left in, they moved Bommanahalli's bounding-box midpoint 0.6 km and Singasandra's 0.9 km. Relabelling them
drops Singasandra's Get care to a true 12 and Play to 4, and Bommanahalli's Work out to 8.

**Get care hit the preferred-only ceiling in both areas** — 14 and 12 picks, every one preferred band. Across
the last three sessions Get care has produced 16 (Kothanur), 14 and 12. The pattern from Kothanur holds:
**arterial-road clinic corridors carry preferred-band depth in all four main subcategories at once.** Hosur
Road and Begur Road do exactly what Hennur–Bagalur did.

**Findings**
- **Thirteen duplicates caught**, eight in Bommanahalli (Dietboite → Mangammanapalya, Meet Your Therapist →
  HSR Layout, Magna Psychiatry and Dr Vikram's → BTM Layout, Madiwala Lake Park → BTM Layout, Earth Bowl and
  Nutricomms → Bannerghatta, Majesstine Sports → HSR Layout) and five in Singasandra — **four of which were
  the entire Kudlu label** (MKS Fitness, AK Rock Gym, Cult Neo Gym, Growfit Meals), plus Fit & Fit Gym
- **Kudlu is functionally inside Singasandra.** All four of its rows are Kudlu Main Road venues inside
  Singasandra's radius and all four surfaced as duplicates. Same pattern as HRBR Layout → Kalyan Nagar.
  **Add to the boundary-review merge list**
- **Nearest-centre allocation must be restricted to swept areas.** Run against every label with 3+ rows, the
  4-row Kudlu label claimed **21 of Singasandra's candidates** — a tiny label's median is essentially
  arbitrary and will strip a real sweep. Re-run against swept centres only, the numbers were 12 and 2.
  **This is a correction to rule 3 as written**
- **Bande Park and Stone Park are the same site** — 20 m apart, both described as the stone-sculpture park on
  Devarachikkanahalli Road, different names and review counts (1,613 and 885). Both cleared the band and both
  were selected before the check caught it. Filed Bande Park only. **Eighteenth different-name/same-site case**
- **Dr Veena Prabhu (Vasan Eye Care) rejected on the operational check at 1.0 on 1 review** — a named-doctor
  listing riding on a real hospital's address. Third instance after Neuberg Anand Domlur and Zest Fitness
- **Rule 3 false positives again.** Coordinate proximity alone flagged Sabka Dentist against a gym, Play On
  Aqua against a martial arts club, and Akshaya Dental against Cult Neo Gym — all different businesses at
  shared building addresses. Gating on name similarity as well as coordinates cleared all of them
- **Art of Living Yoga & Meditation Centre, Singasandra excluded on the secular rule** at 5.0 on 168 reviews —
  it would otherwise have been a preferred-band Work out pick. The **first time the secular rule has cost a
  preferred-band row**; every prior exclusion was below band anyway
- **The park-versus-floor problem recurs twice more, and at scale.** Virata Nagara Park fails at **4.1 on
  3,484 reviews** and Hongasandra Park at 4.1 on 244. Reviews dock both almost entirely for mosquitoes and
  maintenance, not for the amenity. With Arekere, Amruthalli and Kothanur Park, that is **five parks now
  excluded on rating while being genuinely usable**. Virata Nagara's review count makes the threshold look
  wrong rather than the park
- **Bommanahalli Move finished at 2 despite dense supply** — it sits between BTM's lake parks and Begur's,
  and almost every good loop inside its radius belongs to a swept neighbour. A supply-rich area with a
  near-empty cell purely from boundary geometry
- Rejected below floor band: Prashanth Multispeciality 3.8, Vinayaka 3.4, Srushti 3.6, Sree Lakshmi 3.2,
  Singasandra Govt Hospital 2.6, Hospitec Multispeciality 3.4, Shakthi Health Care 3.9, Vinodha Diagnostics 3.5,
  Vikram Hitech 4.0, ReeAge 4.0, Kudlu Lake Park 3.6, Parappana Agrahara Lake 3.9, ITI Layout Park 4.0,
  Grounds N Sports 4.0, Score Bengaluru 4.0, Kick On Sweat On 3.7, Lakeside Sports Centre 4.1
- `rg` written as `South` for both, matching all legacy rows in each


---

### Session 23 — 2026-09-12 — Agara (area 29) — **halted: Agara is inside HSR Layout**

1 Places call, 4 queries, 33 results. **0 rows added.** Master stays at 1,902.
Halted after a deliberate probe rather than spending the full budget. Second halt of the programme after MG Road.

**Overlap said stop before a single query was spent.** 143 of the 158 rows inside Agara's 3 km radius come
from swept areas — HSR Layout 66, Bellandur 34, Koramangala 30. That is the worst measured in the programme,
against Bommanahalli's 112. The radius already holds 40 Get care rows, 33 Work out, 16 Play and 14 Move, all
filed under neighbours. **Agara's centre is 1.45 km from HSR Layout's** — closer than Domlur/HAL at 1.78 km,
which is already a merge candidate.

**Agara's own core is 8 rows, not 13.** Five rows name other localities and each sits nearer another swept
centre: BLR-1258 (Bellandur Gate → Bellandur 0.86 km), BLR-1260 (Sarjapura → Sarjapur Road 2.68 km),
BLR-1265 (Kasavanahalli → Sarjapur Road 0.07 km), BLR-1267 (Kasavanahalli → Sarjapur Road 0.65 km),
BLR-1271 (Jakkasandra → HSR Layout 1.50 km). With them in, the bounding box spans 7.24 km of longitude.

**The probe converted the prediction into evidence.** Four queries on Get care, Agara's emptiest cell and the
neighbours' densest:

| Probe result | Count |
|---|---|
| Results returned | 33 |
| **Carrying "HSR Layout" in the postal address** | **33 of 33** |
| Nearer HSR Layout's centre than Agara's | 22 (67%) |
| Already filed at those coordinates | 12 |
| Would file as Agara | 11 |

**Agara Village is a sub-locality of HSR Layout Sector 1**, and the listings say so themselves — addresses
read "Agara Village, 1st Sector, HSR Layout". Several of the 11 that would have filed as Agara carry HSR in
their own business names: JAS Dental HSR Layout, HSR Dental Clinic & Implant Centre, Clove Dental HSR,
Apollo Dental 27th Main HSR Layout. Sweeping Agara would re-file HSR Layout under a second label and
double-count that corridor on the published map.

**Recommendation: merge Agara into HSR Layout.** Same case as HRBR Layout → Kalyan Nagar and Kudlu →
Singasandra, but more clear-cut — those were geographic inferences, this one is stated in the postal
addresses. The 8 core rows move to HSR Layout; the 5 mis-areaed rows go to Bellandur and Sarjapur Road.

**Findings**
- **Four listings sit within 65 m at the Courtside address** (12.9249, 77.6507): BLR-159 The Courtside Agara,
  BLR-1257 Hyfit, BLR-591 GoRally Pickleball, BLR-784 7Padel | The Courtside HSR. **BLR-159 and BLR-784 share
  the Courtside brand and the site** — near-certain same venue, two listings. The other two are plausibly
  distinct operators in one sports complex, as with XLR8 in Kothanur. **Nineteenth same-site case**
- **The overlap threshold now has a stop value, not just a warning.** Under ~40 swept rows in radius predicts
  a good sweep; over ~100 predicts cells short on geometry; **over ~140, with a swept centre inside 1.5 km,
  the area is not a separate area.** Four data points now: Kalyan Nagar 51, Kothanur 27, Bommanahalli 112,
  Agara 143
- Nothing was written to the master file. The 4 queries spent are the cheapest halt in the programme —
  session 10 spent a full sweep on MG Road before reaching the same conclusion


---

### Session 24 — 2026-09-12 — Kadubeesanahalli (area 29)

2 Places calls, 20 queries, 31 above-band candidates. **20 rows added.** Master: 1,902 → 1,922.
Kadubeesanahalli: 11 → 31.

| Intent | Existing | Picked | Final | Status |
|---|---|---|---|---|
| Get care | 0 | 12 | 12 | **floor cleared, 6 preferred** |
| Eat healthy | 0 | 4 | 4 | short by 6 |
| Move | 0 | 3 | 3 | short by 7 |
| Clear my head | 0 | 1 | 1 | short by 9 |
| Play | 6 | 0 | 6 | not swept, carry forward |
| Work out | 5 | 0 | 5 | not swept, carry forward |

**The overlap gate worked as designed on its first real use.** 75 rows inside the 3 km radius, **55 from swept
areas** (Marathahalli 30, Bellandur 21) — squarely in the 40–100 "sweep, expect moderate duplication" band.
It predicted the result precisely: of 31 candidates only **4 were lost** (3 duplicates, 1 to Bellandur), a
13% loss rate against Bommanahalli's 33% at 112 swept rows. Five data points now and the relationship holds.

**Entered with four cells at zero — the most of any area swept.** Play and Work out were the only populated
cells, so the entire 20-query budget went to Get care, Eat healthy, Clear my head and Move, and both
populated cells were carried forward.

**Corridor, not outliers, and it did not change the centre.** The bbox spans 2.3 km of longitude but the
furthest row sits only 2.13 km from the median and all eleven rows belong to Kadubeesanahalli by nearest
centre — no relabelling needed. First area in four sessions with no mis-areaed rows.

**Findings**
- **Three duplicates only**: Sankara Eye Hospital (→ Brookefield), Harvest Salad Co RMZ and Lighten Up
  Counseling (→ Sarjapur Road). Game Theory Yemlur allocated to Bellandur
- **Eat healthy behaved exactly as the tech-park pattern predicts.** Two nutritionists above band (Heal Hale
  5.0/101, Nutripurna 5.0/52), both working out of or beside clinics serving the Embassy Tech Village and
  Prestige Tech Park crowd. The handoff note — "always run the nutritionist query in tech-park corridors" —
  paid for itself again
- **First use of `Health food store` as a subcategory** (previously 2 rows file-wide): Millet Amma and Organic
  Extract. Kadubeesanahalli has organic grocers but almost no healthy restaurants — the inverse of the usual
  Eat healthy shape, where restaurants carry the cell and stores are absent
- **Dental is 7 of 12 Get care rows at 58% top share** — just inside the cap, and only because the cap stopped
  an eighth. Ten dental clinics cleared the band within 1.2 km along Panathur Main Road. **Dr Roma Smile
  Dentistry (5.0/59) was excluded by the diversity cap alone, not quality** — worth revisiting if the cap is
  ever loosened
- **Dr Swarna's Skin & Hair has two listings 0.5 km apart** on Panathur Main Road, both 4.7. The second
  (4.7/15) fails the band, so only one was filed — but they are the same practice and the pair should be
  recorded before the chain-brand rule is applied
- **Move is thin for a different reason than east Bangalore usually is.** Panathur Lake clears at 4.4/97 and
  two pools clear, but Bhoganahalli Lake fails at 4.0/57 and Devarabeesanahalli Lake at 4.2 on only 10
  reviews. The lakes here are being rehabilitated and haven't accumulated reviews yet — a *young-amenity*
  version of the park-versus-floor problem rather than a maintenance one
- **City Cycling (4.4/404) excluded as Buy gear, not Move** — it is a cycle rental business, not a route
- Rejected below floor band: Iblitz Fitness 4.0, Fitso Panathur swimming 4.0, Fitso Panathur badminton 4.1,
  Active Arena 4.1, Greenfield Club 4.1, Maya Hospital 4.0, Dr Lal PathLabs Panathur 4.0, Vikram Hitech 4.0,
  Jogger's Park Bellandur 3.7, Prabha Park 3.4, Bini Park 3.8
- `rg` written as `East`, matching all 11 legacy rows


---

### Session 25 — 2026-09-12 — Hoodi + Rajarajeshwari Nagar (areas 30–31)

4 Places calls, 40 queries (full budget each — the areas are 20 km apart, opposite ends of the city).
107 above-band candidates, **only 1 lost**. **66 rows added.** Master: 1,922 → 1,988.
Hoodi: 14 → 42. Rajarajeshwari Nagar: 17 → 55.

| Hoodi | Was | Picked | Now |
|---|---|---|---|
| Get care | 0 | 15 | **15 — all preferred** |
| Eat healthy | 0 | 7 | 7 |
| Clear my head | 1 | 5 | 6 |
| Move | 0 | 1 | **1 — see below** |
| Work out / Play | 10 / 3 | — | carried forward |

| Rajarajeshwari Nagar | Was | Picked | Now |
|---|---|---|---|
| Get care | 0 | 16 | **16 — CEILING REACHED, a programme first** |
| Move | 0 | 10 | **floor reached** |
| Eat healthy | 3 | 5 | 8 |
| Clear my head | 0 | 7 | 7 |
| Work out / Play | 9 / 3 | — | carried forward |

**The overlap gate predicted both, and RR Nagar is the cleanest area measured.** Hoodi had 40 swept rows in
radius (Whitefield 18, Brookefield 14) — the 40–100 band. **Rajarajeshwari Nagar had 8**, the lowest of any
area, with the nearest swept centre (Banashankari) 3.94 km away. Result: **one duplicate across 107
candidates, and RR Nagar lost nothing at all.** Six data points now and the relationship is holding tightly.

**First Get care ceiling in the programme.** RR Nagar produced 16 preferred-band picks across five
subcategories — labs at 25% top share, well inside the cap. The area has a genuine medical high street along
80 Feet Road and Jawaharlal Nehru Road. Hoodi produced 15, one short, limited only by supply.

**Findings**
- **Hoodi's Move cell finished at 1 — the worst outcome of any cell in the programme, and entirely the park
  threshold's doing.** Sonu's Running Track at Hoodi Lake fails at **4.1 on 174 reviews**, Seetharampalya Lake
  at 4.0 on 338, Devasandra Lake Park at 4.1 on 674. All three are real, used walking loops; reviews dock them
  for mosquitoes, sewage inflow and unpaved tracks. **Only Sadaramangala Lake cleared.** This is now
  **eight parks excluded on rating across six areas** and the single clearest argument yet for a decision
- **BLR-859 Create and Heal Art Therapy now has coordinates** (12.98951, 77.71370), recovered from this sweep —
  one of the 94 coordinate-less rows fixed as a by-product. It fails the band itself at 4.8 on 11 reviews, so
  it stays as a legacy row, but it is now mappable
- **Two same-site pairs, both caught before writing**: Medicover Hospitals / Medicover Women and Children
  (20 m apart, filed the women's and children's wing as the distinct service) and **Sadaramangala Lake Entrance /
  Sadarmangala Lake Park — identical coordinates, 197 and 89 reviews**. Also Atreum Speciality / Atreum Bloom
  in RR Nagar, 20 m apart, both filed as genuinely distinct services. **Cases 21, 22 and 23**
- **The 60% diversity cap bit for the second session running.** Hoodi Eat healthy came out at 5 nutritionists
  of 8 (62%); Art Of Curing (5.0/40) was dropped to bring it to 4 of 7. Second consecutive area where the cap,
  not quality, set the final row
- **Three Herbalife-style nutrition clubs excluded in RR Nagar** (Grace Lifestyle 5.0/51, Healthy Life
  Nutrition 5.0/60, Miracle Nutrition 4.7/15) — all would have cleared on rating. Consistent with the
  Kothanur and Bommanahalli precedent
- **BLR-1352 Wisdom Martial Arts — B Narayanapura** sits nearer CV Raman Nagar (2.25 km) than Hoodi (2.91 km).
  Relabel. Excluded from Hoodi's centre calculation
- Rejected below floor band: Meghana Nursing 3.6, R C Hospital 3.1, Rajarajeshwari Hospital 2.8, Artyem 4.0,
  Dr Kishan's 3.5, i-Smile 3.7, Amritam 3.7, Paustika Aahara 4.1, Swasthya Nutrition 3.9, Grameena Angadi 3.0,
  Best Club 4.0, Loop Sportsplex 4.1, Halagevadera Halli Lake 4.1, BDA Park 4.0
- `rg` written as `East` for Hoodi and `West` for RR Nagar, matching legacy rows


---

### Session 26 — 2026-09-12 — OSM ward boundaries adopted; central cluster and merges resolved

No Places calls. **0 new venues. Master stays at 1,988 rows, now 39 columns.**
Source: `boundary-files-gba-osm` — OpenStreetMap GBA relation 7902476, fetched 2026-09-10. 369 ward polygons,
5 corporation polygons.

**Every geocoded row now carries an authoritative ward.** Point-in-polygon against the 369 ward polygons:
**1,830 of 1,895 geocoded rows matched**, with **zero rows falling in more than one ward** and one invalid
polygon in the source (Hagaduru). The assignment is unambiguous, so it can be trusted for boundary decisions.

**Three new columns**: `ward`, `corporation`, `in_gba`. `rg_legacy` preserves the old value; `a_prev_label`
preserves the pre-merge area label. Nothing was destroyed.

**The `rg` column was 80% wrong-or-unverifiable and is now authoritative.** It agreed with the boundary
corporation on only 1,471 of 1,830 rows, and used two values — **`North East` and `South East` — that are not
GBA corporations at all**. `rg` is now set from the boundary for all 1,830 matched rows; the 158 rows with no
coordinates or outside the boundary keep their legacy value, so those two invalid values still appear there.

**THE CENTRAL CLUSTER IS RESOLVED — it was one ward all along.** Five separate labels all fall inside the
single **Ashokanagar** ward: MG Road (18 of 26 rows), Ashok Nagar (25 of 26), Brigade Road (5 of 5),
Church Street (3 of 3), St Mark's Road (4 of 4). Merged into **MG Road** — now 64 rows, core 41, gap 19,
and **unblocked after fifteen sessions**. Separately, Cubbon Park and Nrupathunga Road both sit in
**Sampangirama Nagar** — merged into **Cubbon Park** (18 rows). **Vasanth Nagar is its own ward** and stays
standalone (10 rows).

**All three merge candidates confirmed and executed.** The ward evidence was decisive in every case:
- **HRBR Layout → Kalyan Nagar**: HRBR's wards (Kalyanagar, Banaswadi, Kacharakanahalli, Chellakere,
  Babusab Palya) are a strict subset of Kalyan Nagar's. Now 45 rows
- **Kudlu → Singasandra**: Singasandra's single largest ward *is* Kudlu (9 rows). Now 42 rows
- **Agara → HSR Layout**: 27 of HSR Layout's 68 rows already sat in the **Agara** ward. Now 87 rows,
  core 73 — the first area to pass 60 core rows. Note the Courtside cluster actually falls in **Agaram**
  (Central), a different and much larger ward, so the "Agara" label spanned six wards and was never coherent
- **Area labels: 136 → 128**

**Findings**
- **Our area labels were never wards, and should not become them.** Measured concentration in the main ward:
  Kadubeesanahalli 90%, Sarjapur Road 70%, Domlur 70% — but Bommanahalli 22%, Marathahalli 23%, HAL 23%,
  Hebbal 24%. Most swept areas span **5–8 wards at 22–40% concentration**. These are colloquial areas, and
  369 wards would shatter the 10-per-cell floors the whole method rests on. **Wards are a QA and rendering
  layer, not a relabelling.** Kept as columns alongside the public labels
- **A ward-based mis-area report flags 136 rows**, but most are ordinary border blur (Marathahalli/Brookefield
  13, Basavanagudi/Jayanagar 8, Indiranagar/Domlur 8) rather than errors. **Filed as a QA layer, not applied
  as corrections** — applying it wholesale would relabel real Marathahalli venues as Brookefield
- **ELECTRONIC CITY IS 94% OUTSIDE THE GBA BOUNDARY — 45 of its 48 geocoded rows.** It sits under a separate
  authority, not Greater Bengaluru. **65 rows in total fall outside the city polygon.** If the published map
  draws the GBA outline, those pins land outside the city shape. This is a scope decision, not a data error
- Corporation split of the file: South 543, East 388, Central 359, West 315, North 225, outside 65


---

### Session 27 — 2026-09-12 — MG Road (area 32, first sweep of the merged central cluster)

2 Places calls, 20 queries. 53 above-band candidates. **18 rows added.** Master: 1,988 → **2,006 rows**.
MG Road: 64 → 82. **Crosses 2,000 rows.**

| Intent | Was | Picked | Now |
|---|---|---|---|
| Get care | 3 | 7 | **10 — all preferred** |
| Eat healthy | 5 | 5 | **10 — floor reached** |
| Move | 5 | 4 | 9 |
| Clear my head | 4 | 2 | 6 |
| Work out | 14 | — | 14 — already above floor |
| Play | 10 | — | 10 — already at floor |

**The gate was wrong in the useful direction — only 2 swept rows in radius**, making MG Road cleaner on that
measure than Rajarajeshwari Nagar's 8. The prediction of a Bommanahalli-style squeeze was wrong because the
areas crowding it — Cubbon Park 12, Richmond Town 9, Vasanth Nagar 9, Ulsoor 8, Shivajinagar 4 — are all
**unswept sub-10 labels**, not swept areas. Nearest swept centre is Indiranagar at 3.81 km.

**But the duplicate rate was the highest of the programme: 15 of 53, 28%.** That is the merge working as
intended rather than a failure — MG Road already carried 64 rows across all ten intents, so Blue Nile
Counselling, Go Native, Lean & Clean, Richmond Town Park and Sree Kanteerava Stadium were already filed.
**A merged label produces a high duplicate rate on its first sweep. Expect the same at Cubbon Park.**

**WARD-BASED ALLOCATION REPLACED NEAREST-CENTRE, AND IT PAID OFF IMMEDIATELY.** Instead of letting MG Road
claim everything within 3 km, candidates were allocated by the ward polygon they fall in:
- **4 candidates were held, not filed** — Shri Chamarajendra Park Playground and Ring Wood Circle
  (Sampangirama Nagar → **Cubbon Park**); Sparsh Hospital Infantry Road and The Happiness Theory
  (Vasanth Nagar → **Vasanth Nagar**). Under the old rule all four would have been absorbed into MG Road and
  the next two sweeps would have found nothing but duplicates
- This is the first sweep where **an area was prevented from over-claiming by boundary rather than by distance**

**Findings**
- **Only 9 of the 18 rows filed are actually in the Ashokanagar ward.** The rest fall in K Kamaraj Ward (3),
  Bharathi Nagar (2), Shivajinagar, Jogpalya, Pulakeshi Nagar and Shanthinagar — wards whose own labels are
  unswept sub-10 stubs, so rule 3 assigns them to the nearest swept area. **Correct under the current rule, but
  it means "MG Road" now spans seven wards.** If the sub-10 labels are ever swept, this needs revisiting
- **Get care filled to exactly 10 on preferred-band alone** across six subcategories, dental at 30% top share.
  21 candidates were filable; the preferred-only ceiling path stopped it at 10
- **Best Multispeciality Hospital and Q Medical Center share an address** on Dickenson Road (20 m, 4.6/377 and
  4.7/492) — the former is a Pristyn Care aggregator listing over the latter. Filed Q Medical only. **Case 24**
- **Halasuru Kere and Halasuru Lake are the same lake**, two listings 2,446 and 242 reviews. Filed Halasuru
  Kere. **Case 25**
- **NirogStreet 1Veda Ayurveda & Panchakarma (4.9/64) held** — still blocked on the unresolved Ayurveda
  subcategory decision, now **five candidates deep** counting the four from Kothanur
- Rejected below floor: Republic Hospital 3.5, Dr Shetty's Aesthetics 3.5, Triderma 3.6, Asian Diagnostics 3.9,
  Green Theory 4.1, Dr Parekh's Eye 4.1, Salad Days Richmond Road 4.1, Game Theory Ulsoor 4.0,
  Nisha Millets Catholic Club 3.8, Disabled Friendly Children Park 3.4, Studio for Movement Arts 1.0
- **Three Herbalife-style and aggregator listings excluded**, consistent with prior sessions


---

### Session 28 — 2026-09-12 — Cubbon Park (area 33) — probed before committing, then swept

3 Places calls, 25 queries (5 probe + 20 sweep). 36 above-band candidates.
**15 rows added** (14 Cubbon Park + 1 MG Road top-up). Master: 2,006 → **2,021 rows**. Cubbon Park: 18 → 33.

| Intent | Was | Picked | Now |
|---|---|---|---|
| Play | 5 | 3 | 8 |
| Work out | 1 | 5 | 6 — **4 of 5 preferred** |
| Move | 3 | 2 (+1 relabel) | 6 |
| Get care | 1 | 3 | 4 |
| Eat healthy | 0 | 1 | 1 |
| Find your people | 8 | — | 8 |

**THE GATE WAS BORDERLINE AND THE PROBE WAS THE RIGHT CALL.** 80 swept rows in radius (the 40–100 band) but
**MG Road's centre only 1.57 km away** — just outside the 1.5 km merge trigger. Worse, MG Road already had rows
inside Cubbon Park's radius in **every single cell** (Eat healthy 10, Work out 12, Play 11, Get care 9). That
is the Agara shape, so rather than spend the full budget or merge on instinct, **5 queries went to a probe
first**. Unlike Agara, the probe had ward polygons to test against, and the answer was clear: of 9 above-band
non-duplicates, **4 fell in Sampangirama Nagar** — Cubbon Park has real content of its own. **Sweep, don't
merge.** Decision took 5 queries instead of 20.

**The ward filter did the heavy lifting again.** Of 36 candidates, only **14 sit in Sampangirama Nagar**.
Excluded by ward: Shanthinagar 6, **Ashokanagar 6 (MG Road's ward)**, SilverJubilee Park 2, Shivajinagar 1,
Nehru Nagar 1, plus 1 held for Vasanth Nagar. Under nearest-centre allocation most of those would have been
wrongly absorbed into Cubbon Park.

**Findings**
- **Cubbon Park's shape is unlike any other area — Find your people 8 is its largest cell**, and it is the only
  area where that is true. Its ward is park, stadium and government district: the content is clubs, run clubs,
  courts and gyms, not clinics and restaurants. **Get care 4 and Eat healthy 1 are supply limits, not sweep
  failures** — there is very little residential or retail frontage inside the ward
- **BLR-155 Sri Chamarajendra Park was filed under MG Road but IS Cubbon Park**, sitting in Sampangirama Nagar.
  **Relabelled.** Found by the ward column, not by eye
- **MG Road missed Dental Lavelle (5.0/688, preferred, Ashokanagar ward)** — it surfaced in the Cubbon probe
  but not in the MG Road sweep. **Filed to MG Road as a top-up**, taking its Get care from 10 to 11. A sweep's
  query set is not exhaustive; neighbouring sweeps will keep turning up rows the first sweep missed
- **Work out finished at 5 gyms of 6 rows (83%), above the 60% diversity cap as a share of the realised cell.**
  This is not a new breach: the allocator has always measured the cap against the **ceiling** (60% of 10 = 6),
  not against the final count, in every prior session. The realised share only looks extreme because the cell
  is well under floor. **Worth an explicit decision on which denominator the cap uses** — it will recur in every
  thin area
- Rejected below floor / too few reviews: Fitness Hours 5.0/6, Cubbon Park Slack Space 4.9/19,
  Road to Trail Club 5.0/17, Stride Run Club 5.0/13, Karnataka Swimming Association 4.5/11, KTTA Hall 4.5/11,
  Padmashree Clinic 4.8/17, Natural Juices 3.7, Art of Living Shanthinagar 3.0, S R Nagar Namma Clinic 1.0
- **Road to Trail Club and Stride Run Club are both genuine Cubbon Park run clubs** that fail only on review
  count (17 and 13). Given that Find your people is this area's defining cell, they are the strongest argument
  yet for a **lower review floor on community/group listings**, which rarely accumulate Google reviews


---

### Session 29 — 2026-09-12 — Vasanth Nagar (area 34) — MAIN BATCH COMPLETE — plus full map audit

2 Places calls, 20 queries. 39 candidates. **19 rows added** (17 Vasanth Nagar + 2 Cubbon Park top-ups).
Master: 2,021 → **2,040 rows**. Vasanth Nagar: 10 → 27. Cubbon Park: 33 → 35.
**All 34 main-batch areas are now swept.**

| Vasanth Nagar | Was | Picked | Now |
|---|---|---|---|
| Get care | 2 | 10 | **12** |
| Eat healthy | 0 | 4 | 4 |
| Work out | 5 | 1 | 6 |
| Clear my head / Move | 0 / 0 | 1 / 1 | 1 / 1 |

**The heaviest overlap reading of the programme — 146 swept rows in radius, above the >140 halt threshold**,
with Cubbon Park 1.60 km away and MG Road 2.03 km. That is the Agara reading almost exactly (143 rows,
1.45 km). **The boundary data settled what Agara could not**: Vasanth Nagar is its own coherent ward,
2.5 x 2.1 km, holding 7 of its 10 existing rows. Agara's were scattered across six wards. Swept, not merged —
and it produced 27 filable candidates, **20 of them Get care**. Cunningham Road and Millers Road are a real
medical corridor.

**Two more cross-area top-ups**, the pattern first seen at Cubbon Park: **National Military Memorial Park
(4.5/1,599) and ANIVA Counselling (5.0/53)** both fall in Sampangirama Nagar and were filed to **Cubbon Park**,
whose Clear my head cell had been empty. Three sessions running, a sweep has found rows belonging to an
already-swept neighbour. This is now a confirmed structural property, not luck.

---

## MAP AUDIT — as of session 29

### 1. Density

| | |
|---|---|
| Total rows | **2,040** |
| Geocoded / mappable | 1,947 (95%) |
| Inside the GBA boundary | 1,882 (92%) |
| No coordinates | 93 |
| Outside GBA | 65 (45 of them Electronic City) |
| **Density across GBA** | **2.6 pins / km²** |

By corporation: **Central 5.3 pins/km²** (410 rows / 78 km²), South 3.5, East 2.4, West 1.9, **North 1.4**.
Central is twice as dense as the city average; **North is the thinnest and the clearest expansion target.**

Ward coverage: **241 of 369 wards have at least one row (65%). 128 wards are empty.** Of the covered wards,
121 hold only 1–4 rows and just 17 hold 25 or more. **The map is a chain of dense islands, not a covered
surface** — 85% of in-GBA rows sit inside the 34 swept areas.

### 2 & 3. Area health

Tiers: **WELL BUILT** = 5+ of 6 core cells at ≥5 rows · **PARTIAL** = 3–4 cells · **THIN** = <3 cells but ≥10
core rows · **STUB** = <10 core rows.

| Tier | Swept areas (34) | All labels (121) |
|---|---|---|
| **WELL BUILT** | **13** | 13 |
| PARTIAL | 16 | 16 |
| THIN | 5 | 5 |
| STUB | 0 | **87** |

**13 well-built areas**: JP Nagar (76 core rows), Koramangala (76), HSR Layout (73), Indiranagar (69),
Jayanagar (67), Whitefield (60), Banashankari (60), MG Road (59), Rajarajeshwari Nagar (53), Yelahanka (51),
Electronic City (48), BTM Layout (47), Sarjapur Road (41).

**5 thin swept areas**: HAL (21 core rows), Vasanth Nagar (25), Domlur (32), Hebbal (32), Sadashiva Nagar (32).
**HAL is the weakest area in the file** and the only one with an empty core cell.

**87 stub labels** hold under 10 core rows each. The best of them — Basaveshwar Nagar, Richmond Town, Kengeri,
Uttarahalli, Banaswadi, Sahakar Nagar — sit at 8–9 core rows, i.e. one sweep from being useful.

### 4. Intent x area combos passing the ≥5 test

**Across the 34 swept areas: 140 of 204 combos pass (69%). 77 are at the 10-row floor (38%). One cell is empty.**

| Intent | Pass (≥5) | At floor (≥10) | Empty |
|---|---|---|---|
| **Work out** | **34/34 (100%)** | 23 | 0 |
| **Get care** | **32/34 (94%)** | 31 | 0 |
| Play | 24/34 (71%) | 10 | 0 |
| Eat healthy | 20/34 (59%) | 4 | 0 |
| **Move** | **16/34 (47%)** | 3 | 0 |
| **Clear my head** | **14/34 (41%)** | 6 | 1 |

Across **all 121 labels: 146 of 726 combos pass (20%)** — the 87 stubs contribute almost nothing.

**The shape of the problem is now unambiguous.** Get care and Work out are essentially solved. **Clear my head
and Move are the two weak intents**, passing in under half of swept areas, and together they account for most
of the 29 cells sitting at ≤2 rows. Move's weakness is largely **the park review-floor decision** — eight
usable parks are excluded on rating alone. Clear my head's is partly **supply** (therapists cluster centrally)
and partly that community and small-practice listings rarely clear the review count.


---

### Session 30 — 2026-09-12 — Pair 1 of the next batch: Kundalahalli + Kengeri

3 Places calls, 30 queries. **23 rows reclaimed for free + 36 rows added.** Master: 2,040 → **2,075 rows**.
Kundalahalli 5 → 23 · Kengeri 8 → 40 · Brookefield 39 → 53 (top-up).

**RECLAIM FIRST WORKED.** Before searching, 23 rows already in the file but sitting in the new areas' wards
were relabelled: **16 from Brookefield/Whitefield into Kundalahalli**, 7 from RR Nagar and Mysore Road into
Kengeri. Free rows, no queries spent. RR Nagar drops 55 → 49 as a result, which is correct.

**KUNDALAHALLI IS NOT A SWEEP AREA — only 2 of 38 candidates fall in its ward.** Eighteen fall in
**Priyadarshini Ward, which Brookefield owns.** The AECS Layout commercial strip that everyone calls
"Kundalahalli" is administratively Brookefield; Kundalahalli ward itself is residential and lake. The 16
reclaimed rows genuinely belong to it, but there is almost nothing further to find.
**Redirected: 11 of those 18 were filed to Brookefield**, taking a PARTIAL area from 39 to 53 core rows
(Get care 8 → 13, Eat healthy 3 → 6, Work out 8 → 10). A better outcome than the one predicted, in a
different area.

**THE OWNING-WARD RULE HAD A FLAW, AND KENGERI EXPOSED IT.** The batch was selected by taking each label's
**modal ward among its existing rows**. With few, scattered seed rows that is unreliable: Kengeri's 8 seed rows
gave **Mylasandra at only 43%** — and Mylasandra is not where Kengeri's supply is. Triaging against Mylasandra
alone returned **6 filable of 50**. Corrected so that **Kengeri owns the three wards that share its postal
identity — Kengeri, Mylasandra and Kengal Hanumanthaiah West** — and the same 50 candidates returned
**29 filable**.

| Kengeri | Was | Picked | Now |
|---|---|---|---|
| Work out | 0 | 12 | **12 — 3 preferred, from an empty cell** |
| Get care | 3 | 9 | 12 |
| Move | 2 | 4 | 6 |
| Play | 6 | 1 | 7 |
| Eat healthy | 3 | 1 | 4 |

**Findings**
- **An area's owning ward should be the ward that bears its name, not the mode of its seed rows.** Where a
  colloquial area spans several contiguous wards of the same postal identity, it should own all of them.
  The rest of the 15-area batch needs re-checking on this basis before it is run
- **Kengeri is the strongest genuine-hole result so far** — 50 candidates, one duplicate, Work out filled from
  zero to floor. It should have been in the main batch
- Excluded by ward: Nagadevanahalli 3, Hemmigepura 3 — both are separate wards with their own identity
- Rejected: Shivani Organics 3.9, Therapists of India 5.0/9, Nutricafe 5.0/11, Anvita Organics 5.0/8,
  Kundalahalli Lake Park 4.0/408 and BEML Layout Park 4.1/733 (**two more parks lost to the review floor**)


---

### Session 31 — 2026-09-12 — Pair 2: Varthur + Vijayanagar — both genuine holes

4 Places calls, 40 queries. **54 rows added.** Master: 2,077 → **2,131 rows**.
Varthur 7 → 34 · Vijayanagar 9 → 36.

**The two richest sweeps of the programme.** Varthur returned **36 filable of 42 candidates (86%)** — the
highest hit rate recorded. Vijayanagar returned 35 of 51. Between them, **2 duplicates.** Genuine holes really
are rich; the difficulty has always been finding them, not harvesting them.

| Varthur | Was | Now | | Vijayanagar | Was | Now |
|---|---|---|---|---|---|---|
| Get care | 0 | **11** | | Work out | 0 | **10** |
| Work out | 5 | 10 | | Get care | 2 | 10 |
| Eat healthy | 0 | 7 | | Clear my head | 2 | 6 |
| Clear my head | 0 | 3 | | Move | 0 | 3 |

**THE WARD-EXPANSION LESSON REPEATED TWICE MORE.** Vijayanagar's four name-matched wards returned only
**20 filable of 51**. The largest single ward in the results was **Hosahalli (14)** — and "Hoshalli Extension,
Vijayanagar" is the area's own postal identity. Adding Hosahalli and Adi Chunchanagiri took it to **35 filable**.
That is the third consecutive area (after Kengeri and Vijayanagar) where name-matching alone under-scoped the
sweep. **The rule is now settled: an area owns every contiguous ward that shares its postal identity, not just
the ward bearing its name.**

**Findings**
- **Varthur's Get care went 0 → 11 with eight dental clinics available above band.** Peri-urban east Bangalore
  has far more private healthcare than its row count suggested — the area looked empty because nobody had
  looked, not because nothing was there
- **Varthur Move finished at 1** despite four candidates. Gunjur Palya Lake (4.4/37) filed; Varthur Lake
  (3.2/620) rejected on rating — a genuinely poor lake, so the floor worked correctly here
- Vijayanagar Eat healthy stayed at 2 — only two above-band candidates in-ward. A real supply limit
- Rejected below floor: SaladO Varthur 4.6/9, SaladO Candeur 5.0/1, Soumya Rao 5.0/18,
  Dr Prashanthi 4.9/17, Vfive Badminton 3.8, Swasthya Cafe 4.2/266 (filed nothing — Eat healthy cap)
- Excluded by ward from Vijayanagar: Thimmenahalli 4, Krishnadevaraya 2, Kaveripura, Attigupe, Gali Anjaneya,
  Maruthi Mandira — all Govindaraja Nagar / Chandra Layout side, separate identities


---

### Session 32 — 2026-09-12 — Pair 3: Mahadevapura + Nagarbhavi

4 Places calls, 36 queries. **12 rows reclaimed + 46 rows added.** Master: 2,131 → **2,177 rows**.
Mahadevapura 9 → 38 · Nagarbhavi 5 → 34.

**The distance test proved its worth on the first action of the session.** Mahadevapura's ward held 12 rows
labelled elsewhere; **11 passed the distance test and were reclaimed, 1 was correctly rejected**. Nagarbhavi
reclaimed 1 of 2. Exactly what the re-derivation predicted — no surprises, which is itself the result.

| Mahadevapura | Was | Now | | Nagarbhavi | Was | Now |
|---|---|---|---|---|---|---|
| Get care | 0 | **10** | | Get care | 1 | **11** |
| Work out | 3 | 10 | | Move | 1 | **8** |
| Eat healthy | 2 | 3 | | Work out | 0 | 9 |
| Play | 6 | 6 | | Eat healthy | 1 | 3 |

**Findings**
- **Nagarbhavi's Move went 1 → 8 — the best Move result of the programme.** West Bangalore's BDA layouts have
  a dense network of small maintained parks with open gyms, and almost all clear the 4.2 floor. This is the
  clearest evidence yet that **Move's weakness is geographic, not a rule problem**: where parks are good, the
  floor passes them fine
- **Mahadevapura Get care 0 → 10 with eight above-band dental clinics.** Same pattern as Varthur: an area that
  looked empty because nobody had swept it
- Mahadevapura's ward spread was unusually clean — **23 of 37 candidates in Garudachar Palya alone**, so the
  postal-identity expansion barely mattered here. Nagarbhavi needed Chandra Layout added
- Nagarbhavi Clear my head finished at 0 — the only in-ward candidate was PragyanCDC (4.4/56), a child
  development centre rather than adult counselling. **Left empty rather than mis-filed**
- Excluded by ward: Mallathahalli 5, Kottegepalya 1 (Nagarbhavi); A Narayanapura 2, Dodda Nekkundi 1
  (Mahadevapura)


---

### Session 33 — 2026-09-12 — Pair 4: Ulsoor + Vidyaranyapura — **DISTANCE TEST EXTENDED TO CANDIDATES**

3 Places calls, 24 queries. **6 rows reclaimed + 28 added.** Master: 2,177 → **2,205 rows**.
Ulsoor 8 → 19 · Vidyaranyapura 4 → 27.

**METHOD CORRECTION — the distance test now applies to NEW CANDIDATES, not just reclaims.**
Ulsoor's ward set includes Jogpalya, the same long thin ward that produced the Fraser Town artifact in session 30.
Fifteen candidates passed the ward filter — but **5 of them were physically closer to Indiranagar's centre than to
Ulsoor's** (Smile Care Dental 1.04 km, Clove Cambridge Layout 1.16 km, Dr Sheetal 1.30 km, Ave Women's Fitness
1.13 km, One Road To Fitness 1.01 km). Under the old method all five would have been mis-filed to Ulsoor.

Session 30 established "ward ownership proposes, distance disposes" but applied it only to reclaims. **It should
always have applied to fresh search results too.** It does now. Every remaining sweep uses it.

### Two opposite gates in one session
- **Ulsoor: 188 swept rows in radius — the heaviest overlap ever recorded**, MG Road 1.75 km away. Result:
  6 DUPs, 6 below floor, 5 rejected on distance, 2 wrong ward. **Only 10 of 31 candidates filable, 5 written.**
  Central Bangalore is close to saturated
- **Vidyaranyapura: 0 swept rows in radius — the cleanest gate of the programme.** 29 of 37 filable, 2 DUPs,
  23 written. Get care 0 → 11, Move 0 → 5, Play 1 → 4

| Ulsoor | Was | Now | | Vidyaranyapura | Was | Now |
|---|---|---|---|---|---|---|
| Get care | 2 | 7 | | Get care | 0 | **11** |
| Move | 2 | 4 | | Move | 0 | 5 |
| Work out | 2 | 4 | | Work out | 3 | 6 |
| Play | 4 | 4 | | Play | 1 | 4 |

**Findings**
- **Postal-identity expansion needed AGAIN** — Vidyaranyapura's two name-matched wards held only 13 of 37;
  **Singapura ward held 17**, all with BEL/HMT/NTI Layout, Vidyaranyapura addresses. Fourth consecutive area
- **North corporation finally gets real density.** Vidyaranyapura went from 4 rows to 27 in one sweep
- Vidyaranyapura Eat healthy finished at 0 — all healthy-food candidates were in Sahakar Nagar, Yelahanka or
  Malleshwaram, outside radius. **Genuine supply gap, correctly left empty**
- Ulsoor Clear my head stayed at 1: Altheia (5.0/17) and mindStalk (4.9/15) both below the 20-review floor.
  **Another instance of the community/small-practice review floor problem**


---

### Session 34 — 2026-09-12 — Pair 5: Sahakar Nagar + Mathikere

3 Places calls, 23 queries. **3 rows reclaimed + 46 added.** Master: 2,205 → **2,251 rows**.
Sahakar Nagar 9 → 34 · Mathikere 7 → 29.

Two clean gates (32 and 23 swept rows in radius, nearest neighbours 2.22 km and 3.29 km). The distance test
ran on candidates from the start this time and rejected nothing in either area — correct, since both sit
well clear of their neighbours.

| Sahakar Nagar | Was | Now | | Mathikere | Was | Now |
|---|---|---|---|---|---|---|
| Get care | 1 | **11** | | Get care | 0 | **11** |
| Work out | 5 | 10 | | Move | 0 | 4 |
| Clear my head | 1 | 4 | | Work out | 4 | 6 |
| Move | 0 | 2 | | Eat healthy | 0 | 3 |
| Play | 1 | 3 | | Clear my head | 0 | 3 |

**Findings**
- **Postal-identity expansion, fifth and sixth consecutive time.** Sahakar Nagar's three name-matched wards
  held 20 of 39; **Rajiv Gandhi Nagar added 11**. Mathikere's four held 13 of 36; **Brundavana Nagara added 11
  and J.P PARK added 3**. This is no longer a discovery — it is a required first step on every area
- **Mathikere's Move went 0 → 4 anchored by Jaya Prakash Narayana Park (4.3/24,136)** — 85 acres, the biggest
  park in north Bengaluru after Lalbagh and Cubbon Park, with lake, rock garden, open gym and pool. It had
  never been on the map. A reminder that **large, obvious assets can be missed entirely when an area is unswept**
- Sahakar Nagar's yoga supply is unusually deep — six studios above band, five filed, hitting the Work out ceiling
- Sahakar Nagar Eat healthy stayed at 1: only Go Naturals (4.8/36) cleared, Cafe Natural (4.1/1,282) failed the
  floor on a long run of hygiene complaints. **Floor working as intended**
- Excluded by ward: Thindlu 4 (Sahakar Nagar), Geddalahalli 3 (Mathikere) — both RMV/New BEL Road side,
  consistent with the Vidyaranyapura call last session


---

### Session 35 — 2026-09-12 — Pair 6: Fraser Town + Yeshwanthpur — **TWO ERRORS FOUND AND FIXED**

3 Places calls, 20 queries. **6 rows reclaimed + 22 added.** Master: 2,251 → **2,273 rows**.
Fraser Town 12 → 25 · Yeshwanthpur 7 → 16.

### The Jogpalya artifact, confirmed at full scale
Fraser Town matched **22 rows on ward** — and the distance test rejected **18 of them**: 14 to Indiranagar,
2 to Ulsoor, 1 each to Domlur and MG Road. Only 4 reclaimed. This is the artifact the session-30 re-derivation
predicted, now measured directly. **Without the distance test, Fraser Town would have stolen 18 rows from four
different swept areas.**

### Error 1 (mine): contradictory ward sets inside one session
Subedarpalya was assigned to **Mathikere** during session 34's triage and to **Yeshwanthpur** in this session's
reclaim. The reclaim pulled BLR-2481 and BLR-2482 — both written to Mathikere hours earlier — straight back out.
**Reverted.** Ward sets must be declared once per area and reused, not re-typed per step.

### Error 2 (data): Yeshwanthpur's centre was an artifact
Its 9 seed rows sat in four unrelated pockets; the median landed at 13.0277, 77.5577 — **0.58 km from Mathikere**,
which would have failed the 1.5 km independence test and wrongly triggered a merge. Re-deriving from its true
wards only (Yeshwanthpur, Goraguntepalya, Subramanyanagara) gives **13.02664, 77.54405 — Mathikere 1.68 km away.**
Independent, correctly swept. The distance test then rejected 4 more candidates back to Mathikere.

**Three more mislabels found** (added to pending-relabel list): BLR-183 Mahesh Bhupathi Pickleball (5.2 km off),
BLR-412 The Royal Court Pickleball (3.0 km), BLR-691 Ramaiah Memorial Hospital (2.8 km).

| Fraser Town | Was | Now | | Yeshwanthpur | Was | Now |
|---|---|---|---|---|---|---|
| Get care | 2 | **11** | | Get care | 3 | 7 |
| Work out | 3 | 5 | | Move | 0 | 3 |
| Clear my head | 1 | 2 | | Eat healthy | 0 | 2 |

**Findings**
- Cooke Town candidates deliberately **held, not absorbed** — it is the next solo sweep. Cox Town (2) and
  Sagayapuram (2) excluded on ward for the same reason
- Fraser Town Move finished at 1. Coles Park (4.2/6,092) filed; **Richards Park (4.2/5,381) lost to the
  60% diversity cap** — both are the same subcategory and the cell ceiling allowed only one
- Yeshwanthpur Clear my head and Work out stayed thin: real supply gap in an industrial-suburb area


---

### Session 36 — 2026-09-12 — Cooke Town — **PARTIAL FILL, NOT A SWEEP** — batch complete

1 Places call, 5 probe queries. **7 rows added.** Master: 2,273 → **2,280 rows**. Cooke Town 7 → 14.

### Cooke Town fails the independence test — and was treated accordingly
Centre 13.00354, 77.62391 sits **1.15 km from Fraser Town**, below the locked 1.5 km threshold. 23 of the 34
rows within 2 km are already Fraser Town's. **Per the rule this is reclaim-only, not a sweep** — so it got the
Cubbon Park probe protocol (5 queries) instead of a 20-query budget.

**The probe justified a partial fill, not a full sweep.** Cooke Town has genuine Get care supply in wards
Fraser Town never touched — Maruthi Seva Nagara, Sagayapuram, St Thomas Town — so filing it is not
double-counting. But it has **almost nothing else**: no Move, no Play, no Work out above band in its own wards.

Filed 7: **Get care 0 → 6**, Clear my head 0 → 1. Four of the seven are floor-band.

**Cooke Town is now a documented BORDERLINE area** — it stays on the map, it is not merged, but it will never
reach the 10-row floor on most cells and should not be re-swept. Any future Cooke Town supply should be
triaged against Fraser Town first.

**Findings**
- Apollo Diagnostics Cox Town rejected on distance — **0.58 km, closer to Fraser Town**
- Sunny Side Bistro (4.0/1,149) failed the rating floor; Half CA Healthy Cafe (5.0/69) is 1.6 km out in
  Kammanahalli, wrong area
- **Same-site Case 27:** PMHS Physio Rehab Center (4.9/104) and PMHS Health Care Physio Rehab Services
  (4.8/69) share one address — 6/8 High Street, D Costa Layout. Filed the higher-review listing only

### NEXT BATCH COMPLETE — 11 areas processed across sessions 30–36
Kundalahalli (reclaim-only) · Kengeri · Varthur · Vijayanagar · Mahadevapura · Nagarbhavi · Ulsoor ·
Vidyaranyapura · Sahakar Nagar · Mathikere · Fraser Town · Yeshwanthpur · Cooke Town (partial)


---

### Session 37 — 2026-09-12 — **PARK REVIEW FLOOR RESOLVED** — longest-standing open item closed

**8 parks admitted. Master: 2,280 → 2,288 rows.** No new searches — this was a rules decision applied to
evidence already collected across 20 triage files.

### The evidence: parks and businesses are different rating populations

| | n | median | shape |
|---|---|---|---|
| Parks / lakes | 80 | **4.30** | tight cluster 4.2–4.5 |
| Clinics / labs / gyms / yoga | 581 | **4.90** | 95% above 4.6 |

The 4.2 floor sits **near the park median** — it cut that distribution roughly in half. For commercial venues
it is a far tail that removes almost nothing (2 of 581). **The floor was calibrated on businesses that actively
manage their reviews, then mis-applied to free civic infrastructure** where people rate the drainage smell and
still walk there every morning.

### NEW RULE — parks and lakes only
**rating ≥4.0 AND reviews ≥50** (lower rating bar, higher review bar to compensate).
All other subcategories keep the existing 4.2/20 floor unchanged.

### Admitted (8)
Narasipura Lake 4.1/345 · Walking Park NTI Layout 4.1/71 (Vidyaranyapura) · Atal Ji Park 4.0/620 (Mathikere) ·
Vijayanagara Park 4.1/522 (Vijayanagar) · Kundalahalli Lake Park 4.0/408 · Jogging Park AECS Layout 4.1/403 ·
BEML Layout Park 4.1/733 (all → Brookefield) · 3rd Cross Park 4.1/83 (Vasanth Nagar)

### Correctly still excluded
- **Varthur Lake 3.2/620** and **Halasuru Lake Walking Track 3.8/5** — genuinely poor, below 4.0
- **B Narayanapura Lake 4.2/13** — fails the 50-review bar
- **MLA Layout Park 4.1/312** — sits in Geddalahalli, the ward excluded from Mathikere in session 34.
  **Ward consistency beats cell-filling**
- **BEML Layout Park routed to Brookefield, not Kundalahalli** — Kundalahalli is reclaim-only, not a sweep area

### Move cell effect
Vidyaranyapura 5→7 · Brookefield 4→7 · Mathikere 4→5 · Vijayanagar 3→4 · Vasanth Nagar 1→2


---

### Session 38 — 2026-09-12 — **MOVE WIDENED** — new subcategory + BBMP park sweep

1 Places call, 10 queries. **14 rows added.** Master: 2,288 → **2,302 rows**.

### New Move subcategory: Athletics track / stadium loop
Public stadium grounds and athletics tracks with open access — a category the map had no home for. Note the
**100 existing "Multi-sport venue / Stadium" rows all sit under Play**; those are turf and court venues for
booked games, not running loops, so there is no overlap. Checked before adding.

Standard 4.2/20 floor applies to tracks (unlike parks) — these are managed facilities, not civic green space.

### What was added
| Area | Move before | after |
|---|---|---|
| Mahadevapura | 1 | 3 |
| HAL | 2 | 4 |
| Hoodi | 1 | 2 |
| Domlur | 1 | 2 |
| Bellandur | 2 | 3 |
| Indiranagar | 8 | 10 |
| Marathahalli, Whitefield, Koramangala, HSR, RR Nagar | +1 each |

Highlights: **Iblur Lake Park 4.0/3,585** (Bellandur), **Visvesvaraya Park 4.3/2,507** and **Kuvempu Park
4.4/2,256** (HAL), **Wood Park 4.3/2,106** (Indiranagar), **Sonu's Running Track 4.1/174** (Hoodi — the exact
row flagged as wrongly excluded back in session 29).

### Held back on purpose
- **Cell ceilings respected.** Jayanagar already at 10 — Kittur Rani Chennamma Stadium (4.4/829) **not filed**,
  cell is full. Padding strong areas is not the point of this pass
- **Sree Kanteerava Stadium (4.4/20,365)** already on the map — duplicate, skipped
- **Byrasandra Lake walking track (4.6/80)** skipped as a likely same-site duplicate of BLR-1942
  "Byrasandra Lake — GM Palya". Flagged rather than risk a double pin
- Below the park floor and correctly out: Jogger's Park 3.7, Kodigehalli Hoodi Park 3.8, Kundalahalli Lake 3.8,
  BBMP Park Doddanekundi 3.8, B.B.M.P. Park HAL 3rd Stage 3.6


---

### Session 38b — 2026-09-12 — **SMALL-PRACTICE REVIEW FLOOR — DECIDED: NO CHANGE**

**Status: CLOSED. Do not relitigate without new evidence.** No rows added or removed.

### The case that was considered
All 10 excluded therapy/counselling practices fail on **review count alone** — not one fails on rating.
Every one rates 4.8+: The Looking Glass 5.0/5 · Ummeed 5.0/6 · Therapists of India 5.0/9 ·
Holistic Career Guidance 5.0/10 · Ravishyam 5.0/6 · mindStalk 4.9/15 · Dr Prashanthi K 4.9/17 ·
Altheia 5.0/17 · Soumya Rao 5.0/18 · Sundar Hospital Physio 4.9/12.

The structural argument was real: **therapy clinics on the map have a median of 54 reviews; dental clinics
have 312.** People do not publicly review the psychologist they see for depression. The 20-review floor in
this subcategory measures willingness-to-be-seen, not quality — the same category error as the park floor.

### Why the park precedent was NOT followed
A park at 4.1 from 700 reviews is statistically solid — same signal, different scale. **A counselling practice
at 5.0 from 5 reviews is 5 reviews.** There is no volume to reason from. And this is the single category where
a weak recommendation does the most harm: someone in distress acting on a thin signal.

**Decision: the 4.2/20 floor stands unchanged for therapy and counselling.** Clear my head stays weak —
currently ≥5 in only 15 of 47 swept areas, 0 in four — and that is accepted as the correct trade.
Nothing unverified goes on a map people use when they are struggling.

A credential-gated admission (RCI registration / clinical qualification as the quality signal instead of review
volume) remains the only route that would change this. It requires per-row verification and is out of scope
for the Places pipeline.


---

### Session 39 — 2026-09-12 — **UNRATED COHORT RESOLVED — curated, not debt**

**Status: CLOSED.** No rows added or removed. 1,115 rows re-stamped.

The 1,115 rows without a Google rating are **not** an unverified backlog — they were human-vetted during the
original curation, before the quality-band pipeline existed. Confirmed by project owner.

**Action:** `quality_band` set to **`curated`** on all 1,115 (was blank/NaN). The blank field was what made
them read as unchecked in every audit. They now carry an explicit provenance marker.

**quality_band distribution after:** curated 1,115 · preferred/acceptable/floor 1,187

### Two things logged, not actioned
- **182 curated rows carry `v="Needs check"`** and 17 carry `v="Community-reported"` — the file's own
  pre-existing flags, not a new objection. Left untouched per decision.
- Band rules (4.2/20, park 4.0/50, diversity cap) apply to the **Places-sourced half only**. The curated half
  was admitted on a different, human standard. This is now a documented and accepted split, not an
  inconsistency to fix.

**Revised debt list** — the audit's largest item is closed. What genuinely remains:
93 rows without coordinates · Electronic City GBA scope (48 rows) · 27 same-site cases ·
pending relabels · Hagaduru polygon buffer(0) · the merge pass (6 live pairs + 79 stubs)


---

### Session 40 — 2026-09-12 — Strava-discovered running routes, batch 1 (north Bengaluru)

**3 rows added.** Master: 2,302 → **2,305 rows**. Kothanur Move 2→3 · Jakkur Move 3→5.

### Method: Strava as DISCOVERY layer, Places as RESOLUTION layer
Screenshot coordinates are not precise enough for the distance test. So the Strava segment map was used
only to learn **which lakes people actually run**, then each candidate was resolved through Places for real
coordinates, rating and verification. Every normal rule then applied unchanged.

`src` = "Strava segment map + Google Places" on all three.

### Admitted (3)
- **Doddagubbi Lake 4.4/299** → Kothanur (2.70 km). ~4 km maintained dirt track — the best distance loop
  found in north Bengaluru
- **Chokkanahalli Lake Park 4.2/171** → Jakkur (2.76 km). Paved, fenced, guarded short loop
- **Thirumenahalli Lake 4.1/114** → Jakkur (3.22 km). 1.25 km gravel loop. Slightly beyond the 3 km radius
  but Jakkur already owns a Thirumenahalli row (BLR-1618), so the label is consistent

### Rejected by the floor — working as intended
- **Amrutahalli Lake 3.8/78** — fails the 4.0 park floor. Reviews confirm raw sewage and broken track.
  **A Strava segment exists there anyway** — runners use it regardless. Popularity is not quality, and this
  is exactly the case the floor exists for
- **Bande Bommasandra Quarry Lake 4.0/2** — fails the 50-review bar; reviews also call entry dangerous

### Held, not filed
- **Kattigenahalli Lake 4.3/54** — 5.05 km from Yelahanka, beyond any swept radius
- **Bagalur Bamboo Forest 4.2/539** ("Hennur Trail") — 6.15 km from Kothanur, likely outside GBA
Both are genuine quality but sit in unswept territory. **Force-filing them to a distant label would repeat the
Yeshwanthpur centre error.** They belong to a future north sweep.

### Same-site Case 28
**Jakkur lake Joggers' entry 4.3/57** is a second access point for **BLR-1606 Jakkur Lake**, already on the map.
Not filed as a separate pin. Its review detail (3.5 km internal track, gravel surface) is worth folding into
BLR-1606's description on a later pass.

### Open question for batch 2 — road straights
Rachenahalli Main Road, PAGV Main Road, Elu's Road Full Loop, "Bharatiya signal chase" are public-road
segments with **no Places entity** — no coordinates, no rating, no verification path. They cannot go through
the pipeline used here. They would need manually set coordinates and `quality_band="curated"`, i.e. the
human-vetted standard. Flagged for decision, not actioned.

### Excluded per instruction (campus / gated)
Reva University 400m Loop · GKVK road up/downhill · university library climb · NCBS Security Gate Loop ·
Bee park Stretch · Nikoo 1 Exit (Bhartiya City) · Godrej Woodsman


---

### Session 40b — 2026-09-12 — **DATA INTEGRITY: `raw` field repaired on 1,389 rows**

No rows added or removed. Master stays at **2,305**.

### The bug
`raw` — the venue-name field used as the **dedupe key** — held the **area label** instead of the venue name
on **1,389 rows (60% of the file)**. E.g. BLR-002 "Cult.fit Indiranagar" had `raw = "Indiranagar"`.
Affected ids BLR-1 to BLR-2069; spans curated (828) and Places-banded (545) rows alike.

**Why it mattered:** every dedupe check across all sessions has been part-blind. The checks happened to survive
because they also matched on `n` with the sub-locality suffix stripped — that fallback carried the load.
`raw` alone would have caught nothing.

**Repair:** `raw` rebuilt from `n` by stripping the ` — Sub-locality` suffix. Unique `raw` values 853 → ~2,100.
No information lost — the displaced area value was already in `a`.

**Lesson:** the dedupe key was never itself audited. Worth checking key fields directly, not just the
operations that consume them.

### Doddagubbi overlap flagged (not resolved)
**BLR-2556 Doddagubbi Lake (4.4/299)** sits **0.22 km** from pre-existing **BLR-2103 Doddagubbi Panchayat Park
(4.4/219)**. Near-identical ratings, shared name root — probably one site with two Google listings, but a
panchayat park adjacent to a lake is also a real pattern. **Neither retired on a guess.** `dup_flag` set on
both for verification before render. Logged as same-site **Case 29**.


---

### Session 41 — 2026-09-12 — **`routes.csv` split out**

New file **`routes.csv`** — 53 rows, 25 columns. Master unchanged at **2,305**.

### Why a separate file
Routes are **linear features**; the master is a point schema. Distance, surface, shape, elevation and access
have nowhere to live in the master's 39 columns and were being buried in free-text `d`.

### What was moved in
Seeded from the three route-shaped subcategories:
`Running route / trail` 44 · `Cycling route` 8 · `Athletics track / stadium loop` 1.

**Not** included: `Swimming pool` (43) and `Park / Lake walking loop` (140). Pools are point venues; parks are
amenities that often contain a loop but aren't routes themselves. Pulling all 140 would have made routes.csv a
near-copy of Move.

### New fields
`route_id` (RT-nnn) · `master_id` (links back to BLR row) · `route_type` · `shape` · `distance_km` ·
`surface` · `access` · `elevation_profile` · `needs_field_data`

### Honest state of the data — most of it is empty
| field | populated |
|---|---|
| shape | 47/53 |
| lat/lon | 51/53 |
| distance_km | **13/53** |
| surface | **11/53** |
| rating | 18/53 |

`shape` was derived from names and descriptions ("loop", "circuit", "stretch"). `distance_km` and `surface`
were extracted **only where a description actually stated them** — nothing inferred or estimated. A route's
length is not something to guess at.

**46 of 53 rows carry a `needs_field_data` flag** naming exactly which fields are missing. That is the real
state: the file has the right shape and mostly lacks content. Strava is the obvious source for distance and
elevation on the next pass.

### Sync model — decided, needs holding to
- **Master stays the render source.** Route rows remain in it; nothing was deleted
- **`routes.csv` is authoritative for route attributes** (distance, surface, shape, access)
- Linked by `master_id` ↔ `id`
- **Risk:** a route edited in one file and not the other will drift. Any new route must be written to both,
  or the link breaks silently

### Two routes have no coordinates
Cannot render or be distance-tested. Part of the 93-row no-coordinates backlog.


---

### Session 42 — 2026-09-12 — Strava tiles T1/T2/T6 + **second self-made duplicate caught**

**1 row added, 1 retired, 7 road segments into routes.csv.** Master 2,305 → **2,306** (2,191 live).
routes.csv 53 → **60 rows, 29 columns**.

### Heatmap layer finally available — and it changes the picture
Tile 3 had Heatmaps toggled on. Blue density = usage, orange = named segments.

**The darkest heat in Indiranagar is the street grid, not the parks.** 12th Main, 80 Feet Road, CMH Road
and the Defence Colony inner roads carry heavier usage than any park in the tile. This is direct evidence for
the road-route layer — and it is a layer **Places structurally cannot see**, because these have no listing.

### Duplicate caught — mine, again
**BLR-2549 "Wood Park Indiranagar" duplicated BLR-1660 "Wood Park" — 0 m apart, same rating, 2106 vs 2105
reviews.** Created in session 38's Move-widening. It slipped through because **the `raw` field was corrupted at
that time** (session 40b), so the dedupe key was blind.

Retired BLR-2549 — `map_eligible=no`, `out=1`, `merged_from=BLR-1660`, reason in `notes`. Original kept.

**This is the second duplicate from that session** (Doddagubbi was the first, Case 29). Both trace to the same
root cause. **Worth re-checking every row written in sessions 37–39 against the repaired `raw` field** — the
corruption window covers all of them.

### Added (1)
**Chelekere Lake 4.5/69 → Kalyan Nagar.** ~1.2 km paved shaded loop, active walkers association, peacocks.
Not previously on the map.

### Already on map — correctly skipped
Agara Lake (BLR-1564) · HRBR Park (BLR-2048) · Kuvempu Park HAL (BLR-2547) · Visvesvaraya (BLR-2546) ·
Coles Park (BLR-2514) · Ulsoor Lake (BLR-2434) · Byrasandra Lake (BLR-1942)

### Same-site clusters observed
**Agara Lake has 3 Google listings** (4.4/25, 4.4/59, 4.6/41) and **Byrasandra has 3**. Same pattern as
Madiwala's six. Filing per listing would have put 12 pins on 3 lakes.

### 7 road segments → routes.csv, flagged honestly
CMH Road · 80 Feet Rd (12th Main→Domlur) · 12th Main→Double Road · Defence Colony grid loop ·
Thippasandra Main Rd · **Wheeler Road Ext (Cooke Town — a zero-route area)** · Jayamahal Main NB.

All carry `geometry_source = strava-heatmap-estimate`, `verified = Needs check`, and
`needs_field_data = distance|elevation|exact-endpoints`. **Waypoints are anchor estimates read off the
heatmap, not traced geometry** — accurate to roughly a block, not to the kerb. New column `heat_rank`
records observed usage (dark/medium) as the popularity signal.

### Excluded per instruction (campus / gated / corporate)
Bagmane Tech Park Loop · St John's Track Loop · SJR Redwoods · Sun City Road · Tennis Courts EP Loop


---

### Session 43 — 2026-09-12 — Strava tiles T4/T3/T5 (east corridor) — **the floor did most of the work**

**2 rows added, 6 road segments.** Master 2,306 → **2,308**. routes.csv 60 → **66**.
Brookefield Move 7→8 · Mahadevapura Move 3→4.

### The finding: east-corridor lakes are heavily run and mostly unusable
Nine lakes resolved from the three tiles. **Seven failed the floor — and six failed on RATING, not obscurity.**

| Lake | Rating | Fails on | Reviews say |
|---|---|---|---|
| Doddanekundi | 3.8/257 | rating | 2.4 km paved loop, praised — **sewage pumped in daily, dead fish** |
| Nallurahalli | 3.8/159 | rating | three dirty drains flow in; snakes, stray dogs |
| Kaggadasapura | 3.6/99 | rating | covered in weeds, raw sewage, construction debris |
| Mullur | 3.4/53 | rating | contaminated, dead fish, untreated sewage |
| Bhoganahalli | 3.7/39 | both | part-flooded, garbage on shores |
| Kaikondrahalli Trail | 4.1/41 | reviews | garbage burning beside the trail |
| Basavanapura | 4.6/5 | reviews | too few reviews to judge |

**Every one of these carries a named Strava segment.** People run them daily. The heatmap says popular; the
reviews say sewage. **This is the clearest evidence yet that popularity and quality are independent signals** —
and the strongest vindication of keeping the floor at 4.0 rather than relaxing it to fill thin cells.

The east corridor's Move weakness is **not a discovery problem. The lakes exist, they are known, and they are
degraded.** No amount of further searching changes that.

### Admitted (2)
- **Chinnappanahalli Lake 4.2/5,484** → Brookefield (0.77 km). Fully paved, stroller-friendly, kids' area,
  public toilet. Best-kept lake found in the corridor
- **Kowdenahalli Lake And Park 4.3/1,744** → Mahadevapura (2.74 km). 1.4 km fenced mud loop, easier on joints

### Watch list — would pass if cleaned
**Doddanekundi Lake (3.8/257)** has a 2.4 km paved loop, open gym and heavy bird life. Rating is dragged
purely by sewage inflow. If the lake is remediated it becomes a strong Move row for CV Raman Nagar (Move 2).
Worth re-checking annually.

### 6 road segments added
Bellandur Lake Road · Kadubeesanahalli Rd (APH→IPRR) · **Doddanekkundi Industrial Area loop (darkest heat in
the Mahadevapura tile)** · Whitefield Rd (Hoodi→Mahadevapura) · Pattandur Agrahara Metro→Kadugodi Tree Park
Metro · ITI loop KR Puram.

**Note on Bellandur:** the lake is notorious and unusable, but **Bellandur Lake Road shows dark heat** —
runners use the road, not the water's edge. The road-route layer is doing real work in exactly the areas
where the lake layer fails.

### Excluded per instruction (gated / corporate / apartment)
Prestige Sunnyside Oak · SJR Redwoods · Woodsong · Rainbow Drive · Zephyr Club · Sterling Brookside ·
CMRIT~SJR Brooklyn · Google Cloud Run · Google Ananta loop · PWM Hamster Wheel · Purva Seasons ·
Bagmane Tech Park · Durga Petals · Shriram Samruddhi · SLG 810M


---

### Session 44 — 2026-09-12 — Strava tiles T7/T9/T8 — **nine tiles complete**

**5 rows added, 7 road segments.** Master 2,308 → **2,313**. routes.csv 66 → **73**.
Kothanur 3→4 · Vidyaranyapura 7→8 · Rajajinagar 4→5 · Banashankari 7→8 · Yeshwanthpur 3→4.

### Admitted (5)
- **Kalkere Lake 4.3/564** → Kothanur. **~4.5 km circuit — the longest lake loop found anywhere in the city.**
  Rejuvenated, migratory birds. Trail does not fully close at one end
- **Abbigere Park 4.1/3,084** → Vidyaranyapura. Large community park, long path, working open gym
- **Kurubarahalli Kempegowda Park 4.3/609** → Rajajinagar. Renovated, widened track, lit late
- **Pushpanjali Park 4.3/1,497** → Banashankari. **Open 24 hours — rare for a BBMP park**
- **Park Mahalakshmi Layout 4.0/124** → Yeshwanthpur (Move 3→4, a thin area)

### Rejected by the floor
Singapura Park 3.9/286 (rating) · Nayandahalli Lake 4.3/32 (reviews) · Attiguppe Park 4.0/44 (reviews)

### Already on map
**Horamavu Agara Lake** → BLR-1565, but filed to **Banaswadi, a stub label**. The distance test puts it
2.32 km from Kalyan Nagar. **Flagged for the merge pass** — Banaswadi should fold into Kalyan Nagar.

### 7 road segments
Sankey Touch & Back (dark) · Palace Ground Parallel (dark) · Jayamahal Main NB · New BEL Road ·
Nandi Durga Road climb · Vidyapeetha to Ring Road · BDA hill repeats.

**Three filed to Vasanth Nagar**, which sits at Move 2 with almost no park options — the road layer is the
only realistic Move supply there. Two carry `elevation_profile = climb`; gradient is scarce in Bengaluru and
worth recording where it exists.

### Excluded per instruction (campus / gated / corporate)
IISc Main Drag · IISc Monza Circuit · CVH Gate to Main Gate · Veterinary College Ground · GKVK up/downhill ·
university library climb · Jnana Bharathi campus roads · Godrej Woodsman Estate · RMZ Residences ·
Chrysanthemum Apt · BLR_Manyata Residency · Hiranandani loop · Sobha Loop · Sobha Magnolia 400m ·
SNN OneAndQuarter · PMW 1 loop · RNS Shantinivas

### Nine-tile campaign totals
**Sessions 40–44: 13 routes added to master, 20 road segments to routes.csv, 2 self-made duplicates caught
and retired.** routes.csv grew 53 → 73.


---

## Areas completed

| # | Area | Session | Pins added | Short cells |
|---|---|---|---|---|
| 1 | Jakkur | 1 | 32 | Eat healthy, Move, Clear my head — **revisit at end**, see Open items |
| 2 | Yelahanka | 2 | 32 | Eat healthy, Move, Clear my head |
| 3 | Koramangala | 3 | 5 | Clear my head, Move |
| 4 | Indiranagar | 3 | 4 | Play, Move |
| 5 | HSR Layout | 4 | 4 | Play, Move |
| 6 | Whitefield | 4 | 7 | Eat healthy, Get care, Move |
| 7 | Jayanagar | 5 | 15 | Eat healthy |
| 8 | JP Nagar | 6 | 26 | none — all four swept cells reached the floor |
| 9 | Banashankari | 7 | 28 | Move (7), Eat healthy (5) |
| 10 | Malleshwaram | 8 | 16 | Eat healthy (9), Play (5), Move (4), Clear my head (4) |
| 11 | Bellandur | 8 | 21 | Play (8), Eat healthy (5), Clear my head (4), **Move (2) — no supply above floor band** |
| 12 | BTM Layout | 9 | 25 | Move (6), Eat healthy (5), Clear my head (4), **Play (7) — not swept, carry forward** |
| 13 | Brookefield | 9 | 18 | Clear my head (6), Eat healthy (4), Move (4), **Play (3) — no supply above floor band** |
| — | MG Road | 10 | 2 | **HALTED — area-boundary blocker, not complete. See Open items** |
| — | Agara | 23 | 0 | **HALTED — Agara Village is inside HSR Layout Sector 1. Merge, do not sweep. See Open items** |
| 14 | Marathahalli | 11 | 20 | **Eat healthy (1)**, Move (3), Clear my head (4) |
| 15 | Sarjapur Road | 12 | 22 | Move (2), Play (5), Clear my head (5), Eat healthy (7) |
| 16 | Electronic City | 13 | 30 | Clear my head (4), Move (5), Eat healthy (5), Play (8) |
| 17 | Basavanagudi | 14 | 27 | **Eat healthy (2)**, Clear my head (4), Play (6), Move (9) |
| 18 | CV Raman Nagar | 15 | 17 | **Clear my head (1)**, **Eat healthy (1)**, Move (3), Play (6) |
| 19 | Rajajinagar | 16 | 20 | Play (4), Move (4), Clear my head (4), Eat healthy (5), **Work out (7) not swept** |
| 20 | Sadashiva Nagar | 16 | 16 | Play (2), Move (3), Eat healthy (3), Clear my head (4) |
| 21 | Bannerghatta | 17 | 22 | Play (3), Clear my head (4), Eat healthy (5), Move (5), **Work out (7) not swept** |
| 22 | Domlur | 18 | 18 | Move (1), Clear my head (2), Play (3), Eat healthy (4) |
| 23 | HAL | 18 | 8 | **Clear my head (0)**, Eat healthy (1), Move (2), Get care (4), Play (5) |
| 25 | Hebbal | 20 | 18 | Move (2), Eat healthy (3), Clear my head (3), Play (4), **Work out (5) not swept** |
| 27 | Bommanahalli | 22 | 24 | Clear my head (1), Move (2), Eat healthy (2), Play (7), **Get care (14) — all preferred**, **Work out (8) not swept** |
| 34 | Vasanth Nagar | 29 | 17 | Get care (12), Work out (6), Eat healthy (4) — **thin: Move, Play, Clear my head all at 1** |
| 33 | Cubbon Park | 28 | 15 | Play (8), Move (6), Work out (6), Get care (4), Eat healthy (1), Find your people (8) — **supply-limited, not sweep-limited** |
| 32 | MG Road | 27 | 18 | **Get care (10) — all preferred**, **Eat healthy (10) — floor**, Move (9), Clear my head (6), Work out (14) and Play (10) already at floor |
| 31 | Rajarajeshwari Nagar | 25 | 38 | Clear my head (7), Eat healthy (8), **Move (10) — floor**, **Get care (16) — CEILING**, **Work out (9) and Play (3) not swept** |
| 30 | Hoodi | 25 | 28 | Move (1), Clear my head (6), Eat healthy (7), **Get care (15) — all preferred**, **Work out (10) and Play (3) not swept** |
| 29 | Kadubeesanahalli | 24 | 20 | Clear my head (1), Move (3), Eat healthy (4), **Get care (12)**, **Work out (5) and Play (6) not swept** |
| 28 | Singasandra | 22 | 27 | Eat healthy (1), Clear my head (2), Move (7), **Get care (12) — all preferred**, **Work out (10) — floor**, **Play (4) not swept** |
| 26 | Kothanur | 21 | 35 | Clear my head (2), Move (2), Eat healthy (6), **Get care (16) — ceiling**, **Work out (10) — floor** |
| 24 | Kalyan Nagar | 19 | 23 | **Clear my head (2) — swept, nothing new**, Play (2), Move (3), Work out (4), Eat healthy (6) |

## Areas remaining (18)

**Blocked pending the central-Bangalore boundary decision:** MG Road (partially swept) · Ashok Nagar · Cubbon Park · Vasanth Nagar

Others: CV Raman Nagar · Rajajinagar · Cubbon Park · Vasanth Nagar · HRBR Layout

**Merges completed in session 26** (ward-confirmed): Agara → HSR Layout · HRBR Layout → Kalyan Nagar · Kudlu → Singasandra

## Open items

- **BLOCKER: resolve central Bangalore's area boundaries before sweeping MG Road, Ashok Nagar, Cubbon Park or Vasanth Nagar.** 124 rows sit within 3 km of MG Road under 15+ labels, four of which are streets inside the MG Road district (Brigade Road, Church Street, St Mark's Road, Nrupathunga Road). Ashok Nagar's centroid is 540 m from MG Road's. Recommended: merge the street labels into MG Road; decide MG Road vs Ashok Nagar as one area or two; then sweep the merged unit once. Full analysis in the Session 10 entry
- **Agreed sweep order (set after session 10):** finish the main batch of established areas first → then tackle the sub-10-row areas → then resolve MG Road and the central cluster last
- **98 of 136 area labels hold fewer than 10 rows, covering 324 rows — roughly a fifth of the file.** Session 0 set the sweep list at 10+ rows, so these are frozen at their current size permanently. Eleven of the fifteen central-Bangalore labels are in this group (Richmond Town 9, Ulsoor 8, Fraser Town 8, Gandhi Nagar 7, Brigade Road 5, St Mark's Road 4, Shivajinagar 4, Church Street 3, Sivanchetti Gardens 2, Nrupathunga Road 2, Victoria Layout 2). Supersedes and broadens the older "35 single-row areas" note. Decide whether to roll these into zones, merge them into neighbours, or sweep them on a lower threshold
- **Daya Labs Centromed (BLR) and Prakash Laboratories sit 17 m apart in Marathahalli**, both 4.9, both labs, different names/phones/place_ids. Filed as distinct — highest-risk pair in the file, verify before publishing
- **Vishwam Ayurveda Clinic (Marathahalli) and Nutrition For Life @ Vishwam Ayurveda (Brookefield) share one building.** Pick one area for both
- **Sequencing cost: earlier sweeps take later areas' supply.** Marathahalli's two best swimming pools went to Brookefield in session 9 and its Move cell is short as a result. Worth a boundary review of AECS Layout in the final pass
- **Corridor-shaped areas need a different centre rule.** Sarjapur Road's coordinate median sits at one end of a 3.4 km corridor; the bounding-box midpoint is correct. One circular 3 km sweep still cannot cover it — Rocks Fitness (4.8, 909) and other genuine Sarjapur Road venues sit beyond the radius at the Carmelaram end. **Amended after CV Raman Nagar: check for single-row outliers before using the bbox midpoint** — one mis-areaed row there would have moved the centre 2 km into open country. Consider a two-point sweep for corridors. **Confirmed again in Electronic City**, where five good candidates sat between 3.00 and 3.20 km and were excluded by the radius rule alone
- **Nutrition practices are the reliable rescue for Eat healthy, but only where there is a professional population.** Sarjapur Road produced three above band; Marathahalli produced none. Budget the nutritionist query everywhere, but expect it to fail in older residential areas
- **Re-match the ~96 no-coordinate rows with punctuation stripped.** BLR-849 "Dr. Divya Kumawat" failed to auto-match "Dr Divya Kumawat Consultant Counseling Psychologist" because of a full stop, and it turned out to be a preferred-band entry (4.8, 464). Others in that backlog are likely findable the same way
- **The Move taxonomy is inconsistent file-wide.** `Running route / trail` and `Park / Lake walking loop` are used for the same kind of venue, sometimes within one area (Basavanagudi has three of each). This inflates the subcategory-diversity metric. Normalise before publishing
- **Sequencing cost, now four instances and blocking.** CV Raman Nagar finished with Clear my head and Eat healthy both at 1 because Indiranagar and HAL hold the supply. Earlier: Basavanagudi's healthy-eating supply is filed under Banashankari and Jayanagar, swept earlier. After Marathahalli's pools going to Brookefield and Sarjapur Road's overlap with Bellandur, this is now a recurring pattern rather than a one-off — worth a boundary review across all adjacent completed-area pairs
- **TODO (agreed, to apply at the end): chain-brand rule.** For recognised chain brands (Amaha, Cult, Apollo, Clove, Physiotattva, Orange Health, Aster, Neuberg, Salad Days, Harvest Salad, Machaxi, Sporthood, Lal PathLabs, Metropolis, Agilus, Lupin, Kaya, Oliva, VCare etc.), admit a branch **irrespective of review count**, subject to two conditions:
  1. **Rating 4.0 or above** (lowered from the normal 4.2 floor for chains only). This admits genuinely new or thinly-reviewed branches while still excluding well-evidenced bad ones — a branch rated 3.8 across 200+ reviews has been judged by plenty of people and the brand name does not override that
  2. **Verified and operational** — an actual check, not an assumption. Neuberg Anand Domlur carries a live listing rated 1.0 whose reviews state the branch does not exist; Max Lab Home Collection (Sadashiva Nagar, Domlur) and Ms. Vaishnavi (Cloudnine HRBR) have no rating at all. A listing existing is not evidence the branch does
  **Admitted under this rule, from candidate sets still on disk:** Neuberg Anand Kathreguppe (5.0/2), Harvest Salad JP Nagar (4.7/14), Aster Labs Kalyan Nagar (4.6/34), Dr Lal PathLabs Bannerghatta (4.7/15), Metropolis Rajajinagar (4.7/14), Agilus Rajajinagar (4.7/48), Apollo Diagnostics Electronic City (4.9/24), VCare Sadashiva Nagar (4.8/18), Amaha HRBR (5.0/1), Tryamp Physiotherapy Rajajinagar (4.9/47), Aster Eye Care (4.4/7), Machaxi Scooled AECS (4.0/268), Cult Sarjapur Swimming (4.1/190), Sporthood Sarjapur Badminton (4.1/32)
  **Still excluded at 4.0:** Cult Bellandur 3.8, Cult.Play JP Nagar 3.8, Sporthood Turfpark Sarjapur 3.9, Agilus Kundalahalli 3.9, Salad Days JP Nagar 3.9, Harvest Salad Banashankari 3.1
  **This list is partial** — only sessions 12 onward retained their candidate sets. Sessions 1–11 rejects were not kept and those areas need re-searching when the rule is applied
- **HRBR Layout is functionally inside Kalyan Nagar.** Four Kalyan Nagar candidates were already filed under HRBR Layout, Cooke Town and Kothanur. Merge HRBR Layout into Kalyan Nagar in the boundary review
- **Work out carry-forward list now five areas:** BTM Layout Play, Rajajinagar Work out, Bannerghatta Work out, Kalyan Nagar Work out, Hebbal Work out
- **Domlur and HAL centres are 1.78 km apart with 86 Indiranagar rows between them.** HAL's Clear my head swept to zero because all nearby supply belongs to adjacent labels. **Evaluate merging Domlur, HAL and the Indiranagar fringe into one unit** — same reasoning as the central cluster
- **The Bannerghatta label conflates a road and a village 11 km apart.** BLR-607 (Butterfly Park Trail) and BLR-1554 (Recovery Lounge, Talaghattapura) are not on the Bannerghatta Road corridor where the other 37 rows sit. Split into a separate label
- **BLR-936 Amaha Mental Health Centre (Whitefield) has no coordinates and matches BLR-896 (JP Nagar) by place_id.** Amaha is a chain — BLR-936 is likely a real Whitefield branch needing its own place_id, not a merge. Verify before deduplicating
- **Review-count floor excludes genuinely good small amenities.** Arekere Lake Park (4.4, 1.2 km track, 700 m from the Bannerghatta centre) fails on 12 reviews. Consider a carve-out for public parks, where review counts run low regardless of quality. **Second instance: Amruthalli Lake Walking Park (4.0, 109 reviews, 1.3 km paved loop with open gym and toilets) misses on rating.** If the chain rule's 4.0 threshold were extended to public parks, both would qualify
- **BLR-923 Chakshu Foundation is a confirmed duplicate of BLR-825** — same place_id, BLR-825 already has coordinates. Delete BLR-923
- **Sankey Tank is filed twice under two area labels** — BLR-156 (Malleshwaram) and BLR-312 (Sadashiva Nagar). Pick one
- **Rajajinagar Work out sits at 7 and was not swept** — carry forward
- **BLR-1233 Trendz Combat Arena is mis-areaed** — filed as CV Raman Nagar but located in Ramamurthy Nagar, 4.5 km north. Re-area it
- **Check the rest of the file for street-names-as-areas.** The session 0 standardisation caught block/stage/phase suffixes and spelling variants but not this class. Central Bangalore is unlikely to be the only place it occurs

- **BTM Layout Play was skipped for query budget, not closed on evidence.** Sits at 7, needs 3. Sweep it before the programme closes
- **Move is structurally short across east Bangalore.** Bellandur and Brookefield both returned near-zero Move supply above the floor band, with reviewer complaints about sewage and maintenance rather than absence of parks. Expect the same in Marathahalli, Hoodi, Kadubeesanahalli and Bellandur-adjacent areas; report rather than re-search
- **Revisit Jakkur at the end of the programme.** Three cells fell back below the floor of 10 when the six mis-areaed rows were reassigned out in Session 2 — Work out 12 → 10, Play 12 → 10, Eat healthy 4 → 2. Jakkur currently stands at Work out 10, Play 10, Eat healthy 2, Get care 12, Clear my head 2, Move 3. Eat healthy, Clear my head and Move were already supply-capped and may not improve; Work out and Play are worth a second sweep
- **Wrong coordinates on BLR-684** (Manipal Hospital EPIP Whitefield) — identical to BLR-682 (Varthur Road). Two different branches, one wrong pin
- **Deferred to the end: legacy same-name / same-area duplicates.** Not to be resolved mid-sweep. Known case: `healing hub` (BLR-527 / BLR-937, both Whitefield). Run a full pass over all 57 name families once sweeping is complete, distinguishing genuine branches from source-data duplicates
- **Different-name / same-site pairs beyond 50 m** are not caught by any rule. Fourteen instances so far, none caught by a rule. Largest is Madiwala Lake with **three** listings inside 114 m plus a fourth 810 m away on the far shore. Others: Yediyur Lake Park vs entrance gate (250 m, seen twice), JP Nagar 1st Phase Park vs Sri SK Nataraj Park (54 m), Sankey Tank vs Sankey Tank Park (176 m), Prakash Courts vs Padukone School of Badminton (52 m). All caught by eye. **Keep a suppression list of manually-excluded place_ids** so a prose note in this changelog is not the only defence. Needs a name-similarity-plus-distance rule in the final dedup pass, not a wider radius
- **BLR-610 / BLR-1563** (Puttenahalli Lake, JP Nagar) — same lake, two listings, 420 m apart, same intent. Legacy. Final dedup pass
- **BLR-738 / BLR-1113** (Machaxi JP Nagar and Sporthood @ Cult) — 2 m apart, different intents, so rule 3 does not fire. Decide whether the session 0 same-pin-different-intent convention covers this
- **Rule 3 needs a second condition — and a phone-number check.** Derma Solutions and Dr Sandeep Mahapatra (session 11) were the same business under two listings 3 m apart, detectable only because they **share a phone number**. Matching on phone would have caught it cleanly while leaving genuine neighbours alone. Seven confirmed false positives across sessions 7, 8 and 9, at 0.5 m to 43 m, including three distinct counselling practices within 30 m in one AECS Layout block. Distance alone cannot separate distinct tenants of one building — gate the rule on matching subcategory or high name similarity before the final dedup pass
- **`rg` is split within areas across at least four areas** — Sarjapur Road (East/South East/South), plus — Banashankari (South/West), Malleshwaram (Central/West), Bellandur (East/Central/South). Treat as file-wide, not per-area
- Geocode the remaining rows missing lat/lon
- 86 rows carry legacy "Possible duplicate of BLR-xxx" notes from earlier passes — stale after Session 0 dedup, safe to clear
- Confirm the Play retail row's intent — and decide alongside it whether organic grocery and health-food retail belongs under Buy gear, since JP Nagar surfaced four such listings above the floor band with nowhere to file them

### New open items from session 21

- **Relabel BLR-1405 and BLR-1496 from Kothanur to Kasturi Nagar.** Both sit ~7 km south of every other
  Kothanur row. BLR-1405 is additionally a confirmed Kalyan Nagar duplicate (session 19) and may simply be
  deletable
- **Verify Ovum Clinic & Fertility Centre (ChIJedMK8f4ZrjsRQ0BWwLR0TP0) against Ovum Hospitals
  (ChIJ_eDTEfwZrjsRQoVJfaL1r4c).** Shared phone number, 120 m apart, same brand. Add to the different-name/
  same-site list — this makes seventeen
- **Ayurveda/Panchakarma has no subcategory.** Four above-band candidates are held in `wm/kn.json`. Decide
  whether these are `Unconventional therapy` (alttherapy, currently under Clear my head) or `New-age health
  center` (newage, currently under Reset), then sweep Reset by zone. This will recur in every area — Ayurveda
  density in Bangalore is high and no sweep so far has had a place to put it
- **Revisit the five carry-forward Work out cells.** Kothanur cleared the floor from a carry-forward position,
  which is evidence the deferral was a budget decision rather than a supply one

### New open items from session 22

- **Relabel BLR-774 → Electronic City, BLR-694 → Electronic City, BLR-999 → Kudlu.** All three are
  mis-areaed by 2.5–6 km and were excluded from this session's centre calculations
- **Merge Kudlu into Singasandra** (boundary review). All 4 Kudlu rows sit inside Singasandra's radius and
  all 4 returned as duplicates — the HRBR Layout case exactly
- **Amend rule 3: restrict nearest-centre allocation to swept areas.** Applied against all labels with 3+
  rows it let a 4-row label claim 21 candidates from a live sweep
- **Verify Bande Park (ChIJP2w0PtEUrjsR3Hnt4ok8g80) against Stone Park (ChIJKSZmWmIVrjsRvMtEXX23EO0)** —
  20 m apart, same described park. Filed Bande Park only
- **The park threshold needs a decision, not another flag.** Five parks are now excluded on rating alone,
  including one at 4.1 on **3,484 reviews**. Either extend the chain rule's 4.0 floor to public parks or
  accept that the map will show no walking loop in several dense residential areas

### New open items from session 23

- **Merge Agara into HSR Layout.** Addresses state it: "Agara Village, 1st Sector, HSR Layout". Move the 8
  core rows to HSR Layout; **do not sweep Agara as an area.** Then re-check HSR Layout's cells, which may
  gain rows and shift its diversity ratios
- **Relabel the five mis-areaed Agara rows**: BLR-1258 → Bellandur; BLR-1260, BLR-1265, BLR-1267 →
  Sarjapur Road; BLR-1271 → HSR Layout
- **Verify BLR-159 The Courtside Agara against BLR-784 7Padel | The Courtside HSR** — 65 m apart, shared
  brand, near-certain same venue. BLR-591 and BLR-1257 sit at the same address but are likely distinct operators
- **Adopt the overlap thresholds as a pre-sweep gate**, not guidance: <40 swept rows in radius → sweep;
  40–100 → sweep with reduced expectations; >100 → expect geometry-bound cells; **>140 with a swept centre
  inside 1.5 km → probe before committing, and expect to merge**

### New open items from session 24

- **Verify Dr Swarna's Skin & Hair Clinic (Muniraju Complex) against Dr Swarna's Skin Hair & Laser Clinic
  (above Maya Hospital)** — 0.5 km apart on Panathur Main Road, same practitioner, both 4.7. Only the first
  was filed; the second fails on review count. Twentieth same-site/same-brand case
- **Dr Roma Smile Dentistry (5.0/59) was excluded by the diversity cap, not by quality.** Kadubeesanahalli
  Get care is dental-heavy because the supply genuinely is. If the cap is ever revisited, this is the test case
- **Young-amenity lakes.** Bhoganahalli Lake (4.0/57) and Devarabeesanahalli Lake (4.2/10) are recently
  rehabilitated with visible works and low review counts. Distinct from the park-versus-floor problem: these
  are not poorly maintained, they are new. Consider whether the review-count floor should flex for amenities
  with recent rejuvenation
- **Play and Work out carried forward** — carry-forward list now nine cells

### New open items from session 25

- **THE PARK THRESHOLD NOW NEEDS A DECISION.** Eight usable neighbourhood parks are excluded on rating alone
  across six areas: Arekere (4.4/12), Amruthalli (4.0/109), Kothanur Park (4.1/163), Hongasandra (4.1/244),
  **Virata Nagara (4.1/3,484)**, Sonu's Running Track (4.1/174), Seetharampalya Lake (4.0/338), Devasandra
  Lake Park (4.1/674). **Hoodi's Move cell finished at 1 of 10 purely because of this.** Either extend the
  chain rule's 4.0 floor to public parks, or accept that several dense areas will show no walking loop
- **Relabel BLR-1352 → CV Raman Nagar** (2.25 km from CVRN centre, 2.91 km from Hoodi)
- **Verify Sadaramangala Lake Entrance against Sadarmangala Lake Park** — identical coordinates, two listings,
  197 and 89 reviews. Filed one. Also **Medicover Hospitals / Medicover Women and Children** and
  **Atreum Speciality / Atreum Bloom** — same-campus pairs, both filed as distinct services deliberately
- **Hoodi Eat healthy: Art Of Curing (5.0/40) excluded by the 60% cap**, not by quality. Second consecutive
  session where the cap set the outcome — worth reviewing alongside Dr Roma Smile Dentistry from session 24

### New open items from session 26

- **Electronic City scope decision.** 45 of its 48 geocoded rows are outside the GBA boundary, along with 20
  others (Sarjapur Road 4, Yelahanka 2, Kannuru 2, Whitefield 2, and singles). Either extend the published
  map beyond the GBA outline, or mark these rows out-of-scope. **They are currently `map_eligible='yes'`**
- **MG Road is unblocked and is the largest remaining gap** (64 rows, core 41, gap 19). Cubbon Park (gap 50)
  and Vasanth Nagar (gap 52) are also unblocked now
- **Hagaduru ward polygon is invalid** in the source OSM data — harmless here (no rows fall in it) but it will
  break a naive render. Buffer(0) it before drawing
- **The ward mis-area report (`misarea_report.csv`, 136 rows) is unapplied.** Worth a pass to separate genuine
  errors from border blur, but it should not be applied in bulk

### New open items from session 27

- **Cubbon Park and Vasanth Nagar have 4 candidates already held for them** (in `mg_triage.csv`, status
  HOLD-*). Do not re-search for these; they are ready to file
- **"MG Road" now spans seven wards** because six neighbouring wards have only sub-10-row labels. Defensible
  under rule 3, but if Ulsoor, Shivajinagar, Richmond Town or Fraser Town are ever swept as areas, these rows
  need re-allocating. The `ward` column makes that a query rather than a re-sweep
- **Expect a high duplicate rate at Cubbon Park** — same merged-label effect that produced 28% here
- **Ayurveda subcategory now blocks five candidates** (four Kothanur, one MG Road). Cheapest unresolved decision
  in the backlog
- Verify **Q Medical Center vs Best Multispeciality** (case 24) and **Halasuru Kere vs Halasuru Lake** (case 25)

### New open items from session 28

- **DECIDE THE DIVERSITY-CAP DENOMINATOR.** The 60% cap has always been applied against the cell *ceiling*
  (60% of 10 = 6 allowed), not the realised row count. In thin areas this lets a cell finish at 83% one
  subcategory (Cubbon Park Work out: 5 gyms of 6). Either is defensible; it should be stated explicitly because
  it will recur in every under-floor cell
- **Community/group listings need a lower review floor.** Road to Trail Club (5.0/17) and Stride Run Club
  (5.0/13) are real, active Cubbon Park run clubs excluded purely on review count, in the one area where
  Find your people is the largest cell. Run clubs do not accumulate Google reviews the way businesses do
- **Sweeps are not exhaustive — neighbours will find what you missed.** Dental Lavelle (5.0/688) was missed by
  the MG Road sweep and caught by the Cubbon Park probe. Worth a cheap end-of-programme pass that re-runs the
  ward assignment over all rows and looks for above-band gaps, rather than trusting each sweep as complete
- **Vasanth Nagar now has 2 candidates held for it** (The Happiness Theory from MG Road, NAMMAxFit Vasanth
  Nagar from here). File before searching

### New open items from session 29

- **THE MAIN BATCH IS DONE. The next decisions are about shape, not coverage.** 69% of swept combos pass the
  ≥5 test; the 31% that fail are concentrated in **Clear my head (41% pass) and Move (47% pass)**
- **The park review floor is now the single highest-leverage open decision.** It is the main cause of Move
  failing in 18 of 34 swept areas. Eight usable parks sit excluded on rating alone
- **HAL is the weakest swept area** (21 core rows, the only empty cell in the file: Clear my head = 0).
  Worth a targeted re-sweep rather than leaving as-is
- **North corporation is the thinnest** at 1.4 pins/km² against a 2.6 city average. If the map expands,
  expand north
- **128 of 369 wards are empty.** The map reads as dense islands, not a surface. That is fine for a
  destination map, wrong for a "what's near me" map — **worth deciding which product this is**
- **Cross-area top-ups are structural.** Three consecutive sessions found above-band rows belonging to an
  already-swept neighbour. A cheap end-of-programme pass should re-run ward assignment over all rows and hunt
  for these systematically

### New open items from session 30

- **RE-DERIVE THE OWNING WARD FOR THE REMAINING 13 BATCH AREAS.** The modal-ward method that put Kengeri on
  Mylasandra will have mis-assigned others. Use the name-matching ward, and allow multi-ward ownership where
  the wards share a postal identity
- **Kundalahalli should be treated as reclaim-only** — 23 rows, no further sweep. Its supply is Brookefield's
- **Two more parks lost to the review floor** (Kundalahalli Lake 4.0/408, BEML Layout Park 4.1/733). That is
  **ten now across eight areas.** The park threshold remains the single highest-leverage unmade decision

---

## Session 40 — Recategorisation to the nine public categories + Plum Perks fold-in

**Ask:** replace the eleven-intent model with nine user-facing categories, fold the Plum Perks
partner list in, and add an Events-this-week slot set.

**Files written:** `healthmap_v8_recategorised.csv` (master, 45 cols), `plum_perks.csv`,
`categories.csv`, `events_this_week.csv`.

### Category map applied

| v7 intent | v8 category | Notes |
|---|---|---|
| Move | **Move** | 1:1 |
| Play | **Play** | 1:1, less the one misfiled retail row |
| Work out | **Work out** | 1:1 |
| Eat healthy | **Eat healthy** | 1:1 |
| Clear my head | **Mental health** | renamed |
| Get care | **Check your health** | renamed — see scope decision below |
| Buy gear | **Buy gear** | 1:1 |
| Find your people | **Communities** | renamed |
| Play → `Sports / fitness retail` (1) | **Buy gear** | the misfile flagged in the v7 README, now fixed |
| Reset → `New-age health center` (30) | **Check your health** | matches how the perks sheet files the same businesses |
| Reset → `Relaxation space` (6) | **Mental health** | |
| Reset → `Recovery / Contrast therapy` (1) | **Work out** | training recovery, not head-clearing |
| Fix my wearable → `Wearable service center` (30) | **Buy gear** | gear support sits with gear |
| Indulge (66) | **parked** | `map_eligible=no`, `category="Parked (Indulge)"` |

`intent` is preserved as `intent_v7`. Nothing was deleted — the Indulge rows are one flag flip
from coming back.

### Three judgement calls that were mine, not yours

1. **`Check your health` kept all 629 rows.** Your brief said "diagnostic centers, with health
   checkups". Diagnostic labs are 114 of 629. The rest is dental (181), physio (97), specialty
   clinics (116), hospitals (68), eye (31), multispeciality (13), pharmacy (10), new-age (30).
   Narrowing to the brief would have dropped ~500 rows from the best-covered category on the map
   (45 of 47 areas). Kept whole. Reversible in one line if you want the narrow version.
2. **Indulge parked rather than deleted.** 66 rows of indulgent food and thindi trails with no
   home in the nine.
3. **Reset (37) split three ways** as per the table above rather than parked.

### Perk branch sweep

Ten perk brands have multiple visitable Bengaluru addresses. Branch coordinates and Google Maps
links pulled from Places, capped at 10 branches per brand:

Apollo Pharmacy · Clove Dental · Sabka Dentist · Vijaya Diagnostic Centre · Cloudnine ·
QI Spine Clinic · The Wellness Co. · Amaha Health · HealthKart · The Sleep Company

**66 branch rows resolved: 50 appended as new (`BLR-2567`–`BLR-2616`), 16 merged into rows
already on the map.** All 67 perk rows carry `perk_partner=yes`, `perk_id`, `perk_offer_url`,
`branch_of`.

The remaining **93 partners have no visitable address** — D2C, apps, at-home services, dark
stores. They are in `plum_perks.csv` as the tenth category, each tagged with the map category it
supports so a protein brand can surface inside Eat healthy without a pin.

### Errors caught and corrected in-session

- **Dedupe radius was too wide at 250 m.** It collapsed Cloudnine Jayanagar 3rd Block and
  Cloudnine Jayanagar Aurobindo Marg — two genuine branches ~200 m apart — into one row.
  Tightened to 120 m, which separates them correctly. Worth remembering for the open same-site
  work: in dense areas 250 m is not a safe same-site radius.
- **Display names came out malformed** on the first pass — "Clove Dental — Clinic JP Nagar
  Phase 4", "Amaha Health — Amaha Mental Health Centre Indiranagar". Stripping the brand token
  alone leaves the chain's stock noun. Added a noise-word strip.
- **HealthKart was split across two categories.** v7 had the two existing rows in Buy gear; the
  six new branches landed in Eat healthy. Pulled all eight to Eat healthy / `Health food store`.

### Ward and corporation NOT assigned on new rows

The 50 new rows have `ward`, `corporation` and `rg` blank and carry
`needs_geo_check=ward|corporation|area`. The OSM polygons are not in this environment, and the
locked rule is that ward ownership proposes but distance disposes — guessing from the address
string is exactly what the rule forbids. `a` holds the Places sub-locality as a placeholder.
**Next session with the polygons should run the distance test over these 50.**

### Things the brief asked for that the data cannot yet support

- **cult.fit is not in the Plum Perks sheet.** 24 Cult rows are on the map and ready to badge,
  but there is no perk id or offer URL to attach. Left blank rather than invented.
- **Decathlon is not in the Plum Perks sheet either.** 4 rows on the map, cannot be badged.
- **Tagda Raho is a partner (PLUM-058)** but the sheet files it under `Specialty (men's health)`,
  not sports retail. It is not gear. Not moved to Buy gear pending confirmation.
- **Farmers markets: zero rows.** No such subcategory exists in v7. Eat healthy cannot claim them
  until a sweep adds them.
- **Playo links are brand-level only.** Per-venue deep links need a venue-ID map.

### Coverage after the change (live rows only)

| Category | Live | Off-map |
|---|---|---|
| Check your health | 629 | 0 |
| Work out | 493 | 0 |
| Play | 336 | 1 |
| Move | 241 | 4 |
| Eat healthy | 230 | 1 |
| Mental health | 158 | **59** |
| Buy gear | 88 | 0 |
| Communities | **7** | **50** |
| Plum Perks | 93 cards | — |
| Parked (Indulge) | 0 | 66 |

**Communities is the finding of this session.** 50 of its 57 rows have no coordinates, because
run clubs and cycling groups meet at a different spot each week — they were never pin-shaped.
As a pin category it is 7 rows and should not ship that way. Recommend it renders as cards like
Plum Perks, with an optional pin only where a fixed meeting point exists.

Mental health loses 59 of 217 to the same problem. **90 of the map's 93 coordinate-less rows sit
in these two categories — 45 each.** The coordinate backlog is not a background item any more;
it is concentrated almost entirely in the two categories the brief leans hardest on. Clearing it
is worth more to this launch than any further sweeping.

(The other 28 off-map rows in these two categories have coordinates but were excluded earlier for
other reasons — worth a look, since some may simply be re-admittable.)

---

## Session 41 — Cult perk tag + in-app CTA lines

**Cult.fit confirmed as a Plum Perks partner.** 36 rows match the substring "cult":

- **25 tagged `perk_partner=yes`** — cult.fit gyms, Cult-network gyms (Royal Fitness, B3 Wellness,
  Club Fit), Pilates Circle by Cult
- **9 tagged `perk_partner=verify`** — Cult-*group* sub-brands, not cult.fit gyms: eat.fit (BLR-014),
  five Fitso venues, Cult Whitefield Swimming (Sportfit), Sporthood @ Cult, SwimLife (Cult.Play).
  Different products; confirm the perk covers them before they badge
- **2 left alone as false substring matches** — Krishna Wellness Yoga & **Cult**ural Centre
  (BLR-225), **Fysiocult** Physiotherapy (BLR-1771)

Cult is not in the partners sheet, so these rows carry the placeholder `perk_id=PLUM-CULT`.
Replace it when Cult is added.

**`plum-perks` added to `tg`** on all 101 perk-tagged rows, so the layer is filterable.

### App CTA lines

New columns `plum_cta` and `plum_cta_url`; the line is also appended to `d` as asked.
One line per row — the first matching rule wins, so nothing double-stamps.

| Rule | Line | Rows |
|---|---|---|
| `category = Mental health` | Need to talk? Book a consultation here. | 217 |
| `s = Diagnostic lab` | Check Plum for discounted rates on your health checkup. | 114 |
| perk-tagged, neither of the above | A Plum Perks partner — see your offer in the Plum app. | 93 |

All carry `https://www.plumhq.com/app`. **424 of 2,363 rows now carry a Plum CTA.**

### Two things to decide

1. **109 listings now have the CTA as their *entire* description** — they had no `d` text to begin
   with. 50 of them are live. 64 are therapy rows, which is the worst place for it: a therapy pin
   whose only copy is a Plum ad reads as an ad, not a recommendation. Either write descriptions for
   those 109 or suppress the CTA where `d` is empty.
2. **"Diagnostics" was scoped to the `Diagnostic lab` subcategory only** (114 rows). Hospitals (68),
   new-age health centres (30) and pharmacies (10) also sell checkups. Widen if you want them.

The perks-partner wording is mine — you specified copy for the other two, not this one. Worth a read.

---

## Session 42 — Enrichment of the clear_my_mind cohort

**Every live Mental health row now has coordinates and a real description.**

| | Before | After |
|---|---|---|
| Live pins | 158 | **214** |
| Rows with no coordinates | 45 | **0** |
| Rows whose only copy was the Plum CTA | 64 | **0** |

56 of the 59 rows resolved against Google Places on name + address. Each got coordinates, a
full address, a Maps link keyed to `place_id`, rating, review count, published hours, and a
written description. `v` moved from `Needs check` to `Verified`; `src` now reads
`Uploaded list (clear_my_mind___reset.xlsx), Google Places (s42)`.

Five more — the Amaha branch rows created in s40 — were given descriptions from the Places
data already pulled for them.

### Descriptions are written, not fetched

Places has no description field. Each line was composed from what the lookup actually returned:
the practice name, its Places type, published hours, and themes consistent across its reviews.
No clinical claim, specialism, or credential was asserted that the source did not state.
**These are the most sensitive descriptions on the map and should get a human read before
launch** — particularly the ~10 rows where the honest description is that the practice is very
thinly reviewed.

Where reviews were genuinely mixed the description says so rather than smoothing it over
(BLR-869 at 4.4, BLR-888 at 3.9, BLR-940 on cost and medication, BLR-942 at 4.2). A map that
only ever says nice things is not useful in this category.

### Two duplicates retired

`BLR-896` and `BLR-905` are the same sites as `BLR-2599` (Amaha JP Nagar) and `BLR-2601`
(Amaha Koramangala), created in s40. Set `map_eligible=no` with `dup_flag`.

**Cause — a second dedupe failure in s40, distinct from the Cloudnine radius bug.** The brand
check tested whether the normalised brand string was a substring of the row name.
`amahahealth` is not a substring of `amahamentalhealthcentre`, so the match never fired even
though both rows had coordinates 20 m apart. Substring matching on a brand token fails whenever
the chain's local name interpolates words. Any future branch sweep should dedupe on
**coordinate proximity first**, and use the name only to break ties.

That is two dedupe defects in one session's work. The 29 logged same-site cases are likely
under-counted for the same reasons.

### One row deliberately left without coordinates

`BLR-919` Spandana Hospital Rehabilitation Center. Places returned only a street-address
premise at a different door number — 2, 29th Main Rd against the sheet's 558, 26th Main Rd —
with no rating and no establishment record. Not a confident match, so nothing was written.
Flagged for manual verification.

### What this leaves

**Communities is now the only category with a coordinate problem** — 45 of the map's remaining
49 blank-coordinate rows. As logged in s41, that is not a data gap to fill; run clubs have no
fixed address. It needs a card treatment, not a geocoding pass.

## Playo sweep — batches 4–8 (2026-09-16)

81 venues added, `BLR-2672`–`BLR-2753` (82 supplied, 1 cut). Play is now
**473 rows / 472 pinned** against the 500 cap — **27 slots left**. Map total 2686.

All 81 carry a resolved Google `place_id` and the `playo` tag, so the place card
generates the booking CTA in the Offer row.

Applied on append:
- Stripped the Markdown booking line from all 81 descriptions. The place card
  escapes its prose, so `[Playo](https://playo.co)` rendered as literal text.
  `playo-sweep-handoff-prompt.md` now tells the sweep chat not to write it.
- Cut `BLR-2716` JK's Arena: 14 Google reviews, below the ≥20 threshold.
- Left the 10 compound `rg` values (`South East`, `North East`) as supplied —
  `RG_ALIAS` in `ingest-entries.mjs` folds them onto the right corporation, and
  every one resolves to the corporation the sheet already uses for that area.

Two new area labels: **Hoskote** (1 pin) and **Bidarahalli** (2 pins).
Two rows auto-flagged `out=1` (day trips): `BLR-2720` Anchepalaya,
`BLR-2723` Atya Sports.

Open, needs an editorial call:
- `BLR-2687` Sportfit ECC sits **2 m** from `BLR-1073` Cult Whitefield Swimming
  — same building, different Google listings, different categories
  (Play/multisport vs Move/swim, and BLR-1073 carries `PLUM-CULT`). Both kept.
- Safety flags carried in `notes`, not in the public description:
  `BLR-2689` uneven matting (ankle twist), `BLR-2684` concrete pitch edge,
  `BLR-2748` roof leak causing a slip, `BLR-2715` a coach pulling ears.

## Routes expansion + two removals (2026-09-16)

**Removed on child-safety grounds**, per the sweep rule "exclude outright for
anything involving a child-safety complaint":
`BLR-2620` Smash Point Badminton Academy, `BLR-2715` CricLife Academy.
Play is now 471 rows / 470 pinned — 29 slots left against the 500 cap.

**Routes.** `sources/routes/running-routes.csv` replaced with the 88-row
`routes.csv` (was 64). It is a strict superset: the 64 existing rows plus 15 new
lake and park loops and 9 cycling / athletics-track routes. Move goes
245 → **287 rows, 284 pinned**; route-bearing entries 68 → **104**
(90 run, 13 cycle, 1 track).

Three things had to be resolved before ingesting:

1. **Seven master_id collisions.** `RT-082`–`RT-088` claimed `BLR-2567`–`BLR-2573`,
   which the sheet has since reassigned to seven Apollo Pharmacy branches.
   Ingesting as supplied would have overwritten all seven pharmacy records with
   lakes and parks. Resolved as: `RT-085` → `BLR-608` (Turahalli Forest, already
   in the sheet), `RT-088` → `BLR-1675` (Kadugodi Tree Park, already in the
   sheet), and the remaining five (`RT-082` Saul Kere, `RT-083` Begur Lake View
   Park, `RT-084` Vijaya Bank Layout Main Park, `RT-086` Dore Kere Lake,
   `RT-087` BDA Sculpture Park) left with a blank `master_id` so they take their
   own `RT-*` id. **Those five should get real BLR ids in the sheet.**
2. **`RT-036` dropped** as a duplicate of `RT-085` — same forest, same activity,
   no rating and a desk-research point. `RT-085` carries the Places-verified
   point, 4.3/10 200, the ₹10 entry and the gate time.
3. **`ingest-running-routes.mjs` hard-coded `g: 'run'`** for every row, which
   would have relabelled eight cycling routes (including the 42 km NICE Road
   loop and the Turahalli MTB trails) and one athletics track as running routes.
   It now reads the `route_type` column — `cycle` → `cycle` / "Cycling route" /
   mode `Cycle`, `track` → `track`, everything else `run` — and carries that
   through the tags, the route feature and the snap queue, so a cycling route is
   no longer snapped on a walking profile.

24 of the new rows have no GeoJSON line, so they are pin-only; the snap queue is
now 14. Run `node scripts/snap-routes.mjs sources/routes/snap-queue.csv` to trace
them.

Noted, not fixed: the `ingest-entries.mjs` log line "N Move/stadium rows remapped
to track" actually counts every `g` alias applied (mostly `act_*`), not stadium
rows. The label is wrong; the data is fine.

## Playo chip and pin swap; snap run (2026-09-16)

**Playo now has its own label.** `hasPerkCallout()` treated a Playo venue and a
Plum Perks partner as the same thing, so 149 Playo venues wore the red
"Plum Perks" chip — a partnership claim the data does not make. Split into
`calloutTag()`: partners keep the red chip, Playo venues get a blue **Playo**
one. Blue because the Play verb chip beside it is green. The perks-only toggle
still includes Playo venues; the Offer row is unchanged.

**Playo pins alternate like partner pins.** A new `playo-mark` layer cross-fades
Playo's roundel — the O from the wordmark, tennis-ball seams and all — over the
venue's category glyph, on the same 1.4 s beat as the partner gift. Unlike a
partner pin, a Playo pin keeps its category colour: only the glyph swaps.
`redPinImage` is now `recolourPin({ ink, glyph, inkBox })`, and repainting in the
pin's *own* colour is what erases the category glyph so the roundel lands clean.
Both overlays run off one timer — two intervals drift apart inside a minute, and
half the map mid-fade against the other half reads as noise. Partners take
precedence: a pin is never red for Plum and swapping for Playo.

**Snap run.** 8 of 11 queued routes traced; 3 hit Overpass 504s and kept their
straight-line estimate (`RT-084`, `RT-087`, `BLR-1675`) — transient, worth a retry.

Then **11 traces were reverted**, because `osrm:foot-around-water` is broken: of
its 7 traces with a known distance, all 7 came back 2.7× to 5.6× too long. It
routes the surrounding road network rather than the lakeside path — Chelekere's
1.2 km loop traced as 5.46 km, Begur's 4 km as 11.73 km. The published `km` was
never wrong (the script prefers the stated distance) but the drawn line was, so
each is back to an endpoint estimate. **4 of the 11 predate this session**
(`BLR-1194`, `BLR-2542`, `BLR-2556`, `BLR-2558`, `BLR-2557`, `RT-057`).
`overpass:footways-stitched` and plain `osrm:foot` are unaffected and were kept.
Previous geometry saved off-repo if it needs restoring.

## Machaxi tagging, routes on RT ids, lake snapping (2026-09-16, later)

**All 26 Machaxi entries now carry `playo`** (was 7). Matched against Playo's own
1,348-venue Bengaluru list by name and coordinates, not by brand name — 15 of the
19 additions sit within 40 m of their Playo record. `BLR-1054` is listed on Playo
as "PYKLN Sports", 32 m away, rather than under a Machaxi name.

The gap was systematic, not a few missed rows: the sweep's job was to find venues
we did *not* have, so anything already in the database was dropped from the
shortlist as a duplicate and never tagged. **~305 existing entries match Playo's
list**; that set needs grading before any blanket tag, since it includes clinics
and a Decathlon store that are near a court but not bookable.

**Routes own their ids.** All 96 are `RT-001`–`RT-096` with no `master_id`. The
supplied file arrived with **15 collisions** — routes claiming ids the sheet had
given to Apollo Pharmacy and Clove Dental branches — the same defect as the
previous batch, extended. Unbinding removes the class of failure rather than
patching it per batch. Entries 2,539 → 2,610; routes and parks now layer over each
other by design.

**`ingest-running-routes.mjs` now derives `out`** from the gazetted box. It only
ever inherited the flag, so once routes stopped borrowing a master entry's, RT-035
(Bannerghatta, south of the box) lost it and the page's validator rejected the row
**at render time** — a 200 with an empty body, which the build does not catch.

**Lake snapping, second pass.** `ringFrom` is now `ringFromSegments`: it seeds a
ring from every path near the gate rather than from the longest segment in range.
All five earlier refusals had found a real ring 311–422 m from the gate they were
meant to start at, and `touchesStart` correctly threw each away. The plausibility
floor also dropped from 0.8 km to 0.12 km — 0.8 was arbitrary and longer than
plenty of real loops, though it fixed none of those five on its own.

Traced: `RT-089` Ullal Lake 1.68 km, `RT-091` Dollars Colony 0.81 km, `RT-096`
Kempambudhi Kere 1.44 km, `RT-088` Kadugodi Tree Park 1.18 km (stated 1.1 km).
Six keep placeholders. Where there is no stated distance there is nothing to check
a guess against — the best-scoring candidate for `RT-010`'s 200 m football ground
was a 3.6 km ring of the surrounding streets, so the selector publishes only rings
that hug the gate (≤60 m) and close cleanly (≤40 m).
