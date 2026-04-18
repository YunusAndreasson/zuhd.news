import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ANIMATION, SPACING, staggerDelay } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { Icon, Pressable, Text } from './primitives';

interface OptionPageProps<T extends string> {
  options: readonly { value: T; label: string }[];
  selected: T;
  onSelect: (v: T) => void;
  /** Absolute font size for each option's label — used for typographic previews (e.g. size picker). */
  labelFontSize?: (v: T) => number;
}

/** Vertical selection list. Active row is underlined and shows a check. */
export function SheetOptionPage<T extends string>({
  options,
  selected,
  onSelect,
  labelFontSize,
}: OptionPageProps<T>) {
  const { colors, typography } = useTheme();
  return (
    <View accessibilityRole="radiogroup">
      {options.map((opt, i) => {
        const active = opt.value === selected;
        // When a labelFontSize is provided (size picker), the option preview
        // renders at its actual target font — scaling from sizeBase (17pt).
        const optScale = labelFontSize ? labelFontSize(opt.value) / typography.sizeBase : 1;
        return (
          <Animated.View
            key={opt.value}
            entering={FadeInDown.duration(ANIMATION.normal).delay(staggerDelay(i))}
          >
            <Pressable
              onPress={() => {
                if (!active) onSelect(opt.value);
              }}
              haptic="tick"
              style={[styles.row, { borderBottomColor: colors.rule }]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={opt.label}
            >
              <Text variant="bodyEmphasis" tone={active ? 'emphasis' : 'default'} scale={optScale}>
                {opt.label}
              </Text>
              {active && <Icon name="checkmark" tone="default" />}
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
