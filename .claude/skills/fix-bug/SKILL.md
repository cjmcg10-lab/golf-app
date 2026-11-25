---
name: fix-bug
description: Fix a bug ticket — reproduce with a failing test first, minimal fix, gates, independent review, PR. Usage: /fix-bug <issue-number>
---

1. Fetch the issue (`issue_read`). Need: steps to reproduce + expected behaviour. Missing → ask.
2. Create branch `fix/<issue>-<slug>`.
3. **Reproduce first:** write a test that reproduces the bug; run it; show it FAILS for the
   reported reason. If you cannot reproduce, stop and report what you tried.
4. Dispatch `implementer` (worktree) with: the issue, the failing test path, and the rule
   "smallest change that makes this test pass; no refactors".
5. `gate-runner` → all PASS (show the table).
6. Fresh `reviewer` with only issue + failing-test description + diff. Fix loop max 3 rounds.
7. Push (ask first) and open a PR with root cause, fix, the regression test, gate table.
   Never merge.
