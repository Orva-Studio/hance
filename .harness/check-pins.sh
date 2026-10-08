#!/usr/bin/env bash
set -uo pipefail
fail=0
for f in package-lock.json yarn.lock pnpm-lock.yaml; do
  [[ -e $f ]] && { echo "$f: delete it and run \`bun install\`. This project uses Bun."; fail=1; }
done
[[ -e bun.lock ]] || { echo "bun.lock missing: run \`bun install\` and commit it."; fail=1; }
while IFS= read -r pkg; do
  jq -r --arg f "$pkg" '[.dependencies, .devDependencies, .optionalDependencies]
    | map(. // {} | to_entries[]) | .[] | select(.value | test("^[\\^~]|^[<>*]|^latest$|\\.x"))
    | "\($f): \(.key)@\(.value) is a range. Pin the exact version: bun add --exact \(.key)"' "$pkg"
done < <(find . -name package.json -not -path '*/node_modules/*') | grep . && fail=1
exit $fail
