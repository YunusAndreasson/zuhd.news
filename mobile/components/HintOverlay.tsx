import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInUp,
  FadeOut,
  FadeOutDown,
  useReducedMotion,
} from 'react-native-reanimated';
import { ANIMATION, EASING, PRESSED_STYLE, RADIUS, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { hapticTick } from '../lib/haptics';
import type { HintId } from '../lib/onboarding-store';
import { Text } from './primitives';

// One whispered line per undiscoverable interaction. No icon, no arrow, no
// dome gold — a hint is chrome whispering, not the brand accent speaking.
const HINT_COPY: Record<HintId, string> = {
  swipe: 'swipe up for the next story',
  sources: 'tap the story for its sources',
  bookmark: 'press and hold to save a story',
  globe: 'tap a country on the globe',
};

const HINT_SLIDE_OFFSET = SPACING.xxl;

interface HintOverlayProps {
  hint: HintId | null;
  onDismiss: () => void;
  bottomInset: number;
}

/** The single onboarding hint pill. Rendered once in HomeScreen — never
 *  inside recycled article cells. Tap anywhere on the pill dismisses it
 *  forever; performing the taught action retires it through the store. */
export const HintOverlay = memo(function HintOverlay({
  hint,
  onDismiss,
  bottomInset,
}: HintOverlayProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();

  const handlePress = useCallback(() => {
    hapticTick();
    onDismiss();
  }, [onDismiss]);

  if (!hint) return null;

  const entering = reduceMotion
    ? FadeIn.duration(0)
    : FadeInUp.duration(ANIMATION.normal)
        .easing(EASING.out)
        .withInitialValues({ transform: [{ translateY: HINT_SLIDE_OFFSET }] });
  const exiting = reduceMotion
    ? FadeOut.duration(0)
    : FadeOutDown.duration(ANIMATION.normal).easing(EASING.in);

  return (
    <View
      // Clear of the BottomActionBar pills below (their band ends at
      // max(inset, sm) + pill height) and of bottom toasts (inset + xl).
      style={[
        styles.container,
        { bottom: Math.max(bottomInset, SPACING.sm) + SPACING.xxl + SPACING.md },
      ]}
      pointerEvents="box-none"
      accessibilityLiveRegion="polite"
    >
      {/* Remount per hint id so the entering animation runs for each new tip. */}
      <Animated.View key={hint} entering={entering} exiting={exiting}>
        <Pressable
          onPress={handlePress}
          // Inverted surface — the one chrome element that must be seen to do
          // its job. Monochrome flip (text-on-bg becomes bg-on-text), so
          // "color carries meaning" still holds; maximum contrast in both
          // themes with no hue.
          style={({ pressed }) => [
            styles.pill,
            { backgroundColor: colors.text },
            pressed && PRESSED_STYLE,
          ]}
          accessibilityRole="button"
          accessibilityLabel={HINT_COPY[hint]}
          accessibilityHint="Dismisses this tip"
        >
          <Text variant="labelSm" tone="inverse" style={styles.copy}>
            {HINT_COPY[hint]}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 50, // above article content, below Toast (100) and sheets (1000)
  },
  pill: {
    maxWidth: '80%',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.floating,
  },
  copy: {
    textAlign: 'center',
  },
});
