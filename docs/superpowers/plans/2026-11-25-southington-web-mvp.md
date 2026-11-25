# Southington Web MVP (M0–M2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A web app (deployable to Cloudflare Pages) showing Southington Country Club's course and hole maps on 2023 aerial imagery, live GPS distances, and course info with tap-to-call, built from a reviewed course package produced by a reusable course-builder pipeline, in a repo with working gates and the SDLC workflow.

**Architecture:** pnpm monorepo. A Python course builder turns OSM + USGS 3DEP + NAIP + AI/manual additions into static files in `courses/southington-cc/`; a shared TS package defines and validates that package; an Expo (expo-router) app renders it with MapLibre on web and is exported as a static site that bundles the course files.

**Tech Stack:** Node 22, pnpm 10, TypeScript 5, Expo SDK 58 + expo-router, maplibre-gl 5, Vitest, ESLint 9 (flat config), Prettier, Playwright; Python 3.13 with requests, numpy, rasterio, laspy[lazrs], shapely, pyyaml, pillow, mercantile, pytest, ruff.

**Spec:** `docs/superpowers/specs/2026-11-25-southington-mvp-design.md` (milestones M0, M1, M2). M3 (backend), M4 (physics), M5 (native) get their own plans.

## Global Constraints

- Free services only; no service that needs a payment method (no R2). Static files served from Cloudflare Pages (25 MB/file, 20k files).
- No Google/Apple imagery or map data used for extraction. Imagery = NAIP 2023 0.3 m (public domain); elevation = USGS 3DEP (public domain); OSM data under ODbL with visible attribution "© OpenStreetMap contributors".
- Course: Southington Country Club, OSM way 43440837, par 71, 18 holes; pro shop phone +1-860-628-7032.
- Unconfirmed facts (restaurant phone, handicaps, scorecard yardages) are left empty, never guessed.
- Course package excluding imagery < 5 MB.
- Features carry `source` ∈ {osm, ai, manual} and `confidence` (0–1).
- No pop-ups/alerts/celebration animations.
- Free tier only in this plan (map, distances, course info); no physics UI.
- Gate commands (all must exit 0): `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## Review Focus

1. **Player far from the course** (testing at home): distances must not show "4,812 yds"; when > 1,000 yds from the current hole's green show "—" and "You're not on the course". → Task 10 test `farFromCourse`.
2. **Location denied/unavailable** (very common on web): map and hole view still work; distances fall back to measuring from the tee; a one-line notice explains why. → Task 10 test `permissionDenied`.
3. **Poor GPS accuracy** (> 30 m reported): distances still shown, with "±N yds" accuracy label. → Task 10 test `lowAccuracy`.
4. **Hole with an optional feature missing** (no bunkers, no water, no tee polygon): hole view renders and hazard list is empty, no crash. → Task 9 test `holeWithoutHazards`.
5. **Course files fail to load / offline after download**: shows an error with Retry; after "Download for offline", the hole view loads with the network off. → Task 11 test `offlineAfterDownload`.

---

## File Structure

```
package.json, pnpm-workspace.yaml, tsconfig.base.json, eslint.config.js, .prettierrc, vitest.workspace.ts
CLAUDE.md
.claude/settings.json, .claude/hooks/{format.sh,block-force-push.sh}
.claude/agents/{planner,implementer,reviewer,gate-runner}.md
.claude/skills/{build,fix-bug,pr-review,plan}/SKILL.md
.github/ISSUE_TEMPLATE/ticket.md, .github/workflows/ci.yml
packages/course-schema/src/{types.ts,validate.ts,cli.ts,index.ts} + test/
packages/geo/src/{distance.ts,hole.ts,index.ts} + test/
tools/course-builder/pyproject.toml
tools/course-builder/coursebuilder/{osm.py,derive.py,manual.py,elevation.py,imagery.py,merge.py,review.py,build.py}
tools/course-builder/tests/
courses/southington-cc/{manual.yaml,ai.geojson,course.json,features.geojson,elevation-course.bin,greens/*.bin,tiles/{z}/{x}/{y}.jpg,tiles/index.json,review.html}
apps/app/ (Expo): app/{_layout.tsx,index.tsx,hole/[n].tsx,info.tsx}, src/{course/loadCourse.ts,course/offline.ts,map/CourseMap.web.tsx,map/CourseMap.tsx,location/useLocation.ts,distances/useDistances.ts}, scripts/copy-courses.mjs, e2e/smoke.spec.ts
```

---

### Task 1: Monorepo scaffold and gates

**Files:** Create root `package.json`, `pnpm-workspace.yaml` (`packages/*`, `apps/*`), `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`), `eslint.config.js` (typescript-eslint recommended), `.prettierrc`, `.gitignore` (node_modules, dist, .venv, .expo, coverage), `tools/course-builder/pyproject.toml`, `tools/course-builder/tests/test_smoke.py`, `packages/geo/test/smoke.test.ts`.

**Interfaces:** Produces root scripts used by every later task and by gate-runner:
`lint` = `eslint . && pnpm lint:py` · `lint:py` = `tools/course-builder/.venv/bin/ruff check tools/course-builder` · `typecheck` = `pnpm -r typecheck` · `test` = `vitest run && pnpm test:py` · `test:py` = `tools/course-builder/.venv/bin/python -m pytest -q tools/course-builder` · `build` = `pnpm -r build` · `format` = `prettier --write . && tools/course-builder/.venv/bin/ruff format tools/course-builder` · `setup:py` = `python3 -m venv tools/course-builder/.venv && tools/course-builder/.venv/bin/pip install -e 'tools/course-builder[dev]'`.

- [ ] Step 1: Write trivial smoke tests (one TS `expect(1+1).toBe(2)`, one pytest) so each runner has something to run.
- [ ] Step 2: Create the config files and scripts above; `pnpm install`; `pnpm setup:py`.
- [ ] Step 3: Run `pnpm lint; echo $?`, `pnpm typecheck; echo $?`, `pnpm test; echo $?`, `pnpm build; echo $?` — each prints exit 0.
- [ ] Step 4: Commit `chore: monorepo scaffold and gate commands`.

### Task 2: SDLC workflow files

**Files:** `CLAUDE.md`, `.claude/agents/*.md` (4), `.claude/skills/*/SKILL.md` (4), `.claude/settings.json`, `.claude/hooks/format.sh`, `.claude/hooks/block-force-push.sh`, `.github/ISSUE_TEMPLATE/ticket.md`, `.github/workflows/ci.yml`, `docs/plans/.gitkeep`.

Decisions (fixed):

- Tickets: GitHub Issues on `cjmcg10-lab/golf-app`, read via GitHub MCP (`issue_read`). Issue template has sections Summary / Acceptance criteria (checkbox list) / Mockups / Out of scope. No AC → ask the owner.
- Branches `feat/<issue>-<slug>`, `fix/<issue>-<slug>`, `chore/<slug>`; Conventional Commits; squash merge; only the owner merges.
- The review skill is named `/pr-review` (avoids clashing with Claude Code's built-in `/review`).
- Agents (frontmatter `tools:`):
  - planner: `Read, Grep, Glob, Write` — Write restricted by instruction to `docs/plans/<ticket>.md`; plan lists files to touch, tests to add, and AC → how satisfied.
  - implementer: `Read, Grep, Glob, Edit, Write, Bash` — follows plan, writes unit tests, outputs "Ambiguities" list instead of guessing.
  - reviewer: `Read, Grep, Glob, Bash` (Bash only for `git diff`/`git log`/`git show`) — inputs: ticket, plan, diff only; checks correctness, security, error paths, test quality, over-engineering; output `VERDICT: APPROVE|CHANGES` + findings `[blocker|major|minor] file:line — text`.
  - gate-runner: `Bash, Read` — runs the four gate commands, outputs a table `command | exit code | PASS/FAIL` plus the tail of failing output; no opinions.
- Skills: `/build <issue>` (fetch → planner → show plan and STOP for owner OK → implementer in a worktree on new branch → gate-runner → reviewer → fix loop ≤ 3 rounds → open PR with summary + AC checklist; parallel implementers use `isolation: "worktree"`), `/fix-bug <issue>` (failing test first → minimal fix → gates → review → PR), `/pr-review [PR#|branch]` (gate-runner + reviewer; post one PR comment ≤ ~20 lines, one line per finding, footer per repo rules), `/plan <issue>` (planner only).
- Hooks: PostToolUse on `Edit|Write` → `format.sh` runs prettier on changed `*.ts,*.tsx,*.js,*.json,*.md` and ruff format on `*.py` (exit 0 always). PreToolUse on `Bash` → `block-force-push.sh` exits 2 with a message when the command matches `git push` with `--force`/`-f`/`--force-with-lease` (or `+ref`) targeting `main` (explicitly, or implicitly while on `main`).
- `settings.json` permissions: deny `Read(./.env*)`, ask for `Bash(git push:*)`, `Bash(wrangler pages deploy:*)`, `Bash(rm -rf:*)`.
- CI: on PR and push, `pnpm install --frozen-lockfile`, `pnpm setup:py`, the four gates.

- [ ] Step 1: Write a test script `tools/sdlc/test-hooks.sh` that pipes sample PreToolUse JSON into `block-force-push.sh`: `git push --force origin main` → exit 2; `git push -f origin HEAD:main` → exit 2; `git push origin feat/1-x` → exit 0; `git push --force origin feat/1-x` → exit 0. Run it; expect failures (script missing).
- [ ] Step 2: Write the hook scripts, settings, agents, skills, issue template, CI, and CLAUDE.md (stack, exact gate commands, conventions above, the 8 workflow principles; under ~80 lines).
- [ ] Step 3: Run `bash tools/sdlc/test-hooks.sh` → all cases pass. Run `pnpm test` → exit 0.
- [ ] Step 4: Dry-run `/plan` on a made-up ticket ("Show hole handicap on the hole header") and keep the output at `docs/plans/example-hole-handicap.md`.
- [ ] Step 5: Commit `chore: SDLC workflow (agents, skills, hooks, CI)`.

### Task 3: Course package schema and validator

**Files:** `packages/course-schema/src/{types.ts,validate.ts,cli.ts,index.ts}`, `packages/course-schema/test/validate.test.ts`, fixture `test/fixtures/mini/{course.json,features.geojson}` (2-hole course).

**Interfaces — Produces:**

```ts
export type LngLat = [lng: number, lat: number];
export type FeatureKind =
  | 'green'
  | 'fairway'
  | 'tee'
  | 'bunker'
  | 'water'
  | 'rough'
  | 'trees'
  | 'cartpath'
  | 'ob'
  | 'clubhouse';
export type Source = 'osm' | 'ai' | 'manual';
export interface FeatureProps {
  id: string;
  kind: FeatureKind;
  hole: number | null;
  source: Source;
  confidence: number;
}
export interface Contact {
  label: string;
  phone: string;
} // phone in E.164
export interface TeeSet {
  id: string;
  name: string;
  color: string | null;
  rating: number | null;
  slope: number | null;
}
export interface Hole {
  number: number;
  par: number;
  handicap: number | null;
  playLine: LngLat[]; // tee → (dogleg points) → green centre
  measuredYards: number; // length of playLine
  yards: Record<string, number | null>; // per TeeSet.id, from scorecard
  pin: LngLat;
  green: { front: LngLat; center: LngLat; back: LngLat };
  featureIds: string[];
}
export interface Course {
  schemaVersion: 1;
  id: string;
  version: string;
  name: string;
  address: string;
  location: LngLat;
  bounds: [w: number, s: number, e: number, n: number];
  par: number;
  website: string | null;
  contacts: Contact[];
  teeSets: TeeSet[];
  holes: Hole[];
  imagery: { tiles: string; minzoom: number; maxzoom: number; attribution: string } | null;
  elevation: {
    course: string;
    greens: Record<string, string>;
    greenSource: 'lidar' | 'dem';
  } | null;
  attribution: string[];
}
export interface ValidationIssue {
  level: 'error' | 'warning';
  path: string;
  message: string;
}
export function validateCourse(
  course: unknown,
  features: GeoJSON.FeatureCollection,
): ValidationIssue[];
```

CLI: `pnpm --filter @golf/course-schema validate <dir>` prints issues, exits 1 if any error.

- [ ] Step 1: Tests in `validate.test.ts`: `validMini` (fixture → `[]`); `parSumMismatch` (course.par 71 vs holes sum 70 → error at `par`); `holeMissingPin` → error `holes[0].pin`; `featureIdUnknown` (hole references id not in features → error); `badPhone` (`"860-628-7032"` → error, E.164 required); `yardsFarFromMeasured` (yards 400 vs measured 300 → warning, >10%); `confidenceOutOfRange` → error.
- [ ] Step 2: Run `pnpm vitest run packages/course-schema` → FAIL.
- [ ] Step 3: Implement types, `validateCourse` (hand-written checks, no schema library), CLI.
- [ ] Step 4: Run tests → PASS; `pnpm typecheck` → 0.
- [ ] Step 5: Commit `feat(course-schema): course package types and validator`.

### Task 4: Course builder — OSM import and derived holes

**Files:** `coursebuilder/osm.py`, `coursebuilder/derive.py`, `coursebuilder/manual.py`, `tests/test_osm.py`, `tests/test_derive.py`, `tests/fixtures/osm_mini.json` (API 0.6 `map.json` excerpt: boundary way, 2 hole ways, greens, pins, a bunker, a cart path, clubhouse node with phone).

**Interfaces — Produces:**

- `fetch_osm(bbox: tuple[float,float,float,float]) -> dict` — GET `https://api.openstreetmap.org/api/0.6/map.json?bbox=w,s,e,n` with a generic User-Agent; caches to `courses/<id>/.cache/osm.json`. (Overpass is unreliable through this proxy; the main API works.)
- `osm_to_features(osm: dict, boundary_way_id: int) -> FeatureCollection` — ways → polygons/lines using the tag map `golf=green|fairway|tee|bunker|water_hazard→water|lateral_water_hazard→water|rough|cartpath|clubhouse`, `natural=water→water`, `natural=wood|landuse=forest→trees`; only features inside the boundary; `id="osm-way-<id>"`, `source="osm"`, `confidence=1.0`; `hole` assigned to the hole whose playLine is nearest (greens/tees/fairways/bunkers/water within 60 m), else null.
- `derive_holes(osm: dict, features: FeatureCollection) -> list[dict]` — one Hole per `golf=hole` way (`ref`, `par`, `handicap` if tagged); `playLine` = the way's coordinates; `pin` = the `golf=pin` node inside or nearest that hole's green; green front/back = the points where the extended last playLine segment enters/leaves the green polygon, centre = midpoint of those; `measuredYards` = geodesic playLine length / 0.9144, rounded.
- `load_manual(path) -> dict` — YAML with optional `contacts`, `teeSets`, `holes: {<n>: {handicap, yards: {<teeId>: n}}}`, `website`, `address`; values merge over derived ones.

- [ ] Step 1: Tests: `test_feature_kinds_mapped` (fixture → expected kinds/count); `test_outside_boundary_dropped`; `test_hole_from_way` (ref/par, playLine endpoints); `test_pin_nearest_green`; `test_green_front_center_back_ordering` (front closer to tee than back along play line); `test_measured_yards` (known 2-point line → expected yards ±1); `test_manual_overrides_contacts`.
- [ ] Step 2: Run `pnpm test:py` → FAIL.
- [ ] Step 3: Implement (shapely + pyproj geodesic for lengths).
- [ ] Step 4: Run `pnpm test:py` → PASS.
- [ ] Step 5: Commit `feat(course-builder): OSM import and hole derivation`.

### Task 5: Course builder — elevation and imagery

**Files:** `coursebuilder/elevation.py`, `coursebuilder/imagery.py`, `tests/test_elevation.py`, `tests/test_imagery.py`.

**Interfaces — Produces:**

- Elevation file format `GELV` v1 (little-endian), shared with TS readers in M4:
  `magic "GELV"(4) | version u16=1 | reserved u16 | width u32 | height u32 | west f64 | north f64 | dLon f64 | dLat f64 | base f32 | scale f32` (52 bytes) then `width*height` u16 row-major from north-west; value 65535 = nodata; metres = `base + v*scale`.
- `write_gelv(path, grid: np.ndarray, west, north, dlon, dlat) -> None`, `read_gelv(path) -> tuple[np.ndarray, dict]`; `scale` chosen so the grid's range fits in 0–65534 (≤ 1 mm for a course).
- `fetch_dem(bbox, res_m=1.0) -> (grid, transform)` — 3DEP ImageServer `exportImage` (`https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage`, `bboxSR=4326`, `imageSR=4326`, `format=tiff`, `pixelType=F32`, size from res).
- `green_surface(green_polygon, res_m=0.5) -> (grid, meta, source)` — reads ground-classified (class 2) points for the green's bbox + 5 m buffer from the USGS 3DEP LiDAR Entwine (EPT) dataset covering CT (`https://s3-us-west-2.amazonaws.com/usgs-lidar-public/<dataset>/ept.json`), grids by mean of points per cell with nearest-fill for empty cells; returns source `'lidar'`. If EPT is unreachable or yields < 2 pts/m², resample the 1 m DEM bilinearly and return `'dem'`.
- `build_tiles(bbox, out_dir, zooms=range(15, 20)) -> list[str]` — NAIP 2023 item via Planetary Computer STAC search (collection `naip`, newest), href signed with `https://planetarycomputer.microsoft.com/api/sas/v1/sign?href=`, windowed read + warp to EPSG:3857 with rasterio, write 256 px JPEG (quality 80) tiles `tiles/{z}/{x}/{y}.jpg` for tiles intersecting bbox; writes `tiles/index.json` = list of relative paths (used by offline download).

- [ ] Step 1: Tests: `test_gelv_roundtrip` (random grid with nodata → identical after read, header fields equal); `test_gelv_scale_precision` (range 60–90 m → abs error ≤ 0.001); `test_green_surface_fallback` (EPT fetch monkeypatched to raise → source `'dem'`, grid shape matches 0.5 m); `test_tile_index_covers_bbox` (mercantile tiles for bbox at z15–19 equal the written index; raster read monkeypatched with a synthetic array).
- [ ] Step 2: Run `pnpm test:py` → FAIL.
- [ ] Step 3: Implement.
- [ ] Step 4: Run `pnpm test:py` → PASS.
- [ ] Step 5: Commit `feat(course-builder): elevation (GELV) and NAIP tiles`.

### Task 6: Build Southington package (AI gap fill, manual data, review page)

**Files:** `coursebuilder/merge.py`, `coursebuilder/review.py`, `coursebuilder/build.py`, `tests/test_merge.py`, `courses/southington-cc/{manual.yaml,ai.geojson}` + generated outputs.

**Interfaces:**

- Consumes Tasks 3–5.
- `merge_features(osm_fc, ai_fc, manual_fc|None) -> FeatureCollection` — AI features with the same kind overlapping an OSM feature by IoU > 0.5 are dropped (OSM wins); otherwise added; manual always added and wins over both.
- `build.py <course-id>` CLI: reads `courses/<id>/build.yaml` (`osm_boundary_way: 43440837`, bbox padded 50 m), runs fetch → features → merge → holes → manual → elevation → tiles → writes `course.json` + `features.geojson` → runs the TS validator CLI and fails on errors → writes `review.html`.
- `review.html`: standalone page using `maplibre-gl@5` from a pinned CDN URL, NAIP tiles as the base, features coloured by kind with dashed outlines for `source=ai`/`manual`, a hole list with par/measured yards, and a table of validation warnings.

- [ ] Step 1: Tests in `test_merge.py`: `test_ai_duplicate_of_osm_dropped`; `test_ai_new_feature_kept`; `test_manual_wins`.
- [ ] Step 2: Run → FAIL; implement `merge.py`, `review.py`, `build.py`; run → PASS.
- [ ] Step 3: Run `build.py southington-cc` once without `ai.geojson` to produce tiles and base package.
- [ ] Step 4: AI gap-fill pass (done by the executing Claude session): for each hole, render a crop of the NAIP tiles with OSM features overlaid; inspect visually; trace missing tree lines, rough edges, missing/incorrect bunkers and tees as polygons in `ai.geojson` with `source: ai` and `confidence` 0.5–0.9; record each change in `courses/southington-cc/AI_NOTES.md` (hole, what, why).
- [ ] Step 5: Manual data: look up the club's published scorecard/website for tee set names, yardages, handicaps, restaurant phone; write confirmed values into `manual.yaml` with a `sources:` list of URLs; leave unconfirmed values out.
- [ ] Step 6: Re-run `build.py southington-cc` → validator prints 0 errors; package (excluding `tiles/`) < 5 MB (`du -sh`).
- [ ] Step 7: Commit `feat(courses): Southington Country Club package v1`.
- [ ] Step 8: **Owner checkpoint** — publish `review.html` for the owner to look at; apply their corrections via `manual.yaml`/`ai.geojson` and rebuild before Task 9 depends on the data.

### Task 7: Geo utilities

**Files:** `packages/geo/src/{distance.ts,hole.ts,index.ts}`, `packages/geo/test/{distance.test.ts,hole.test.ts}`.

**Interfaces — Produces:**

```ts
export function distanceYards(a: LngLat, b: LngLat): number; // haversine, R=6371008.8 m
export function bearingDeg(a: LngLat, b: LngLat): number; // 0..360, from north
export interface HazardDistance {
  id: string;
  kind: FeatureKind;
  frontYards: number;
  backYards: number;
}
export function hazardDistances(
  from: LngLat,
  hole: Hole,
  features: GeoJSON.FeatureCollection,
): HazardDistance[];
// for bunker/water features of this hole: front = nearest polygon point, back = farthest point
// along the line from→green.center (points within ±15° of that bearing), sorted by frontYards
export function greenDistances(
  from: LngLat,
  hole: Hole,
): { front: number; center: number; back: number };
export function holeBearing(hole: Hole): number; // playLine[0] → green.center
```

- [ ] Step 1: Tests: `distanceKnown` (two points 100 m apart → 109.4 ±0.2); `bearingCardinal` (due east → 90 ±0.5); `greenDistancesOrdered` (front < center < back from the tee); `hazardSorted`; `holeWithoutHazards` (no bunker/water → `[]`).
- [ ] Step 2: Run → FAIL; implement; run → PASS.
- [ ] Step 3: Commit `feat(geo): distance and hazard utilities`.

### Task 8: Expo app shell, course loading, course map

**Files:** `apps/app/` (create with `create-expo-app` tabs-less template, SDK 58), `app/_layout.tsx`, `app/index.tsx`, `src/course/loadCourse.ts`, `src/map/CourseMap.web.tsx`, `src/map/CourseMap.tsx`, `scripts/copy-courses.mjs`, `src/course/loadCourse.test.ts`.

**Interfaces:**

- Consumes `Course`, `validateCourse` (Task 3).
- `loadCourse(id: string, fetcher = fetch): Promise<{ course: Course; features: FeatureCollection }>` — fetches `/courses/<id>/course.json` + `features.geojson`, validates, throws `CourseLoadError` on network failure or validation errors.
- `<CourseMap course features holeNumber?: number bearing?: number userLocation?: LngLat|null onTapPoint?: (p: LngLat) => void />` — web: maplibre-gl with NAIP raster source `course.imagery.tiles`, vector layers per kind (green #3fae49, fairway #7fc96b, tee #9ad48a, bunker #e8d9a8, water #3d8fd6, trees #2f5d2f, rough #5b8f4a, cartpath #9a9a9a), OSM + NAIP attribution control; native file renders a "Map available in the mobile build" placeholder (M5).
- `copy-courses.mjs` copies `courses/*/` (excluding `.cache`) into `apps/app/public/courses/` before `expo export -p web`; app `build` script = `node scripts/copy-courses.mjs && expo export -p web`.

- [ ] Step 1: Tests: `loadsValidCourse` (mock fetch returns fixture → course name); `networkErrorThrows` (`CourseLoadError` with `kind: 'network'`); `invalidCourseThrows` (`kind: 'invalid'`).
- [ ] Step 2: Run → FAIL; implement; run → PASS.
- [ ] Step 3: `pnpm --filter app build` → `apps/app/dist/index.html` exists; serve it (`npx serve apps/app/dist`) and screenshot the home page in Chromium (whole-course map with holes numbered).
- [ ] Step 4: Commit `feat(app): course map on web`.

### Task 9: Hole view

**Files:** `app/hole/[n].tsx`, `src/hole/HoleHeader.tsx`, `src/hole/HoleView.test.tsx`.

**Interfaces:** Consumes `CourseMap`, `holeBearing`, `greenDistances`, `hazardDistances`. Route `/hole/<n>`; prev/next buttons; header "Hole N · Par P · <measuredYards> yds" (+ handicap when known); map rotated to `holeBearing` so the tee is at the bottom, fit to the hole's playLine + green with padding.

- [ ] Step 1: Tests (React Native Testing Library, map mocked): `headerShowsParAndYards`; `handicapHiddenWhenNull`; `holeWithoutHazards` (renders, hazard list empty); `nextFromHole18Disabled`.
- [ ] Step 2: Run → FAIL; implement; run → PASS.
- [ ] Step 3: Commit `feat(app): hole view`.

### Task 10: Live GPS distances

**Files:** `src/location/useLocation.ts`, `src/distances/useDistances.ts`, `src/distances/DistancePanel.tsx`, tests alongside.

**Interfaces:**

- `useLocation(): { fix: { at: LngLat; accuracyM: number } | null; status: 'pending'|'ok'|'denied'|'unavailable' }` — web `navigator.geolocation.watchPosition({ enableHighAccuracy: true, maximumAge: 1000 })`.
- `useDistances(hole, features, fix, target: LngLat|null) -> { origin: 'gps'|'tee'; offCourse: boolean; green: {front,center,back}|null; hazards: HazardDistance[]; toTarget: number|null; targetToGreen: number|null; accuracyYards: number|null }` — origin = GPS fix, else hole tee (`playLine[0]`); `offCourse` when GPS distance to green centre > 1000 yds (then `green` is null); accuracy label shown when `accuracyM > 30`.
- Tap on map sets `target`; panel shows "To target X · target to green Y".

- [ ] Step 1: Tests for `useDistances`: `gpsOrigin`; `permissionDenied` (no fix → origin `'tee'`, notice text "Location is off — distances are from the tee"); `farFromCourse` (fix 5 km away → offCourse true, panel shows "—" and "You're not on the course"); `lowAccuracy` (accuracy 45 m → "±49 yds"); `targetDistances`.
- [ ] Step 2: Run → FAIL; implement; run → PASS.
- [ ] Step 3: Commit `feat(app): live GPS distances`.

### Task 11: Course info and offline download

**Files:** `app/info.tsx`, `src/course/offline.ts`, `src/course/offline.test.ts`, `public/sw.js`.

**Interfaces:**

- Info screen: name, address (opens maps link), website, each `contacts[]` as a button "Call <label>" → `Linking.openURL('tel:<phone>')`; data attribution list.
- `downloadForOffline(courseId): Promise<{ files: number; bytes: number }>` — fetches `course.json`, `features.geojson` and every path in `tiles/index.json` into Cache Storage `course-<id>-<version>`; progress callback; `isDownloaded(courseId)`. `sw.js` serves `/courses/**` cache-first from that cache, network for everything else.

- [ ] Step 1: Tests: `callButtonsPerContact` (2 contacts → 2 buttons; press → `tel:+18606287032`); `noContactsShowsWebsiteOnly`; `downloadCachesAllTiles` (mock Cache API; index of 3 tiles → 5 files cached); `offlineAfterDownload` (Playwright, Task 12: after download, `context.setOffline(true)`, reload `/hole/1` → map and header render).
- [ ] Step 2: Run → FAIL; implement; run unit tests → PASS.
- [ ] Step 3: Commit `feat(app): course info, tap-to-call, offline download`.

### Task 12: Web smoke test and Cloudflare Pages deploy

**Files:** `apps/app/e2e/smoke.spec.ts`, `apps/app/playwright.config.ts`, `apps/app/public/_headers`, `docs/deploy.md`.

**Interfaces:** Playwright runs against `npx serve apps/app/dist` with `--trace off`. Root script `e2e` = `pnpm --filter app build && playwright test -c apps/app`. `_headers`: `/courses/*/tiles/*` → `Cache-Control: public, max-age=604800`.

- [ ] Step 1: Tests: `homeShowsCourse` (title "Southington Country Club", 18 hole links); `holeOneLoads` (header "Hole 1 · Par 4"); `geolocationMocked` (Playwright geolocation set to the hole 1 tee → green centre distance within ±5 yds of `measuredYards`); `infoCallLink` (`a[href="tel:+18606287032"]` or button present); `offlineAfterDownload` (from Task 11).
- [ ] Step 2: Run `pnpm e2e` → PASS (after any fixes).
- [ ] Step 3: Write `docs/deploy.md`: owner connects the GitHub repo in Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git; build command `pnpm install && pnpm --filter app build`; output dir `apps/app/dist`; Node 22 env var `NODE_VERSION=22`. No API token needed in this repo.
- [ ] Step 4: Run all four gates and show exit codes; commit `feat(app): web smoke tests and Pages deploy config`.
- [ ] Step 5: Whole-branch review by a fresh reviewer against the spec and this plan; fix loop ≤ 3 rounds.
