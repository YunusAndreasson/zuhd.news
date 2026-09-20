import { act, renderHook } from '@testing-library/react';
import * as Reanimated from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { useCameraFlight } from '../hooks/useCameraFlight';
import {
  arcDegrees,
  DECK_SETTLE_MS,
  flyCurve,
  flyMs,
  flyPosition,
  flySpanClip,
  slerpLatLng,
} from '../lib/globe-camera';

// The shared jest mock runs no reactions and has no animation functions. Here
// the reaction is captured so each frame of a flight can be driven by hand, and
// `withTiming` lands at once — the test plays the frames itself.
type Reaction = (value: number, previous: number | null) => void;
let reaction: Reaction = () => {};
Object.assign(Reanimated, {
  useAnimatedReaction: (_prepare: () => number, react: Reaction) => {
    reaction = react;
  },
  withTiming: (to: number) => to,
  cancelAnimation: jest.fn(),
});

const shared = (value: number) => ({ value }) as SharedValue<number>;

function setup({ owner = 0, zoomed = false, clip = 20, progress = 0 } = {}) {
  const inputs = {
    cameraOwner: shared(owner),
    cameraLat: shared(0),
    cameraLng: shared(0),
    viewLat: shared(10),
    viewLng: shared(20),
    zoomActive: shared(zoomed ? 1 : 0),
    zoomAngle: shared(zoomed ? clip : 90),
    clip: shared(clip),
    storyProgress: shared(progress),
  };
  const { result } = renderHook(() => useCameraFlight(inputs));
  return { inputs, flight: result.current };
}

/** Play a flight from `t = 0` through the given frames. */
function play(...frames: number[]) {
  let previous = 0;
  act(() => {
    reaction(0, 1);
    for (const t of frames) {
      reaction(t, previous);
      previous = t;
    }
  });
}

it('flies to a story along the great circle, rising on the way', () => {
  const { inputs, flight } = setup({ clip: 20, progress: 3 });
  act(() => flight.toStory([40, 120], 3, 24));
  // Taken from where the globe was drawn, not from stale camera values.
  expect(inputs.cameraOwner.value).toBe(1);
  expect(inputs.zoomActive.value).toBe(1);
  play(0.5);
  const curve = flyCurve(20, 24, arcDegrees(10, 20, 40, 120));
  // Halfway through the flight is not halfway along the arc: the crossing
  // covers its ground while it is highest (`flyPosition`).
  const [lat, lng] = slerpLatLng(10, 20, 40, 120, flyPosition(curve, 0.5));
  expect(inputs.cameraLat.value).toBeCloseTo(lat, 9);
  expect(inputs.cameraLng.value).toBeCloseTo(lng, 9);
  // A long crossing zooms out past both framings mid-flight.
  expect(inputs.zoomAngle.value).toBeGreaterThan(24);
  expect(inputs.zoomAngle.value).toBeCloseTo(flySpanClip(curve, 0.5), 9);
});

it('lets go of the flight’s zoom when a finger lands on the earth', () => {
  const { inputs, flight } = setup({ clip: 20, progress: 3 });
  act(() => flight.toStory([40, 120], 3, 24));
  play(0.5);
  // Mid-crossing: the override is the flight’s and is well above both
  // framings. Stopping the tween alone used to leave it there until the next
  // pinch or settle, stranding the globe zoomed out.
  expect(inputs.zoomActive.value).toBe(1);
  act(() => flight.cancelFlight());
  expect(inputs.zoomActive.value).toBe(0);
  // The camera stays where the finger took it over.
  expect(inputs.cameraOwner.value).toBe(1);
});

it('keeps a pinch’s own zoom when a finger stops a place flight', () => {
  const { inputs, flight } = setup({ zoomed: true, clip: 12 });
  act(() => flight.toPlace([-30, 60]));
  play(0.4);
  act(() => flight.cancelFlight());
  expect(inputs.zoomActive.value).toBe(1);
});

