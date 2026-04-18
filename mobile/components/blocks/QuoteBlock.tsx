import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { Text } from '../primitives';
import { type BlockVariant, blockContainerStyle } from './shared';

interface QuoteBlockProps {
  text: string;
  speaker?: string;
  year?: string;
  variant?: BlockVariant;
}

/** Editorial quote — left-rule in accent, italic prose, small-caps attribution.
 *  Only one reference line (the speaker/year) renders; block-level source is
 *  intentionally omitted so the quote doesn't double-attribute. */
export const QuoteBlock = memo(function QuoteBlock({
  text,
  speaker,
  year,
  variant = 'article',
}: QuoteBlockProps) {
  const { colors } = useTheme();
  const isContext = variant === 'context';

  const attributionParts: string[] = [];
  if (speaker) attributionParts.push(speaker);
  if (year) attributionParts.push(year);
  const attribution = attributionParts.join(' \u00b7 ');

  return (
    <View style={blockContainerStyle[isContext ? 'context' : 'article']}>
      <View style={styles.row}>
        <View style={[styles.ruleLeft, { backgroundColor: colors.accent }]} />
        <View style={styles.body}>
          <Text selectable variant="bodyItalic">
            {'\u201c'}
            {text}
            {'\u201d'}
          </Text>
          {attribution ? (
            <Text variant="labelXs" style={styles.attribution}>
              {attribution}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  ruleLeft: {
    width: 2,
    borderRadius: 1,
    marginRight: SPACING.md,
  },
  body: {
    flex: 1,
  },
  attribution: {
    marginTop: SPACING.xs,
  },
});
