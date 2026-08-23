import type { ReactNode } from 'react';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { RADIUS, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

/**
 * A column, presenting its detail as a modal over itself.
 *
 * Every column is an index and every row opens a detail. Until now the page
 * *swapped* between the two — the index unmounted, the detail took the whole
 * screen — and the pull-down that dismisses a detail moved it over nothing.
 * A reader pulling had to take on trust that something was underneath.
 *
 * `mobile/CLAUDE.md` recorded the swap as a rule, on the grounds that an
 * overlay would eat the horizontal pan. The reason does not survive contact:
 * that pan belongs to `PagerView`, whose *page* is this component's parent,
 * and a child filling that page cannot take a gesture the page never gave it
 * — which is why the detail has always been able to cross sections while
 * open, back when it was a swapped child of exactly these dimensions. What
 * would have eaten the pan is an overlay above the pager, and this is not one.
 * (Re-verified on device: horizontal swipe from an open detail still lands on
 * the next section.)
 *
 * ── The choreography, which is not ours ───────────────────────────────────
 *
 * It is the one every sheet a reader has ever dismissed runs on, and copying
 * it is the point: the presenting view settles back and dims, the sheet sits
 * inset from the top with a rounded edge and a handle, and pulling the sheet
 * down walks all of it backwards — the backdrop growing and brightening as
 * the sheet leaves. The reader watches where they are going the whole way,
 * which is the half a shrinking-into-nothing page could never give them.
 *
 * `progress` is 0 when the column is just its index and 1 when the detail is
 * fully presented; the pull drives it back down under the finger. One value,
 * shared with `usePullToClose`, so the sheet and the ground behind it cannot
 * disagree about how far the gesture has got.
 */

/** How far back the index settles. Small — this is a hint that the column is
 *  still there, not a diorama. Matches the depth a system sheet uses. */
const BACKDROP_SCALE = 0.94;

/** How dark the index goes. Enough to push it behind the reading surface,
 *  short of hiding what it is. */
const BACKDROP_DIM = 0.55;

/** The sliver of index left showing above the sheet. It is the whole of what
 *  makes this a modal rather than a page: without it the sheet's top edge has
 *  nothing to be an edge *against*. */
export const SHEET_INSET = SPACING.sm;

export const SheetStage = memo(function SheetStage({
  progress,
  active,
  presented,
  backdrop,
  sheet,
}: {
  /** 0 = index only, 1 = detail fully presented. Written by the open/close
   *  transition and by the pull. One value for the whole screen, because one
   *  detail is open at a time. */
  progress: SharedValue<number>;
  /**
   * Whether *this* column is the one holding it.
   *
   * The shared value is screen-wide, so without this every column's index
   * would settle back at once — invisible on the three that are off screen,
   * except during the horizontal drag that brings one of them in. It lags
   * `presented` on the way out so that closing a detail animates the ground
   * forward instead of snapping it.
   */
  active: boolean;
  /** Whether a detail is mounted at all. The backdrop stops taking touches
   *  the moment one is — the sliver showing above the sheet is a row of the
   *  index, and tapping it would open a second detail behind the first. */
  presented: boolean;
  backdrop: ReactNode;
  sheet: ReactNode;
}) {
  const { colors } = useTheme();

  const backdropStyle = useAnimatedStyle(() => {
    'worklet';
    const p = active ? progress.value : 0;
    return { transform: [{ scale: 1 - (1 - BACKDROP_SCALE) * p }] };
  });

  const scrimStyle = useAnimatedStyle(() => {
    'worklet';
    return { opacity: active ? BACKDROP_DIM * progress.value : 0 };
  });

  return (
    <View style={styles.fill}>
      <Animated.View
        style={[styles.fill, styles.backdrop, backdropStyle]}
        pointerEvents={presented ? 'none' : 'auto'}
      >
        {backdrop}
      </Animated.View>
      {/* Drawn over the index and under the sheet, so the dim lands on the
          column and never on the thing being read. `pointerEvents` off
          throughout: it is ink, not a control — dismissing is the pull, the
          bar and the corner, and a tappable scrim would be a fourth way to do
          one thing. */}
      <Animated.View
        style={[styles.fill, { backgroundColor: colors.bg }, scrimStyle]}
        pointerEvents="none"
      />
      {/* Inset from the top, which is the whole of what makes this read as a
          modal: the sheet's edge needs something to be an edge *against*, and
          what shows above it is the index it came from. */}
      {presented ? <View style={styles.sheet}>{sheet}</View> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  // The corner the index takes on as it settles back, so the two surfaces
  // read as the same kind of object at different depths — which is what a
  // system sheet does to the view it covers.
  backdrop: {
    borderRadius: RADIUS.sheet,
    overflow: 'hidden',
  },
  sheet: {
    position: 'absolute',
    top: SHEET_INSET,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
