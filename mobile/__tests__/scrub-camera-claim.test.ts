import { act, renderHook } from '@testing-library/react';
import type { PanGestureConfig, TapGestureConfig } from 'react-native-gesture-handler';
import * as Reanimated from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { useScrub } from '../hooks/useScrub';

jest.mock('../lib/haptics', () => ({ hapticImpact: jest.fn() }));

let mockPan: PanGestureConfig;
let mockTap: TapGestureConfig;
const mockRNQueue: (() => void)[] = [];
jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => {
    mockRNQueue.push(() => fn(...args));
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

it.each(['drag', 'tap'])(
  'claims camera input on UI before a scrub %s reaches a blocked JS thread',
  (gesture) => {
    mockRNQueue.length = 0;
    const onClaim = jest.fn();
    const onCommit = jest.fn();
    const onScrubStart = jest.fn();
    const { result } = renderHook(() =>
      useScrub({
        fraction: { value: 0 } as SharedValue<number>,
        detents: 10,
        steps: 10,
        labelFor: String,
        onClaim,
        onCommit,
        onScrubStart,
      }),
    );
    act(() => result.current.onLayout({ nativeEvent: { layout: { width: 100 } } } as never));
    act(() => {
      if (gesture === 'drag') mockPan.onActivate?.({ x: 50 } as never);
      else mockTap.onDeactivate?.({ x: 50, canceled: false } as never);
    });
    expect(onClaim).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
    expect(onScrubStart).not.toHaveBeenCalled();
    if (gesture === 'drag') {
      act(() => mockPan.onFinalize?.({ canceled: false } as never));
    }
    act(() => {
      for (const fn of mockRNQueue) fn();
    });
    expect(onCommit).toHaveBeenCalledWith(0.5);
  },
);
