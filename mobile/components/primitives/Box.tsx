import { memo, type ReactNode } from 'react';
import { StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { type ColorPalette, RADIUS, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';

type SpacingToken = keyof typeof SPACING;
type RadiusToken = keyof typeof RADIUS;
type ColorToken = keyof ColorPalette;
type RuleSide = 'top' | 'bottom' | 'left' | 'right';

export interface BoxProps extends Omit<ViewProps, 'style'> {
  background?: ColorToken;
  radius?: RadiusToken;
  padding?: SpacingToken;
  paddingX?: SpacingToken;
  paddingY?: SpacingToken;
  /** Draw hairline rules on the listed sides using `colors.rule`. */
  rule?: RuleSide | RuleSide[];
  fill?: boolean;
  style?: ViewProps['style'];
  children?: ReactNode;
}

const RULE_KEY: Record<RuleSide, keyof ViewStyle> = {
  top: 'borderTopWidth',
  bottom: 'borderBottomWidth',
  left: 'borderLeftWidth',
  right: 'borderRightWidth',
};

const RULE_COLOR_KEY: Record<RuleSide, keyof ViewStyle> = {
  top: 'borderTopColor',
  bottom: 'borderBottomColor',
  left: 'borderLeftColor',
  right: 'borderRightColor',
};

export const Box = memo(function Box({
  background,
  radius,
  padding,
  paddingX,
  paddingY,
  rule,
  fill,
  style,
  children,
  ...rest
}: BoxProps) {
  const { colors } = useTheme();
  const computed: ViewStyle = {
    ...(background !== undefined && { backgroundColor: colors[background] }),
    ...(radius !== undefined && { borderRadius: RADIUS[radius] }),
    ...(padding !== undefined && { padding: SPACING[padding] }),
    ...(paddingX !== undefined && { paddingHorizontal: SPACING[paddingX] }),
    ...(paddingY !== undefined && { paddingVertical: SPACING[paddingY] }),
    ...(fill && { flex: 1 }),
  };
  if (rule) {
    const sides = Array.isArray(rule) ? rule : [rule];
    for (const side of sides) {
      (computed as Record<string, unknown>)[RULE_KEY[side]] = StyleSheet.hairlineWidth;
      (computed as Record<string, unknown>)[RULE_COLOR_KEY[side]] = colors.rule;
    }
  }
  return (
    <View {...rest} style={[computed, style]}>
      {children}
    </View>
  );
});
