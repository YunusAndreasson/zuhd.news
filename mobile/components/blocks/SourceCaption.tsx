import { memo } from 'react';
import { StyleSheet } from 'react-native';
import { SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { Text } from '../primitives';

/** Tiny right-aligned citation beneath a block. Rendered when a block's
 *  `source` index resolves to a string in the brief-level sources array.
 *  lineHeight is tight (≈ fontSize × 1.1) so the caption doesn't eat vertical
 *  space between otherwise-adjacent blocks. */
export const SourceCaption = memo(function SourceCaption({ label }: { label: string }) {
  const { typography } = useTheme();
  return (
    <Text
      variant="labelXs"
      numberOfLines={1}
      style={[
        styles.caption,
        { lineHeight: Math.round(typography.sizeXs * typography.leadingTight) },
      ]}
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
