#!/usr/bin/env node
// Keep each runtimeVersion's native source immutable once it has been recorded.
//
// app.json hand-sets `runtimeVersion` ("2.12.0"), so nothing stops a native change
// shipping under a runtime whose binaries lack it, and an OTA built from it would
// then crash those binaries. This hashes the native source per platform and holds it
// to the hash recorded for the runtime in native-runtimes.json. It runs from
// `npm run verify`, as `eas-build-post-install` (so such a build fails) and before
// every OTA (scripts/eas-update.sh). Runtimes in `retired` belong to binaries already
// shipped, so they can never be recorded again.
const fs = require('node:fs');
const path = require('node:path');
const {
  createFingerprintAsync,
  DEFAULT_IGNORE_PATHS,
  DEFAULT_SOURCE_SKIPS,
  SourceSkips,
} = require('@expo/fingerprint');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'native-runtimes.json');

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--record')) throw new Error('Usage: check-runtime.js [--record]');
  const record = args.includes('--record');
  const runtime = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo
    ?.runtimeVersion;
  if (typeof runtime !== 'string' || runtime === '') {
    throw new Error(
      'Expected a hand-set string runtimeVersion in app.json (this gate keys the record by it).',
    );
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.retired.includes(runtime)) {
    throw new Error(
      `Runtime ${runtime} is retired: binaries built with it are already out. Set a NEW runtimeVersion in app.json.`,
    );
  }
  const hashes = {};
  for (const platform of ['ios', 'android']) {
    const fingerprint = await createFingerprintAsync(root, {
      platforms: [platform],
      extraSources: ['widgets', 'assets/widget'].map((filePath) => ({
        type: 'dir',
        filePath,
        reasons: ['Bundled Daily briefing widget'],
      })),
      // ios/ and android/ are generated (CNG): a stale local prebuild sits here and
      // EAS has run prebuild by post-install. Their source is the app config, the
      // plugins, the patches and the native packages, which are all hashed.
      ignorePaths: [...DEFAULT_IGNORE_PATHS, 'ios', 'ios/**', 'android', 'android/**'],
      // package.json scripts and .gitignore are not native source: counted, adding
      // an npm script would retire a runtime that no binary changed for.
      sourceSkips: DEFAULT_SOURCE_SKIPS | SourceSkips.PackageJsonScriptsAll | SourceSkips.GitIgnore,
    });
    const ids = new Set(fingerprint.sources.map((source) => source.id));
    for (const id of [`rncoreAutolinkingConfig:${platform}`, `expoAutolinkingConfig:${platform}`]) {
      if (!ids.has(id)) {
        throw new Error(
          `Incomplete ${platform} native discovery (no ${id}); check node_modules before recording or publishing.`,
        );
      }
    }
    hashes[platform] = fingerprint.hash;
  }
  const previous = manifest.runtimes[runtime];
  if (previous && (previous.ios !== hashes.ios || previous.android !== hashes.android)) {
    throw new Error(
      `Native source changed within runtime ${runtime}. Set a NEW runtimeVersion in app.json, then run npm run runtime:record. ` +
        'Never replace an existing runtime record.',
    );
  }
  if (!previous) {
    if (!record) {
      throw new Error(
        `Unrecorded runtime ${runtime}. Run npm run runtime:record and commit native-runtimes.json before building or publishing.`,
      );
    }
    manifest.runtimes[runtime] = hashes;
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Recorded runtime ${runtime}.`);
  }
  console.log(`Native source matches runtime ${runtime} (iOS and Android).`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
