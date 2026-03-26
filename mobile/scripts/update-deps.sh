#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Update all dependencies to latest, then pin to Expo-compatible versions.
# Preserves version prefix style (^, ~, exact).
#
# Usage:
#   ./scripts/update-deps.sh            # update everything
#   ./scripts/update-deps.sh --dry-run  # preview only

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

if $DRY_RUN; then
  echo "=== Dry run ==="
  echo ""
  echo "Outdated packages:"
  npm outdated 2>/dev/null || true
  echo ""
  echo "Expo compatibility:"
  npx expo install --check 2>/dev/null || true
  exit 0
fi

# Snapshot before
BEFORE=$(jq -r '(.dependencies // {}) + (.devDependencies // {}) | to_entries[] | "\(.key) \(.value)"' package.json | sort)

node -e '
const { execSync } = require("child_process");
const fs = require("fs");

function getPrefix(spec) {
  if (spec.startsWith("~")) return "~";
  if (spec.startsWith("^")) return "^";
  return "";
}

function latestVersion(name) {
  try {
    return execSync(`npm view ${name} version 2>/dev/null`, { encoding: "utf8" }).trim();
  } catch { return null; }
}

function readPkg() {
  return JSON.parse(fs.readFileSync("package.json", "utf8"));
}

function writePkg(pkg) {
  fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
}

// Phase 1: bump everything to latest
console.log("→ Updating to latest...");
let pkg = readPkg();
let changed = 0;
for (const field of ["dependencies", "devDependencies"]) {
  if (!pkg[field]) continue;
  for (const [name, spec] of Object.entries(pkg[field])) {
    const prefix = getPrefix(spec);
    const latest = latestVersion(name);
    if (!latest) continue;
    const newSpec = prefix + latest;
    if (newSpec !== spec) {
      console.log("  %s: %s → %s", name, spec, newSpec);
      pkg[field][name] = newSpec;
      changed++;
    }
  }
}
if (changed === 0) console.log("  All packages already at latest.");
writePkg(pkg);

// Install so expo check sees actual versions
console.log("\n→ Installing...");
execSync("npm install 2>&1", { encoding: "utf8", stdio: "pipe" });

// Phase 2: read expo check and pin incompatible packages
console.log("→ Syncing with Expo...");
let expoJson = {};
try {
  expoJson = JSON.parse(execSync("npx expo install --check --json 2>&1", { encoding: "utf8" }));
} catch (e) {
  try { expoJson = JSON.parse(e.stdout || "{}"); } catch { /* no expo issues */ }
}

let pinned = 0;
pkg = readPkg(); // re-read (npm install may have modified)
if (expoJson.dependencies && expoJson.dependencies.length) {
  for (const dep of expoJson.dependencies) {
    const field = dep.packageType || "dependencies";
    if (pkg[field]?.[dep.packageName]) {
      const old = pkg[field][dep.packageName];
      const expected = dep.expectedVersionOrRange;
      if (old !== expected) {
        console.log("  pin %s: %s → %s", dep.packageName, old, expected);
        pkg[field][dep.packageName] = expected;
        pinned++;
      }
    }
  }
}
if (pinned === 0) {
  console.log("  All Expo-managed deps compatible.");
} else {
  writePkg(pkg);
  console.log("  Pinned %d package(s).", pinned);
  console.log("\n→ Reinstalling...");
  execSync("npm install 2>&1", { encoding: "utf8", stdio: "pipe" });
}
'

# Show diff
AFTER=$(jq -r '(.dependencies // {}) + (.devDependencies // {}) | to_entries[] | "\(.key) \(.value)"' package.json | sort)
echo ""
echo "=== Changes ==="
diff --color=auto <(echo "$BEFORE") <(echo "$AFTER") && echo "  (none)" || true

# Verify
echo ""
echo "→ Expo compatibility:"
npx expo install --check 2>&1 || true
