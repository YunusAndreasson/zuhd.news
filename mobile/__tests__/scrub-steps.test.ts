import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { act, renderHook } from '@testing-library/react';
import type { PanGestureConfig, TapGestureConfig } from 'react-native-gesture-handler';
import * as Reanimated from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { useScrub, type ScrubOptions } from '../hooks/useScrub';
import { hapticImpact } from '../lib/haptics';

jest.mock('../lib/haptics', () => ({ hapticImpact: jest.fn() }));

let mockPan: PanGestureConfig;
let mockTap: TapGestureConfig;
const mockHops: (() => void)[] = [];
jest.mock('react-native-worklets', () => ({
  scheduleOnUI: (fn: (...args: unknown[]) => void, ...args: unknown[]) => fn(...args),
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

function setup(options: Partial<ScrubOptions> = {}) {
  const labelFor = jest.fn((f: number) => `at ${Math.floor(f * 10)}`);
  const onCommit = jest.fn();
  const { result, unmount } = renderHook(() =>
    useScrub({
      fraction: { value: 0 } as SharedValue<number>,
      detents: 10,
      steps: 10,
      labelFor,
      onCommit,
      ...options,
    }),
  );
  act(() => result.current.onLayout({ nativeEvent: { layout: { width: 100 } } } as never));
  const drain = () =>
    act(() => {
      for (const hop of mockHops.splice(0)) hop();
    });
  return { result, labelFor, onCommit, drain, unmount };
}

beforeEach(() => {
  mockHops.length = 0;
  jest.mocked(hapticImpact).mockClear();
});

it('keeps only the latest tap when multiple releases reach a blocked JS queue', () => {
  const { onCommit, drain } = setup();
  act(() => mockTap.onDeactivate?.({ x: 20, canceled: false } as never));
  act(() => mockTap.onDeactivate?.({ x: 80, canceled: false } as never));
  drain();
  expect(onCommit).toHaveBeenCalledTimes(1);
  expect(onCommit).toHaveBeenCalledWith(0.8);
});

it('carries the release camera epoch even if a newer gesture claims before JS drains', () => {
  const requestEpoch = { value: 4 } as SharedValue<number>;
  const { onCommit, drain } = setup({ requestEpoch });
  act(() => mockTap.onDeactivate?.({ x: 60, canceled: false } as never));
  requestEpoch.value++;
  drain();
  // The owner can commit the selected card without taking the new camera.
  expect(onCommit).toHaveBeenCalledWith(0.6, 4);
});

it.each(['inactive', 'background'] as const)(
  'cancels a held drag on %s and ignores late native events',
  (state) => {
    const fraction = { value: 0.2 } as SharedValue<number>;
    const onScrubStart = jest.fn();
    const onScrubEnd = jest.fn();
    const { result, onCommit, drain } = setup({ fraction, onScrubStart, onScrubEnd });
    act(() => mockPan.onActivate?.({ x: 70 } as never));
    const change = jest.mocked(AppState.addEventListener).mock.calls.at(-1)![1];
    act(() => change(state));
    act(() => (mockPan.onUpdate as (e: never) => void)({ x: 90 } as never));
    act(() => mockPan.onFinalize?.({ canceled: false } as never));
    drain();
    expect(fraction.value).toBe(0.2);
    expect(result.current.holding.value).toBe(0);
    expect(result.current.shown.value).toBe(0);
    expect(onCommit).not.toHaveBeenCalled();
    expect(onScrubStart).not.toHaveBeenCalled();
    expect(onScrubEnd).toHaveBeenCalledTimes(1);
    expect(hapticImpact).not.toHaveBeenCalled();
    act(() => mockTap.onDeactivate?.({ x: 90, canceled: false } as never));
    drain();
    expect(onCommit).not.toHaveBeenCalled();
    act(() => change('active'));
    act(() => mockTap.onDeactivate?.({ x: 40, canceled: false } as never));
    drain();
    expect(onCommit).toHaveBeenCalledWith(0.4);
  },
);

it('delivers an already released selection when backgrounding before JS catches up', () => {
  const { onCommit, drain } = setup();
  act(() => mockTap.onDeactivate?.({ x: 70, canceled: false } as never));
  act(() => jest.mocked(AppState.addEventListener).mock.calls.at(-1)![1]('background'));
  drain();
  expect(onCommit).toHaveBeenCalledWith(0.7);
});

it('does not deliver queued work after the scrubber unmounts', () => {
  const { onCommit, labelFor, drain, unmount } = setup();
  act(() => mockPan.onActivate?.({ x: 70 } as never));
  act(() => mockPan.onFinalize?.({ canceled: false } as never));
  unmount();
  drain();
  expect(onCommit).not.toHaveBeenCalled();
  expect(labelFor).not.toHaveBeenCalled();
  expect(hapticImpact).not.toHaveBeenCalled();
});

it('restores the previous released selection if a newer held drag is canceled before JS catches up', () => {
  const { onCommit, drain } = setup();
  act(() => mockTap.onDeactivate?.({ x: 20, canceled: false } as never));
  act(() => mockPan.onActivate?.({ x: 80 } as never));
  drain();
  expect(onCommit).not.toHaveBeenCalled();
  act(() => mockPan.onFinalize?.({ canceled: true } as never));
  drain();
  expect(onCommit.mock.calls).toEqual([[0.2]]);
  // Canceling another drag cannot re-deliver an already applied selection.
  act(() => mockPan.onActivate?.({ x: 60 } as never));
  act(() => mockPan.onFinalize?.({ canceled: true } as never));
  drain();
  expect(onCommit.mock.calls).toEqual([[0.2]]);
});

it('a tap after a released drag clears holding even when its queued end was superseded', () => {
  let held = false;
  const { drain } = setup({
    onScrubStart: () => {
      held = true;
    },
    onScrubEnd: () => {
      held = false;
    },
  });
  act(() => mockPan.onActivate?.({ x: 20 } as never));
  drain();
  expect(held).toBe(true);
  act(() => mockPan.onFinalize?.({ canceled: false } as never));
  act(() => mockTap.onDeactivate?.({ x: 80, canceled: false } as never));
  drain();
  expect(held).toBe(false);
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
  expect(result.current.preview.getSnapshot().label).toBe('at 2');
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
  expect(onCommit).not.toHaveBeenCalled();
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

it('updates the tooltip without rendering the gesture owner, and unsubscribes cleanly', () => {
  let ownerRenders = 0;
  const { result } = renderHook(() => {
    ownerRenders++;
    return useScrub({
      fraction: { value: 0 } as SharedValue<number>,
      detents: 10,
      steps: 10,
      labelFor: (f) => `at ${Math.floor(f * 10)}`,
      detailFor: () => 'politics',
      captionFor: (f) => `Story ${Math.floor(f * 10)}`,
      onCommit: jest.fn(),
    });
  });
  const store = result.current.preview;
  const tooltip = renderHook(() =>
    useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot),
  );
  const rendersBefore = ownerRenders;
  act(() => result.current.onLayout({ nativeEvent: { layout: { width: 100 } } } as never));
  act(() => mockPan.onActivate?.({ x: 25 } as never));
  act(() => {
    for (const hop of mockHops.splice(0)) hop();
  });
  expect(tooltip.result.current).toEqual({ label: 'at 2', detail: 'politics', caption: 'Story 2' });
  expect(ownerRenders).toBe(rendersBefore);
  const snapshot = store.getSnapshot();
  act(() => (mockPan.onUpdate as (e: never) => void)({ x: 26 } as never));
  act(() => {
    for (const hop of mockHops.splice(0)) hop();
  });
  expect(store.getSnapshot()).toBe(snapshot);
  tooltip.unmount();
  act(() => (mockPan.onUpdate as (e: never) => void)({ x: 45 } as never));
  act(() => {
    for (const hop of mockHops.splice(0)) hop();
  });
  expect(store.getSnapshot().label).toBe('at 4');
});
