#!/usr/bin/env bash
# argent-adb.sh — adb-based fallback for argent gesture/screenshot tools on Linux.
#
# Background: argent ships macOS-only simulator-server / ax-service / dylibs, so
# screenshot, gesture-tap, gesture-swipe, keyboard, run-sequence all fail on Linux
# (see https://github.com/software-mansion/argent/issues/246). Discovery tools
# (describe, list-devices, launch-app) still work because they use adb/uiautomator.
#
# This wrapper accepts NORMALIZED [0,1] coordinates — the same space argent's
# discovery tools return — and converts them to pixels for `adb shell input`.
#
# Usage:
#   ./scripts/argent-adb.sh tap   0.917 0.073
#   ./scripts/argent-adb.sh swipe 0.5 0.7 0.5 0.3 [durationMs]
#   ./scripts/argent-adb.sh text  "hello world"
#   ./scripts/argent-adb.sh key   KEYCODE_ENTER   # or e.g. KEYCODE_BACK
#   ./scripts/argent-adb.sh back
#   ./scripts/argent-adb.sh home
#   ./scripts/argent-adb.sh shot  [outfile]      # default: /tmp/zuhd-shot.png
#
# Env:
#   ADB_SERIAL  Override device serial (default: first `adb devices`).

set -euo pipefail

if [[ -z "${ADB_SERIAL:-}" ]]; then
  ADB_SERIAL="$(adb devices | awk 'NR>1 && $2=="device" { print $1; exit }')"
fi
if [[ -z "$ADB_SERIAL" ]]; then
  echo "error: no booted adb device found" >&2
  exit 1
fi

adb_sh() { adb -s "$ADB_SERIAL" shell "$@"; }

SIZE_CACHE="/tmp/argent-adb-size.${ADB_SERIAL}"

read_size() {
  if [[ -s "$SIZE_CACHE" ]]; then
    IFS='x' read -r SCREEN_W SCREEN_H < "$SIZE_CACHE" || true
    [[ -n "$SCREEN_W" && -n "$SCREEN_H" ]] && return
  fi
  local raw
  raw="$(adb_sh wm size | sed -n 's/.*: \([0-9]*x[0-9]*\).*/\1/p' | tail -n1)"
  SCREEN_W="${raw%x*}"
  SCREEN_H="${raw#*x}"
  printf '%sx%s\n' "$SCREEN_W" "$SCREEN_H" > "$SIZE_CACHE"
}

to_px() {
  # to_px <norm 0..1> <total px> -> integer px
  awk -v n="$1" -v t="$2" 'BEGIN { printf("%d", n*t + 0.5) }'
}

cmd="${1:-}"
shift || true

case "$cmd" in
  tap)
    read_size
    x_px="$(to_px "$1" "$SCREEN_W")"
    y_px="$(to_px "$2" "$SCREEN_H")"
    adb_sh input tap "$x_px" "$y_px"
    ;;
  swipe)
    read_size
    x1="$(to_px "$1" "$SCREEN_W")"
    y1="$(to_px "$2" "$SCREEN_H")"
    x2="$(to_px "$3" "$SCREEN_W")"
    y2="$(to_px "$4" "$SCREEN_H")"
    dur="${5:-300}"
    adb_sh input swipe "$x1" "$y1" "$x2" "$y2" "$dur"
    ;;
  text)
    # adb input text needs spaces escaped as %s
    encoded="${1// /%s}"
    adb_sh input text "$encoded"
    ;;
  key)
    adb_sh input keyevent "$1"
    ;;
  back)  adb_sh input keyevent KEYCODE_BACK ;;
  home)  adb_sh input keyevent KEYCODE_HOME ;;
  shot)
    out="${1:-/tmp/zuhd-shot.png}"
    adb -s "$ADB_SERIAL" exec-out screencap -p > "$out"
    echo "$out"
    ;;
  size)
    read_size
    echo "${SCREEN_W}x${SCREEN_H}"
    ;;
  *)
    echo "usage: $0 {tap|swipe|text|key|back|home|shot|size} ..." >&2
    exit 2
    ;;
esac
