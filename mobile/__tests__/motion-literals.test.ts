import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from '@babel/parser';

/**
 * Motion is a token (DESIGN.md Anti-patterns): a duration or a spring written
 * into a component is a gait of its own, and the app's motion stops reading as
 * one hand. `constants/theme.ts` names every step (`ANIMATION`, `EASING`); a
 * module may still name a constant of its own (the globe's `GROUND_FADE_MS`),
 * because a name is where its reason is written down. What this holds is the
 * bare number in the call.
 *
 * A 0 ms timing is a UI-thread timer's end value, not motion, and passes.
 */

const ROOT = join(__dirname, '..');
const DIRS = ['app', 'components', 'hooks', 'lib'];
const SPRING_KEYS = new Set(['damping', 'stiffness', 'mass', 'duration', 'dampingRatio']);
/** A layout animation builder's motion setters. */
const BUILDER_SETTERS = new Set(['duration', 'delay', 'damping', 'stiffness', 'mass']);

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

/** A number written in place: `250`, or `-12`. */
function literal(node: unknown): number | null {
  const n = node as (Node & { value?: unknown; operator?: string; argument?: Node }) | undefined;
  if (n?.type === 'NumericLiteral') return n.value as number;
  if (
    n?.type === 'UnaryExpression' &&
    n.operator === '-' &&
    n.argument?.type === 'NumericLiteral'
  ) {
    return -(n.argument.value as number);
  }
  return null;
}

const FILES = DIRS.flatMap((dir) => sources(join(ROOT, dir)));

it('finds the sources it checks', () => {
  expect(FILES.length).toBeGreaterThan(150);
});

it('writes no duration or spring as a bare number outside the motion tokens', () => {
  const bare: string[] = [];
  for (const file of FILES) {
    const program = parse(readFileSync(file, 'utf8'), {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    }).program;
    walk(program, (n) => {
      if (n.type !== 'CallExpression') return;
      const at = `${relative(ROOT, file)}:${(n.loc as { start: { line: number } }).start.line}`;
      const callee = n.callee as Node & { name?: string; property?: Node & { name?: string } };
      const args = n.arguments as Node[];

      if (
        callee.type === 'Identifier' &&
        (callee.name === 'withTiming' || callee.name === 'withSpring')
      ) {
        const config = args[1] as (Node & { properties?: Node[] }) | undefined;
        if (config?.type !== 'ObjectExpression') return;
        for (const prop of config.properties ?? []) {
          const key = (prop.key as (Node & { name?: string }) | undefined)?.name;
          if (prop.type !== 'ObjectProperty' || !key) continue;
          const value = literal(prop.value);
          if (value === null) continue;
          const checked = callee.name === 'withTiming' ? key === 'duration' : SPRING_KEYS.has(key);
          if (checked && !(key === 'duration' && value === 0)) {
            bare.push(`${at} ${callee.name} ${key}: ${value}`);
          }
        }
        return;
      }

      const setter = callee.property?.name;
      if (callee.type === 'MemberExpression' && setter && BUILDER_SETTERS.has(setter)) {
        const value = literal(args[0]);
        if (value !== null && value !== 0) bare.push(`${at} .${setter}(${value})`);
      }
    });
  }
  expect(bare).toEqual([]);
});
