import { memo, type ReactNode, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { ANIMATION, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { hapticImpact, hapticTick } from '../lib/haptics';
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

  const fireAction = useCallback(() => {
    hapticImpact();
    onSwipeAction();
  }, [onSwipeAction]);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-12, 999])
    .failOffsetY([-10, 10])
    .onStart(() => {
      'worklet';
      ratchetStartFired.value = false;
      ratchetThresholdFired.value = false;
    })
    .onUpdate((e) => {
      'worklet';
      const next = Math.min(0, Math.max(-ACTION_WIDTH, e.translationX));
      translateX.value = next;
      if (!ratchetStartFired.value && next <= RATCHET_START) {
        ratchetStartFired.value = true;
        runOnJS(hapticTick)();
      }
      if (!ratchetThresholdFired.value && next <= SWIPE_THRESHOLD) {
        ratchetThresholdFired.value = true;
        runOnJS(hapticTick)();
      }
      if (ratchetStartFired.value && next > RATCHET_START) {
        ratchetStartFired.value = false;
      }
      if (ratchetThresholdFired.value && next > SWIPE_THRESHOLD) {
        ratchetThresholdFired.value = false;
      }
    })
    .onEnd(() => {
      'worklet';
      if (translateX.value < SWIPE_THRESHOLD) {
        translateX.value = withSpring(0, ANIMATION.spring);
        runOnJS(fireAction)();
      } else {
        translateX.value = withSpring(0, ANIMATION.spring);
      }
    });

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
