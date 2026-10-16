import { SymbolView } from 'expo-symbols';
import { memo } from 'react';
import { StyleSheet } from 'react-native';
import { ICON, toneColor } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { ICONS, type IconProps } from './icons';

export type { IconProps } from './icons';

/**
 * iOS draws the SF Symbol (system-native, optically tuned at every size,
 * automatic tinting). Android is `Icon.tsx`. Never use `<SymbolView>` directly
 * in app code — go through this.
 */
export const Icon = memo(function Icon({
  name,
  size = 'md',
  tone = 'secondary',
  color,
}: IconProps) {
  const { colors } = useTheme();
  return (
    <SymbolView
      name={ICONS[name].ios}
      size={ICON[size]}
      tintColor={color ?? toneColor(tone, colors)}
      style={styles[size]}
    />
  );
});

// SF Symbols take their optical size from `size`; the square frame keeps the
// layout the same as Android's.
const styles = StyleSheet.create({
  xs: { width: ICON.xs, height: ICON.xs },
  sm: { width: ICON.sm, height: ICON.sm },
  md: { width: ICON.md, height: ICON.md },
  lg: { width: ICON.lg, height: ICON.lg },
});
