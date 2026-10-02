import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * React Compiler is on app-wide, and a component that breaks one of its rules
 * is not compiled — whole, and in silence. Nothing in a build, a lint or a
 * profile of one commit says which; `Forget(...)` in a profiler capture is
 * the only sign, and only for the fibers that capture touched.
 *
 * These were all skipped until 2026-10-02: the menu for a function declared
 * after its `return` (and a `useSyncExternalStore` on the data meter that
 * re-rendered it, closed, on every download), the hazard and country bodies
 * for `useMemo`/`useCallback` dependencies the compiler could not keep, saved
 * stories for a ref written during render. This runs the compiler as
 * babel-preset-expo configures it and holds them compiled.
 *
 * The opposite list is short and deliberate: `MiniGlobe` opts out
 * (`directives.test.ts`), and the gesture-driven components that write
 * `sharedValue.value` from their configs are not compiled today — moving them
 * is its own change, to be profiled on hardware.
 */
const MUST_COMPILE: Record<string, string[]> = {
  'components/MenuSheet.tsx': ['MenuSheet', 'SavedRow', 'DataUsedRow', 'GroupRow', 'GroupPage'],
  'components/ConflictSheet.tsx': ['ConflictSheet', 'ConflictBody'],
  'components/DisasterSheet.tsx': ['DisasterSheet', 'DisasterBody'],
  'components/CountrySheet.tsx': ['CountrySheet', 'CountryBody'],
  'components/SheetBookmarksPage.tsx': ['SheetBookmarksPage'],
  'components/map/StoryCard.tsx': ['StoryCard', 'StoryActions'],
  'components/globe/MiniGlobe.tsx': ['GlobeCanvas'],
};

interface CompilerEvent {
  kind: string;
  fnName?: string | null;
  detail?: { reason?: string; options?: { reason?: string } };
}

function compileEvents(file: string): CompilerEvent[] {
  const babel = require('@babel/core');
  const events: CompilerEvent[] = [];
  babel.transformSync(readFileSync(join(__dirname, '..', file), 'utf8'), {
    filename: file,
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: ['typescript', 'jsx'] },
    plugins: [
      [
        require('babel-plugin-react-compiler'),
        {
          // As babel-preset-expo passes it (`getReactCompilerPlugin`).
          target: '19',
          panicThreshold: 'none',
          customOptOutDirectives: ['use no memo', 'use no forget', 'widget'],
          logger: { logEvent: (_: string, event: CompilerEvent) => events.push(event) },
        },
      ],
    ],
  });
  return events;
}

describe.each(Object.entries(MUST_COMPILE))('%s', (file, names) => {
  const events = compileEvents(file);
  it.each(names)('compiles %s', (name) => {
    const compiled = events.some((e) => e.kind === 'CompileSuccess' && e.fnName === name);
    if (!compiled) {
      const reasons = events
        .filter((e) => e.kind === 'CompileError')
        .map((e) => e.detail?.reason ?? e.detail?.options?.reason ?? 'unknown');
      throw new Error(`${name} skipped React Compiler: ${reasons.join('; ') || 'not found'}`);
    }
  });
});
