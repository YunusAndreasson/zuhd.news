/**
 * @jest-environment node
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// `npm run api:check` resolves every identifier to its symbol, which misses a
// deprecated JSX prop or option key: those resolve to the local attribute or
// property being written, not to the declaration it fills. Three Reanimated
// `withInitialValues({ transform })` calls sat behind that gap. The fixture is
// written to a temp dir so it never joins the app's own typecheck.
const SCRIPT = path.join(__dirname, '..', 'scripts', 'check-deprecated-apis.mjs');

const LIB = `
declare global {
  namespace JSX {
    interface Element {}
    interface IntrinsicElements {}
  }
}
export interface WidgetProps {
  /** @deprecated Use \`size\`. */
  width?: number;
  size?: number;
}
export declare function Widget(props: WidgetProps): JSX.Element;
export interface Options {
  /** @deprecated Use \`mode\`. */
  legacyMode?: string;
  mode?: string;
}
export declare function configure(options: Options): void;
/** @deprecated Use \`configure\`. */
export declare function oldConfigure(): void;
`;

const USE = `
import { configure, oldConfigure, Widget } from './lib';
export const current = <Widget size={3} />;
export const stale = <Widget width={3} />;
configure({ mode: 'a' });
configure({ legacyMode: 'b' });
oldConfigure();
`;

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'api-check-'));
  writeFileSync(path.join(dir, 'lib.d.ts'), LIB);
  writeFileSync(path.join(dir, 'use.tsx'), USE);
  writeFileSync(
    path.join(dir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { strict: true, jsx: 'preserve', noEmit: true, types: [] },
      files: ['lib.d.ts', 'use.tsx'],
    }),
  );
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

it('reports deprecated calls, JSX props and option keys, and nothing current', () => {
  const run = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8' });
  // A launch failure can also return status 1; report it before interpreting
  // an empty stderr stream as missing deprecation findings.
  if (run.error) throw run.error;
  expect(run.status).toBe(1);
  const findings = run.stderr
    .split('\n')
    .filter((line) => line.startsWith('use.tsx:'))
    .map((line) => line.replace(/^use\.tsx:\d+:\d+ /, ''));
  // The import of a deprecated function counts as well as its call.
  expect(new Set(findings)).toEqual(
    new Set(['width — Use `size`.', 'legacyMode — Use `mode`.', 'oldConfigure — Use `configure`.']),
  );
});
