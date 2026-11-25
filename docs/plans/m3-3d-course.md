# M3 — Low-poly 3D course (web)

Owner request (2026-11-25): stylised low-poly 3D of the whole Southington course, visual theme
following skiwithme.builtbyroger.app; keep the low-poly trees; no satellite imagery on the ground —
crisp-edged flat colour surfaces on smooth terrain (no visible triangles); cart paths; low-poly
golf carts with a seated character when driving; standing low-poly golfers; a simulated swing at
shot setup; low-poly buildings; on the live web app.

## Acceptance (from the request)

1. Whole course in 3D from LiDAR terrain, ground painted with crisp fairway/green/tee/bunker/
   water/cart-path/road/rough areas — no imagery on the ground.
2. Low-poly trees (wooded areas), low-poly buildings (OSM footprints, extruded), cart paths.
3. Golfer characters stand at the ball; choosing a shot plays a swing, then the ball flight.
4. Golf cart drives along the cart paths to the next tee with the golfer seated.
5. Shot setup: start from GPS, tee, or a tapped spot; tap the landing spot; caddy (physics +
   live weather) picks club and aim.
6. UI follows the ski app: dark navy chrome, mint accent, Montserrat/Nunito Sans, floating
   round-square buttons; 2D map still available.

## Files

- `tools/course-builder/coursebuilder/scenery.py` (+ test): buildings (height from tags),
  roads, parking → `scenery.geojson` over the terrain bbox. `build.py` writes it.
- `apps/app/scripts/copy-courses.mjs`: ship `elevation-course.bin` again (used now).
- `packages/physics` (+ tests): ball flight, caddy, roll (ported from the prototype).
- `apps/app/src/scene/`: `elevation.ts`, `frame.ts`, `trees.ts`, `paths.ts`, `swing.ts` (pure, tested);
  `paint.ts` (ground texture), `models.ts` (low-poly meshes), `World.ts`, `CourseScene.web.tsx`.
- `apps/app/src/weather/useWeather.ts` (+ test): Open-Meteo current conditions.
- Screens: home = 3D course overview; hole = 3D with shot setup; `2D` toggle to the old map.
- `src/course/offline.ts`: download elevation + scenery too.

## Tests

Unit: scenery extraction, GELV parse + sampling, tree placement inside/outside, path graph routing,
swing keyframes, physics carries (7i ≈ 172 yds still air) and caddy accuracy, weather mapping.
E2E: existing smoke tests updated; hole screen renders a WebGL canvas and the caddy card.
