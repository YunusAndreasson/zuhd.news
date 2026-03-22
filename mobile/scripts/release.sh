#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

usage() {
  echo "Usage: ./scripts/release.sh [test|release] [ios|android|all]"
  echo ""
  echo "  test     Build + submit to TestFlight / Google Play internal track"
  echo "  release  Build + submit to App Store / Google Play production"
  echo ""
  echo "Examples:"
  echo "  ./scripts/release.sh test ios       # TestFlight build"
  echo "  ./scripts/release.sh test android   # Google Play internal"
  echo "  ./scripts/release.sh test all       # Both platforms"
  echo "  ./scripts/release.sh release all    # Production release"
  exit 1
}

[[ $# -lt 2 ]] && usage

MODE="${1}"
PLATFORM="${2}"

if [[ "$MODE" != "test" && "$MODE" != "release" ]]; then
  echo "Error: first argument must be 'test' or 'release'"
  usage
fi

if [[ "$PLATFORM" != "ios" && "$PLATFORM" != "android" && "$PLATFORM" != "all" ]]; then
  echo "Error: second argument must be 'ios', 'android', or 'all'"
  usage
fi

# Bump version
echo "› Bumping version..."
node scripts/bump.js

# Commit the version bump
git add app.json package.json
git commit -m "chore: bump to $(node -p "require('./package.json').version")" || true

echo "› Building ($MODE) for $PLATFORM..."

build_ios() {
  eas build --profile production --platform ios --non-interactive
}

build_android() {
  eas build --profile production --platform android --non-interactive
}

submit_ios() {
  local target="App Store"; [[ "$MODE" == "test" ]] && target="TestFlight"
  echo "› Submitting iOS to $target..."
  eas submit --platform ios --latest --non-interactive
}

submit_android() {
  echo "› Submitting Android to Google Play..."
  eas submit --platform android --latest --non-interactive
}

if [[ "$PLATFORM" == "ios" || "$PLATFORM" == "all" ]]; then
  build_ios
  submit_ios
fi

if [[ "$PLATFORM" == "android" || "$PLATFORM" == "all" ]]; then
  build_android
  submit_android
fi

echo "✓ Done."
