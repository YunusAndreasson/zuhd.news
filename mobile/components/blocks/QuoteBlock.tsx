import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MAX_FONT_SCALE, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
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
  const { colors, font, typography, textStyles } = useTheme();
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
          <Text
            selectable
            style={{
              ...font.italic,
              fontSize: typography.sizeBase,
              lineHeight: typography.sizeBase * typography.leadingBody,
              color: colors.text,
            }}
            maxFontSizeMultiplier={MAX_FONT_SCALE.body}
          >
            {'\u201c'}
            {text}
            {'\u201d'}
          </Text>
          {attribution ? (
            <Text
              style={[styles.attribution, textStyles.smallCapsXs]}
              maxFontSizeMultiplier={MAX_FONT_SCALE.label}
            >
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
