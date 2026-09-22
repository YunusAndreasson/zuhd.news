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
let delayedCallbacks: ((finished: boolean) => void)[] = [];
beforeEach(() => {
  delayedCallbacks = [];
});
Object.assign(Reanimated, {
  useAnimatedReaction: (_prepare: () => number, react: Reaction) => {
    reaction = react;
  },
  withTiming: (to: number, _config?: unknown, callback?: (finished: boolean) => void) => {
    if (callback) delayedCallbacks.push(callback);
    return to;
  },
  withDelay: (_delay: number, value: number) => value,
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

it('leaves a pinch’s zoom with the camera, for the landing to fly down from', () => {
  // Over the story in front, but pinched out to the whole planet: taken by the
  // deck, that zoom would ride on to every story after it.
  const pinched = setup({ owner: 1, zoomed: true, clip: 90 });
  pinched.inputs.cameraLat.value = 40;
  pinched.inputs.cameraLng.value = 120;
  act(() => pinched.flight.setFront([40, 120]));
  act(() => pinched.flight.claimForDeck());
  expect(pinched.inputs.cameraOwner.value).toBe(1);
  expect(pinched.inputs.zoomActive.value).toBe(1);
  // The swipe lands and flies to the story's framing, which lets the zoom go.
  act(() => pinched.flight.toStoryIfHeld([40, 120], 1, 22));
  pinched.inputs.storyProgress.value = 1;
  play(1);
  expect(pinched.inputs.zoomActive.value).toBe(0);
  expect(pinched.inputs.zoomAngle.value).toBeCloseTo(22, 9);
  expect(pinched.inputs.cameraOwner.value).toBe(0);
});

it('keeps a same-location zoom flight intact when the deck claims a swipe', () => {
  const { inputs, flight } = setup({ zoomed: true, clip: 90 });
  act(() => {
    flight.setFront([10, 20]);
    flight.toStory([10, 20], 0, 22);
  });
  play(0.4);
  const flyingClip = inputs.zoomAngle.value;
  expect(flyingClip).toBeGreaterThan(22);
  expect(inputs.cameraLat.value).toBeCloseTo(10);
  expect(inputs.cameraLng.value).toBeCloseTo(20);

  act(() => flight.claimForDeck());
  expect(inputs.zoomActive.value).toBe(1);
  expect(inputs.cameraOwner.value).toBe(1);
  expect(inputs.zoomAngle.value).toBe(flyingClip);

  // Claiming does not cancel the flight plan: it can still land normally.
  act(() => reaction(1, 0.4));
  expect(inputs.zoomAngle.value).toBeCloseTo(22);
  expect(inputs.zoomActive.value).toBe(0);
  expect(inputs.cameraOwner.value).toBe(0);
});

it('retargets an ongoing zoom flight when the deck lands on another story', () => {
  const { inputs, flight } = setup({ zoomed: true, clip: 90 });
  act(() => {
    flight.setFront([10, 20]);
    flight.toStory([10, 20], 0, 22);
  });
  play(0.4);
  inputs.clip.value = inputs.zoomAngle.value;
  act(() => flight.claimForDeck());
  inputs.storyProgress.value = 1;
  act(() => flight.toStoryIfHeld([40, 120], 1, 24));
  play(1);
  expect(inputs.cameraLat.value).toBeCloseTo(40);
  expect(inputs.cameraLng.value).toBeCloseTo(120);
  expect(inputs.zoomAngle.value).toBeCloseTo(24);
  expect(inputs.zoomActive.value).toBe(0);
  expect(inputs.cameraOwner.value).toBe(0);
});

it.each(['cancelFlight', 'claimForDeck'] as const)(
  'a newer %s invalidates a delayed story flight even if its completion arrives late',
  (claim) => {
    const { inputs, flight } = setup({ owner: 1, zoomed: true, clip: 60 });
    inputs.cameraLat.value = 19.08;
    inputs.cameraLng.value = 56.2;
    act(() => flight.toStory([30.27, 120.15], 1, 24, 300));
    expect(inputs.zoomAngle.value).toBe(60);
    act(() => flight[claim]());
    // Deliberately deliver even a successful stale completion: the request
    // epoch must refuse it independently of cancelAnimation's callback flag.
    act(() => finishDelay(0));
    play(1);
    expect(inputs.cameraLat.value).toBe(19.08);
    expect(inputs.cameraLng.value).toBe(56.2);
    expect(inputs.zoomAngle.value).toBe(60);
  },
);

it('a newer immediate story or place selection supersedes a delayed marker flight', () => {
  const { inputs, flight } = setup({ progress: 2 });
  act(() => flight.toStory([30.27, 120.15], 1, 24, 300));
  act(() => flight.toStory([38.9, -77.04], 2, 22));
  act(() => finishDelay(0));
  play(1);
  expect(inputs.cameraLat.value).toBeCloseTo(38.9);
  expect(inputs.cameraLng.value).toBeCloseTo(-77.04);
  expect(inputs.cameraOwner.value).toBe(0);
});

it('does not let an old completion start a replacement delayed request early', () => {
  const { inputs, flight } = setup({ progress: 2 });
  act(() => flight.toStory([30.27, 120.15], 1, 24, 300));
  act(() => flight.toStory([38.9, -77.04], 2, 22, 300));
  act(() => finishDelay(0));
  expect(inputs.zoomActive.value).toBe(0);
  act(() => finishDelay(1));
  play(1);
  expect(inputs.cameraLat.value).toBeCloseTo(38.9);
  expect(inputs.cameraOwner.value).toBe(0);
});

it('remaps a reordered story without changing an explored camera or pinch zoom', () => {
  const { inputs, flight } = setup({ owner: 1, zoomed: true, clip: 60, progress: 1 });
  inputs.cameraLat.value = 19.08;
  inputs.cameraLng.value = 56.2;
  act(() => flight.remapStory(1, 2, true));
  expect(inputs.storyProgress.value).toBe(2);
  expect(inputs.cameraOwner.value).toBe(1);
  expect(inputs.cameraLat.value).toBe(19.08);
  expect(inputs.cameraLng.value).toBe(56.2);
  expect(inputs.zoomActive.value).toBe(1);
  expect(inputs.zoomAngle.value).toBe(60);
});

it.each([0, 300])(
  'remaps the landing of an existing flight across a reorder (delay %i)',
  (delay) => {
    const { inputs, flight } = setup({ progress: 1 });
    act(() => flight.toStory([19.08, 72.88], 1, 24, delay));
    act(() => flight.remapStory(1, 2, true));
    if (delay) act(() => finishDelay(0));
    play(1);
    expect(inputs.storyProgress.value).toBe(2);
    expect(inputs.cameraLat.value).toBeCloseTo(19.08);
    expect(inputs.cameraLng.value).toBeCloseTo(72.88);
    expect(inputs.cameraOwner.value).toBe(0);
  },
);

function finishDelay(index: number) {
  const callback = delayedCallbacks[index];
  if (!callback) throw new Error('Missing delayed completion');
  callback(true);
}

it('refuses an old tap delivered after a newer UI gesture, before it can hold or schedule a flight', () => {
  const { inputs, flight } = setup();
  const tapEpoch = flight.requestEpoch.value;
  act(() => flight.cancelFlight());
  act(() => {
    flight.hold(tapEpoch);
    flight.toStory([30.27, 120.15], 1, 24, 300, tapEpoch);
  });
  expect(inputs.cameraOwner.value).toBe(0);
  expect(inputs.zoomActive.value).toBe(0);
  expect(delayedCallbacks).toHaveLength(0);
});
