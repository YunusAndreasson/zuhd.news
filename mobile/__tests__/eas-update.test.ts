/**
 * @jest-environment node
 */
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// scripts/eas-update.sh in a throwaway repo with its own upstream. `eas` on PATH is
// a stub that only leaves a mark, so no test can publish; each refusal must leave
// none, and the dry run must stop before it too.
const SCRIPT = path.join(__dirname, '..', 'scripts', 'eas-update.sh');

let base: string;
let repo: string;
let mark: string;
let env: NodeJS.ProcessEnv;

function git(...args: string[]) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8', env });
  if (result.status !== 0) throw new Error(result.stderr);
}
function gate(exitCode: number) {
  writeFileSync(path.join(repo, 'mobile/scripts/check-runtime.js'), `process.exit(${exitCode});\n`);
}
function ota(...args: string[]) {
  return spawnSync('bash', [path.join(repo, 'mobile/scripts/eas-update.sh'), ...args], {
    encoding: 'utf8',
    env,
  });
}

beforeEach(() => {
  base = mkdtempSync(path.join(tmpdir(), 'eas-update-'));
  repo = path.join(base, 'repo');
  mark = path.join(base, 'eas-was-called');
  mkdirSync(path.join(base, 'bin'));
  writeFileSync(path.join(base, 'bin/eas'), `#!/bin/sh\ntouch '${mark}'\n`);
  chmodSync(path.join(base, 'bin/eas'), 0o755);
  env = {
    ...process.env,
    PATH: `${path.join(base, 'bin')}:${process.env.PATH}`,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: 'test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  };
  spawnSync('git', ['init', '-q', '--bare', path.join(base, 'upstream.git')], { env });
  mkdirSync(path.join(repo, 'mobile/scripts'), { recursive: true });
  git('init', '-q', '-b', 'master');
  copyFileSync(SCRIPT, path.join(repo, 'mobile/scripts/eas-update.sh'));
  gate(0);
  writeFileSync(
    path.join(repo, 'mobile/eas.json'),
    JSON.stringify({ build: { production: { channel: 'production' } } }),
  );
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  git('remote', 'add', 'origin', path.join(base, 'upstream.git'));
  git('push', '-q', '-u', 'origin', 'master');
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

function expectRefusal(result: ReturnType<typeof ota>, code: number, text: string) {
  expect(result.status).toBe(code);
  expect(result.stderr).toContain(text);
  expect(existsSync(mark)).toBe(false);
}

it('requires a message', () => {
  expectRefusal(ota('--dry-run'), 2, '--message is required');
  expectRefusal(ota('-m', '  '), 2, '--message is required');
});

it('refuses an unknown platform or a rollout outside 1-100', () => {
  expectRefusal(ota('-m', 'x', 'web'), 2, 'unknown argument');
  for (const pct of ['0', '101', '50.5', 'half']) {
    expectRefusal(ota('-m', 'x', '--rollout-percentage', pct), 2, 'whole number');
  }
});

it('refuses when the runtime gate fails', () => {
  gate(1);
  git('commit', '-qam', 'gate fails');
  git('push', '-q');
  expectRefusal(ota('-m', 'x'), 1, '');
});

it('refuses an uncommitted tree', () => {
  writeFileSync(path.join(repo, 'stray.txt'), 'x');
  expectRefusal(ota('-m', 'x'), 1, 'Commit or stash');
});

it('refuses a HEAD that is not on its upstream', () => {
  writeFileSync(path.join(repo, 'more.txt'), 'x');
  git('add', '-A');
  git('commit', '-q', '-m', 'unpushed');
  expectRefusal(ota('-m', 'x'), 1, 'does not exactly match');
});

it('refuses when the production channel is not "production"', () => {
  writeFileSync(
    path.join(repo, 'mobile/eas.json'),
    JSON.stringify({ build: { production: { channel: 'prod' } } }),
  );
  git('commit', '-qam', 'rename channel');
  git('push', '-q');
  expectRefusal(ota('-m', 'x'), 1, 'expected "production"');
});

it('pins the branch and environment, and defaults to every platform', () => {
  const result = ota('--dry-run', '-m', 'Fix the dock');
  expect(result.status).toBe(0);
  expect(result.stdout).toContain(
    'eas update --branch production --environment production --platform all --message Fix\\ the\\ dock --non-interactive',
  );
  expect(existsSync(mark)).toBe(false);
});

it('passes a platform and a rollout percentage through', () => {
  const result = ota('ios', '--rollout-percentage=10', '--message=x', '--dry-run');
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('--platform ios');
  expect(result.stdout).toContain('--rollout-percentage 10');
  expect(existsSync(mark)).toBe(false);
});
