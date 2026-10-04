import { act, renderHook } from '@testing-library/react';
import type { PanGestureConfig, TapGestureConfig } from 'react-native-gesture-handler';
import * as Reanimated from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { useScrub } from '../hooks/useScrub';
import { hapticImpact } from '../lib/haptics';

jest.mock('../lib/haptics', () => ({ hapticImpact: jest.fn() }));

let mockPan: PanGestureConfig;
let mockTap: TapGestureConfig;
const mockHops: (() => void)[] = [];
jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => {
    mockHops.push(() => fn(...args));
  },
}));
jest.mock('react-native-gesture-handler', () => ({
  usePanGesture: (config: PanGestureConfig) => {
    mockPan = config;
    return config;
  },
  useTapGesture: (config: TapGestureConfig) => {
    mockTap = config;
    return config;
  },
  useCompetingGestures: () => ({}),
}));
Object.assign(Reanimated, { withSpring: (to: number) => to, withTiming: (to: number) => to });

function setup() {
  const labelFor = jest.fn((f: number) => `at ${Math.floor(f * 10)}`);
  const onCommit = jest.fn();
  const { result } = renderHook(() =>
    useScrub({
      fraction: { value: 0 } as SharedValue<number>,
      detents: 10,
      steps: 10,
      labelFor,
      onCommit,
    }),
  );
  act(() => result.current.onLayout({ nativeEvent: { layout: { width: 100 } } } as never));
  const drain = () =>
    act(() => {
      for (const hop of mockHops.splice(0)) hop();
    });
  return { result, labelFor, onCommit, drain };
}

beforeEach(() => {
  mockHops.length = 0;
  jest.mocked(hapticImpact).mockClear();
});

it('crosses a step in one hop to JS, carrying the notch and the label together', () => {
  const { result, drain } = setup();
  // Grab: the start, and the first step's notch and label.
  act(() => mockPan.onActivate?.({ x: 5 } as never));
  drain();
  jest.mocked(hapticImpact).mockClear();
  // Into the next step: the notch and the label were two hops, which could
  // land on different frames.
  jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 1000);
  // `onUpdate` is typed to allow an `AnimatedEvent`; this config passes a worklet.
  act(() => (mockPan.onUpdate as (e: never) => void)({ x: 25 } as never));
  expect(mockHops).toHaveLength(1);
  drain();
  expect(hapticImpact).toHaveBeenCalledTimes(1);
  expect(result.current.label).toBe('at 2');
  jest.restoreAllMocks();
});

it('gives a tap no label to work out: its tooltip never shows', () => {
  const { labelFor, onCommit, drain } = setup();
  act(() => mockTap.onDeactivate?.({ x: 70, canceled: false } as never));
  drain();
  expect(onCommit).toHaveBeenCalledWith(0.7);
  expect(labelFor).not.toHaveBeenCalled();
  expect(hapticImpact).not.toHaveBeenCalled();
});

it('snaps on the gesture thread, before delayed commits can interrupt a newer drag', () => {
  const fraction = { value: 0.2 } as SharedValue<number>;
  const onCommit = jest.fn();
  const { result } = renderHook(() =>
    useScrub({
      fraction,
      detents: 2,
      steps: 2,
      labelFor: String,
      onCommit,
      snapTo: (f: number) => (f < 0.5 ? 0.2 : 0.8),
    }),
  );
  act(() => result.current.onLayout({ nativeEvent: { layout: { width: 100 } } } as never));
  act(() => mockTap.onDeactivate?.({ x: 34, canceled: false } as never));
  // A tap on the current story still needs to land at its centre, even when
  // JS is stalled and seeking that story will not change the deck position.
  expect(fraction.value).toBe(0.2);
  expect(onCommit).not.toHaveBeenCalled();
  act(() => mockPan.onActivate?.({ x: 70 } as never));
  act(() => {
    for (const hop of mockHops.splice(0)) hop();
  });
  expect(fraction.value).toBe(0.7);
  expect(result.current.holding.value).toBe(1);
  expect(onCommit).toHaveBeenLastCalledWith(0.34);
  act(() => mockPan.onFinalize?.({ canceled: false } as never));
  expect(fraction.value).toBe(0.8);
  act(() => {
    for (const hop of mockHops.splice(0)) hop();
  });
  expect(onCommit).toHaveBeenLastCalledWith(0.7);
  expect(result.current.holding.value).toBe(0);
});

it('restores the original position on cancellation and accepts the next gesture', () => {
  const fraction = { value: 0.2 } as SharedValue<number>;
  const onCommit = jest.fn();
  const onScrubEnd = jest.fn();
  const { result } = renderHook(() =>
    useScrub({
      fraction,
      detents: 2,
      steps: 2,
      labelFor: String,
      onCommit,
      onScrubEnd,
      snapTo: () => 0.8,
    }),
  );
  act(() => result.current.onLayout({ nativeEvent: { layout: { width: 100 } } } as never));
  act(() => mockPan.onActivate?.({ x: 70 } as never));
  act(() => mockPan.onFinalize?.({ canceled: true } as never));
  act(() => {
    for (const hop of mockHops.splice(0)) hop();
  });
  expect(fraction.value).toBe(0.2);
  expect(result.current.holding.value).toBe(0);
  expect(result.current.shown.value).toBe(0);
  expect(onCommit).not.toHaveBeenCalled();
  expect(onScrubEnd).toHaveBeenCalledTimes(1);
  act(() => mockTap.onDeactivate?.({ x: 75, canceled: false } as never));
  expect(fraction.value).toBe(0.8);
  act(() => {
    for (const hop of mockHops.splice(0)) hop();
  });
  expect(onCommit).toHaveBeenCalledWith(0.75);
});

it('commits the deck before the JS queue drains so an immediate swipe starts at the sought story', () => {
  let deckIndex = 0;
  const onCommit = jest.fn();
  const { result } = renderHook(() =>
    useScrub({
      fraction: { value: 0 } as SharedValue<number>,
      detents: 35,
      steps: 35,
      labelFor: String,
      onCommit,
      onCommitUI: (f) => {
        deckIndex = Math.min(34, Math.floor(f * 35));
      },
    }),
  );
  act(() => result.current.onLayout({ nativeEvent: { layout: { width: 100 } } } as never));
  act(() => mockPan.onActivate?.({ x: 99 } as never));
  act(() => mockPan.onFinalize?.({ canceled: false } as never));
  expect(deckIndex).toBe(34);
  expect(onCommit).not.toHaveBeenCalled();
  // The next gesture can move to the end card before React sees the seek.
  deckIndex++;
  act(() => {
    for (const hop of mockHops.splice(0)) hop();
  });
  expect(deckIndex).toBe(35);
  act(() => mockTap.onDeactivate?.({ x: 0, canceled: false } as never));
  expect(deckIndex).toBe(0);
});
