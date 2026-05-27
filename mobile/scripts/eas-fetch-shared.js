#!/usr/bin/env node
// Populate `mobile/shared/` on the EAS build server. Locally `@shared/*`
// resolves to ../shared/ (the repo-root sibling), but Metro's resolver on
// EAS won't follow that cross-boundary path even with extraNodeModules or
// resolveRequest — so we place a copy INSIDE the project root where Metro
// resolves it natively. metro.config.js prefers ./shared/ when present.
// Runs as `eas-build-pre-install` (before `npm install`) — Node built-ins only.

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const mobileDir = path.resolve(__dirname, '..');
const targetDir = path.join(mobileDir, 'shared');
const markerFile = path.join(targetDir, 'countries', 'country-data.ts');

if (fs.existsSync(markerFile)) {
  console.log(`[eas-fetch-shared] ${targetDir} already populated — skipping`);
  process.exit(0);
}

if (fs.existsSync(targetDir)) {
  const entries = fs.readdirSync(targetDir);
  console.log(
    `[eas-fetch-shared] ${targetDir} exists but marker missing; ` +
      `contents: [${entries.join(', ') || '<empty>'}] — clearing`,
  );
  fs.rmSync(targetDir, { recursive: true, force: true });
}

if (!process.env.EAS_BUILD) {
  console.error('[eas-fetch-shared] not on EAS Build and mobile/shared/ missing — refusing to fetch');
  console.error('  (locally, metro.config falls back to ../shared/ so no action needed)');
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

fs.cpSync(src, targetDir, { recursive: true });
fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`[eas-fetch-shared] populated ${targetDir}`);
console.log(`[eas-fetch-shared] marker file exists: ${fs.existsSync(markerFile)}`);
