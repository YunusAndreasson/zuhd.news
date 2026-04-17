import * as Haptics from 'expo-haptics';
import { memo, useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { ANIMATION, MAX_FONT_SCALE, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { hapticNotification } from '../../lib/haptics';
import { SourceCaption } from './SourceCaption';
import { type BlockVariant, blockContainerStyle } from './shared';

interface QuizBlockProps {
  question: string;
  options: string[];
  correct: number;
  explanation?: string;
  variant?: BlockVariant;
  sourceLabel?: string;
}

/** Active-reading check: one question, plain-row options. A correct tap fires
 *  a Success haptic and tints the chosen row in sage; a wrong tap fires a
 *  Warning haptic, shakes the question, tints the chosen row in rose, and
 *  reveals the correct row in sage. State locks after first answer — retrieval
 *  practice only counts when the attempt is meaningful. */
export const QuizBlock = memo(function QuizBlock({
  question,
  options,
  correct,
  explanation,
  variant = 'article',
  sourceLabel,
}: QuizBlockProps) {
  const { colors, font, typography, textStyles } = useTheme();
  const isContext = variant === 'context';
  const reduceMotion = useReducedMotion();

  const [selected, setSelected] = useState<number | null>(null);
  const answered = selected !== null;

  const shakeX = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const handlePress = useCallback(
    (idx: number) => {
      if (answered) return;
      setSelected(idx);
      if (idx === correct) {
        hapticNotification(Haptics.NotificationFeedbackType.Success);
      } else {
        hapticNotification(Haptics.NotificationFeedbackType.Warning);
        if (!reduceMotion) {
          shakeX.value = withSequence(
            withTiming(-5, { duration: 40 }),
            withTiming(5, { duration: 40 }),
            withTiming(-3, { duration: 40 }),
            withTiming(0, { duration: 40 }),
          );
        }
      }
    },
    [answered, correct, reduceMotion, shakeX],
  );

  // Screen-reader announcement on answer — the visual color change is
  // invisible to assistive tech, so we speak the outcome explicitly.
  useEffect(() => {
    if (selected === null) return;
    const right = selected === correct;
    const correctLabel = options[correct];
    AccessibilityInfo.announceForAccessibility(
      right ? 'Correct.' : `Incorrect. The answer is: ${correctLabel ?? ''}`,
    );
  }, [selected, correct, options]);

  const rowColor = (idx: number): string => {
    if (!answered) return colors.text;
    if (idx === correct) return colors.toneFavorable;
    if (idx === selected) return colors.toneUnfavorable;
    return colors.textSecondary;
  };

  return (
    <View style={blockContainerStyle[isContext ? 'context' : 'article']}>
      <Text
        style={[styles.label, textStyles.smallCapsXs]}
        maxFontSizeMultiplier={MAX_FONT_SCALE.label}
      >
        choose one
      </Text>
      <Animated.View style={shakeStyle}>
        <Text
          selectable
          style={{
            ...font.italic,
            fontSize: typography.sizeBase,
            lineHeight: typography.sizeBase * typography.leadingBody,
            color: colors.textEmphasis,
            marginBottom: SPACING.sm,
          }}
          maxFontSizeMultiplier={MAX_FONT_SCALE.body}
        >
          {question}
        </Text>
      </Animated.View>
      <View
        style={[styles.options, { borderTopColor: colors.rule, borderBottomColor: colors.rule }]}
      >
        {options.map((opt, i) => {
          const isFirst = i === 0;
          const isCorrectRow = answered && i === correct;
          const isWrongSelected = answered && i === selected && i !== correct;
          const circleBorder = !answered
            ? colors.textSecondary
            : isCorrectRow
              ? colors.toneFavorable
              : isWrongSelected
                ? colors.toneUnfavorable
                : colors.rule;
          const circleFill = isCorrectRow
            ? colors.toneFavorable
            : isWrongSelected
              ? colors.toneUnfavorable
              : 'transparent';
          return (
            <Pressable
              key={i}
              onPress={() => handlePress(i)}
              disabled={answered}
              style={({ pressed }) => [
                styles.option,
                !isFirst && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: colors.rule,
                },
                pressed && !answered && { backgroundColor: colors.pillBg, opacity: 0.9 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={opt}
              accessibilityState={{ disabled: answered, selected: selected === i }}
            >
              {/* Leading radio — hollow at rest (universal "choose one"
                  affordance), fills on answer. Replaces a left rule so the
                  tap target reads at a glance without tapping. */}
              <View
                style={[
                  styles.optionCircle,
                  { borderColor: circleBorder, backgroundColor: circleFill },
                ]}
              />
              <Text
                style={{
                  ...font.regular,
                  fontSize: typography.sizeBase,
                  lineHeight: typography.sizeBase * typography.leadingBody,
                  color: rowColor(i),
                  flex: 1,
                }}
                maxFontSizeMultiplier={MAX_FONT_SCALE.body}
              >
                {opt}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {answered && explanation ? (
        <Animated.Text
          entering={FadeIn.duration(ANIMATION.normal)}
          style={{
            ...font.italic,
            fontSize: typography.sizeXs,
            lineHeight: typography.sizeXs * typography.leadingBody,
            color: colors.textSecondary,
            marginTop: SPACING.sm,
          }}
          maxFontSizeMultiplier={MAX_FONT_SCALE.body}
        >
          {explanation}
        </Animated.Text>
      ) : null}
      {sourceLabel ? <SourceCaption label={sourceLabel} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  label: {
    marginBottom: SPACING.xs,
  },
  options: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingRight: SPACING.sm,
  },
  optionCircle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    marginRight: SPACING.md,
  },
});
