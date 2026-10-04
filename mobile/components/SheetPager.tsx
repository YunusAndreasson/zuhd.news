import { type ReactNode, useLayoutEffect, useState } from 'react';
import { type StyleProp, StyleSheet, type ViewStyle } from 'react-native';
import Animated, {
  Keyframe,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { ANIMATION, EASING, SPACING } from '../constants/theme';
import type { SheetMove } from '../hooks/useSheetNavigation';
import { useTheme } from '../hooks/useTheme';

/**
 * A multi-page sheet's pages, and the move between them.
 *
 * A platform sheet animates its own rise and nothing inside it, so a page
 * used to replace the last in one frame. Here the new page comes in from the
 * side it was reached from — the right going forward, the left going back —
 * from under a veil of the sheet's ground that lifts off it.
 *
 * The veil is a leaf: fading the page itself would composite every row off
 * screen for each frame of the fade. It is keyed by the page, so it mounts
 * opaque in the commit that mounts the page, and the page's first frame is
 * never seen at rest. Needs a sheet of fixed height (`SheetLayout`'s `fill`).
 *
 * A page's own entrance (a stagger of its blocks) is its owner's to skip:
 * `LayoutAnimationConfig skipEntering`, keyed by the page.
 */

const SHIFT = SPACING.lg;
const TIMING = { duration: ANIMATION.normal, easing: EASING.out };

/** Opaque, then clear: the veil's own style is the cleared one. */
const VEIL_LIFT = new Keyframe({ 0: { opacity: 1 }, 100: { opacity: 0 } }).duration(
  ANIMATION.normal,
);

/** Whether `move` is one this component has seen happen. The move it
 *  mounted with is already over: Android mounts a sheet's content each time
 *  it opens, and a sheet reopened on the page it was left on must not play
 *  that page's arrival again. */
function useMoving(move: SheetMove): boolean {
  const [settled] = useState(move);
  return move !== settled && move.direction !== 0;
}

/**
 * The veil alone, over whatever it is laid on: the handle's title wears one,
 * so a page's name arrives with its page.
 */
export function PageVeil({
  pageKey,
  move,
  style,
}: {
  pageKey: string;
  move: SheetMove;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const moving = useMoving(move);
  return (
    <Animated.View
      key={pageKey}
      entering={moving ? VEIL_LIFT : undefined}
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.veil, { backgroundColor: colors.sheetBg }, style]}
    />
  );
}

export function SheetPager({
  pageKey,
  move,
  children,
}: {
  pageKey: string;
  move: SheetMove;
  children: ReactNode;
}) {
  const moving = useMoving(move);
  const shift = useSharedValue(0);
  useLayoutEffect(() => {
    if (!moving) return;
    shift.set(move.direction * SHIFT);
    shift.set(withTiming(0, TIMING));
  }, [moving, move, shift]);
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: shift.get() }] }));
  return (
    <Animated.View style={[styles.page, slide]}>
      {children}
      <PageVeil pageKey={pageKey} move={move} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  veil: { opacity: 0 },
});
