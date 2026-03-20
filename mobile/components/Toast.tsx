import { forwardRef, useImperativeHandle, useState, useCallback } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONT, TYPOGRAPHY, SPACING } from '../constants/theme';

export interface ToastRef {
  show: (message: string) => void;
}

const TOAST_VISIBLE_MS = 2500;
const TOAST_SLIDE_OFFSET = -SPACING.xxl;

export const Toast = forwardRef<ToastRef>((_, ref) => {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState('');
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(TOAST_SLIDE_OFFSET);

  const dismiss = useCallback(() => {
    opacity.value = withTiming(0);
    translateY.value = withTiming(TOAST_SLIDE_OFFSET);
  }, [opacity, translateY]);

  useImperativeHandle(ref, () => ({
    show: (msg: string) => {
      setMessage(msg);
      opacity.value = withTiming(1);
      translateY.value = withSpring(0);
      setTimeout(dismiss, TOAST_VISIBLE_MS);
    },
  }));

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      style={[styles.container, { top: insets.top + SPACING.sm }, animatedStyle]}
      pointerEvents="none"
    >
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: SPACING.xl,
    right: SPACING.xl,
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.rule,
    borderRadius: SPACING.sm,
    zIndex: 100,
  },
  text: {
    fontFamily: FONT.semiBold,
    fontSize: TYPOGRAPHY.sizeSm,
    color: COLORS.text,
  },
});
