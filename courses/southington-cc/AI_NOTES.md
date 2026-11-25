# AI gap-fill notes — Southington Country Club

Pass done 2026-11-25 by Claude reviewing NAIP 2023 0.3 m imagery with the OpenStreetMap features
overlaid (zoom 16 overview, zoom 17 sections, zoom 18 detail of the holes 10/14/15 area).

**Finding:** OSM already maps every hole's green, fairway, tees, bunkers, cart paths and water well;
outlines line up with the imagery. The gap was **trees** (none mapped). Rough was not traced:
everything inside the boundary that is not another feature is treated as rough.

**Tee fixes (second pass, zoom 19):** the OSM hole lines for 12 and 15 started at the wrong tee
(93 vs 120 and 253 vs 211 yds on the scorecard). `manual.yaml` now sets `tee:` for both:
- Hole 12: a rectangular tee box with markers just south-west of the mapped (forward) oval tee,
  unmapped in OSM → traced as `ai-tee-12-back`. 112 yds to the green centre, 120 to the back
  (Blue 120).
- Hole 15: the OSM line started at the far box (osm way 1208876141, 255 yds, matches no tee set).
  The line now starts at osm way 1208876140 — 194 to the centre, 205 to the back (Blue 211,
  Gold 196).

| id | kind | confidence | what / why |
|---|---|---|---|
| ai-trees-east-woods | trees | 0.6 | Woods along the east edge of the course, east of holes 13, 16 and 17 (includes a power-line clearing, hence lower confidence). |
| ai-trees-12-west | trees | 0.7 | Wooded area west of the 12th green, between the houses and hole 12. |
| ai-trees-14-15-belt | trees | 0.6 | Tree belt between the 14th and 15th fairways. |
| ai-trees-10-green-south | trees | 0.6 | Tree clump south-west of the 10th green. |
| ai-trees-10-15-mid | trees | 0.55 | Tree clump between the 10th and 15th fairways. |
| ai-trees-11-north | trees | 0.55 | Tree row south of the 11th fairway. |
| ai-trees-13-15-scatter | trees | 0.5 | Scattered trees between the 13th green and the 15th green. |
| ai-trees-16-18-west | trees | 0.5 | Tree line between the 16th tee/path and the 18th fairway (west of the 16th tee). |
| ai-tee-12-back | tee | 0.8 | Back tee of hole 12 (rectangular box with tee markers), see Tee fixes above. |
| ai-trees-16-18-east | trees | 0.5 | Same tree line, east of the 16th tee (split so the tee is not covered). |
