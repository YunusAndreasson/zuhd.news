import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import * as Reanimated from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import type { ScrubOptions } from '../hooks/useScrub';

let mockOptions: ScrubOptions;
jest.mock('../hooks/useScrub', () => ({
  useScrub: (options: ScrubOptions) => {
    mockOptions = options;
    return { holding: { value: 0 } };
  },
}));
jest.mock('../hooks/useTheme', () => ({
  useTheme: () => ({
    colors: require('../constants/theme').DARK_COLORS,
    resolvedAppearance: 'dark',
  }),
}));
jest.mock('../hooks/useStoryArrivals', () => ({
  useStoryArrivals: () => ({ count: 0, first: -1 }),
}));
jest.mock('../lib/read-store', () => ({ useReadSlugs: () => new Set() }));
jest.mock('../components/primitives', () => ({
  Icon: () => null,
  IconButton: () => null,
  Text: () => null,
}));
jest.mock('../components/ScrubBar', () => ({
  ScrubBar: () => null,
  ScrubTooltip: () => null,
  MARK_LABEL_WIDTH: 28,
}));
const passthrough = ({ children }: { children?: ReactNode }) => children ?? null;
Object.assign(jest.requireMock('react-native'), { View: passthrough });
Object.assign(Reanimated.default, { View: passthrough });
const { StoryDock } =
  require('../components/map/StoryDock') as typeof import('../components/map/StoryDock');
const shared = (value: number) => ({ value }) as SharedValue<number>;

it('carries the chosen slug through a refresh before the queued commit runs', () => {
  const onScrubSeek = jest.fn();
  const props = {
    index: 0,
    position: shared(0),
    committedPosition: shared(0),
    timeAt: () => 'now',
    onSeek: jest.fn(),
    onScrubSeek,
  };
  const { rerender } = render(<StoryDock {...props} count={3} slugs={['a', 'b', 'c']} />);
  const queuedCommit = mockOptions.onCommit;
  rerender(<StoryDock {...props} count={4} slugs={['new', 'a', 'b', 'c']} />);
  act(() => queuedCommit(0.5, 7));
  expect(onScrubSeek).toHaveBeenCalledWith(1, 'b', 7);
  // A subsequent gesture uses the new track, rather than the old closure.
  act(() => mockOptions.onCommit(0.5, 8));
  expect(onScrubSeek).toHaveBeenLastCalledWith(1, 'a', 8);
});

it('moves the deck on UI before JS receives the selection and exposes the camera epoch', () => {
  const position = shared(0);
  const committedPosition = shared(0);
  const requestEpoch = shared(7);
  const onScrubSeek = jest.fn();
  render(
    <StoryDock
      index={0}
      count={3}
      slugs={['a', 'b', 'c']}
      position={position}
      committedPosition={committedPosition}
      requestEpoch={requestEpoch}
      onSeek={jest.fn()}
      onScrubSeek={onScrubSeek}
      timeAt={() => 'now'}
    />,
  );
  act(() => mockOptions.onCommitUI?.(0.9));
  expect(position.value).toBe(2);
  expect(committedPosition.value).toBe(2);
  expect(onScrubSeek).not.toHaveBeenCalled();
  expect(mockOptions.requestEpoch).toBe(requestEpoch);
});
