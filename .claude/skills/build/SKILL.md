---
name: build
description: Build a ticket end to end — plan, owner approval, implement on a branch, gates, independent review, bounded fix loop, PR. Usage: /build <issue-number>
---

1. **Requirements.** Fetch the issue (`issue_read`, repo `cjmcg10-lab/golf-app`). No acceptance
   criteria → ask the owner and stop.
2. **Plan.** Dispatch `planner` → `docs/plans/<issue>-<slug>.md`. Show the plan to the owner and
   **STOP until the owner says OK**. Revise the plan if asked.
3. **Implement.** Create branch `feat/<issue>-<slug>` from `main`. Dispatch `implementer` with the
   plan path (use `isolation: "worktree"`; any parallel implementers each get their own worktree).
   If it reports AMBIGUITIES, ask the owner before continuing.
4. **Gates.** Dispatch `gate-runner`. Any FAIL → send the output back to `implementer`, re-run.
5. **Review.** Dispatch a fresh `reviewer` with ONLY: the issue text, the plan file, and
   `git diff main...HEAD`. Never pass it this conversation.
6. **Fix loop (max 3 rounds).** If CHANGES: implementer fixes blockers/majors → gate-runner →
   fresh reviewer. After round 3, stop and report what remains.
7. **PR.** Push the branch (ask first) and open a PR: summary, AC checklist with how each is met,
   gate table, reviewer verdict, remaining minors. End with the repo's PR footer.
   Never merge — the owner merges.
