import { memo, useCallback } from 'react';
import { Text as RNText, StyleSheet, View } from 'react-native';
import { FLAG, HIT_SLOP, RADIUS, SPACING } from '../constants/theme';
import { displayCountryName } from '../lib/place-names';
import { Pressable, Text } from './primitives';

/**
 * A flag at one of the `FLAG` sizes. A flag is a pictogram, not type, so it
 * keeps its size at every Dynamic Type setting — one in a ranking's row, which
 * is a fixed height for `getItemLayout`, scaled with the text and outgrew the
 * row — on a line tall enough for the emoji's ascent. Three places drew one,
 * each its own way.
 */
export const FlagGlyph = memo(function FlagGlyph({
  flag,
  size = 'row',
}: {
  flag: string;
  size?: keyof typeof FLAG;
}) {
  return (
    <RNText allowFontScaling={false} style={flagStyles[size]}>
      {flag}
    </RNText>
  );
});

const flagStyles = StyleSheet.create({
  row: { fontSize: FLAG.row, lineHeight: FLAG.row * 1.125 },
  inline: { fontSize: FLAG.inline, lineHeight: FLAG.inline * 1.125 },
  display: { fontSize: FLAG.display, lineHeight: FLAG.display * 1.125 },
});

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
        <FlagGlyph flag={flag} />
        <Text variant="labelSm" numberOfLines={1}>
          {display}
        </Text>
      </View>
    );
  }
  return (
    <Pressable
      onPress={handlePress}
      hitSlop={HIT_SLOP}
      style={[styles.flagChip, { borderColor }]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${display}`}
    >
      <FlagGlyph flag={flag} />
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
});
