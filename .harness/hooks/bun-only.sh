#!/usr/bin/env bash
cmd=$(jq -r '.tool_input.command // empty')
if [[ $cmd =~ (^|[;&|\(][[:space:]]*|[[:space:]]&&[[:space:]]*)(npm|npx|yarn|pnpm)([[:space:]]|$) ]]; then
  echo "Use Bun, not ${BASH_REMATCH[2]}: bun install, bun add [--exact], bun run, bunx." >&2
  exit 2
fi
