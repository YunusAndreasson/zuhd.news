import { memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet } from 'react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  FadeOutDown,
  FadeOutUp,
  useReducedMotion,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ANIMATION,
  dissolveIn,
  dissolveOut,
  EASING,
  HIT_SLOP,
  PRESSED_STYLE,
  RADIUS,
  SPACING,
} from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { announce } from '../lib/announce';
import { Text } from './primitives';

type ToastPosition = 'top' | 'bottom';

/** What a tap on the toast does, and what a screen reader is told it does:
 *  a toast that acts is a button, and a button says what it does. */
export interface ToastAction {
  onPress: () => void;
  hint: string;
}

export interface ToastRef {
  show: (
    message: string,
    action?: ToastAction,
    position?: ToastPosition,
    durationMs?: number,
  ) => void;
}

// Actionable toasts linger — user needs time to decide to tap. Passive
// acknowledgements ("Saved to bookmarks", "Removed from bookmarks") clear
// quickly to stay out of the way. An actionable one stays as long as the
// reader has asked the system to leave controls up (Android's "Time to take
// action"; iOS answers with the default).
const TOAST_VISIBLE_ACTIONABLE_MS = 4000;
const TOAST_VISIBLE_PASSIVE_MS = 2000;
const TOAST_SLIDE_OFFSET = SPACING.xxl;

// In from the edge it belongs to, and back out to it. Built once, out here,
// so every toast is handed the same builders. Under Reduce Motion the slide
// gives way to a dissolve in place (`dissolveIn`), not to a cut.
const SLIDE_IN: Record<ToastPosition, ReturnType<typeof FadeInDown.duration>> = {
  top: FadeInDown.duration(ANIMATION.normal)
    .easing(EASING.out)
    .withInitialValues({ translateY: -TOAST_SLIDE_OFFSET }),
  bottom: FadeInUp.duration(ANIMATION.normal)
    .easing(EASING.out)
    .withInitialValues({ translateY: TOAST_SLIDE_OFFSET }),
};
const SLIDE_OUT: Record<ToastPosition, ReturnType<typeof FadeOutUp.duration>> = {
  top: FadeOutUp.duration(ANIMATION.normal).easing(EASING.out),
  bottom: FadeOutDown.duration(ANIMATION.normal).easing(EASING.out),
};
const DISSOLVE_IN = dissolveIn();
const DISSOLVE_OUT = dissolveOut();

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
  const reduceMotion = useReducedMotion();
  const [message, setMessage] = useState('');
  const [pos, setPos] = useState<ToastPosition>('bottom');
  const [visible, setVisible] = useState(false);
  const [hint, setHint] = useState<string | undefined>(undefined);
  const onPressRef = useRef<(() => void) | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const actionableMsRef = useRef(TOAST_VISIBLE_ACTIONABLE_MS);

  useEffect(() => {
    let live = true;
    AccessibilityInfo.getRecommendedTimeoutMillis(TOAST_VISIBLE_ACTIONABLE_MS)
      .then((ms) => {
        if (live) actionableMsRef.current = Math.max(ms, TOAST_VISIBLE_ACTIONABLE_MS);
      })
      .catch(() => {});
    return () => {
      live = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
  }, []);

  useImperativeHandle(ref, () => ({
    show: (
      msg: string,
      action?: ToastAction,
      position: ToastPosition = 'bottom',
      durationMs?: number,
    ) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setMessage(msg);
      setPos(position);
      setHint(action?.hint);
      setVisible(true);
      onPressRef.current = action?.onPress;
      // News the reader did not ask for: after whatever VoiceOver is saying.
      announce(msg, { liveRegion: true, queue: true });

      const visibleMs = durationMs ?? (action ? actionableMsRef.current : TOAST_VISIBLE_PASSIVE_MS);
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
      entering={reduceMotion ? DISSOLVE_IN : SLIDE_IN[pos]}
      exiting={reduceMotion ? DISSOLVE_OUT : SLIDE_OUT[pos]}
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
        accessibilityRole={hint ? 'button' : 'alert'}
        accessibilityLabel={message}
        accessibilityHint={hint}
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
