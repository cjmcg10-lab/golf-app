#!/usr/bin/env bash
# PostToolUse(Edit|Write): format the edited file. Never blocks (always exit 0).
f=$(python3 -c 'import json,sys;print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))' 2>/dev/null)
root=${CLAUDE_PROJECT_DIR:-.}
case "$f" in
  */node_modules/*|*/.venv/*|*/courses/*|*/dist/*) ;;
  *.ts|*.tsx|*.js|*.mjs|*.json|*.md|*.yaml|*.yml|*.css|*.html)
    (cd "$root" && pnpm -s exec prettier --write --ignore-unknown "$f" >/dev/null 2>&1) ;;
  *.py)
    "$root/tools/course-builder/.venv/bin/ruff" format -q "$f" >/dev/null 2>&1 ;;
esac
exit 0
