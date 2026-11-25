---
name: pr-review
description: Review a PR or branch — runs gates and an independent reviewer, then posts one short PR comment. Usage: /pr-review [PR-number | branch]
---

1. Resolve the target: PR number → `pull_request_read` for head branch, linked issue, diff;
   branch → `git diff main...<branch>`. No argument → current branch.
2. Check out the head in a worktree; dispatch `gate-runner` there.
3. Dispatch a fresh `reviewer` with only: the linked issue (AC), any `docs/plans/` file for it,
   and the diff.
4. Post ONE PR comment (`add_issue_comment`), about 20 lines max:
   `Gates: lint ✅ typecheck ✅ test ❌ build ✅` · `Verdict: CHANGES` · one line per finding
   `[major] file:line — text`, then the footer the repo rules require.
   For a branch without a PR, print the same text instead of posting.
