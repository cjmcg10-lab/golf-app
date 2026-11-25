# Golf App — Southington Country Club MVP: Design

Status: approved 2026-11-25 · Date: 2026-11-25

## 1. Intent

A social golf app for iOS, Android and web. A group of friends playing the same
course can see each other on the course map (walking or in carts), keep a shared
scorecard, and get physics-based shot advice: how far a shot really plays given
elevation, wind, temperature, humidity and altitude, plus an "auto caddy" that
recommends a club from the player's own club distances. Each course carries its
contact info (pro shop, restaurant) with tap-to-call.

The first build targets **one course: Southington Country Club** (150 Savage St,
Southington, CT; OSM way 43440837; par 71, 18 holes). The course-building
pipeline must be reusable so later courses are cheap to add.

**Hard constraint: run for free.** Every service must fit a free tier. The only
accepted costs are app-store fees ($99/yr Apple, $25 once Google), deferred
until store release.

## 2. Goals (this build)

1. A **course package** for Southington built from free data (OSM + USGS LiDAR +
   NAIP aerial imagery + an AI gap-filling pass), reviewed by a human.
2. A **web app** (first test target) showing the course map, hole-by-hole view,
   live GPS distances to front/center/back of green and to hazards, and course
   info with tap-to-call.
3. **Accounts, friends, rounds**: create a round, invite friends by code, shared
   live scorecard, friends' live locations on the map with a walking/cart icon.
4. **Shot physics**: "plays like" distance, predicted carry + rollout for a
   stock (tour-average) shot, using live weather and terrain.
5. **Club distances + auto caddy**: player enters carry per club; app recommends a
   club for the current shot.
6. The same codebase builds **iOS and Android** apps (development builds; store
   submission is a later step), including background location.

## 3. Non-goals (this build)

- Pop-ups, alerts, celebration animations (explicitly dropped by the owner).
- Mini-games (skins, match play, etc.) — later; the scorecard data model should
  not block them.
- Automatic shot detection from standing-still behaviour — later; we only
  collect the location stream that would enable it.
- Player-entered launch/spin data ("advanced player" personal ball flight) —
  later, paid tier; the physics engine must accept custom launch params so
  this is additive.
- Payments/billing. Tier is a flag on the user; gating is implemented, billing is not.
- Courses other than Southington; courses outside the US.
- App store submission.

## 4. Anti-goals (failure even if it "works")

- Anything that incurs a recurring bill.
- Janky map or battery drain bad enough that a player turns the app off by hole 5.
- Using Google/Apple map imagery for data extraction (licence violation).
- Advice the app presents confidently that is obviously wrong on the course
  (e.g. a 150-yd 7-iron called a driver). Physics must be validated against
  known reference numbers before it is shown.

## 5. Approaches considered

| Option                                                              | Trade-off                                                                                                 | Decision   |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------- |
| **Expo (React Native) + react-native-web, one TypeScript codebase** | One codebase for iOS/Android/web; good maps (MapLibre) and background location; JS physics is fast enough | **Chosen** |
| Flutter                                                             | Excellent mobile perf, but heavier/slower web, and web is the first test target                           | Rejected   |
| Native Swift + Kotlin + separate web                                | Best perf, ~3× the work and three codebases                                                               | Rejected   |

| Backend option                                                    | Trade-off                                                                                   | Decision   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------- |
| **Cloudflare (Workers, D1, Durable Objects, R2, Pages) + GitHub** | Owner already uses GitHub + Cloudflare; generous free tier; no project pausing; free egress | **Chosen** |
| Supabase                                                          | Built-in auth + realtime, but free projects pause after a week idle; second vendor          | Rejected   |

## 6. Architecture

pnpm-workspace monorepo:

```
apps/app/              Expo app (expo-router); exports to web for Cloudflare Pages
workers/api/           Cloudflare Worker: REST API, D1, Durable Object per round, weather proxy
packages/physics/      Pure TS ball-flight + rollout + auto-caddy (no deps, unit-tested)
packages/course-schema/ TS types + validator for the course package (shared by app, worker, builder)
tools/course-builder/  Python pipeline: OSM + 3DEP + NAIP -> course package; review page
courses/southington-cc/ Built package source (JSON/GeoJSON committed; large rasters go to R2)
```

### 6.1 Free services used

