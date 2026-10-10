import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { spokenDelta } from '../lib/cards/format';
import { MARKET_CAVEAT, type StoryOdds } from '../lib/predictions';
import { DeltaChip } from './DeltaChip';
import { Icon, Pressable, Text } from './primitives';

/**
 * What the market thinks about this story, under its headline.
 *
 * This is the merge. Contracts used to live in their own deck a swipe away
 * from the news they price; the link between them was written by the pipeline
 * all along (`relatedArticles` on every `poly-*` indicator) and simply never
 * read in this direction.
 *
 * Three rules, all load-bearing:
 *   - **Level, then movement in points.** A contract going 26 → 86 moved 60
 *     points; "+231%" is arithmetic pretending to be journalism.
 *   - **Never a favorable/unfavorable tint.** On the odds of a war that would
 *     be a verdict. The move's chip is slate whichever way it went (`moveTone`).
 *   - **The caveat is always printed.** A price is set by people with money on
 *     the outcome, and it is not a forecast. `MARKET_CAVEAT` is a constant so
 *     no generated description can ever quietly replace it.
 */
export const OddsLine = memo(function OddsLine({
  odds,
  last,
  onPress,
}: {
  odds: StoryOdds;
  /** Nothing follows it in the story but `save · share · sources`: no bottom
   *  rule, as for `StoryChart`. */
  last?: boolean;
  onPress?: (odds: StoryOdds) => void;
}) {
  const { colors } = useTheme();
  const handlePress = useCallback(() => onPress?.(odds), [odds, onPress]);
  const spoken = [
    `Traders price this at ${odds.level}`,
    odds.move ? spokenDelta(odds.move) : null,
    MARKET_CAVEAT,
  ]
    .filter(Boolean)
    .join(', ');
  const body = (
    <>
      <Text variant="labelXs" tone="secondary">
        traders price this at
      </Text>
      <View style={styles.oddsRow}>
        <Text variant="tabularEmphasis" scale={1.25}>
          {odds.level}
        </Text>
        {/* The chip `StoryChart` prints a contract's move in, with its window. */}
        {odds.move ? <DeltaChip delta={odds.move} /> : null}
        {/* As on `StoryChart`: what says the line opens its chart. */}
        {onPress ? (
          <View
            style={styles.chevron}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Icon name="chevron-forward" size="sm" tone="secondary" />
          </View>
        ) : null}
      </View>
      <Text variant="labelXs" tone="secondary">
        {MARKET_CAVEAT}
      </Text>
    </>
  );
  // The press primitive, like the `sources · save · share` words under it: it
  // used a static pressed style while they sprang.
  return onPress ? (
    <Pressable
      onPress={handlePress}
      style={[styles.odds, { borderColor: colors.rule }, last && styles.last]}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint="Opens the market's chart"
    >
      {body}
    </Pressable>
  ) : (
    <View
      style={[styles.odds, { borderColor: colors.rule }, last && styles.last]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={spoken}
    >
      {body}
    </View>
  );
});

const styles = StyleSheet.create({
  // Ruled above and below and never filled. It is not the article's prose and
  // must not read as a continuation of it — but a tinted box would spend the
  // chromatic budget on a price, which is exactly what the rule against
  // tinting odds exists to prevent.
  odds: {
    marginBottom: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  last: { borderBottomWidth: 0, marginBottom: 0 },
  oddsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SPACING.sm,
    marginVertical: SPACING.xxs,
  },
  // At the row's end, centred on a row otherwise set on the text's baseline.
  chevron: { alignSelf: 'center', marginLeft: 'auto' },
});
