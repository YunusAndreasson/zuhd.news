import { act, renderHook } from '@testing-library/react';
import * as Reanimated from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { useSettledMapContext } from '../hooks/useSettledMapContext';
import { markGlobeMoving, publishRestingView } from '../lib/resting-view';

type Camera = {
  exploring: boolean;
  lat: number;
  lng: number;
  clip: number;
  story: number;
  flight: number;
  view: number;
};
let cameraReaction: (next: Camera, previous: Camera | null) => void;
let timerReaction: (next: number, previous: number | null) => void;
const delay = jest.fn((_ms: number, value: number) => value);
Object.assign(Reanimated, {
  useAnimatedReaction: (prepare: () => unknown, react: unknown) => {
    if (typeof prepare() === 'number') timerReaction = react as typeof timerReaction;
    else cameraReaction = react as typeof cameraReaction;
  },
  cancelAnimation: jest.fn(),
  withTiming: (value: number) => value,
  withDelay: delay,
});
const shared = <T,>(value: T) => ({ value }) as SharedValue<T>;
const settled = { clip: 30, named: [], unnamed: [], countries: [] };
const mount = () =>
  renderHook(() =>
    useSettledMapContext(shared(true), shared(0), shared(0), shared(30), shared(0), shared(1)),
  );
beforeEach(() => {
  delay.mockClear();
  publishRestingView({ named: [], unnamed: [], countries: [] });
});

it('publishes only the latest settled camera and restarts the quiet period during movement', () => {
  const { result } = mount();
  const start = { exploring: true, lat: 0, lng: 0, clip: 30, story: 0, flight: 1, view: 0 };
  act(() => cameraReaction(start, null));
  const end = { ...start, lng: 10 };
  act(() => cameraReaction(end, start));
  expect(result.current).toBeNull();
  expect(delay).toHaveBeenCalledTimes(2);
  expect(delay).toHaveBeenLastCalledWith(200, 1, Reanimated.ReduceMotion.Never);
  act(() => timerReaction(1, 0));
  expect(result.current).toEqual({ ...settled, exploring: true, story: 0 });
  act(() => cameraReaction(end, end));
  expect(delay).toHaveBeenCalledTimes(2);
  const story = { ...end, exploring: false, story: 2 };
  act(() => cameraReaction(story, end));
  expect(result.current).toEqual({ ...settled, exploring: true, story: 0 });
  act(() => timerReaction(1, 0));
  expect(result.current).toEqual({ ...settled, exploring: false, story: 2 });
});
it("restarts the quiet period on the globe's publish and settles with what it shows", () => {
  const { result } = mount();
  const start = { exploring: true, lat: 0, lng: 0, clip: 30, story: 0, flight: 1, view: 0 };
  act(() => cameraReaction(start, null));
  act(() => timerReaction(1, 0));
  const before = result.current;
  // A turn of the globe over the same marks and capitals commits nothing.
  const turned = { ...start, lng: 10 };
  act(() => cameraReaction(turned, start));
  act(() => timerReaction(1, 0));
  expect(result.current).toBe(before);
  // The publish sets no state of its own; the quiet period it restarts does.
  act(() =>
    publishRestingView({ named: ['strait-hormuz'], unnamed: ['mkt:bist'], countries: ['TR'] }),
  );
  expect(result.current).toBe(before);
  act(() => cameraReaction({ ...turned, view: 1 }, turned));
  expect(delay).toHaveBeenCalledTimes(3);
  act(() => timerReaction(1, 0));
  expect(result.current).toEqual({
    exploring: true,
    clip: 30,
    story: 0,
    named: ['strait-hormuz'],
    unnamed: ['mkt:bist'],
    countries: ['TR'],
  });
});
it('puts a settle off while the globe is still moving, and takes it when the globe rests', () => {
  const { result } = mount();
  const start = { exploring: false, lat: 0, lng: 0, clip: 30, story: 0, flight: 1, view: 0 };
  act(() => cameraReaction(start, null));
  act(() => timerReaction(1, 0));
  const before = result.current;
  // A slow frame: the story has changed and every watched value has been still
  // for the quiet period, but the last frame drawn was a moving one.
  markGlobeMoving();
  const next = { ...start, story: 1 };
  act(() => cameraReaction(next, start));
  act(() => timerReaction(1, 0));
  expect(result.current).toBe(before);
  // A flight's progress holds the quiet period open by itself.
  act(() => cameraReaction({ ...next, flight: 0.5 }, next));
  expect(delay).toHaveBeenCalledTimes(3);
  // The landing: the same view is news, because the globe came to rest on it.
  act(() => publishRestingView({ named: [], unnamed: [], countries: ['TR'] }));
  act(() => cameraReaction({ ...next, view: 1 }, next));
  act(() => timerReaction(1, 0));
  expect(result.current).toEqual({
    exploring: false,
    clip: 30,
    story: 1,
    named: [],
    unnamed: [],
    countries: ['TR'],
  });
});
