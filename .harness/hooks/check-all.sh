#!/usr/bin/env bash
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}"
export ROOT=$PWD
failed=0
while IFS= read -r cmd; do
  out=$(bash -c "$cmd" 2>&1) && continue
  base=.harness/baseline/$(printf %s "$cmd" | shasum | cut -c1-12)
  if [[ -f $base ]]; then
    out=$(awk 'NR == FNR { seen[$0]++; next } { k = $0; gsub(/[0-9]+/, "N", k); if (seen[k] > 0) seen[k]--; else print }' "$base" - <<< "$out")
    [[ -z $out ]] && continue
    out="New issues (older ones are baselined in $base):"$'\n'$out
  fi
  printf '%s\n' "$out" >&2
  failed=1
done < <(jq -r '.check[]' .harness/harness.json)
[[ $failed == 0 ]] || exit 2
