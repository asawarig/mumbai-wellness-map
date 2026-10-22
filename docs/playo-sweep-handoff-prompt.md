# Handoff — resolve 164 Playo venues against Google Places

Paste everything below into the chat that has `places_search`. Attach
`playo-shortlist-164.csv` with it.

---

## What this is

I'm adding sports venues to the **Bengaluru Wellness Map** (Plum marketing
project). The discovery work is already done — you are not searching for venues,
you are **resolving ones I've already picked**.

The attached `playo-shortlist-164.csv` has 164 venues pulled from Playo's own
API, already deduplicated against the live map by coordinate proximity (150m),
so none of them are on the map yet. Each row has: name, area, full street
address, real lat/lon, the sports offered, Playo's rating and review count, and
the Playo listing URL.

Two columns are deliberately blank and are your job: **`place_id`** and
**`description`**.

## Read this first — the ratings in the file are not Google's

The shortlist is filtered on **Playo's** ratings (>4.0, ≥20 reviews). I checked
118 venues that appear in both Playo's data and our map, where we already hold a
Google rating. They do not agree:

- only 9 of 118 match within 0.05
- mean difference 0.45 stars
- median review counts: **230 on Google vs 38 on Playo**
- e.g. Tennis Temple is 4.7 (536 reviews) on Google, 4.03 (38) on Playo

Playo rates from its own bookers. So:

1. Resolve each venue against Google Places and take **Google's** rating and
   review count.
2. **Re-rank on Google's numbers and drop anything at 4.0 or below**, or with
   fewer than 20 Google reviews. This threshold is absolute — do not include a
   venue below it "for my call". Batch 6 sent one at 14 reviews and it was cut.
3. Tell me how many fell out. I have 80 more eligible venues in reserve and can
   send a second batch to refill.

## The job, per row

1. `places_search` for the venue using its **name + area + address** from the
   CSV. The coordinates are accurate — use them as location bias and to confirm
   you have matched the right place, not a similarly-named one elsewhere.
2. Resolve the **`place_id`**. **Hard gate: no row ships without one.** If
   Places cannot find it, drop the row and say so. No placeholder links.
3. Pull from the Places result: rating, review count, opening hours, price
   level, website.
4. **Read the reviews properly.** That is where the description comes from, and
   it is the whole value of this pass.
5. Write the description.

## Quality filtering

**Exclude outright** for: hygiene failures, safety hazards (torn court mats,
holes in flooring, exposed metal, unsafe run-off, green pool water), refund
fraud or unresolved payment disputes, staff misconduct, anything involving a
child-safety complaint.

**Include with a written caveat** when the issue is annoyance rather than harm:
weak ventilation, AC failures, dim lighting, no parking, double-booking through
apps, front-desk rudeness. Put the caveat in the description in plain language —
"confirm your slot directly", "check the lights are working before an evening
game".

## Description house style

2–3 sentences. Lead with what is distinctive and specific, pulled from reviews:
unusual facilities, who it actually suits, what the trade-off is. End with the
caveat if there is one. No marketing language, no exclamation marks, no
"nestled", no "hidden gem".

Good: "Three-court football and cricket turf, open 24 hours at ₹1300 an hour.
Floodlights are strong enough for late games but the surface gets slick after
rain."

Bad: "A fantastic all-in-one sports destination offering something for everyone!"

**Do NOT add a booking line.** Earlier batches ended every description with
"Book on [Playo](https://playo.co) or see your offer in the Plum app." — the
place card escapes its prose and does not parse Markdown, so that rendered as
literal bracket-and-parenthesis text on every card. The map now generates the
booking CTA itself, as a linked Offer row, for any row tagged `playo`. Just tag
it and stop the description at the last real detail.

**No Markdown anywhere in `d`.** No links, no bold, no italics. Plain prose only.

## Output — return one CSV, these 47 columns in this exact order

