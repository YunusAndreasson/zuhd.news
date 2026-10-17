#!/usr/bin/env bash
# Keep dependencies current without accidentally migrating to another Expo SDK.
#
# Usage:
#   npm run deps:check          # report only (default)
#   npm run deps:update         # update within declared semver ranges
#   npm run deps:update:latest  # cross major versions, then re-pin Expo packages
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
APPLY=0
LATEST=0

for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    --latest) LATEST=1 ;;
    --) ;;
    -h|--help) sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "error: unknown argument '$arg' (try --help)" >&2; exit 1 ;;
  esac
done

cd "$APP_DIR"

echo "▸ [1/5] Checking Expo SDK compatibility…"
npx expo install --check --npm || true

echo
echo "▸ [2/5] Checking for outdated dependencies…"
npm outdated || true

if [ "$APPLY" -eq 0 ]; then
  echo
  echo "▸ Dry run complete — nothing was changed."
  echo "  Run npm run deps:update (or deps:update:latest to cross majors)."
  exit 0
fi

echo
if [ "$LATEST" -eq 1 ]; then
  echo "▸ [3/5] Updating direct dependencies to their latest releases…"
  # The Expo SDK itself is a deliberate migration; Expo-managed packages are
  # updated separately in the next step against the currently installed SDK.
  #
  # Held back on purpose — crossing these majors breaks the build, so they are
  # rejected here and revisited by hand:
  #   typescript     TS 7 has no stable programmatic API until 7.1, and
  #                  scripts/check-deprecated-apis.mjs (api:check) uses it.
  #   react,         RN's renderer is compiled against the exact React
  #   react-dom      version the SDK pins; react-dom moves with it, or its
  #                  peer range (^ the newer react) fails `npm install` below.
  #   jest family    the SDK pins jest and @types/jest (30 on SDK 58) but not
  #                  babel-jest or jest-environment-jsdom, so a new jest major
  #                  would leave those two a major ahead. Move all four by hand.
  npx --yes npm-check-updates --upgrade \
    --reject expo,typescript,react,react-dom,jest,@types/jest,babel-jest,jest-environment-jsdom
  npm install
else
  echo "▸ [3/5] Updating dependencies within package.json semver ranges…"
  npm update --save
fi

echo
echo "▸ [4/5] Re-pinning Expo-managed packages to SDK-compatible versions…"
# Any package listed under `expo.install.exclude` in package.json (none today) is
# deliberately ahead of the installed SDK's pin and is skipped here.
# `EXPO_DEBUG=1 npx expo install --check` prints exactly what was skipped.
npx expo install --fix --npm

echo
echo "▸ [5/5] Validating the installed dependency tree…"
npx expo-doctor || true

echo
echo "▸ Done. Review package.json and package-lock.json before committing."
