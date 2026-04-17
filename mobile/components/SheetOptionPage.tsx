import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ANIMATION, ICON, SPACING, staggerDelay } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { HapticPressable } from './HapticPressable';

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
  const { colors, font, typography } = useTheme();
  return (
    <View accessibilityRole="radiogroup">
      {options.map((opt, i) => {
        const active = opt.value === selected;
        return (
          <Animated.View
            key={opt.value}
            entering={FadeInDown.duration(ANIMATION.normal).delay(staggerDelay(i))}
          >
            <HapticPressable
              onPress={() => {
                if (!active) onSelect(opt.value);
              }}
              haptic="tick"
              style={[styles.row, { borderBottomColor: colors.rule }]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={opt.label}
            >
              <Text
                style={{
                  ...font.semiBold,
                  fontSize: labelFontSize?.(opt.value) ?? typography.sizeBase,
                  color: active ? colors.textEmphasis : colors.text,
                }}
              >
                {opt.label}
              </Text>
              {active && <Ionicons name="checkmark" size={ICON.md} color={colors.text} />}
            </HapticPressable>
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
