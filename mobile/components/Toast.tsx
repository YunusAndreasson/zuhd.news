import { memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { FadeInDown, FadeInUp, FadeOutDown, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ANIMATION, EASING, HIT_SLOP, PRESSED_STYLE, RADIUS, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { announce } from '../lib/announce';
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

// Reanimated drops both to their end state under Reduce Motion by itself.
function getEntering(pos: ToastPosition) {
  const base = pos === 'top' ? FadeInDown : FadeInUp;
  return base
    .duration(ANIMATION.normal)
    .easing(EASING.out)
    .withInitialValues({ translateY: pos === 'top' ? -TOAST_SLIDE_OFFSET : TOAST_SLIDE_OFFSET });
}

function getExiting(pos: ToastPosition) {
  const base = pos === 'top' ? FadeOutUp : FadeOutDown;
  return base.duration(ANIMATION.normal).easing(EASING.in);
}

export const Toast = memo(function Toast({
  ref,
  topOffset,
  bottomOffset,
}: {
  ref?: React.Ref<ToastRef>;
  /** Where a top toast may start, measured from the top of the window.
   *  Defaults to the safe area. A screen with chrome along the top passes its
   *  height, so a toast cannot land on the controls it is reporting on. */
  topOffset?: number;
  /** Where a bottom toast may end, measured up from the bottom of the window.
   *  Defaults to the safe area; the map passes its dock, so "Saved" does not
   *  land on the buttons a thumb is about to press. */
  bottomOffset?: number;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState('');
  const [pos, setPos] = useState<ToastPosition>('bottom');
  const [visible, setVisible] = useState(false);
  const onPressRef = useRef<(() => void) | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
      announce(msg, { liveRegion: true });

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
    pos === 'top'
      ? { top: (topOffset ?? insets.top) + SPACING.xl }
      : { bottom: (bottomOffset ?? insets.bottom) + SPACING.xl };

  if (!visible) return null;

  return (
    <Animated.View
      // Remount the view when position flips so the entering animation
      // runs from the correct off-screen origin (top vs. bottom).
      key={pos}
      entering={getEntering(pos)}
      exiting={getExiting(pos)}
      style={[styles.container, positionStyle]}
      // `box-none`: the full-width container is only a positioning frame — it
      // must not intercept touches in its horizontal band (it overlaps the
      // bottom action-pill row when a bottom toast is visible). Only the inner
      // pill Pressable should receive taps.
      pointerEvents="box-none"
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
