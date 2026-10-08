#!/usr/bin/env bash
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}"
file=$(jq -r '.tool_input.file_path // empty')
[[ -n $file ]] || exit 0
rel=${file#"$PWD"/}
failed=0
for i in $(seq 0 $(($(jq '.edit | length' .harness/harness.json) - 1))); do
  e=$(jq -c ".edit[$i]" .harness/harness.json)
  [[ $rel =~ $(jq -r .match <<< "$e") ]] || continue
  fmt=$(jq -r '.format // empty' <<< "$e")
  [[ -z $fmt ]] || bash -c "$fmt" _ "$file" >/dev/null 2>&1
  out=$(bash -c "$(jq -r .lint <<< "$e")" _ "$file" 2>&1) || { printf '%s\n' "$out" >&2; failed=1; }
done
[[ $failed == 0 ]] || exit 2
