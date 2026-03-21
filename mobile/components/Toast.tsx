import { useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONT, SPACING, TYPOGRAPHY } from '../constants/theme';

export interface ToastRef {
  show: (message: string, onPress?: () => void) => void;
}

const TOAST_VISIBLE_MS = 4000;
const TOAST_SLIDE_OFFSET = SPACING.xxl;

export function Toast({ ref }: { ref?: React.Ref<ToastRef> }) {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState('');
  const onPressRef = useRef<(() => void) | undefined>(undefined);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue<number>(TOAST_SLIDE_OFFSET);

  const dismiss = useCallback(() => {
    opacity.value = withTiming(0);
    translateY.value = withTiming(TOAST_SLIDE_OFFSET);
  }, [opacity, translateY]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useImperativeHandle(ref, () => ({
    show: (msg: string, onPress?: () => void) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setMessage(msg);
      onPressRef.current = onPress;
      opacity.value = withTiming(1);
      translateY.value = withSpring(0);
      timerRef.current = setTimeout(dismiss, TOAST_VISIBLE_MS);
    },
  }));

  const handlePress = useCallback(() => {
    onPressRef.current?.();
    dismiss();
  }, [dismiss]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      style={[styles.container, { bottom: insets.bottom + SPACING.xl }, animatedStyle]}
      pointerEvents="auto"
    >
      <Pressable onPress={handlePress} style={({ pressed }) => pressed && { opacity: 0.5 }}>
        <Text style={styles.text}>{message}</Text>
      </Pressable>
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
