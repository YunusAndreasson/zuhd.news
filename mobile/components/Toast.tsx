import { memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PRESSED_STYLE, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';

type ToastPosition = 'top' | 'bottom';

export interface ToastRef {
  show: (message: string, onPress?: () => void, position?: ToastPosition) => void;
}

const TOAST_VISIBLE_MS = 4000;
const TOAST_SLIDE_OFFSET = SPACING.xxl;
const EASE_IN = { duration: 200, easing: Easing.in(Easing.ease) };
const EASE_OUT = { duration: 250, easing: Easing.out(Easing.ease) };

export const Toast = memo(function Toast({ ref }: { ref?: React.Ref<ToastRef> }) {
  const { colors, font, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState('');
  const [pos, setPos] = useState<ToastPosition>('bottom');
  const [visible, setVisible] = useState(false);
  const onPressRef = useRef<(() => void) | undefined>(undefined);
  const posRef = useRef<ToastPosition>('bottom');
  const opacity = useSharedValue(0);
  const translateY = useSharedValue<number>(TOAST_SLIDE_OFFSET);

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const dismiss = useCallback(() => {
    const offset = posRef.current === 'top' ? -TOAST_SLIDE_OFFSET : TOAST_SLIDE_OFFSET;
    opacity.value = withTiming(0, EASE_IN, (finished) => {
      if (finished) runOnJS(setVisible)(false);
    });
    translateY.value = withTiming(offset, EASE_IN);
  }, [opacity, translateY]);

  useImperativeHandle(ref, () => ({
    show: (msg: string, onPress?: () => void, position: ToastPosition = 'bottom') => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setMessage(msg);
      setPos(position);
      posRef.current = position;
      setVisible(true);
      onPressRef.current = onPress;

      translateY.value = position === 'top' ? -TOAST_SLIDE_OFFSET : TOAST_SLIDE_OFFSET;
      opacity.value = withTiming(1, EASE_OUT);
      translateY.value = withTiming(0, EASE_OUT);

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

  const positionStyle =
    pos === 'top' ? { top: insets.top + SPACING.xl } : { bottom: insets.bottom + SPACING.xl };

  return (
    <Animated.View
      style={[styles.container, positionStyle, animatedStyle]}
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityLiveRegion="polite"
    >
      <Pressable
        onPress={handlePress}
        hitSlop={12}
        style={({ pressed }) => [
          styles.pill,
          { backgroundColor: colors.toastBg },
          pressed && PRESSED_STYLE,
        ]}
        accessibilityRole="alert"
        accessibilityLabel={message}
      >
        <Text style={[styles.text, { ...font.semiBold, fontSize: typography.sizeSm, color: colors.text }]}>{message}</Text>
      </Pressable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignSelf: 'center',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  pill: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: 14,
  },
  text: {},
});
