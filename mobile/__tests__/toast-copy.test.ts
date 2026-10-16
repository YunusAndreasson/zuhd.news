import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from '@babel/parser';

/**
 * A toast is one voice (DESIGN.md Voice): sentence case, its parts parted by
 * ` · `, and one a tap acts on ends `· tap to <verb>`. Only such a toast says
 * "tap": a reader told to tap one that does nothing has been misled. No dash
 * and no "Please". Read off every toast written in the source: the message a
 * toast is shown with, and the messages the screen's sheets hand to it
 * (`onToast`, `onDone`). A message built by a function (`refreshFailedToast`)
 * is held by that function's own test.
 */

const ROOT = join(__dirname, '..');
const DIRS = ['app', 'components', 'hooks'];

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : [];
  });
}

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

/** The words of a message as written: a template's expressions as `{}`. */
function words(node: unknown): string | null {
  const n = node as Node & { value?: unknown; quasis?: { value: { cooked: string } }[] };
  if (n?.type === 'StringLiteral') return n.value as string;
  if (n?.type === 'TemplateLiteral') return (n.quasis ?? []).map((q) => q.value.cooked).join('{}');
  return null;
}

/** The source text of a callee, enough to tell a toast's `show` from others. */
function calleeText(node: unknown): string {
  const n = node as Node & { name?: string; object?: Node; property?: Node & { name?: string } };
  if (n?.type === 'Identifier') return n.name ?? '';
  if (n?.type === 'MemberExpression' || n?.type === 'OptionalMemberExpression') {
    return `${calleeText(n.object)}.${n.property?.name ?? ''}`;
  }
  return '';
}

interface Toast {
  at: string;
  message: string;
  acts: boolean;
}

const toasts: Toast[] = [];
for (const file of DIRS.flatMap((dir) => sources(join(ROOT, dir)))) {
  const program = parse(readFileSync(file, 'utf8'), {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  }).program;
  walk(program, (n) => {
    if (n.type !== 'CallExpression' && n.type !== 'OptionalCallExpression') return;
    const callee = calleeText(n.callee);
    const args = n.arguments as Node[];
    const shown = /toast/i.test(callee) && callee.endsWith('.show');
    const handed = callee === 'onToast' || callee === 'onDone';
    if (!shown && !handed) return;
    const message = words(args[0]);
    if (message === null) return;
    const action = args[1] as (Node & { name?: string }) | undefined;
    const acts =
      shown &&
      action !== undefined &&
      !(action.type === 'Identifier' && action.name === 'undefined');
    toasts.push({
      at: `${relative(ROOT, file)}:${(n.loc as { start: { line: number } }).start.line}`,
      message,
      acts,
    });
  });
}

it('finds the toasts it checks', () => {
  expect(toasts.length).toBeGreaterThanOrEqual(15);
});

it('writes no dash and no "Please"', () => {
  expect(toasts.filter((t) => /—|\bplease\b/i.test(t.message))).toEqual([]);
});

it('starts in sentence case', () => {
  expect(toasts.filter((t) => !/^([A-Z0-9]|\{\})/.test(t.message))).toEqual([]);
});

it('says "tap" exactly when a tap acts, and ends on what the tap does', () => {
  expect(toasts.filter((t) => /\btap\b/.test(t.message) !== t.acts)).toEqual([]);
  expect(toasts.filter((t) => t.acts && !/ · tap to [a-z ]+$/.test(t.message))).toEqual([]);
});
