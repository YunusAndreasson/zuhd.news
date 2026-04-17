import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MAX_FONT_SCALE, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { type BlockVariant, blockContainerStyle } from './index';
import { SourceCaption } from './SourceCaption';

interface QuoteBlockProps {
  text: string;
  speaker?: string;
  year?: string;
  variant?: BlockVariant;
  /** Resolved citation string from `ContextBrief.sources[block.source]`. */
  sourceLabel?: string;
}

/** Editorial quote — left-rule in accent, italic prose, small-caps attribution.
 *  No visual gimmicks; the left rule + italic set the tone without decoration. */
export const QuoteBlock = memo(function QuoteBlock({
  text,
  speaker,
  year,
  variant = 'article',
  sourceLabel,
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
      {sourceLabel ? <SourceCaption label={sourceLabel} /> : null}
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
