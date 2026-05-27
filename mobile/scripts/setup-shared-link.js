#!/usr/bin/env node
// Local-dev postinstall: ensure mobile/shared/ exists so Metro can resolve
// `@shared/*` without cross-boundary watching. Creates a symlink to the
// repo-root shared/ if mobile/shared/ doesn't already exist.
//
// On EAS Build, scripts/eas-fetch-shared.js populates mobile/shared/ as a
// real directory before npm install runs — this script then sees the dir
// and skips, leaving the EAS copy intact.

const fs = require('node:fs');
const path = require('node:path');

const mobileDir = path.resolve(__dirname, '..');
const target = path.join(mobileDir, 'shared');

if (fs.existsSync(target)) {
  process.exit(0);
}

const repoShared = path.resolve(mobileDir, '..', 'shared');
if (!fs.existsSync(repoShared)) {
  console.warn(`[setup-shared-link] repo-root shared/ not found at ${repoShared} — skipping`);
  process.exit(0);
}

fs.symlinkSync('../shared', target, 'dir');
console.log(`[setup-shared-link] symlinked ${target} -> ../shared`);