| Need                        | Service                                                                  | Free limit that matters                                                                                  |
| --------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Web hosting                 | Cloudflare Pages                                                         | Unlimited bandwidth                                                                                      |
| API                         | Cloudflare Workers                                                       | 100k requests/day                                                                                        |
| Database                    | Cloudflare D1 (SQLite)                                                   | 5 GB, 5M reads/day                                                                                       |
| Live round state            | Durable Objects (SQLite-backed, WebSocket hibernation)                   | 100k req/day on free plan                                                                                |
| Course files, imagery tiles | Cloudflare Pages static assets (same deploy as the web app)              | 25 MB per file, 20k files; no payment method needed (R2 was rejected because it requires a card on file) |
| CI, course builds           | GitHub Actions                                                           | 2,000 min/month (private)                                                                                |
| Weather                     | US National Weather Service API (api.weather.gov)                        | Free, public domain, no key                                                                              |
| Elevation                   | USGS 3DEP (1 m DEM + LiDAR point cloud)                                  | Public domain                                                                                            |
| Aerial imagery              | USDA NAIP via Microsoft Planetary Computer (2023, 0.3 m)                 | Public domain                                                                                            |
| Base map data               | OpenStreetMap (ODbL — attribution required)                              | Free                                                                                                     |
| Map renderer                | MapLibre (maplibre-gl on web, @maplibre/maplibre-react-native on mobile) | OSS                                                                                                      |
| Auth                        | Better Auth library on Worker + D1                                       | OSS                                                                                                      |
| Mobile builds               | Expo EAS free tier, or local builds                                      | Limited builds/month                                                                                     |

Verified on 2026-11-25: OSM has Southington mapped (18 holes with par summing
to 71, 18 pins, 20 greens, 37 tees, 25 fairways, 29 bunkers, 37 cart paths, 3
water hazards, clubhouse with phone +1-860-628-7032). USGS has 1 m DEM and LiDAR
point cloud coverage. NAIP 2023 0.3 m imagery covers the course.
Missing in OSM: hole handicaps, yardages, tree lines, rough outlines, restaurant phone.

## 7. Course package

One versioned package per course, downloaded once and cached on the device.

- `course.json`: id, name, address, location, par, contacts
  (`[{label: "Pro shop", phone}, {label: "Restaurant", phone}, ...]`), tee sets
  (name, colour, rating/slope if known), holes[] → number, par, handicap,
  yardage per tee set, tee points per set, default pin point, green centre/front/back
  along the play line, and feature IDs.
- `features.geojson`: polygons/lines with `kind` ∈ {green, fairway, tee, bunker,
  water, rough, trees, cartpath, ob, clubhouse}, `hole` ref, `source` ∈
  {osm, ai, manual}, `confidence`.
- `elevation-course.bin`: whole-course 1 m DEM, 16-bit quantised, with header
  (origin, cell size, scale) — used for plays-like elevation change and landing slope.
- `greens/<hole>.bin`: per-green high-res surface (0.5 m) built from LiDAR
  ground-classified points, used for green slope/break display.
- Imagery: NAIP 0.3 m clipped to the course, cut into XYZ raster tiles served from Cloudflare Pages static assets. When a course is opened the app offers a one-time download of the course's tiles (expected tens of MB) so imagery works offline; without it, the hole view falls back to vector features.
- Target size excluding imagery: < 5 MB.

## 8. Course-builder pipeline

Runs offline (local or GitHub Actions), never on the phone.

1. **OSM import** of everything inside the course boundary.
2. **Elevation**: fetch 3DEP 1 m DEM for the boundary; fetch LiDAR point cloud
   tiles for greens and build 0.5 m ground surfaces.
3. **Imagery**: fetch NAIP 2023 tiles for the boundary.
4. **AI gap fill**: per hole, imagery crop + OSM overlay → propose missing or
   corrected features (tree lines, rough, bunker edges, missing tees). For
   Southington this pass is done by Claude in-session (vision on crops) plus
   simple colour/texture segmentation; automating it with an open segmentation
   model is a later improvement. AI features are tagged `source: ai`.
5. **Derive**: yardages per tee set along the play line (tee → fairway
   centreline → green centre), front/centre/back of green.
6. **Manual data**: a small `manual.yaml` per course for things no dataset has
   (restaurant phone, hole handicaps, tee set names, scorecard yardages).
   For Southington these come from the club's published scorecard/website;
   any value not confirmed is left empty rather than guessed.
