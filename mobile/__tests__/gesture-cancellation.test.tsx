import { act, render, renderHook } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import type { PanGestureConfig } from 'react-native-gesture-handler';
import * as Reanimated from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { MapSheet, type MapSheetRef } from '../components/map/MapSheet';
import { StoryDeck, type StoryDeckRef } from '../components/map/StoryDeck';
import { useScrub } from '../hooks/useScrub';
import { useSwipeBackGesture } from '../hooks/useSwipeBack';

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
/** A coast has no target to stand in for it: the tests read what it was given. */
const decay = jest.fn((_config: unknown) => Number.NaN);
interface Reaction {
  prepare: () => unknown;
  react: (next: unknown, previous: unknown) => void;
  previous: unknown;
}
const reactions = new Set<Reaction>();
Object.assign(Reanimated, {
  withSpring: spring,
  withDecay: decay,
  withTiming: (to: number) => to,
  cancelAnimation: jest.fn(),
  // Held, not run: nothing here moves a value on a UI thread. `land` runs
  // them, as a frame would once a value they read had changed.
  useAnimatedReaction: (prepare: Reaction['prepare'], react: Reaction['react']) => {
    const held = useRef<Reaction>({ prepare, react, previous: null });
    held.current.prepare = prepare;
    held.current.react = react;
    useEffect(() => {
      const reaction = held.current;
      reactions.add(reaction);
      return () => {
        reactions.delete(reaction);
      };
    }, []);
  },
});
/** The frame after a spring: `withSpring` above puts a value on its target at once. */
const land = () =>
  act(() => {
    for (const reaction of reactions) {
      const next = reaction.prepare();
      reaction.react(next, reaction.previous);
      reaction.previous = next;
    }
  });
const shared = (value: number) => ({ value }) as SharedValue<number>;
const event = (data: object) => data as never;

beforeEach(() => jest.clearAllMocks());

/** A flick left, far and fast enough to turn one card whatever it is caught at. */
const flickOn = () => {
  mockPan.onBegin?.(event({}));
  mockPan.onActivate?.(event({ translationX: -16 }));
  mockPan.onDeactivate?.(event({ translationX: -350, velocityX: -2000, canceled: false }));
};

function renderDeck(index: number, count = 5) {
  const progress = shared(index);
  const onRelease = jest.fn();
  const onSettle = jest.fn();
  const onDragStart = jest.fn();
  const ref = { current: null as StoryDeckRef | null };
  const deck = (at: number) => (
    <StoryDeck
      ref={ref}
      count={count}
      index={at}
      progress={progress}
      width={400}
      sheetGesture={{} as never}
      scrollEnabled={false}
      onScrollOffset={shared(0)}
      keyOf={String}
      renderStory={() => null}
      renderEnd={() => null}
      onDragStart={onDragStart}
      onRelease={onRelease}
      onSettle={onSettle}
    />
  );
  const { rerender } = render(deck(index));
  return {
    progress,
    onRelease,
    onSettle,
    onDragStart,
    ref,
    show: (at: number) => rerender(deck(at)),
  };
}

it('rolls a canceled deck swipe back without committing or carrying velocity', () => {
  const { progress, onRelease, onSettle } = renderDeck(2);
  progress.value = 2.3;
  act(() => {
    mockPan.onBegin?.(event({}));
    mockPan.onActivate?.(event({ translationX: -16 }));
    if (typeof mockPan.onUpdate === 'function') mockPan.onUpdate(event({ translationX: -350 }));
    mockPan.onDeactivate?.(event({ translationX: -350, velocityX: -2000, canceled: true }));
  });
  expect(progress.value).toBe(2);
  expect(spring).toHaveBeenLastCalledWith(2, expect.objectContaining({ velocity: 0 }));
  land();
  expect(onRelease).not.toHaveBeenCalled();
  expect(onSettle).not.toHaveBeenCalled();
});

it('tells the screen of a new story when the card lands on it, not as the finger lets go', () => {
  const { onRelease, onSettle } = renderDeck(2);
  act(flickOn);
  // The lift is the hand's: the haptic, the announcement, the camera.
  expect(onRelease.mock.calls).toEqual([[3]]);
  expect(onSettle).not.toHaveBeenCalled();
  land();
  land();
  expect(onSettle.mock.calls).toEqual([[3]]);
  expect(onRelease).toHaveBeenCalledTimes(1);
});

