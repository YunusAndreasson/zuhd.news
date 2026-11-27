import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * On native a worklet's closure is its dependency list: Reanimated ignores
 * the array handed to `useAnimatedStyle` and restarts the style's mapper
 * whenever a captured value changes, which runs the style again and re-sends
 * what it returns. A style that needs a prop only for its first frame (the
 * `__RUNTIME_KIND === 1` branch) holds that prop as it was at mount, in state.
 *
 * Captured live, `restOffset` restarted both styles of all three deck slots
 * at every landing, and `open` the veil's at every open and close. Jest mocks
 * Reanimated, so nothing else here sees a closure; this reads them from the
 * worklets plugin's own output.
 */
const MUST_NOT_CAPTURE: Record<string, string> = {
  'components/map/StoryDeck.tsx': 'restOffset',
  'components/map/StoryCard.tsx': 'open',
};

function closures(file: string): string[][] {
  const babel = require('@babel/core');
  const { code } = babel.transformSync(readFileSync(join(__dirname, '..', file), 'utf8'), {
    filename: file,
    babelrc: false,
    configFile: false,
    parserOpts: { plugins: ['typescript', 'jsx'] },
    plugins: [require('react-native-worklets/plugin')],
  }) as { code: string };
  return [...code.matchAll(/\.__closure = \[([^\]]*)\]/g)].map((match) =>
    (match[1] ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
  );
}

describe.each(Object.entries(MUST_NOT_CAPTURE))('%s', (file, prop) => {
  const captured = closures(file);
  it('has worklets to read', () => {
    expect(captured.length).toBeGreaterThan(0);
  });
  it(`has no worklet that closes over \`${prop}\``, () => {
    expect(captured.filter((names) => names.includes(prop))).toEqual([]);
  });
});
