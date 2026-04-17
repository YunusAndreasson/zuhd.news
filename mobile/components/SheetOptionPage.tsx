import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { ICON, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { HapticPressable } from './HapticPressable';

interface OptionPageProps<T extends string> {
  /** Optional helper text shown above the options. */
  hint?: string;
  options: { value: T; label: string }[];
  selected: T;
  onSelect: (v: T) => void;
}

/** Vertical selection list. Active row is underlined and shows a check. */
export function SheetOptionPage<T extends string>({
  hint,
  options,
  selected,
  onSelect,
}: OptionPageProps<T>) {
  const { colors, font, typography } = useTheme();
  return (
    <>
      {hint && (
        <Text
          style={{
            ...font.regular,
            fontSize: typography.sizeSm,
            lineHeight: typography.sizeSm * typography.leadingBody,
            color: colors.textSecondary,
            marginBottom: SPACING.md,
          }}
        >
          {hint}
        </Text>
      )}
      <View accessibilityRole="radiogroup">
        {options.map((opt) => {
          const active = opt.value === selected;
          return (
            <HapticPressable
              key={opt.value}
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
                  fontSize: typography.sizeBase,
                  color: active ? colors.textEmphasis : colors.text,
                }}
              >
                {opt.label}
              </Text>
              {active && <Ionicons name="checkmark" size={ICON.md} color={colors.text} />}
            </HapticPressable>
          );
        })}
      </View>
    </>
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
