#!/usr/bin/env bash
# Tests .claude/hooks/block-force-push.sh with sample PreToolUse payloads.
set -u
HOOK="$(dirname "$0")/../../.claude/hooks/block-force-push.sh"
fail=0
check() { # expected_exit command [current_branch]
  local want=$1 cmd=$2 branch=${3:-feat/x}
  local json; json=$(python3 -c 'import json,sys;print(json.dumps({"tool_name":"Bash","tool_input":{"command":sys.argv[1]}}))' "$cmd")
  echo "$json" | HOOK_BRANCH="$branch" bash "$HOOK" >/dev/null 2>&1; local got=$?
  if [ "$got" = "$want" ]; then echo "ok   [$got] $cmd (on $branch)"; else echo "FAIL [want $want got $got] $cmd (on $branch)"; fail=1; fi
}
check 2 "git push --force origin main"
check 2 "git push -f origin HEAD:main"
check 2 "git push --force-with-lease origin main"
check 2 "git push origin +main"
check 2 "git push --force" main
check 0 "git push origin feat/1-x"
check 0 "git push --force origin feat/1-x"
check 0 "git push origin main"
check 0 "echo git push --force origin feature-main-ish" 
check 0 "ls -la"
exit $fail
