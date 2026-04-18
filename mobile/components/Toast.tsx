import { memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ANIMATION, EASING, HIT_SLOP, PRESSED_STYLE, RADIUS, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { Text } from './primitives';

type ToastPosition = 'top' | 'bottom';

export interface ToastRef {
  show: (
    message: string,
    onPress?: () => void,
    position?: ToastPosition,
    durationMs?: number,
  ) => void;
}

// Actionable toasts linger — user needs time to decide to tap. Passive
// acknowledgements ("Saved", "Removed") clear quickly to stay out of the way.
// Callers that need a custom dwell (e.g. educational copy that takes longer
// to read) pass `durationMs` explicitly.
const TOAST_VISIBLE_ACTIONABLE_MS = 4000;
const TOAST_VISIBLE_PASSIVE_MS = 2000;
const TOAST_SLIDE_OFFSET = SPACING.xxl;
const EASE_IN = { duration: ANIMATION.normal, easing: EASING.in };
const EASE_OUT = { duration: ANIMATION.normal, easing: EASING.out };

const offsetFor = (p: ToastPosition) => (p === 'top' ? -TOAST_SLIDE_OFFSET : TOAST_SLIDE_OFFSET);

export const Toast = memo(function Toast({ ref }: { ref?: React.Ref<ToastRef> }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState('');
  const [pos, setPos] = useState<ToastPosition>('bottom');
  const [visible, setVisible] = useState(false);
  const onPressRef = useRef<(() => void) | undefined>(undefined);
  const posRef = useRef<ToastPosition>('bottom');
  const opacity = useSharedValue(0);
  const translateY = useSharedValue<number>(TOAST_SLIDE_OFFSET);

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const dismiss = useCallback(() => {
    const offset = offsetFor(posRef.current);
    if (reduceMotion) {
      opacity.value = 0;
      translateY.value = offset;
      setVisible(false);
      return;
    }
    opacity.value = withTiming(0, EASE_IN, (finished) => {
      if (finished) runOnJS(setVisible)(false);
    });
    translateY.value = withTiming(offset, EASE_IN);
  }, [opacity, translateY, reduceMotion]);

  useImperativeHandle(ref, () => ({
    show: (
      msg: string,
      onPress?: () => void,
      position: ToastPosition = 'bottom',
      durationMs?: number,
    ) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setMessage(msg);
      setPos(position);
      posRef.current = position;
      setVisible(true);
      onPressRef.current = onPress;

      const start = offsetFor(position);
      if (reduceMotion) {
        translateY.value = 0;
        opacity.value = 1;
      } else {
        translateY.value = start;
        opacity.value = withTiming(1, EASE_OUT);
        translateY.value = withTiming(0, EASE_OUT);
      }

      const visibleMs =
        durationMs ?? (onPress ? TOAST_VISIBLE_ACTIONABLE_MS : TOAST_VISIBLE_PASSIVE_MS);
      timerRef.current = setTimeout(dismiss, visibleMs);
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
        hitSlop={HIT_SLOP}
        style={({ pressed }) => [
          styles.pill,
          { backgroundColor: colors.toastBg },
          pressed && PRESSED_STYLE,
        ]}
        accessibilityRole="alert"
        accessibilityLabel={message}
      >
        <Text variant="captionEmphasis">{message}</Text>
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
    borderRadius: RADIUS.floating,
  },
});
