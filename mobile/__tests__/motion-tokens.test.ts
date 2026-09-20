import { ReduceMotion } from 'react-native-reanimated';
import { ANIMATION, KEEP_MOTION } from '../constants/theme';

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
