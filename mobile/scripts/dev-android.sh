#!/usr/bin/env bash
# One-shot dev launcher: emulator + Metro + dev client.
# Usage: ./scripts/dev-android.sh    (run from mobile/)
set -e

ADB=/opt/android-sdk/platform-tools/adb
APP_ID=news.zuhd.app

# 1. Boot emulator if not already running (uses ~/.local/bin/emu).
if ! "$ADB" devices | grep -q "emulator-.*device$"; then
  echo "▶ booting emulator..."
  setsid emu >/tmp/emulator.log 2>&1 < /dev/null &
  until "$ADB" shell getprop sys.boot_completed 2>/dev/null | grep -q "1"; do sleep 2; done
  echo "✓ emulator booted"
fi

# 2. Ensure dev client is installed; build only if missing.
if ! "$ADB" shell pm list packages | grep -q "package:$APP_ID"; then
  echo "▶ no dev client installed — running native build (5+ min)..."
  npx expo run:android
  exit $?
fi

# 3. Start Metro + open dev client. Stdin must stay attached so interactive
# keys (r, j, a, ?) work — no tee/pipe here. Expo already mirrors all output
# to .expo/dev/logs/start.log, which the agent monitor watches.
echo "▶ starting Metro + launching $APP_ID (logs mirrored to .expo/dev/logs/start.log)"
exec npx expo start --android --dev-client