it('tells the screen at once when a finger comes down before the landing, and a second flick goes one further', () => {
  const { progress, onRelease, onSettle } = renderDeck(2);
  act(flickOn);
  expect(onSettle).not.toHaveBeenCalled();
  // Caught on its way: React must hold story 3 before story 4's card exists.
  progress.value = 2.6;
  act(() => mockPan.onBegin?.(event({})));
  expect(onSettle.mock.calls).toEqual([[3]]);
  act(() => {
    mockPan.onActivate?.(event({ translationX: -16 }));
    mockPan.onDeactivate?.(event({ translationX: -350, velocityX: -2000, canceled: false }));
  });
  expect(onRelease.mock.calls).toEqual([[3], [4]]);
  land();
  expect(onSettle.mock.calls).toEqual([[3], [4]]);
});

it('does not take back a swipe let go since, when the render for the one before arrives late', () => {
  const { progress, show } = renderDeck(2);
  act(flickOn);
  progress.value = 2.6;
  act(flickOn);
  // The first landing's render, arriving with the card passing exactly over
  // story 3: the deck is committed to 4 and must stay so.
  progress.value = 3;
  act(() => show(3));
  act(() => {
    mockPan.onBegin?.(event({}));
    mockPan.onActivate?.(event({ translationX: -16 }));
    mockPan.onDeactivate?.(event({ translationX: -16, velocityX: 0, canceled: true }));
  });
  expect(spring).toHaveBeenLastCalledWith(4, expect.objectContaining({ velocity: 0 }));
});

it('does not send a jump the screen made back to it as a landing', () => {
  const { progress, onSettle, show } = renderDeck(2);
  // `focusStory`: the position jumps, then the deck re-renders on the story.
  progress.value = 4;
  act(() => show(4));
  land();
  expect(onSettle).not.toHaveBeenCalled();
  // And the deck is committed there: a canceled swipe returns to it.
  act(() => {
    mockPan.onBegin?.(event({}));
    mockPan.onActivate?.(event({ translationX: -16 }));
    mockPan.onDeactivate?.(event({ translationX: -16, velocityX: 0, canceled: true }));
  });
  expect(spring).toHaveBeenLastCalledWith(4, expect.objectContaining({ velocity: 0 }));
});

it('steps one story per tap, telling the screen at each tap, and stops at the end card', () => {
  const { onRelease, onSettle, onDragStart, ref } = renderDeck(1, 3);
  // Two taps before React has re-rendered with a new index: one story each.
  act(() => {
    ref.current?.step(1);
    ref.current?.step(1);
  });
  expect(onRelease.mock.calls).toEqual([[2], [3]]);
  expect(onSettle.mock.calls).toEqual([[2], [3]]);
  expect(onDragStart).toHaveBeenCalledTimes(2);
  expect(spring).toHaveBeenLastCalledWith(3, expect.objectContaining({ dampingRatio: 1 }));
  // A step is told at the tap: its landing has nothing left to say.
  land();
  expect(onSettle).toHaveBeenCalledTimes(2);
  // The end card is the last place: a third tap does nothing.
  act(() => ref.current?.step(1));
  expect(onSettle).toHaveBeenCalledTimes(2);
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
        renderList: () => <div />,
        onPullDown,
        onDetentChange,
        ref,
      }),
    );
    if (detent === 'full') act(() => ref.current?.expand());
    land();
    onDetentChange.mockClear();
    act(() => {
      mockPan.onBegin?.(event({}));
      mockPan.onActivate?.(event({ translationY: 8 }));
      if (typeof mockPan.onUpdate === 'function') mockPan.onUpdate(event({ translationY: 600 }));
      mockPan.onDeactivate?.(event({ velocityY: 2500, canceled: true }));
      mockPan.onFinalize?.(event({ canceled: true }));
    });
    land();
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

