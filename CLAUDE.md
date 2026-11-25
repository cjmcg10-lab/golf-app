# Golf App

Social golf app (iOS, Android, web). First course: Southington Country Club.
Design: `docs/superpowers/specs/2026-11-25-southington-mvp-design.md`.

## Stack

- pnpm 10 monorepo, Node 22, TypeScript (strict).
- `apps/app` — Expo SDK 58 + expo-router; web export deployed to Cloudflare Pages.
- `packages/course-schema` — course package types + validator (CLI: `pnpm --filter @golf/course-schema validate <dir>`).
- `packages/geo` — distance/bearing/hazard math.
- `tools/course-builder` — Python 3.13 pipeline (OSM + USGS 3DEP + NAIP) → `courses/<id>/`.
- Everything must run on free tiers (Cloudflare Pages/Workers/D1/Durable Objects, GitHub).

## Commands (run from repo root; all must exit 0)

- Setup: `pnpm install && pnpm setup:py`
- `pnpm lint` — ESLint + ruff
- `pnpm typecheck` — tsc in every package
- `pnpm test` — Vitest + pytest
- `pnpm build` — builds every package (app → `apps/app/dist`)
- `pnpm format` — Prettier + ruff format (also run automatically by the edit hook)
- `pnpm e2e` — Playwright smoke tests against the web export
- Rebuild a course: `tools/course-builder/.venv/bin/python -m coursebuilder.build southington-cc`

## Conventions

- Tickets: GitHub Issues on `cjmcg10-lab/golf-app` (template has Acceptance criteria).
- Branches `feat/<issue>-<slug>`, `fix/<issue>-<slug>`, `chore/<slug>`. Conventional Commits.
- One PR per ticket, squash merge. **Only the owner merges.**
- Course data: never use Google/Apple imagery; never guess unconfirmed facts (phones, yardages).
- OSM data needs visible "© OpenStreetMap contributors" attribution.

## Workflow (enforced by `.claude/agents` + `.claude/skills`)

Commands: `/plan <issue>`, `/build <issue>`, `/fix-bug <issue>`, `/pr-review [PR|branch]`.

1. Requirements first: read the ticket's AC and mockups before planning. No AC → ask the owner.
2. Plan before code: `docs/plans/<ticket>.md` lists files, tests, and how each AC is met.
3. Minimal code: reuse → stdlib → installed deps → new code. No unrequested files/abstractions/deps.
4. Author ≠ reviewer: `reviewer` runs fresh with only ticket + plan + diff.
5. Mechanical gates decide green: run lint/typecheck/test/build, show exit codes. Never claim
   passing without output.
6. Bounded fix loop: review → fix → re-review, max 3 rounds, then stop and report.
7. Parallel agents each get their own git worktree.
8. The owner approves merges, deploys, force-pushes, and destructive commands.
   (A hook blocks force-pushes to `main`.)
