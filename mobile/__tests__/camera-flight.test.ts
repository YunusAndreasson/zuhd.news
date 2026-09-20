import { act, renderHook } from '@testing-library/react';
import * as Reanimated from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { useCameraFlight } from '../hooks/useCameraFlight';
import { arcDegrees, slerpLatLng, swipeClip } from '../lib/globe-camera';

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
  const [lat, lng] = slerpLatLng(10, 20, 40, 120, 0.5);
  expect(inputs.cameraLat.value).toBeCloseTo(lat, 9);
  expect(inputs.cameraLng.value).toBeCloseTo(lng, 9);
  // A long crossing zooms out past both framings mid-flight.
  expect(inputs.zoomAngle.value).toBeGreaterThan(24);
  expect(inputs.zoomAngle.value).toBeCloseTo(
    swipeClip(20, 24, 0.5, arcDegrees(10, 20, 40, 120)),
    9,
  );
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
