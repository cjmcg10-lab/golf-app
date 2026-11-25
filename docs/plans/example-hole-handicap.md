# Plan: #0 Show hole handicap on the hole header

> Dry run on a made-up ticket. The code it touches (Tasks 3, 7, 9 of
> `docs/superpowers/plans/2026-11-25-southington-web-mvp.md`) does not exist yet; this plan targets
> the interfaces described there.

## Ticket

#0 "Show hole handicap on the hole header"

- [ ] The hole view header shows "HCP N" after the yardage when the hole's handicap is known.
- [ ] When the handicap is unknown (null), nothing about handicap is shown.
- [ ] The whole-course list shows each hole's handicap in a small grey label when known.

## Approach

Use the existing field `Hole.handicap: number | null` (Task 3 `packages/course-schema/src/types.ts`);
no schema, builder or data change. In `HoleHeader.tsx` (Task 9) add ` · HCP N` after
`<measuredYards> yds` only when `hole.handicap !== null`. In the hole list on `app/index.tsx`
(Task 8; Task 12 expects 18 hole links there) render a small grey `<Text>` "HCP N" next to each hole
link under the same condition. Two places with one line each, so no shared helper or new component.

## Files to touch

- `apps/app/src/hole/HoleHeader.tsx` — add ` · HCP {hole.handicap}` after the yardage when not null.
- `apps/app/app/index.tsx` — per hole link, add grey label `HCP {hole.handicap}` when not null.
- `apps/app/src/hole/HoleView.test.tsx` — tests below (file exists after Task 9).
- `apps/app/app/index.test.tsx` — new; tests below (no home-screen test file exists in the plan; needed for AC 3).

## Tests to add

`apps/app/src/hole/HoleView.test.tsx` (map mocked, as in Task 9):

- `headerShowsHandicapWhenKnown` — hole with `handicap: 7`, `measuredYards: 412` → header text is
  `Hole 1 · Par 4 · 412 yds · HCP 7` (HCP comes after yds).
- `handicapHiddenWhenNull` (already in Task 9; tighten it) — `handicap: null` → header is
  `Hole 1 · Par 4 · 412 yds`; `queryByText(/HCP/)` is null.

`apps/app/app/index.test.tsx` (`loadCourse` and `CourseMap` mocked, 2-hole fixture):

- `holeListShowsHandicapLabel` — hole 1 `handicap: 5` → `getByText('HCP 5')` exists and its
  style has the grey colour and smaller font size.
- `holeListHidesHandicapWhenNull` — hole 2 `handicap: null` → exactly one `HCP` label in the list.

## AC → how satisfied

| AC                                            | Code                                      | Test                                                      |
| --------------------------------------------- | ----------------------------------------- | --------------------------------------------------------- |
| Header shows "HCP N" after yardage when known | `HoleHeader.tsx` conditional suffix       | `headerShowsHandicapWhenKnown`                            |
| Nothing shown when null                       | Same condition (`!== null`) in both files | `handicapHiddenWhenNull`, `holeListHidesHandicapWhenNull` |
| Course list shows small grey label when known | `app/index.tsx` per-hole `<Text>`         | `holeListShowsHandicapLabel`                              |

## Risks / open questions

- **Code not written yet.** `Hole`, `HoleHeader.tsx`, `HoleView.test.tsx` and `app/index.tsx` come
  from Tasks 3, 8, 9. Re-check names and header format once those land; this ticket must follow them.
- **"Whole-course list" is not defined** in the plan or spec. Assumed to be the hole links on the
  home screen (`app/index.tsx`). If it means a separate list screen, ask the owner.
- **"Small grey"** has no exact value in a mockup. Proposal: `#8a8a8a`, font size 12. Owner to confirm.
- **Separator.** AC says "after the yardage"; assumed the header's existing `·` separator.
- **Handicap 0 is falsy.** Use `!== null`, not a truthiness check. Valid values are 1–18; the
  validator (Task 3) does not check the range; out of scope here.
- **Real data has no handicaps yet** (unconfirmed facts are left empty, Task 6 Step 5), so the label
  will not show for Southington until `manual.yaml` has confirmed values. Tests use fixtures.
