import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from '@babel/parser';

/**
 * A directive is only a directive where the language says so: the first
 * statements of a file or a function body, as a bare string. Anywhere else the
 * same string is an expression statement that does nothing — and nothing says
 * so.
 *
 * `MiniGlobe.tsx` opted itself out of React Compiler with `'use no memo'`
 * after its imports, which is not a directive position; the formatter then
 * wrapped it in parentheses, and the opt-out opted nothing out (found
 * 2026-10-02). A `'worklet'` that slips the same way leaves a function that
 * runs on the UI thread un-workletized, which crashes rather than idles.
 */

const ROOT = join(__dirname, '..');
const DIRS = ['app', 'components', 'hooks', 'lib', 'constants'];

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : [];
  });
}

/** Node keys that never hold a statement. */
const SKIP = new Set(['loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments']);

type Node = { type?: string; [key: string]: unknown };

function walk(node: unknown, visit: (n: Node) => void): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const n = node as Node;
  if (typeof n.type === 'string') visit(n);
  for (const [key, value] of Object.entries(n)) {
    if (!SKIP.has(key) && value && typeof value === 'object') walk(value, visit);
  }
}

function parseFile(path: string) {
  return parse(readFileSync(path, 'utf8'), {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
}

const FILES = DIRS.flatMap((dir) => sources(join(ROOT, dir)));

it('finds the sources it checks', () => {
  expect(FILES.length).toBeGreaterThan(150);
});

it('has no string statement outside a directive position', () => {
  const inert: string[] = [];
  for (const file of FILES) {
    walk(parseFile(file).program, (n) => {
      if (n.type !== 'ExpressionStatement') return;
      const expr = n.expression as Node & { value?: unknown };
      if (expr?.type !== 'StringLiteral') return;
      const line = (n.loc as { start: { line: number } } | undefined)?.start.line;
      inert.push(`${relative(ROOT, file)}:${line} '${String(expr.value)}'`);
    });
  }
  expect(inert).toEqual([]);
});

it('opts MiniGlobe itself out of React Compiler', () => {
  const directives: string[] = [];
  walk(parseFile(join(ROOT, 'components/globe/MiniGlobe.tsx')).program, (n) => {
    const id = n.id as Node & { name?: string };
    if (n.type !== 'FunctionExpression' || id?.name !== 'MiniGlobe') return;
    const body = n.body as { directives: { value: { value: string } }[] };
    for (const d of body.directives) directives.push(d.value.value);
  });
  expect(directives).toContain('use no memo');
});
