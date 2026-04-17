import { memo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { MAX_FONT_SCALE, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';

/** Tiny right-aligned citation beneath a block. Rendered when a block's
 *  `source` index resolves to a string in the brief-level sources array.
 *  lineHeight is tight (≈ fontSize × 1.1) so the caption doesn't eat vertical
 *  space between otherwise-adjacent blocks. */
export const SourceCaption = memo(function SourceCaption({ label }: { label: string }) {
  const { textStyles, typography } = useTheme();
  return (
    <Text
      style={[
        styles.caption,
        textStyles.smallCapsXs,
        { lineHeight: Math.round(typography.sizeXs * 1.1) },
      ]}
      maxFontSizeMultiplier={MAX_FONT_SCALE.label}
      numberOfLines={1}
    >
      {label}
    </Text>
  );
});

const styles = StyleSheet.create({
  caption: {
    marginTop: SPACING.xxs,
    textAlign: 'right',
  },
});
