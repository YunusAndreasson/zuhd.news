#!/usr/bin/env node
// EAS only uploads the `mobile/` project dir, but `@shared/*` resolves to
// `../shared/` at the repo root. Fetch just that directory from GitHub at
// the commit EAS is building, so Metro can resolve it during bundling.
// Runs as `eas-build-pre-install` (before `npm install`) — Node built-ins only.

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sharedDir = path.resolve(__dirname, '..', '..', 'shared');
// Marker file — `shared/` may exist as an empty placeholder (EAS-CLI's monorepo
// detection creates one when metro.config references ../shared). Skip only if
// the actual source files are there.
const markerFile = path.join(sharedDir, 'countries', 'country-data.ts');

if (fs.existsSync(markerFile)) {
  console.log(`[eas-fetch-shared] shared/ already populated at ${sharedDir} — skipping`);
  process.exit(0);
}

if (fs.existsSync(sharedDir)) {
  const entries = fs.readdirSync(sharedDir);
  console.log(
    `[eas-fetch-shared] shared/ exists at ${sharedDir} but marker file missing; ` +
      `contents: [${entries.join(', ') || '<empty>'}] — re-fetching from GitHub`,
  );
  fs.rmSync(sharedDir, { recursive: true, force: true });
}

if (!process.env.EAS_BUILD) {
  console.error('[eas-fetch-shared] shared/ missing and not running on EAS Build — refusing to fetch');
  process.exit(1);
}

const commit = process.env.EAS_BUILD_GIT_COMMIT_HASH;
if (!commit) {
  console.error('[eas-fetch-shared] EAS_BUILD_GIT_COMMIT_HASH not set');
  process.exit(1);
}

const repoUrl = 'https://github.com/YunusAndreasson/zuhd.news.git';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zuhd-shared-'));

console.log(`[eas-fetch-shared] sparse-checkout shared/ from ${repoUrl} @ ${commit}`);

const run = (cmd) => execSync(cmd, { stdio: 'inherit', cwd: tmpDir });

run('git init -q');
run(`git remote add origin ${repoUrl}`);
run('git config core.sparseCheckout true');
fs.writeFileSync(path.join(tmpDir, '.git', 'info', 'sparse-checkout'), 'shared/\n');
try {
  run(`git fetch --depth 1 origin ${commit}`);
} catch {
  console.error(
    `[eas-fetch-shared] couldn't fetch ${commit} from ${repoUrl}.\n` +
      `  The commit likely wasn't pushed to GitHub before \`eas build\` ran.\n` +
      `  Push the branch (release.sh does this automatically) and re-run the build.`,
  );
  process.exit(1);
}
run('git checkout -q FETCH_HEAD');

const src = path.join(tmpDir, 'shared');
if (!fs.existsSync(src)) {
  console.error(`[eas-fetch-shared] shared/ not found in fetched tree at ${src}`);
  process.exit(1);
}

fs.cpSync(src, sharedDir, { recursive: true });
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`[eas-fetch-shared] shared/ copied to ${sharedDir}`);
