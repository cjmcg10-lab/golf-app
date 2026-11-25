---
name: plan
description: Plan a ticket without writing code — runs the planner subagent and writes docs/plans/<ticket>.md. Usage: /plan <issue-number>
---

1. Fetch the issue from GitHub `cjmcg10-lab/golf-app` with the GitHub MCP `issue_read` tool
   (title, body, comments, linked mockups). If no AC section → ask the owner for AC and stop.
2. Dispatch the `planner` subagent with the issue text only. It writes `docs/plans/<issue>-<slug>.md`.
3. Show the owner the plan file contents. Do not implement anything.
