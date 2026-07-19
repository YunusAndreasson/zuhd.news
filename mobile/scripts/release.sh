#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

usage() {
  cat <<'EOF'
Usage: ./scripts/release.sh [--check] [ios|android|all]

  --check  Run every local preflight without starting an EAS build.
  ios      Build and auto-submit to TestFlight.
  android  Build and auto-submit to the configured Play testing track.
  all      Build and auto-submit both platforms (default).
EOF
}

CHECK_ONLY=false
PLATFORM=all
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=true ;;
    ios|android|all) PLATFORM="$arg" ;;
    -h|--help) usage; exit 0 ;;
    *) echo "error: unknown argument: $arg" >&2; usage >&2; exit 2 ;;
  esac
done

for command in git node npx eas; do
  command -v "$command" >/dev/null || { echo "error: missing required command: $command" >&2; exit 1; }
done

REPO_ROOT="$(git rev-parse --show-toplevel)"
dirty="$(git -C "$REPO_ROOT" status --porcelain --untracked-files=all)"
if [[ -n "$dirty" ]]; then
  echo "error: release source is not committed. Commit or stash every repository change first:" >&2
  printf '%s\n' "$dirty" >&2
  exit 1
fi

upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)"
if [[ -z "$upstream" ]]; then
  echo "error: the current branch has no upstream. Push it with: git push -u origin HEAD" >&2
  exit 1
fi

remote="${upstream%%/*}"
echo "› Refreshing $upstream..."
git fetch --quiet "$remote"
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse '@{upstream}')" ]]; then
  echo "error: HEAD does not exactly match $upstream. Push or pull before releasing." >&2
  git rev-list --left-right --count 'HEAD...@{upstream}' >&2
  exit 1
fi

RELEASE_PLATFORM="$PLATFORM" node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const eas = require('./eas.json');
const selected = process.env.RELEASE_PLATFORM === 'all'
  ? ['ios', 'android']
  : [process.env.RELEASE_PLATFORM];
const submit = eas.submit?.production ?? {};

for (const platform of selected) {
  const config = submit[platform];
  if (!config) throw new Error(`submit.production.${platform} is not configured in eas.json`);
  if (platform === 'ios' && !config.ascAppId) {
    throw new Error('submit.production.ios.ascAppId is required for non-interactive TestFlight submission');
  }
  if (platform === 'android' && !config.track) {
    throw new Error('submit.production.android.track is required for non-interactive Play submission');
  }
  if (platform === 'android' && !config.serviceAccountKeyPath) {
    throw new Error('submit.production.android.serviceAccountKeyPath is required for non-interactive Play submission');
  }
  for (const key of ['serviceAccountKeyPath', 'ascApiKeyPath']) {
    if (config[key] && !fs.existsSync(path.resolve(config[key]))) {
      throw new Error(`${key} does not exist: ${config[key]}`);
    }
  }
}
NODE

if [[ -f pnpm-lock.yaml ]]; then
  VERIFY=(pnpm run verify)
else
  VERIFY=(npm run verify)
fi

echo "› Running full repository verification..."
"${VERIFY[@]}"

echo "› Validating resolved Expo configuration..."
npx expo config --type public >/dev/null

PREFLIGHT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/eas-release-preflight.XXXXXX")"
trap 'rm -rf "$PREFLIGHT_DIR"' EXIT

bundle_platform() {
  local target="$1"
  echo "› Creating a local production JavaScript bundle for $target..."
  npx expo export --platform "$target" --output-dir "$PREFLIGHT_DIR/export-$target" --clear
}

inspect_archive() {
  local target="$1"
  echo "› Inspecting the EAS upload archive for $target..."
  eas build:inspect --platform "$target" --profile production --stage archive \
    --output "$PREFLIGHT_DIR/archive-$target"
}

if [[ "$PLATFORM" == all ]]; then
  bundle_platform ios
  bundle_platform android
  inspect_archive ios
  inspect_archive android
else
  bundle_platform "$PLATFORM"
  inspect_archive "$PLATFORM"
fi

if [[ -n "$(git -C "$REPO_ROOT" status --porcelain --untracked-files=all)" ]]; then
  echo "error: preflight changed tracked source files. Review and commit them before releasing." >&2
  git -C "$REPO_ROOT" status --short >&2
  exit 1
fi

echo "✓ Local release preflight passed for $PLATFORM at $(git rev-parse --short HEAD)."
if [[ "$CHECK_ONLY" == true ]]; then
  exit 0
fi

echo "› Checking Expo authentication..."
eas whoami >/dev/null

echo "› Starting production build and automatic submission for $PLATFORM..."
eas build --platform "$PLATFORM" --profile production \
  --auto-submit-with-profile production --non-interactive --clear-cache \
  --message "Release $(git rev-parse --short HEAD)"
