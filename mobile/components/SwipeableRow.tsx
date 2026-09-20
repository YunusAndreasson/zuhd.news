import { memo, type ReactNode, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  GestureDetector,
  type PanGestureConfig,
  usePanGesture,
} from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { ANIMATION, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { hapticTick } from '../lib/haptics';
import { Text } from './primitives';

const ACTION_WIDTH = 72;
const SWIPE_THRESHOLD = -ACTION_WIDTH * 0.6;
const RATCHET_START = -ACTION_WIDTH * 0.2;

interface SwipeableRowProps {
  children: ReactNode;
  onSwipeAction: () => void;
  actionLabel?: string;
}

export const SwipeableRow = memo(function SwipeableRow({
  children,
  onSwipeAction,
  actionLabel = 'remove',
}: SwipeableRowProps) {
  const { colors } = useTheme();
  const translateX = useSharedValue(0);
  const ratchetStartFired = useSharedValue(false);
  const ratchetThresholdFired = useSharedValue(false);

  // No haptic of its own: the action is a committed change of state, and
  // its owner gives the notification for that (a second buzz here read as a
  // double knock).
  const fireAction = useCallback(() => {
    onSwipeAction();
  }, [onSwipeAction]);

  const panConfig = useMemo<PanGestureConfig>(
    () => ({
      // Leftward only: a single negative value sets the start bound alone.
      activeOffsetX: -12,
      failOffsetY: [-10, 10],
      onActivate: () => {
        'worklet';
        ratchetStartFired.value = false;
        ratchetThresholdFired.value = false;
      },
      onUpdate: (e) => {
        'worklet';
        const next = Math.min(0, Math.max(-ACTION_WIDTH, e.translationX));
        translateX.value = next;
        if (!ratchetStartFired.value && next <= RATCHET_START) {
          ratchetStartFired.value = true;
          scheduleOnRN(hapticTick);
        }
        if (!ratchetThresholdFired.value && next <= SWIPE_THRESHOLD) {
          ratchetThresholdFired.value = true;
          scheduleOnRN(hapticTick);
        }
        if (ratchetStartFired.value && next > RATCHET_START) {
          ratchetStartFired.value = false;
        }
        if (ratchetThresholdFired.value && next > SWIPE_THRESHOLD) {
          ratchetThresholdFired.value = false;
        }
      },
      onDeactivate: (e) => {
        'worklet';
        // Latch the released offset before starting the spring: once
        // `withSpring` is assigned, reading `.value` yields the in-flight
        // animated value, not where the finger let go.
        const released = translateX.value;
        translateX.value = withSpring(0, ANIMATION.spring);
        // A cancelled swipe (a sheet dragged away, a system gesture) also
        // deactivates, and must only spring back — it deleted the row once.
        if (!e.canceled && released < SWIPE_THRESHOLD) {
          scheduleOnRN(fireAction);
        }
      },
    }),
    [translateX, ratchetStartFired, ratchetThresholdFired, fireAction],
  );
  const panGesture = usePanGesture(panConfig);

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const actionOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [-ACTION_WIDTH, -ACTION_WIDTH * 0.3, 0],
      [1, 0.6, 0],
      Extrapolation.CLAMP,
    ),
  }));

  // Elevation idiom: the row sits at `sheetBg` (matching its sheet
  // container, so it appears flush, no card outline) and the action
  // slot beneath uses `bg` to read as a deeper layer revealed by the
  // swipe — a subtle Z-axis cue without a visible shadow. Only
  // consumed inside sheets (SheetBookmarksPage), so the bg/sheetBg
  // pairing is consistent with the surrounding chrome.
  return (
    <View style={styles.container}>
      <Animated.View
        style={[styles.actionContainer, { backgroundColor: colors.bg }, actionOpacity]}
      >
        <Text variant="labelXs">{actionLabel}</Text>
      </Animated.View>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[{ backgroundColor: colors.sheetBg }, rowStyle]}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  actionContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: SPACING.screenPadding,
  },
});
