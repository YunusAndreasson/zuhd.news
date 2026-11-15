/**
 * @jest-environment node
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// scripts/check-runtime.js against a stub @expo/fingerprint, in a temp project.
// The stub hashes `native.json`, so a test makes a native change by editing it.
const SCRIPT = path.join(__dirname, '..', 'scripts', 'check-runtime.js');
const runtime = '2.12.0';

let root: string;
function json(file: string, value: unknown) {
  writeFileSync(path.join(root, file), JSON.stringify(value));
}
function manifest(
  runtimes: Record<string, { ios: string; android: string }>,
  retired: string[] = [],
) {
  json('native-runtimes.json', { retired, runtimes });
}
function run(...args: string[]) {
  return spawnSync(process.execPath, [path.join(root, 'scripts/check-runtime.js'), ...args], {
    encoding: 'utf8',
  });
}
const recorded = { ios: 'ios:native-v1', android: 'android:native-v1' };

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'runtime-gate-'));
  mkdirSync(path.join(root, 'scripts'));
  copyFileSync(SCRIPT, path.join(root, 'scripts/check-runtime.js'));
  mkdirSync(path.join(root, 'node_modules/@expo/fingerprint'), { recursive: true });
  writeFileSync(
    path.join(root, 'node_modules/@expo/fingerprint/index.js'),
    `const fs = require('node:fs');
    const path = require('node:path');
    exports.DEFAULT_IGNORE_PATHS = [];
    exports.DEFAULT_SOURCE_SKIPS = 0;
    exports.SourceSkips = { PackageJsonScriptsAll: 1024, GitIgnore: 2048 };
    exports.createFingerprintAsync = async (root, options) => {
      const p = options.platforms[0];
      const native = JSON.parse(fs.readFileSync(path.join(root, 'native.json'), 'utf8'));
      return {
        hash: p + ':' + native.version,
        sources: [{ id: 'rncoreAutolinkingConfig:' + p }, { id: 'expoAutolinkingConfig:' + p }],
      };
    };`,
  );
  json('native.json', { version: 'native-v1' });
  json('app.json', { expo: { version: '1448.4.9', runtimeVersion: runtime } });
  manifest({ [runtime]: recorded });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

it('accepts unchanged native source', () => {
  expect(run().status).toBe(0);
});

it('refuses a native change within a recorded runtime, even when recording', () => {
  // Adding @sentry/react-native, or any other native package, lands here.
  json('native.json', { version: 'native-v2' });
  for (const args of [[], ['--record']]) {
    const result = run(...args);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('NEW runtimeVersion');
  }
  expect(
    JSON.parse(readFileSync(path.join(root, 'native-runtimes.json'), 'utf8')).runtimes[runtime],
  ).toEqual(recorded);
});

it('refuses a change on one platform alone', () => {
  manifest({ [runtime]: { ...recorded, android: 'android:older' } });
  expect(run().status).toBe(1);
});

it('records a new runtime only when asked', () => {
  json('native.json', { version: 'native-v2' });
  json('app.json', { expo: { version: '1448.4.9', runtimeVersion: '2.13.0' } });
  const unrecorded = run();
  expect(unrecorded.status).toBe(1);
  expect(unrecorded.stderr).toContain('Unrecorded runtime 2.13.0');
  expect(run('--record').status).toBe(0);
  expect(run().status).toBe(0);
  const { runtimes } = JSON.parse(readFileSync(path.join(root, 'native-runtimes.json'), 'utf8'));
  expect(runtimes['2.13.0']).toEqual({ ios: 'ios:native-v2', android: 'android:native-v2' });
  expect(runtimes[runtime]).toEqual(recorded);
});

it('refuses a retired runtime, whose binaries are already out', () => {
  json('app.json', { expo: { runtimeVersion: '2.11.0' } });
  manifest({ [runtime]: recorded }, ['2.11.0']);
  const result = run('--record');
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('retired');
});

it('refuses a runtime policy instead of a hand-set string', () => {
  json('app.json', { expo: { runtimeVersion: { policy: 'appVersion' } } });
  expect(run().status).toBe(1);
});

it('refuses an incomplete fingerprint instead of recording it', () => {
  writeFileSync(
    path.join(root, 'node_modules/@expo/fingerprint/index.js'),
    `exports.DEFAULT_IGNORE_PATHS = []; exports.DEFAULT_SOURCE_SKIPS = 0; exports.SourceSkips = {};
    exports.createFingerprintAsync = async () => ({ hash: 'partial', sources: [] });`,
  );
  manifest({});
  const result = run('--record');
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Incomplete');
});
