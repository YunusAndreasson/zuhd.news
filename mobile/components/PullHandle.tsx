import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { LAYOUT, RADIUS, SPACING } from '../constants/theme';
import { CLOSE_DISTANCE } from '../hooks/usePullToClose';
import { useTheme } from '../hooks/useTheme';

/**
 * The bar that says a detail view can be pulled down.
 *
 * The gesture was there before this was, and it was invisible: nothing on an
 * article or a card suggested that dragging it down would put it away, so the
 * only readers who would ever find it are the ones who tried by accident. An
 * affordance is not polish here — it is the difference between a feature and a
 * secret.
 *
 * Deliberately the same 36×4 bar at `RADIUS.handle` that `SheetHandle` draws
 * on every sheet in the app. A reader who has opened the menu, the sources
 * list or a country profile has already been taught what it means; a second,
 * cleverer glyph would have to teach it again. `mobile/CLAUDE.md`'s rule about
 * one name per thing applies to shapes too.
 *
 * The one thing it does not borrow is the ink. `SheetHandle` draws in
 * `colors.rule` — a hairline grey — and gets away with it because a sheet is a
 * lighter surface with its own edge, its own scrim and a system animation that
 * has just played. This bar has none of that: it sits on `colors.bg`, where
 * `rule` (#2e2e2e on #0F0F11) is very nearly invisible. Measured on a device
 * at the muted tier it could not be seen at all, which for the app's only
 * signal that a detail is dismissible is the same as not drawing it.
 *
 * It also answers the pull rather than just announcing it: the bar brightens
 * and stretches as the drag approaches the distance that commits, so a reader
 * holding halfway can see whether letting go will close. That is the same
 * information the haptic gives, in the channel a reader is already looking at.
 *
 * Not a control. It takes no touches (`pointerEvents="none"`) and is hidden
 * from the accessibility tree: a screen reader gets a labelled button for this
 * in two places — the corner and the bar — and a third, unlabelled, focusable
 * decoration in the middle of the reading order would be noise.
 */
/** Quiet at rest, certain at the commit point. Low enough that it never
 *  competes with the kicker two lines under it; high enough to be seen without
 *  looking for it, which is the whole job. */
const REST_OPACITY = 0.5;

export const PullHandle = memo(function PullHandle({ pull }: { pull: SharedValue<number> }) {
  const { colors } = useTheme();

  const style = useAnimatedStyle(() => {
    'worklet';
    const t = Math.min(1, pull.value / CLOSE_DISTANCE);
    return {
      opacity: REST_OPACITY + (1 - REST_OPACITY) * t,
      transform: [{ scaleX: 1 + 0.4 * t }],
    };
  });

  return (
    <View
      style={styles.container}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[styles.bar, { backgroundColor: colors.textSecondary }, style]} />
    </View>
  );
});

const styles = StyleSheet.create({
  // Above the content and out of its flow, so a card that already measures
  // itself against the page — `CardFrame.onContentLayout`, the measurement
  // that once let four cards truncate in silence — never sees this height.
  container: {
    position: 'absolute',
    top: SPACING.xs,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 5,
  },
  bar: {
    width: LAYOUT.handleWidth,
    height: LAYOUT.handleHeight,
    borderRadius: RADIUS.handle,
  },
});
