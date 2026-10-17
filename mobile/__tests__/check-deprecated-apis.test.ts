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
export type HookFn = () => void;
/** @deprecated Use \`configure\`. */
export declare const useOld: HookFn;
export declare function overloaded(a: string): void;
/** @deprecated Pass a string. */
export declare function overloaded(a: number): void;
export interface Base {
  /** @deprecated Use \`z\`. */
  y?: number;
}
export interface Own {
  y?: number;
}
export declare function take(o: Own & Base): void;
`;

// Each line of the fixture, so an expectation can name the line it is about.
const USE_LINES = [
  "import { configure, oldConfigure, overloaded, take, useOld, Widget } from './lib';",
  'export const current = <Widget size={3} />;',
  'export const stale = <Widget width={3} />;',
  "configure({ mode: 'a' });",
  "configure({ legacyMode: 'b' });",
  'oldConfigure();',
  'useOld();',
  "overloaded('a');",
  'overloaded(1);',
  'take({ y: 1 });',
  '// deprecated-api-allowed: waiting on lib v2',
  'oldConfigure();',
  'oldConfigure(); // deprecated-api-allowed: waiting on lib v2',
  'oldConfigure();',
];
const USE = USE_LINES.join('\n');
const lineOf = (text: string, from = 0) => USE_LINES.indexOf(text, from) + 1;

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

it('reports deprecated names, calls, JSX props and option keys, and nothing current', () => {
  const run = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8' });
  // A launch failure can also return status 1; report it before interpreting
  // an empty stderr stream as missing deprecation findings.
  if (run.error) throw run.error;
  expect(run.status).toBe(1);
  const findings = run.stderr
    .split('\n')
    .filter((line) => line.startsWith('use.tsx:'))
    .map((line) => line.replace(/^use\.tsx:(\d+):\d+ (\S+) — .*$/, '$1 $2'));
  const marked = lineOf('// deprecated-api-allowed: waiting on lib v2');
  expect(new Set(findings)).toEqual(
    new Set([
      // A deprecated name counts where it is imported as well as where it is used,
      // a const typed by an undeprecated alias included.
      '1 oldConfigure',
      '1 useOld',
      `${lineOf('export const stale = <Widget width={3} />;')} width`,
      `${lineOf("configure({ legacyMode: 'b' });")} legacyMode`,
      `${lineOf('oldConfigure();')} oldConfigure`,
      `${lineOf('useOld();')} useOld`,
      // Only the call that resolves to the deprecated overload; the function's
      // import is not deprecated, since one overload is current.
      `${lineOf('overloaded(1);')} overloaded`,
      // A marker excuses its own line, or the line under a comment-only line;
      // one that ends a line does not reach the next.
      `${lineOf('oldConfigure();', marked + 2)} oldConfigure`,
    ]),
  );
});