7. **Validate** against `course-schema` (every hole has tee, green, pin; par sums
   match; yardages within 10% of scorecard where known).
8. **Review page**: static HTML showing imagery with all features overlaid and
   colour-coded by source; the owner approves before publish.
9. **Publish** as versioned static files in the Pages deploy.

## 9. App

### 9.1 Screens

- **Course** (map of whole course) → **Hole** view (rotated so tee is at the bottom,
  imagery + features, distance arcs).
- **Live distances**: from player GPS to front/centre/back of green, to hazards
  on the hole, and to a tapped target point.
- **Shot planner** (paid): tap target → plays-like distance, carry, rollout,
  landing spot, recommended club; weather summary.
- **Scorecard**: shared, per round; strokes per player per hole; totals and to-par.
  Any player in the round can enter any player's score (one person often keeps
  the card); last write wins per cell, every change is stored with who/when so
  mini-games and disputes can use the history later.
- **Round / friends**: create round, join by 6-char code, list of players,
  their dots on the map with walking/cart icon. "Friends" in this build means
  the players in your round; a recent-players list makes re-inviting easy.
  A lasting friends list (add/accept, privacy) is later.
- **My bag**: club list with carry distance per club (stored on the account).
- **Course info**: contacts with tap-to-call (`tel:` link), address, website.

### 9.2 Location

- Foreground: high-accuracy GPS, 1 s updates for distances.
- Background (native only): expo-location + expo-task-manager, distance filter
  ~10 m, sent to the round's Durable Object at most every 10 s.
- Web: location only while the tab is open (browser limitation, accepted for testing).
- "In cart" = smoothed speed > 3 m/s → cart icon; else walking icon.
- Sharing starts when a player joins a round and stops when the round ends.
  A round ends when its creator ends it, or automatically after 6 hours or
  when every player has been off the course for 30 minutes. Any player can
  pause their own sharing mid-round.
- Location samples are kept server-side only for the duration of the round
  (needed later for shot detection); deleted 30 days after the round ends.
- Permission prompts and store justification text are written as part of the
  native milestone.

### 9.3 Performance

- Course package cached locally; app works without signal except live friends/weather.
- MapLibre GPU rendering; features as vector layers, imagery as raster tiles.
- Physics in plain TS, target < 5 ms per shot simulation on a mid-range Android.
- Avoid React re-render storms: location stream held in a store with selectors;
  map markers updated imperatively.
- Smooth motion of friend markers via interpolation between updates (Reanimated on native).

## 10. Backend

- **Worker REST API**: auth (Better Auth, email + password for now; no password-reset
  email during testing, resets done by admin; a free email route is added before public launch), profile,
  clubs (bag), rounds (create/join/list), scores (write), course package URLs,
  weather (`GET /weather?course=`).
- **D1 tables**: users, sessions, clubs, rounds, round_players, scores,
  location_samples (pruned at 30 days).
- **Durable Object per active round**: holds WebSockets for its players; fans out
  location and score updates; uses WebSocket hibernation to stay inside free limits;
  persists scores to D1.
- **Weather**: Worker calls NWS latest observation from the nearest station
  (for Southington, Meriden Markham KMMK) for temperature, humidity, pressure,
  wind speed/direction; cached 10 min per course in the Cache API. Fallback to
  NWS gridpoint forecast if the observation is stale (> 90 min).

## 11. Physics engine (`packages/physics`)

### 11.1 Ball flight

- 3-D point-mass model integrated with RK4 (dt ≈ 5 ms), forces: gravity, drag,
  Magnus lift; spin decays exponentially over flight.
- Drag and lift coefficients as functions of Reynolds number and spin ratio,
  from published golf-ball aerodynamics literature (builder selects and cites source).
- **Air density** from temperature, station pressure and relative humidity
  (moist-air equation); altitude enters through pressure (and the course's DEM elevation
  when only sea-level pressure is available).
- **Wind**: speed/direction from weather; logarithmic wind profile with height
  (measurement at 10 m, scaled to ball height).
- Elevation change: integrate until the ball's height meets the terrain along
  its path (DEM), not a flat plane.

### 11.2 Stock shot

- Default launch conditions are tour-average numbers per club (ball speed, launch
  angle, spin) from publicly available launch-monitor averages; for an arbitrary
  carry, interpolate between clubs.