it('keeps the distance of a vertical drag whose activation arrives late', () => {
  const onDetentChange = jest.fn();
  renderHook(() =>
    MapSheet({
      peek: 300,
      full: 700,
      progress: shared(0),
      renderList: () => <div />,
      onDetentChange,
    }),
  );
  act(() => {
    mockPan.onBegin?.(event({}));
    // The first delivered event already crossed half the sheet's travel.
    mockPan.onActivate?.(event({ translationY: -250 }));
    if (typeof mockPan.onUpdate === 'function') mockPan.onUpdate(event({ translationY: -260 }));
    mockPan.onDeactivate?.(event({ velocityY: 0, canceled: false }));
  });
  expect(spring).toHaveBeenLastCalledWith(0, expect.objectContaining({ velocity: 0 }));
  land();
  expect(onDetentChange).toHaveBeenCalledWith('full');
});

it('tells the screen of a new stop when the sheet lands on it, not as the finger lets go', () => {
  const onDetentChange = jest.fn();
  const ref = { current: null as MapSheetRef | null };
  renderHook(() =>
    MapSheet({
      peek: 300,
      full: 700,
      progress: shared(0),
      renderList: () => <div />,
      onDetentChange,
      ref,
    }),
  );
  land();
  // Dragged to the open stop and held there: the finger can still take it away.
  act(() => {
    mockPan.onBegin?.(event({}));
    mockPan.onActivate?.(event({ translationY: -8 }));
    if (typeof mockPan.onUpdate === 'function') mockPan.onUpdate(event({ translationY: -600 }));
  });
  land();
  expect(onDetentChange).not.toHaveBeenCalled();
  // Let go: the release alone says nothing, the landing does, once.
  act(() => mockPan.onDeactivate?.(event({ velocityY: 0, canceled: false })));
  expect(onDetentChange).not.toHaveBeenCalled();
  land();
  land();
  expect(onDetentChange.mock.calls).toEqual([['full']]);
  // A move the app makes waits for its landing too.
  act(() => ref.current?.collapse());
  expect(onDetentChange).toHaveBeenCalledTimes(1);
  land();
  expect(onDetentChange.mock.calls).toEqual([['full'], ['peek']]);
});

describe('a page swiped back', () => {
  function renderBack() {
    const drag = shared(0);
    const onBack = jest.fn();
    renderHook(() => useSwipeBackGesture({ enabled: true, onBack, drag }));
    const pull = (to: number) => {
      mockPan.onActivate?.(event({ translationX: 20 }));
      if (typeof mockPan.onUpdate === 'function') mockPan.onUpdate(event({ translationX: to }));
    };
    return { drag, onBack, pull };
  }

  it("follows the finger from where the pan claimed it, and keeps a late claim's drag", () => {
    const { drag, pull } = renderBack();
    act(() => pull(120));
    expect(drag.value).toBe(100);
    // The first event delivered is already far out: only the slop is discounted.
    act(() => {
      mockPan.onActivate?.(event({ translationX: 150 }));
      if (typeof mockPan.onUpdate === 'function') mockPan.onUpdate(event({ translationX: 150 }));
    });
    expect(drag.value).toBe(230);
  });

  it('comes home without going back when the swipe is canceled', () => {
    const { drag, onBack, pull } = renderBack();
    act(() => {
      pull(320);
      mockPan.onDeactivate?.(event({ velocityX: 900, canceled: true }));
    });
    expect(onBack).not.toHaveBeenCalled();
    expect(drag.value).toBe(0);
    expect(spring).toHaveBeenLastCalledWith(0, expect.objectContaining({ velocity: 0 }));
  });

  it('stays when it is let go coming home, however far out it was', () => {
    const { onBack, pull } = renderBack();
    act(() => {
      pull(220);
      mockPan.onDeactivate?.(event({ velocityX: -700, canceled: false }));
    });
    expect(onBack).not.toHaveBeenCalled();
    expect(spring).toHaveBeenLastCalledWith(0, expect.objectContaining({ velocity: -700 }));
  });

  it('goes back on a flick from a short drag, and coasts until the page changes', () => {
    const { onBack, pull } = renderBack();
    act(() => {
      pull(40);
      mockPan.onDeactivate?.(event({ velocityX: 600, canceled: false }));
    });
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(decay).toHaveBeenLastCalledWith(expect.objectContaining({ velocity: 600 }));
    // The same short drag, let go slowly, is not a decision.
    act(() => {
      pull(40);
      mockPan.onDeactivate?.(event({ velocityX: 100, canceled: false }));
    });
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
