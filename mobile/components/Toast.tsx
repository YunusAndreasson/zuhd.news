import { memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  FadeOutDown,
  FadeOutUp,
  useReducedMotion,
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
// acknowledgements ("Saved to bookmarks", "Removed from bookmarks") clear
// quickly to stay out of the way.
const TOAST_VISIBLE_ACTIONABLE_MS = 4000;
const TOAST_VISIBLE_PASSIVE_MS = 2000;
const TOAST_SLIDE_OFFSET = SPACING.xxl;

function getEntering(pos: ToastPosition, reduceMotion: boolean) {
  if (reduceMotion) return FadeIn.duration(0);
  const base = pos === 'top' ? FadeInDown : FadeInUp;
  return base
    .duration(ANIMATION.normal)
    .easing(EASING.out)
    .withInitialValues({
      transform: [{ translateY: pos === 'top' ? -TOAST_SLIDE_OFFSET : TOAST_SLIDE_OFFSET }],
    });
}

function getExiting(pos: ToastPosition, reduceMotion: boolean) {
  if (reduceMotion) return FadeOut.duration(0);
  const base = pos === 'top' ? FadeOutUp : FadeOutDown;
  return base.duration(ANIMATION.normal).easing(EASING.in);
}

export const Toast = memo(function Toast({ ref }: { ref?: React.Ref<ToastRef> }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState('');
  const [pos, setPos] = useState<ToastPosition>('bottom');
  const [visible, setVisible] = useState(false);
  const onPressRef = useRef<(() => void) | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
  }, []);

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
      setVisible(true);
      onPressRef.current = onPress;

      const visibleMs =
        durationMs ?? (onPress ? TOAST_VISIBLE_ACTIONABLE_MS : TOAST_VISIBLE_PASSIVE_MS);
      timerRef.current = setTimeout(() => setVisible(false), visibleMs);
    },
  }));

  const handlePress = useCallback(() => {
    onPressRef.current?.();
    dismiss();
  }, [dismiss]);

  const positionStyle =
    pos === 'top' ? { top: insets.top + SPACING.xl } : { bottom: insets.bottom + SPACING.xl };

  if (!visible) return null;

  return (
    <Animated.View
      // Remount the view when position flips so the entering animation
      // runs from the correct off-screen origin (top vs. bottom).
      key={pos}
      entering={getEntering(pos, reduceMotion)}
      exiting={getExiting(pos, reduceMotion)}
      style={[styles.container, positionStyle]}
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