- Engine accepts custom launch params (ball speed, launch, spin, spin axis) so
  the later "advanced player" feature only adds an input screen.

### 11.3 Landing and rollout

- On landing: bounce + roll model driven by landing angle, landing speed,
  remaining spin, surface type (green / fairway / rough / bunker from features)
  and local slope from the DEM. Surface firmness/friction constants per type,
  tunable; defaults chosen to match typical published rollout (e.g. tour 7-iron
  rolls a few yards on a green).
- Output: carry point, final resting point, total distance, apex, flight time.

### 11.4 Plays-like and auto caddy

- **Plays-like distance**: the calm, sea-level, flat-ground carry that would land at
  the target under current conditions (solved by bisection on ball speed).
- **Player clubs**: player's carries are assumed measured in "standard" conditions
  (sea level, 70 °F, 50 % RH, no wind, flat).
- **Auto caddy**: pick the club whose standard carry is closest to and not short
  of the plays-like carry; if the predicted rollout ends past the back of the green
  or in a hazard, suggest the next club down; show the second choice too.
- **Green read** (best effort with free data): show slope direction arrows and %
  on the green surface. Full putt-break simulation is later.

### 11.5 Validation

Unit tests compare stock simulations at standard conditions with published
tour-average carries (driver, 7-iron, PW within ±5 %), and check sensible direction
and rough magnitude of effects (e.g. ~1 % more carry per ~1,000 ft altitude band
as described in literature; headwind reduces carry more than tailwind adds).

## 12. Tiers

Tier is a field on the user (`free` | `pro`). Gating is real in every build,
including the deployed web test. Pro is granted by an admin-only endpoint (owner's
account is admin); during testing the owner grants Pro to testers.

| Free                                                                             | Paid (Pro)                                    |
| -------------------------------------------------------------------------------- | --------------------------------------------- |
| Course map, hole view, GPS distances (front/centre/back, hazards, tap-to-target) | Plays-like distances (weather + elevation)    |
| Friends on the map, walking/cart                                                 | Shot planner: carry, rollout, landing spot    |
| Shared scorecard, rounds                                                         | Auto caddy                                    |
| Course info + tap-to-call                                                        | Green slope view                              |
| My bag (club distances)                                                          | Later: personal launch/spin, mini-games (TBD) |

## 13. Testing and quality

- `packages/physics`, `packages/course-schema`: Vitest unit tests.
- `workers/api`: Vitest with `@cloudflare/vitest-pool-workers`.
- `apps/app`: component tests for logic-heavy pieces; Playwright smoke test on the web export.
- `tools/course-builder`: pytest for derivation and validation steps.
- Gates (lint, typecheck, test, build) are wired into the SDLC workflow set up
  in the same repo (CLAUDE.md, agents, skills) — that earlier request is completed
  as milestone M0 now that the stack exists.

## 14. Milestones

- **M0** Monorepo scaffold, gate commands, SDLC files (CLAUDE.md, agents, skills, hooks), CI.
- **M1** Course builder → Southington package + review page; owner approves.
- **M2** Web app: course + hole view, GPS distances, course info/tap-to-call; deployed to Cloudflare Pages.
- **M3** Backend: accounts, bag, rounds, join by code, shared scorecard, live friend locations.
- **M4** Physics + weather + plays-like + shot planner + auto caddy + green slope; tier gating.
- **M5** Native dev builds for iOS and Android with background location
  (owner already holds an Apple Developer membership). Web app comes first.
- **Later**: mini-games, shot detection, personal launch data, more courses,
  automated AI segmentation, payments, store submission.

## 15. Decisions made by Claude (owner may override)

- Auth via email + password (no paid email service needed); social logins later.
- Weather from NWS rather than Open-Meteo (Open-Meteo's free tier is non-commercial).
- Location samples retained 30 days after a round.
- Free/paid split in §12.
- Expo app at `apps/app`, pnpm workspaces.
- No R2: static files on Cloudflare Pages so no card is needed.
- Round-only friends; any player can enter any score; round auto-ends after 6 h
  or 30 min all off-course; players can pause sharing.
- Offline imagery via one-time course download.
- No password-reset email during testing.
- Pro granted via admin endpoint; gating active on the web test.

## 16. Left to the builder

Exact aerodynamic coefficient source, rollout constants, UI styling, map styling,
file-level module layout, library minor versions, CI details.
