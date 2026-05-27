#!/usr/bin/env bash
# Bundle-size guard. Runs `expo export`, sums the emitted JS, and compares
# against `perf/bundle-budget.json`. Exits 1 on overrun.
#
#   ./scripts/check-bundle-size.sh           # check against budget
#   ./scripts/check-bundle-size.sh --update  # rewrite budget from current build

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
OUT_DIR="${TMPDIR:-/tmp}/zuhd-bundle-size"
BUDGET_FILE="$ROOT/perf/bundle-budget.json"

UPDATE=0
for arg in "$@"; do
  case "$arg" in
    --update) UPDATE=1 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

cd "$ROOT"
rm -rf "$OUT_DIR"
echo "→ npx expo export (ios) → $OUT_DIR"
npx expo export --platform ios --output-dir "$OUT_DIR" >/dev/null

# Sum every emitted JS / HBC file under _expo/.
TOTAL_BYTES=$(find "$OUT_DIR/_expo" \( -name '*.js' -o -name '*.hbc' \) -type f \
  -exec stat -c%s {} + 2>/dev/null | awk '{s+=$1} END {print s+0}')

if [[ "$TOTAL_BYTES" -eq 0 ]]; then
  echo "no JS/HBC files found under $OUT_DIR/_expo — export may have failed" >&2
  exit 2
fi

TOTAL_KB=$((TOTAL_BYTES / 1024))
echo "→ bundle size: ${TOTAL_KB} KiB (${TOTAL_BYTES} bytes)"

if [[ "$UPDATE" -eq 1 || ! -f "$BUDGET_FILE" ]]; then
  BUDGET=$((TOTAL_BYTES + TOTAL_BYTES / 10))   # current + 10% headroom
  cat > "$BUDGET_FILE" <<EOF
{
  "current_bytes": $TOTAL_BYTES,
  "budget_bytes": $BUDGET,
  "updated": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
  echo "→ budget written: $BUDGET_FILE (${BUDGET} bytes, +10% headroom)"
  exit 0
fi

BUDGET=$(node -e "console.log(require('$BUDGET_FILE').budget_bytes)")
if [[ "$TOTAL_BYTES" -gt "$BUDGET" ]]; then
  OVER_KB=$(( (TOTAL_BYTES - BUDGET) / 1024 ))
  echo "✗ bundle exceeds budget by ${OVER_KB} KiB (current ${TOTAL_BYTES}, budget ${BUDGET})" >&2
  echo "  if intentional, rerun with --update to refresh the budget" >&2
  exit 1
fi

UNDER_KB=$(( (BUDGET - TOTAL_BYTES) / 1024 ))
echo "✓ within budget (${UNDER_KB} KiB headroom)"
