import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from '@babel/parser';

/**
 * `HomeScreen` is not compiled by React Compiler (it writes shared values
 * from its handlers), so nothing caches what it does not cache itself. A
 * function written inline in its JSX is a new one on every commit, and a
 * memoized child handed it renders with every landing, open and close: the
 * menu did, for the handler that shows its toast.
 */

type Node = { type?: string; [key: string]: unknown };
const SKIP = new Set(['loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments']);

function walk(node: unknown, visit: (n: Node) => void): void {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const n = node as Node;
  if (typeof n.type === 'string') visit(n);
  for (const key of Object.keys(n)) if (!SKIP.has(key)) walk(n[key], visit);
}

const isFunction = (n: Node | undefined) =>
  n?.type === 'ArrowFunctionExpression' || n?.type === 'FunctionExpression';

it('hands no child a function written inline in its JSX', () => {
  const source = readFileSync(join(__dirname, '..', 'app', 'index.tsx'), 'utf8');
  const ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  const inline: string[] = [];
  let attributes = 0;
  walk(ast.program, (n) => {
    if (n.type !== 'JSXAttribute') return;
    attributes++;
    const value = n.value as Node | null;
    if (value?.type !== 'JSXExpressionContainer') return;
    const held = value.expression as Node;
    // `on ? () => … : undefined` is as new as `() => …`.
    const written =
      held.type === 'ConditionalExpression'
        ? [held.consequent as Node, held.alternate as Node]
        : [held];
    if (written.some(isFunction)) {
      const name = (n.name as { name?: string }).name ?? '?';
      const line = (n.loc as { start: { line: number } }).start.line;
      inline.push(`${name} (app/index.tsx:${line})`);
    }
  });
  expect(attributes).toBeGreaterThan(100);
  expect(inline).toEqual([]);
});
