# M4 — Home, round setup, clean HUD, crisp ground

Owner request (2026-11-25), in order:

1. Launch screen: spinning golf ball, "Choose your course" with a search bar and the list of
   available courses (not straight into Southington).
2. Course overview (today's 3D overview) with **Play here** → smooth transition into round setup:
   tee set and other round options → first hole.
3. On the hole: start on the tee; adjust where the tee is; set hitting position and landing
   position.
4. Stats: straight distance to the target, and plays-like accounting for elevation and wind
   (with the breakdown).
5. Settings page, including turning weather off for the plays-like numbers.
6. Ground textures sharp when zoomed in.
7. Golf cart always faces the way we're going.
8. No swing animation; no forced cart-driving animation. Show the golfer in the cart only when
   GPS shows they are driving (speed), facing the direction of travel.
9. 2D keeps the same look as 3D (no satellite imagery).
10. Cleaner UI, with options; build the cleanest.

## Design

- **Crisp ground** (6, 9): the builder bakes signed-distance fields (0.5 m texels, ±8 m) for
  fairway, green, tee, bunker, water, cart path, road, parking, woods, plus the mowing direction,
  into four RGB PNGs (`ground-0..3.png`). A terrain shader thresholds them with `fwidth`, so edges
  stay sharp at any zoom; collars, lips, shores and path edges are bands of the same fields;
  mowing stripes and grain are procedural. Satellite tiles are no longer shipped or downloaded.
- **2D** = the same scene through a top-down orthographic camera (tee at the bottom), so it keeps
  the textures. MapLibre is removed.
- **Routes**: `/` launch (ball, search, course list from `/courses/index.json` written by
  `copy-courses.mjs`); `/course/[id]` one screen with phases overview → setup → play
  (`?hole=n`), so the camera flies continuously between them; `/hole/[n]` redirects into the
  round; `/settings`; `/info`.
- **Round**: tee set, holes (18 / front 9 / back 9). Tee position override per hole stored
  locally ("Move tee" mode, Reset).
- **Tap modes** on the hole: Ball · Target · Tee (segmented control); GPS button sets Ball from
  the current fix once.
- **Stats** (`src/round/shotStats.ts`, pure): straight yards, plays-like, elevation / wind / air
  components (each from the physics caddy with that factor alone), club, to green F/C/B.
  Weather off ⇒ only elevation.
- **Settings** (`src/settings`): account for weather, HUD layout (Clean / Detailed), units of
  elevation (ft/m). Persisted in localStorage.
- **Cart**: parked on the nearest path facing the direction of play; when GPS speed > 2.5 m/s
  the golfer is shown seated in a cart at the GPS fix, heading = GPS course.
- Swing, ball flight animation, drive routing removed (`swing.ts`, `paths.ts` routing).

## Tests

Pytest: SDF sign/width/line distance, PNG channels. Vitest: shotStats (flat calm = straight,
uphill plays longer, headwind longer, weather off ignores wind), settings persistence, catalog
search filter, tee override store. E2E: launch screen lists Southington and searches; overview →
Play here → setup → hole 1 shows header and stats; `/hole/1` deep link; geolocation distance;
offline after download; settings toggle changes plays-like.
