import { act, render, renderHook } from '@testing-library/react';
import type { PanGestureConfig } from 'react-native-gesture-handler';
import * as Reanimated from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { MapSheet, type MapSheetRef } from '../components/map/MapSheet';
import { StoryDeck } from '../components/map/StoryDeck';
import { useScrub } from '../hooks/useScrub';

let mockPan: PanGestureConfig;
jest.mock('react-native-gesture-handler', () => ({
  usePanGesture: (config: PanGestureConfig) => {
    mockPan = config;
    return config;
  },
  useTapGesture: (config: unknown) => config,
  useCompetingGestures: () => ({}),
  GestureDetector: () => null,
}));
jest.mock('../lib/haptics', () => ({ hapticTick: jest.fn(), hapticImpact: jest.fn() }));
jest.mock('../hooks/useTheme', () => ({ useTheme: () => ({ colors: {} }) }));

const spring = jest.fn((to: number, _config: unknown) => to);
Object.assign(Reanimated, {
  withSpring: spring,
  withTiming: (to: number) => to,
  cancelAnimation: jest.fn(),
});
const shared = (value: number) => ({ value }) as SharedValue<number>;
const event = (data: object) => data as never;

beforeEach(() => jest.clearAllMocks());

it('rolls a canceled deck swipe back without committing or carrying velocity', () => {
  const progress = shared(2.3);
  const onSettle = jest.fn();
  render(
    <StoryDeck
      count={5}
      index={2}
      progress={progress}
      width={400}
      sheetGesture={{} as never}
      scrollEnabled={false}
      onScrollOffset={shared(0)}
      keyOf={String}
      renderStory={() => null}
      renderEnd={() => null}
      onDragStart={jest.fn()}
      onSettle={onSettle}
    />,
  );
  act(() => {
    mockPan.onActivate?.(event({ translationX: -16 }));
    if (typeof mockPan.onUpdate === 'function') mockPan.onUpdate(event({ translationX: -350 }));
    mockPan.onDeactivate?.(event({ translationX: -350, velocityX: -2000, canceled: true }));
  });
  expect(progress.value).toBe(2);
  expect(spring).toHaveBeenLastCalledWith(2, expect.objectContaining({ velocity: 0 }));
  expect(onSettle).not.toHaveBeenCalled();
  act(() => {
    mockPan.onActivate?.(event({ translationX: -16 }));
    mockPan.onDeactivate?.(event({ translationX: -350, velocityX: -2000, canceled: false }));
  });
  expect(onSettle).toHaveBeenCalledTimes(1);
});

it.each(['peek', 'full'] as const)(
  'restores the committed %s sheet after an interrupted pull',
  (detent) => {
    const onPullDown = jest.fn();
    const onDetentChange = jest.fn();
    const ref = { current: null as MapSheetRef | null };
    renderHook(() =>
      MapSheet({
        peek: 300,
        full: 700,
        progress: shared(0),
        header: null,
        renderList: () => <div />,
        onPullDown,
        onDetentChange,
        ref,
      }),
    );
    if (detent === 'full') act(() => ref.current?.expand());
    onDetentChange.mockClear();
    act(() => {
      mockPan.onBegin?.(event({}));
      mockPan.onActivate?.(event({ translationY: 8 }));
      if (typeof mockPan.onUpdate === 'function') mockPan.onUpdate(event({ translationY: 600 }));
      mockPan.onDeactivate?.(event({ velocityY: 2500, canceled: true }));
      mockPan.onFinalize?.(event({ canceled: true }));
    });
    expect(spring).toHaveBeenLastCalledWith(
      detent === 'full' ? 0 : 400,
      expect.objectContaining({ velocity: 0 }),
    );
    expect(onPullDown).not.toHaveBeenCalled();
    expect(onDetentChange).not.toHaveBeenCalled();
    // Activation stops an in-flight animation before an update chooses ownership.
    act(() => {
      mockPan.onBegin?.(event({}));
      mockPan.onActivate?.(event({ translationY: 8 }));
      mockPan.onDeactivate?.(event({ velocityY: 0, canceled: true }));
    });
    expect(spring).toHaveBeenLastCalledWith(
      detent === 'full' ? 0 : 400,
      expect.objectContaining({ velocity: 0 }),
    );
  },
);

it('restores a canceled scrub, ends its hold once, and still commits normal releases', () => {
  const fraction = shared(0.25);
  const onCommit = jest.fn();
  const onScrubEnd = jest.fn();
  const { result } = renderHook(() =>
    useScrub({ fraction, detents: 10, steps: 10, labelFor: String, onCommit, onScrubEnd }),
  );
  act(() => result.current.onLayout(event({ nativeEvent: { layout: { width: 100 } } })));
  act(() => {
    mockPan.onActivate?.(event({ x: 50 }));
    if (typeof mockPan.onUpdate === 'function') mockPan.onUpdate(event({ x: 90 }));
  });
  expect(fraction.value).toBe(0.9);
  act(() => mockPan.onFinalize?.(event({ canceled: true })));
  expect(fraction.value).toBe(0.25);
  expect(result.current.holding.value).toBe(0);
  expect(onCommit).not.toHaveBeenCalled();
  expect(onScrubEnd).toHaveBeenCalledTimes(1);
  act(() => mockPan.onFinalize?.(event({ canceled: true })));
  expect(onScrubEnd).toHaveBeenCalledTimes(1);
  act(() => {
    mockPan.onActivate?.(event({ x: 80 }));
    mockPan.onFinalize?.(event({ canceled: false }));
  });
  expect(onCommit).toHaveBeenCalledWith(0.8);
  expect(onScrubEnd).toHaveBeenCalledTimes(2);
});
