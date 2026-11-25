#!/usr/bin/env bash
# PreToolUse(Bash): block force-pushes that target main. Exit 2 = block (stderr shown to Claude).
# HOOK_BRANCH overrides the current-branch lookup (used by tools/sdlc/test-hooks.sh).
payload=$(cat)
branch=${HOOK_BRANCH:-$(git -C "${CLAUDE_PROJECT_DIR:-.}" rev-parse --abbrev-ref HEAD 2>/dev/null)}
PAYLOAD="$payload" BRANCH="$branch" python3 - <<'PY'
import json, os, re, shlex, sys
cmd = json.loads(os.environ["PAYLOAD"]).get("tool_input", {}).get("command", "")
branch = os.environ.get("BRANCH", "")
for part in re.split(r"&&|\|\||;|\|", cmd):
    try:
        toks = shlex.split(part)
    except ValueError:
        toks = part.split()
    if len(toks) < 2 or toks[0] != "git" or "push" not in toks[1:3]:
        continue
    args = toks[toks.index("push") + 1:]
    force = any(a in ("-f", "--force") or a.startswith("--force-with-lease") or a.startswith("--force-if-includes")
                or (a.startswith("-") and not a.startswith("--") and "f" in a) for a in args)
    refs = [a for a in args if not a.startswith("-")][1:]  # drop remote name
    plus = any(r.startswith("+") for r in refs)
    def to_main(r):
        dst = r.lstrip("+").split(":")[-1]
        return dst in ("main", "refs/heads/main")
    targets_main = any(to_main(r) for r in refs) or (not refs and branch == "main")
    if (force or plus) and targets_main:
        print("Blocked: force-pushing to main is not allowed. Ask the owner.", file=sys.stderr)
        sys.exit(2)
sys.exit(0)
PY
