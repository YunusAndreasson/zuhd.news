import { useCallback } from 'react';
import { Text as RNText, StyleSheet, View } from 'react-native';
import { FLAG, RADIUS, SPACING } from '../constants/theme';
import { displayCountryName } from '../lib/place-names';
import { Pressable, Text } from './primitives';

interface FlagChipProps {
  name: string;
  flag: string;
  borderColor: string;
  /** When provided, the chip becomes a button that opens that country's sheet. */
  onPress?: (countryName: string) => void;
}

/** Bordered flag-glyph + country-name chip. Shared by ConflictSheet and
 *  DisasterSheet so the "affected country" affordance reads identically in
 *  both. Static when `onPress` is omitted, a button otherwise. */
export function FlagChip({ name, flag, borderColor, onPress }: FlagChipProps) {
  const display = displayCountryName(name) ?? name;
  const handlePress = useCallback(() => onPress?.(name), [name, onPress]);
  if (!onPress) {
    return (
      <View style={[styles.flagChip, { borderColor }]}>
        <RNText allowFontScaling={false} style={styles.flagGlyph}>
          {flag}
        </RNText>
        <Text variant="labelSm" numberOfLines={1}>
          {display}
        </Text>
      </View>
    );
  }
  return (
    <Pressable
      haptic="tick"
      onPress={handlePress}
      style={[styles.flagChip, { borderColor }]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${display}`}
    >
      <RNText allowFontScaling={false} style={styles.flagGlyph}>
        {flag}
      </RNText>
      <Text variant="labelSm" numberOfLines={1}>
        {display}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xxs,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.floating,
    borderWidth: StyleSheet.hairlineWidth,
  },
  flagGlyph: {
    fontSize: FLAG.row,
    lineHeight: FLAG.row * 1.125,
  },
});