```
category,intent_v7,id,n,c,g,s,a,a_original,raw,ad,lat,lon,rg,gm,w,ig,d,p,b,t,tg,src,rating,v,reviews,quality_band,out,map_eligible,notes,d_original,desc_data_moved,merged_from,name_variants,dup_flag,ward,corporation,in_gba,rg_legacy,a_prev_label,perk_partner,perk_id,perk_offer_url,branch_of,needs_geo_check,plum_cta,plum_cta_url
```

Fill these; leave every other column empty:

| Column | Value |
|---|---|
| `category` | `Play` |
| `intent_v7` | `Play` |
| `id` | `BLR-2617` upward, sequential, no gaps |
| `n` | venue name — keep Playo's spelling unless Google's is clearly the real one |
| `c` | `Activities` |
| `g` | one of: `turf` `badminton` `padel` `tennis` `cricket` `multisport` `court` `play` `stadium` `swim` `climb` `golf` `specialty` |
| `s` | one of: `Turf / Ground` · `Court venue` · `Multi-sport venue / Stadium` · `Swimming pool` · `Specialty sport venue` · `Entertainment venue` |
| `a` | area — **must match an existing spelling** (see below) |
| `raw` | freer locality label, e.g. `Bellandur / Devarai` |
| `ad` | full street address from Places |
| `lat` / `lon` | **from the Places result**, not the CSV, not estimated |
| `rg` | exactly one of: `Central` `North` `East` `South` `West` |
| `gm` | `https://www.google.com/maps/place/?q=place_id:<PLACE_ID>` |
| `w` | official website if Places has one, else empty |
| `d` | the description, ending with the Playo booking line |
| `p` | `₹` `₹₹` `₹₹₹` `₹₹₹₹` or `Free` |
| `b` | best-for, comma separated, e.g. `Box cricket, Football turf, Late games` |
| `t` | hours, e.g. `6 AM – 11 PM (Daily)` or `24/7 (Daily)` |
| `tg` | pipe-separated tags, lowercase, hyphenated. **Must include `playo`** |
| `src` | `Google Places (resolved)` |
| `rating` | Google rating |
| `reviews` | Google review count |
| `v` | `Verified` |
| `quality_band` | `curated` `preferred` `acceptable` or `floor` |
| `out` | `0` |
| `map_eligible` | `yes` |
| `notes` | anything I should know — a caveat, a doubt about the match |

### Constraints that will break the build if you get them wrong

- **`tg` must contain `playo`.** That is what triggers the Plum Perks chip and
  the "book through Playo" line on the place card. Pipe-separated, not commas.
- **`g` must be one of the listed values.** The build refuses an unknown
  sub-category — it has no icon and no label, and it stops the deploy.
- **`rg` must be one of the five corporations.** Not "South East", not
  "Northwest".
- **`a` must match an existing area spelling**, or the area filter splits into
  two chips for the same place. The sheet already suffers from
  Brookefield/Brookfield and Marathahalli/Marathalli drift — do not add more.
  Existing spellings include: Bellandur, Whitefield, Koramangala, HSR Layout,
  Indiranagar, Jayanagar, JP Nagar, Electronic City, Yelahanka, KR Puram,
  Rajarajeshwari Nagar, Nagarbhavi, Ramamurthy Nagar, Horamavu, Kadugodi,
  Sarjapur Road, Begur, BTM Layout, Banashankari, Marathahalli, Brookefield,
  Hebbal, Kammanahalli, Banaswadi, Varthur, Bommanahalli. If a venue's area is
  not in the sheet, use the nearest established one and note it.
- **`lat`/`lon` from Places**, not copied from my CSV. Mine came from Playo and
  are good enough to match on, not to pin on.

## What to send back

One CSV file, and a short note: how many rows shipped, the ID range, how many
you dropped for no `place_id`, how many fell below 4.0 or 20 reviews on
**Google's** numbers, and any venue where you were unsure you matched the right
place. Don't list what you excluded unless something structural went wrong.
