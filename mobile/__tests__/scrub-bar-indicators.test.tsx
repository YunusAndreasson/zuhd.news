import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import * as Reanimated from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import type { ScrubBar as ScrubBarType } from '../components/ScrubBar';
import type { Scrub } from '../hooks/useScrub';

jest.mock('react-native-gesture-handler', () => ({
  usePanGesture: (config: unknown) => config,
  GestureDetector: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('../hooks/useTheme', () => ({ useTheme: () => ({ colors: {} }) }));
jest.mock('../components/primitives', () => ({ Text: () => null }));

const passthrough = ({ children }: { children?: ReactNode }) => children ?? null;
Object.assign(jest.requireMock('react-native'), { View: passthrough });
Object.assign(Reanimated.default, { View: passthrough });
let styles = 0;
Object.assign(Reanimated, {
  LinearTransition: { duration: () => ({}) },
  useAnimatedStyle: () => {
    styles += 1;
    return {};
  },
});
// After the mocks above: the bar builds its cell transition at import.
const { ScrubBar } = require('../components/ScrubBar') as { ScrubBar: typeof ScrubBarType };

const shared = <T,>(value: T) => ({ value }) as SharedValue<T>;
const scrub = {
  width: shared(300),
  shown: shared(0),
  onLayout: () => {},
  gesture: {},
} as unknown as Scrub;

/** How many animated styles — UI-thread mappers — a bar mounts. Each one runs
 *  on every change of `fraction`, which the dock's deck writes every frame of
 *  a swipe, whether or not a view wears its style. */
function mappers(props: Partial<Parameters<typeof ScrubBarType>[0]>) {
  styles = 0;
  render(
    <ScrubBar
      scrub={scrub}
      fraction={shared(0.5)}
      height={3}
      trackColor="#333"
      thumbColor="#fff"
      {...props}
    />,
  );
  return styles;
}

it('the dock runs its playhead and nothing it does not draw', () => {
  // No fill, and a playhead at the current story: the thumb never shows.
  expect(mappers({ segments: 5, activeSegment: 2, activeSegmentColor: '#fff' })).toBe(1);
});

it('the briefing runs its fill and its thumb, and no playhead', () => {
  expect(mappers({ fillColor: '#999' })).toBe(3);
  // Preparing: the track and its fill, nothing to pick up.
  expect(mappers({ fillColor: '#999', interactive: false })).toBe(2);
});
