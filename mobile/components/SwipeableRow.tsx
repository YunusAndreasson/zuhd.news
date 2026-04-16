import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
import { hapticImpact } from '../lib/haptics';

const ACTION_WIDTH = 72;
const SWIPE_THRESHOLD = -ACTION_WIDTH * 0.6;

interface SwipeableRowProps {
  children: ReactNode;
  onSwipeAction: () => void;
  actionLabel?: string;
}

export function SwipeableRow({
  children,
  onSwipeAction,
  actionLabel = 'remove',
}: SwipeableRowProps) {
  const { colors, font, typography } = useTheme();
  const translateX = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      'worklet';
      translateX.value = Math.min(0, Math.max(-ACTION_WIDTH, e.translationX));
    })
    .onEnd(() => {
      'worklet';
      if (translateX.value < SWIPE_THRESHOLD) {
        translateX.value = withSpring(0, ANIMATION.spring);
        runOnJS(hapticImpact)();
        runOnJS(onSwipeAction)();
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

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.actionContainer,
          { backgroundColor: colors.bg },
          actionOpacity,
        ]}
      >
        <Text
          style={[
            styles.actionLabel,
            {
              ...font.smallCaps,
              fontSize: typography.sizeXs,
              letterSpacing: typography.trackingCaps,
              color: colors.textSecondary,
            },
          ]}
        >
          {actionLabel}
        </Text>
      </Animated.View>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.content, { backgroundColor: colors.sheetBg }, rowStyle]}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  actionContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: SPACING.screenPadding,
  },
  actionLabel: {},
  content: {},
});
