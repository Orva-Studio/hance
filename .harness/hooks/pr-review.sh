#!/usr/bin/env bash
[[ $(jq -r '.tool_input.command // empty') =~ gh[[:space:]]+pr[[:space:]]+create ]] || exit 0
cat >&2 <<'MSG'
PR created. Before merging, have a different model review it in a fresh context, then fix what it finds. One of:
- codex review --base main
- grok -p "Review this branch's diff against main for bugs. Findings only."
- a subagent on a different Claude model
MSG
exit 2
