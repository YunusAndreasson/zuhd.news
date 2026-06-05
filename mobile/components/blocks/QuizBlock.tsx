import * as Haptics from 'expo-haptics';
import { memo, useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { ANIMATION, OPACITY, SPACING, type TextTone } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { hapticNotification } from '../../lib/haptics';
import { Text } from '../primitives';
import { SourceCaption } from './SourceCaption';
import { type BlockVariant, blockContainerStyle, blockSharedStyles } from './shared';

interface QuizBlockProps {
  question: string;
  options: string[];
  correct: number;
  explanation?: string;
  variant?: BlockVariant;
  sourceLabel?: string;
}

/** Active-reading check: one question, plain-row options. */
export const QuizBlock = memo(function QuizBlock({
  question,
  options,
  correct,
  explanation,
  variant = 'article',
  sourceLabel,
}: QuizBlockProps) {
  const { colors } = useTheme();
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

  useEffect(() => {
    if (selected === null) return;
    const right = selected === correct;
    const correctLabel = options[correct];
    AccessibilityInfo.announceForAccessibility(
      right ? 'Correct.' : `Incorrect. The answer is: ${correctLabel ?? ''}`,
    );
  }, [selected, correct, options]);

  // Tone signal lives in the answer-circle's fill (sage/rose), not the option
  // text — the text color stays in the high-contrast palette so option labels
  // remain readable. Previously the correct/wrong row text was recolored to
  // toneFavorable/Unfavorable, which fail WCAG AA at body size on sheet bg.
  const rowTone = (idx: number): TextTone => {
    if (!answered) return 'default';
    if (idx === correct || idx === selected) return 'emphasis';
    return 'secondary';
  };

  return (
    <View style={blockContainerStyle[variant]}>
      <Text variant="labelSm" style={blockSharedStyles.label}>
        choose one
      </Text>
      <Animated.View style={shakeStyle}>
        <Text selectable variant="bodyItalic" tone="emphasis" style={styles.question}>
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
                pressed &&
                  !answered && { backgroundColor: colors.pillBg, opacity: OPACITY.dominant },
              ]}
              accessibilityRole="button"
              accessibilityLabel={opt}
              accessibilityState={{ disabled: answered, selected: selected === i }}
            >
              <View
                style={[
                  styles.optionCircle,
                  { borderColor: circleBorder, backgroundColor: circleFill },
                ]}
              />
              <Text variant="body" tone={rowTone(i)} style={styles.optionText}>
                {opt}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {answered && explanation ? (
        <Animated.View entering={FadeIn.duration(ANIMATION.normal)}>
          {/* Explanation is the payoff of the quiz — readable at caption
              size (13pt) in default text color, not the earlier italic
              secondary-tinted 11pt which stacked three dimming factors. */}
          <Text variant="caption" tone="default" style={styles.explanation}>
            {explanation}
          </Text>
        </Animated.View>
      ) : null}
      {sourceLabel ? <SourceCaption label={sourceLabel} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  question: {
    marginBottom: SPACING.sm,
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
  optionText: {
    flex: 1,
  },
  explanation: {
    marginTop: SPACING.sm,
  },
});
