import { useCallback, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONT, SPACING, TYPOGRAPHY } from '../constants/theme';

export interface ToastRef {
  show: (message: string) => void;
}

const TOAST_VISIBLE_MS = 2500;
const TOAST_SLIDE_OFFSET = -SPACING.xxl;

export function Toast({ ref }: { ref?: React.Ref<ToastRef> }) {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState('');
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(TOAST_SLIDE_OFFSET);

  const dismiss = useCallback(() => {
    opacity.value = withTiming(0);
    translateY.value = withTiming(TOAST_SLIDE_OFFSET);
  }, [opacity, translateY]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useImperativeHandle(ref, () => ({
    show: (msg: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setMessage(msg);
      opacity.value = withTiming(1);
      translateY.value = withSpring(0);
      timerRef.current = setTimeout(dismiss, TOAST_VISIBLE_MS);
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
}

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