it('hands a landed swipe to a flight only where that would not hurry it', () => {
  // `handleDeckSettle` compares the crossing's own duration against the deck
  // spring's rather than against an arc, and this is why: a flight's duration
  // rises with the distance and never falls back, so once a crossing is long
  // enough to fly, every longer one is too. One arc could not promise that —
  // the same distance flies at different speeds from an 18° framing and a 24°
  // one — and a hand-off that *shortened* a crossing would be the opposite of
  // the point.
  const framings: [number, number][] = [
    [18, 18],
    [21, 21],
    [24, 24],
    [18, 24],
    [24, 18],
  ];
  for (const [from, to] of framings) {
    let flying = false;
    let last = 0;
    for (let travel = 2; travel <= 180; travel += 2) {
      const ms = flyMs(flyCurve(from, to, travel));
      expect(ms).toBeGreaterThanOrEqual(last);
      last = ms;
      if (ms > DECK_SETTLE_MS) flying = true;
      // Never back under the bar once over it.
      else expect(flying).toBe(false);
    }
    // A neighbouring city rides the card; the far side of the planet flies.
    expect(flyMs(flyCurve(from, to, 3))).toBeLessThanOrEqual(DECK_SETTLE_MS);
    expect(flyMs(flyCurve(from, to, 120))).toBeGreaterThan(DECK_SETTLE_MS);
  }
});

it('lands on the story framing and hands the camera back on the same frame', () => {
  const { inputs, flight } = setup({ clip: 20, progress: 3 });
  act(() => flight.toStory([40, 120], 3, 24));
  play(0.5, 1);
  expect(inputs.cameraLat.value).toBeCloseTo(40, 9);
  expect(inputs.cameraLng.value).toBeCloseTo(120, 9);
  expect(inputs.zoomAngle.value).toBeCloseTo(24, 9);
  expect(inputs.zoomActive.value).toBe(0);
  expect(inputs.cameraOwner.value).toBe(0);
});

it('keeps the camera when the deck has moved on during the flight', () => {
  const { inputs, flight } = setup({ progress: 3 });
  act(() => flight.toStory([40, 120], 3, 24));
  inputs.storyProgress.value = 4;
  play(1);
  expect(inputs.cameraOwner.value).toBe(1);
});

it('releases a pinch when it flies to a story', () => {
  const { inputs, flight } = setup({ zoomed: true, clip: 12, progress: 2 });
  act(() => flight.toStory([0, 0], 2, 22));
  play(1);
  expect(inputs.zoomActive.value).toBe(0);
  expect(inputs.zoomAngle.value).toBeCloseTo(22, 9);
});

it.each([
  [false, 0],
  [true, 1],
])('a place flight comes back to the zoom it left (pinched: %p)', (zoomed, active) => {
  const { inputs, flight } = setup({ zoomed, clip: 15 });
  act(() => flight.toPlace([-30, 60]));
  play(0.5, 1);
  expect(inputs.zoomAngle.value).toBeCloseTo(15, 9);
  expect(inputs.zoomActive.value).toBe(active);
  // A gauge's place is not a story: the camera stays there.
  expect(inputs.cameraOwner.value).toBe(1);
});

it('flies a landed swipe only if a target is holding the camera', () => {
  const idle = setup({ owner: 0 });
  act(() => idle.flight.toStoryIfHeld([40, 120], 1, 24));
  expect(idle.inputs.cameraOwner.value).toBe(0);
  expect(idle.inputs.zoomActive.value).toBe(0);

  const held = setup({ owner: 1 });
  act(() => held.flight.toStoryIfHeld([40, 120], 1, 24));
  expect(held.inputs.zoomActive.value).toBe(1);
});

it('lets a swipe take the camera only when it is still on the story in front', () => {
  const near = setup({ owner: 1 });
  near.inputs.cameraLat.value = 40.3;
  near.inputs.cameraLng.value = 119.6;
  act(() => near.flight.setFront([40, 120]));
  act(() => near.flight.claimForDeck());
  expect(near.inputs.cameraOwner.value).toBe(0);

  const far = setup({ owner: 1 });
  far.inputs.cameraLat.value = 10;
  act(() => far.flight.setFront([40, 120]));
  act(() => far.flight.claimForDeck());
  expect(far.inputs.cameraOwner.value).toBe(1);

  // Across the dateline counts as near.
  const wrapped = setup({ owner: 1 });
  wrapped.inputs.cameraLat.value = 0;
  wrapped.inputs.cameraLng.value = 179.8;
  act(() => wrapped.flight.setFront([0, -179.9]));
  act(() => wrapped.flight.claimForDeck());
  expect(wrapped.inputs.cameraOwner.value).toBe(0);
});
