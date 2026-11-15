#!/usr/bin/env bash
# The one way to publish an OTA update to the production channel: `npm run ota`.
# It refuses unless the native runtime gate passes and HEAD is committed and pushed,
# then pins the branch and the EAS environment so neither can be mistyped.
set -euo pipefail

cd "$(dirname "$0")/.."

usage() {
  cat <<'EOF'
Usage: npm run ota -- --message "<what changed>" [ios|android|all] [--rollout-percentage N] [--dry-run]

  --message, -m          Required. Shown in the EAS dashboard for this update.
  ios|android|all        Platform (default: all).
  --rollout-percentage   Serve the update to N% (1-100) of the runtime's users first.
  --dry-run              Run every check, print the eas command, and stop.

Publishes to branch "production" with the "production" EAS environment, for the
runtimeVersion in app.json. A native change needs a new runtime and a store build
(npm run release), not an update.
EOF
}

PLATFORM=all
MESSAGE=""
ROLLOUT=""
DRY_RUN=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    ios|android|all) PLATFORM="$1" ;;
    -m|--message) [[ $# -ge 2 ]] || { echo "error: $1 needs a value" >&2; exit 2; }; MESSAGE="$2"; shift ;;
    --message=*) MESSAGE="${1#*=}" ;;
    --rollout-percentage) [[ $# -ge 2 ]] || { echo "error: $1 needs a value" >&2; exit 2; }; ROLLOUT="$2"; shift ;;
    --rollout-percentage=*) ROLLOUT="${1#*=}" ;;
    --dry-run) DRY_RUN=true ;;
    -h|--help) usage; exit 0 ;;
    *) echo "error: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

if [[ -z "${MESSAGE// }" ]]; then
  echo "error: --message is required: say what this update changes." >&2
  exit 2
fi
if [[ -n "$ROLLOUT" ]] && ! [[ "$ROLLOUT" =~ ^[1-9][0-9]?$|^100$ ]]; then
  echo "error: --rollout-percentage must be a whole number from 1 to 100, got: $ROLLOUT" >&2
  exit 2
fi

for command in git node; do
  command -v "$command" >/dev/null || { echo "error: missing required command: $command" >&2; exit 1; }
done

echo "› Checking the native runtime record..."
node scripts/check-runtime.js

REPO_ROOT="$(git rev-parse --show-toplevel)"
dirty="$(git -C "$REPO_ROOT" status --porcelain --untracked-files=all)"
if [[ -n "$dirty" ]]; then
  echo "error: the update would not match a commit. Commit or stash every repository change first:" >&2
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
  echo "error: HEAD does not exactly match $upstream. Push or pull before publishing." >&2
  git rev-list --left-right --count 'HEAD...@{upstream}' >&2
  exit 1
fi

# The production build profile's channel is what the store binaries listen on.
node -e '
const channel = require("./eas.json").build?.production?.channel;
if (channel !== "production") {
  console.error(`error: eas.json build.production.channel is ${JSON.stringify(channel)}, expected "production"; fix this script before publishing.`);
  process.exit(1);
}'

CMD=(eas update --branch production --environment production --platform "$PLATFORM"
  --message "$MESSAGE" --non-interactive)
if [[ -n "$ROLLOUT" ]]; then
  CMD+=(--rollout-percentage "$ROLLOUT")
fi

if [[ "$DRY_RUN" == true ]]; then
  echo "✓ Checks passed at $(git rev-parse --short HEAD). Dry run, would run:"
  printf -v line ' %q' "${CMD[@]}"
  echo " $line"
  exit 0
fi

command -v eas >/dev/null || { echo "error: missing required command: eas" >&2; exit 1; }
echo "› Publishing to production ($PLATFORM${ROLLOUT:+, ${ROLLOUT}% rollout}) at $(git rev-parse --short HEAD)..."
"${CMD[@]}"

# No crash reporting yet. When @sentry/react-native lands (a native change, so a new
# runtimeVersion), upload this update's source maps here, from the dist/ eas update
# just exported, so its crashes symbolicate.
