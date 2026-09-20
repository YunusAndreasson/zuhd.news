import { FadeInDown } from 'react-native-reanimated';
import { ANIMATION, staggerDelay } from '../constants/theme';

/** Staggered fade-in-down entrance for a block at a known `index`. Wraps the
 *  `FadeInDown.duration(...).delay(staggerDelay(index))` recipe that was
 *  copy-pasted across every sheet so the entrance curve + capped stagger live
 *  in one place. Use in map bodies where the loop index is already available
 *  (SourcesSheet, MenuSheet, CountrySheet, SheetInfoPage…). */
export function staggerEnter(index: number, duration: number = ANIMATION.normal) {
  return FadeInDown.duration(duration).delay(staggerDelay(index));
}

/** Counter-based variant for sheets that reveal a handful of hero rows in
 *  source order without a loop index. Returns a factory that advances an
 *  internal counter on each call — call once per animated row:
 *
 *    const enter = makeStaggerEnter();
 *    <Animated.View entering={enter()}>…</Animated.View>   // delay 0
 *    <Animated.View entering={enter()}>…</Animated.View>   // delay 1 step
 *
 *  Reset per render by calling `makeStaggerEnter()` in the component body,
 *  exactly like the previous inline `let blockIndex = 0` pattern. */
export function makeStaggerEnter(duration: number = ANIMATION.normal) {
  let index = 0;
  return () => staggerEnter(index++, duration);
}
