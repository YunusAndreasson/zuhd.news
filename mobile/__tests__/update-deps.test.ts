/**
 * @jest-environment node
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

it('keeps SDK-managed and patched packages out of the install before Expo checks compatibility', () => {
  const app = mkdtempSync(join(tmpdir(), 'deps-sweep-'));
  try {
    for (const dir of ['bin', 'scripts', 'node_modules/expo', 'patches']) {
      mkdirSync(join(app, dir), { recursive: true });
    }
    copyFileSync(join(__dirname, '../scripts/update-deps.sh'), join(app, 'scripts/update-deps.sh'));
    writeFileSync(
      join(app, 'node_modules/expo/bundledNativeModules.json'),
      '{"react-native-reanimated":"4.7.1"}',
    );
    writeFileSync(join(app, 'patches/@example+sheet+1.2.3.patch'), '');
    writeFileSync(join(app, 'bin/npm'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    writeFileSync(
      join(app, 'bin/npx'),
      `#!/bin/sh
case "$*" in
  *npm-check-updates*) printf '%s\\n' "$@" > ncu-args ;;
esac
`,
      { mode: 0o755 },
    );
    execFileSync('bash', [join(app, 'scripts/update-deps.sh'), '--apply', '--latest'], {
      env: { ...process.env, PATH: `${join(app, 'bin')}:${process.env.PATH}` },
    });
    const args = readFileSync(join(app, 'ncu-args'), 'utf8').trim().split('\n');
    expect(args[args.indexOf('--reject') + 1]?.split(',')).toEqual(
      expect.arrayContaining(['react-native-reanimated', '@example/sheet']),
    );
  } finally {
    rmSync(app, { recursive: true, force: true });
  }
});
