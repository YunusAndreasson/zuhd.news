import { ReduceMotion } from 'react-native-reanimated';
import { ANIMATION, KEEP_MOTION } from '../constants/theme';
import { DECK_CURVE_MS, DECK_SETTLE_MS, FLIGHT_MIN_MS } from '../lib/globe-camera';

// Reanimated 4 merges a spring's config over `GentleSpringConfig`, whose mass is
// 4. A token that named only damping and stiffness therefore ran at a quarter
// of the stiffness it was tuned at — `ANIMATION.spring` took ~2.6 s to stop
// wobbling a swiped row back into place. Every spring here states the physics
// it means: a mass, or a perceived duration and damping ratio.
const springs: [string, object][] = Object.entries(ANIMATION).flatMap(([name, value]) =>
  typeof value === 'object' && value !== null ? [[name, value] as [string, object]] : [],
);

it('has springs to check', () => {
  expect(springs.length).toBeGreaterThan(0);
});

it.each(springs)('spring token %s states its mass, or its duration and damping ratio', (_, c) => {
  const physical = 'damping' in c && 'stiffness' in c && 'mass' in c;
  const perceived = 'duration' in c && 'dampingRatio' in c;
  expect(physical || perceived).toBe(true);
});

it('keeps motion that Reduce Motion must not snap, and only that', () => {
  expect(KEEP_MOTION).toEqual({ reduceMotion: ReduceMotion.Never });
  // No token carries it by default: a discrete animation leaves Reduce Motion
  // to the library, which snaps it.
  for (const [, config] of springs) expect('reduceMotion' in config).toBe(false);
});

// A landing spring's curve, as arithmetic. Reanimated does not take a
// `duration`-form spring's stiffness from the config: it solves for it, so that
// the spring's energy has fallen to `energyThreshold` of what it started with
// at 1.5 × `duration` (`calculateNewStiffnessToMatchDuration`), and ends the
// animation there. So raising the threshold alone does not end a spring
// sooner — it makes the spring softer, to reach the larger threshold at the
// same moment — while shortening the duration and raising the threshold
// together can keep the rate, which is the curve: the same motion, ended
// earlier. Critically damped and released at rest, with `u = rate × time`,
// the travel left is `(1 + u) e^-u` and the energy left `e^-2u (1 + 2u + 2u²)`.
// The jest harness stubs `withSpring`, so this is the only check there is.
const SETTLE_FACTOR = 1.5;
/** Reanimated's own `energyThreshold` default. */
const ENERGY_THRESHOLD = 6e-9;

/** The rate, in rad/s, Reanimated gives a critically damped spring. */
function settleRate(durationMs: number, energyThreshold = ENERGY_THRESHOLD): number {
  // The energy left only falls as `u` grows, so the root is bracketed.
  let lo = 0;
  let hi = 64;
  for (let i = 0; i < 80; i++) {
    const u = (lo + hi) / 2;
    if (Math.exp(-2 * u) * (1 + 2 * u + 2 * u * u) > energyThreshold) lo = u;
    else hi = u;
  }
  return (lo + hi) / 2 / ((durationMs * SETTLE_FACTOR) / 1000);
}

/** The share of its travel a spring of this rate still has to go after `ms`. */
function travelLeft(rate: number, ms: number): number {
  const u = (rate * ms) / 1000;
  return (1 + u) * Math.exp(-u);
}

describe("the deck's landing", () => {
  const { duration, energyThreshold } = ANIMATION.springSettle;
  const whole = settleRate(DECK_CURVE_MS);
  const cut = settleRate(duration, energyThreshold);

  it('draws the 350 ms curve', () => {
    // Reanimated solves the stiffness from the duration and the threshold
    // together. Either changed alone is a different spring, not a shorter one.
    expect(Math.abs(cut / whole - 1)).toBeLessThan(0.005);
  });

  it('ends once the card has arrived, and not before', () => {
    const end = duration * SETTLE_FACTOR;
    expect(end).toBeLessThan(400);
    // Half a point or so of the widest phone's card, which nobody sees snap.
    const left = travelLeft(cut, end) * 430;
    expect(left).toBeLessThan(0.6);
    expect(left).toBeGreaterThan(0.3);
  });

  it('keeps the whole curve as the bar a crossing is held against', () => {
    // `DECK_SETTLE_MS` decides whether the camera flies the rest itself
    // (`crossingFlies`). At the spring's shortened end it would sit under the
    // shortest flight, and every crossing would fly.
    expect(DECK_SETTLE_MS).toBe(Math.round(DECK_CURVE_MS * SETTLE_FACTOR));
    expect(DECK_SETTLE_MS).toBeGreaterThan(FLIGHT_MIN_MS);
    expect(duration * SETTLE_FACTOR).toBeLessThan(FLIGHT_MIN_MS);
  });
});
