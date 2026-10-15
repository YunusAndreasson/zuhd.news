import { act, render } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import type { PanGestureConfig } from 'react-native-gesture-handler';
import * as Reanimated from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

let mockPan: PanGestureConfig;
const mockQueue: (() => void)[] = [];
const mockReactions: { prepare: () => number; react: (value: number) => void }[] = [];
jest.mock('react-native-worklets', () => ({
  scheduleOnUI: (fn: (...args: unknown[]) => void, ...args: unknown[]) => fn(...args),
  scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) =>
    mockQueue.push(() => fn(...args)),
}));
jest.mock('react-native-gesture-handler', () => ({
  usePanGesture: (config: PanGestureConfig) => {
    mockPan = config;
    return config;
  },
  useNativeGesture: () => ({}),
  GestureDetector: ({ children }: { children?: ReactNode }) => children,
}));
jest.mock('../hooks/useTheme', () => ({
  useTheme: () => ({ colors: require('../constants/theme').DARK_COLORS }),
}));
const passthrough = ({ children }: { children?: ReactNode }) => children ?? null;
Object.assign(jest.requireMock('react-native'), { View: passthrough });
Object.assign(Reanimated.default, { View: passthrough, ScrollView: passthrough });
Object.assign(Reanimated, {
  cancelAnimation: jest.fn(),
  withSpring: (to: number) => to,
  useAnimatedReaction: (prepare: () => number, react: (value: number) => void) =>
    mockReactions.push({ prepare, react }),
});
const { StoryDeck } =
  require('../components/map/StoryDeck') as typeof import('../components/map/StoryDeck');
const shared = (value: number) => ({ value }) as SharedValue<number>;
beforeEach(() => {
  mockQueue.length = 0;
  mockReactions.length = 0;
});

function setup() {
  const progress = shared(0);
  const committedPosition = shared(0);
  const onRelease = jest.fn();
  const onSettle = jest.fn();
  const onRollback = jest.fn();
  render(
    <StoryDeck
      index={0}
      count={5}
      width={400}
      sheetGesture={{} as ComponentProps<typeof StoryDeck>['sheetGesture']}
      progress={progress}
      committedPosition={committedPosition}
      scrollEnabled={false}
      onScrollOffset={shared(0)}
      keyOf={String}
      renderStory={() => null}
      renderEnd={() => null}
      onDragStart={jest.fn()}
      onRelease={onRelease}
      onSettle={onSettle}
      onRollback={onRollback}
    />,
  );
  const drain = () =>
    act(() => {
      for (const fn of mockQueue.splice(0)) fn();
    });
  const flick = (canceled = false) =>
    act(() => {
      mockPan.onBegin?.({} as never);
      mockPan.onActivate?.({ translationX: -20 } as never);
      (mockPan.onUpdate as (event: never) => void)({ translationX: -260 } as never);
      mockPan.onDeactivate?.({ translationX: -260, velocityX: -1400, canceled } as never);
    });
  return { progress, committedPosition, onRelease, onSettle, onRollback, drain, flick };
}

it('three quick flicks advance three stories while JS is blocked and springs are caught early', () => {
  const { progress, committedPosition, onRelease, onSettle, drain, flick } = setup();
  flick();
  expect(committedPosition.value).toBe(1);
  // Simulate catching the first spring only a quarter of the way there.
  progress.value = 0.25;
  flick();
  expect(committedPosition.value).toBe(2);
  progress.value = 1.25;
  flick();
  expect(committedPosition.value).toBe(3);
  expect(onRelease).not.toHaveBeenCalled();
  const landing = mockReactions[0]!;
  act(() => landing.react(landing.prepare()));
  drain();
  expect(onRelease.mock.calls).toEqual([[1], [2], [3]]);
  expect(onSettle.mock.calls).toEqual([[1], [2], [3]]);
  expect(progress.value).toBe(3);
});

it('rolls a native-canceled swipe back without releasing another story', () => {
  const { progress, committedPosition, onRelease, onRollback, drain, flick } = setup();
  flick(true);
  drain();
  expect(progress.value).toBe(0);
  expect(committedPosition.value).toBe(0);
  expect(onRelease).not.toHaveBeenCalled();
  expect(onRollback).toHaveBeenCalledTimes(1);
  // A new gesture after cancellation remains usable.
  flick();
  drain();
  expect(committedPosition.value).toBe(1);
  expect(onRelease).toHaveBeenCalledWith(1);
});

it('does not report an old spring landing after a scrub commits a newer target on UI', () => {
  const { progress, committedPosition, onSettle, drain, flick } = setup();
  flick();
  committedPosition.value = 4;
  // A late frame of the old spring reaches its own old target.
  progress.value = 1;
  const landing = mockReactions[0]!;
  act(() => landing.react(landing.prepare()));
  drain();
  expect(onSettle).not.toHaveBeenCalled();
  progress.value = 4;
  act(() => landing.react(landing.prepare()));
  drain();
  expect(onSettle).toHaveBeenCalledWith(4);
});
