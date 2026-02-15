#!/usr/bin/env bash
# zuhd.news daily audio briefing — runs once daily at 07:00 UTC via systemd timer
# Generates briefing MP3, rebuilds site, deploys to Cloudflare

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_DIR/logs"

# Ensure mise-managed tools are on PATH (systemd doesn't source shell profiles)
export PATH="/root/.local/share/mise/installs/node/24.13.1/bin:/root/.local/bin:$PATH"
export HOME="/root"

mkdir -p "$LOG_DIR"

TIMESTAMP=$(date +%Y-%m-%d_%H%M)
LOG_FILE="$LOG_DIR/briefing-$TIMESTAMP.log"

cleanup() {
  echo "" | tee -a "$LOG_FILE"
  echo "Finished: $(date)" | tee -a "$LOG_FILE"
  find "$LOG_DIR" -name "briefing-*.log" -mtime +7 -delete 2>/dev/null || true
}
trap cleanup EXIT

cd "$PROJECT_DIR"

echo "=== zuhd.news daily briefing ===" | tee "$LOG_FILE"
echo "Started: $(date)" | tee -a "$LOG_FILE"

# Stage 1: Generate briefing (collect articles, SSML via Claude, TTS via Google)
echo "" | tee -a "$LOG_FILE"
echo "--- Stage 1: Generate briefing ---" | tee -a "$LOG_FILE"
timeout 300 node scripts/generate-briefing.js 2>&1 | tee -a "$LOG_FILE"
GEN_EXIT=$?
echo "Generate exit: $GEN_EXIT" | tee -a "$LOG_FILE"

if [ $GEN_EXIT -ne 0 ]; then
  echo "Briefing generation failed — aborting" | tee -a "$LOG_FILE"
  exit 1
fi

# Stage 2: Rebuild site (includes audio player)
echo "" | tee -a "$LOG_FILE"
echo "--- Stage 2: Build ---" | tee -a "$LOG_FILE"
node scripts/build.js 2>&1 | tee -a "$LOG_FILE"
BUILD_EXIT=$?
echo "Build exit: $BUILD_EXIT" | tee -a "$LOG_FILE"

if [ $BUILD_EXIT -ne 0 ]; then
  echo "Build failed — aborting" | tee -a "$LOG_FILE"
  exit 1
fi

# Stage 3: Deploy to Cloudflare Pages
echo "" | tee -a "$LOG_FILE"
echo "--- Stage 3: Deploy ---" | tee -a "$LOG_FILE"
npx wrangler pages deploy dist --project-name zuhd-news --branch master --commit-dirty=true 2>&1 | tee -a "$LOG_FILE"
DEPLOY_EXIT=$?
echo "Deploy exit: $DEPLOY_EXIT" | tee -a "$LOG_FILE"
