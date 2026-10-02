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
