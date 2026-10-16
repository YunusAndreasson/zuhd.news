import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ICON, toneColor } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { ICONS, type IconProps } from './icons';

export type { IconProps } from './icons';

/**
 * Android draws the Material Symbol as a glyph of the Material Symbols font,
 * which the expo-font plugin embeds (`app.json`), so it is there at the first
 * frame. `expo-symbols`' own Android view loads the font again in every
 * instance and draws nothing until that resolves; it is also kept out of this
 * file so its copy of the font stays out of the bundle. iOS is `Icon.ios.tsx`.
 * Never draw a symbol directly in app code — go through this.
 */
export const Icon = memo(function Icon({
  name,
  size = 'md',
  tone = 'secondary',
  color,
}: IconProps) {
  const { colors } = useTheme();
  return (
    <View style={styles[size]}>
      <Text
        aria-hidden
        allowFontScaling={false}
        style={[glyphs[size], { color: color ?? toneColor(tone, colors) }]}
      >
        {String.fromCharCode(ICONS[name].glyph)}
      </Text>
    </View>
  );
});

// The square frame matches iOS's.
const styles = StyleSheet.create({
  xs: { width: ICON.xs, height: ICON.xs },
  sm: { width: ICON.sm, height: ICON.sm },
  md: { width: ICON.md, height: ICON.md },
  lg: { width: ICON.lg, height: ICON.lg },
});

// A font-family and size override, the escape hatch an icon needs: it is a
// symbol, not running text, and it keeps its size when the reader's text grows.
const SYMBOLS = 'MaterialSymbols_400Regular';
const glyphs = StyleSheet.create({
  xs: { fontFamily: SYMBOLS, fontSize: ICON.xs, lineHeight: ICON.xs },
  sm: { fontFamily: SYMBOLS, fontSize: ICON.sm, lineHeight: ICON.sm },
  md: { fontFamily: SYMBOLS, fontSize: ICON.md, lineHeight: ICON.md },
  lg: { fontFamily: SYMBOLS, fontSize: ICON.lg, lineHeight: ICON.lg },
});
