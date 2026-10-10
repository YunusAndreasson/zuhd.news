import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { spokenDelta } from '../lib/cards/format';
import type { GraphCard } from '../lib/cards/types';
import { gaugeMove } from '../lib/cards/week-move';
import { observationDate } from '../lib/data-freshness';
import { stripLabel } from '../lib/now';
import { MARKET_CAVEAT } from '../lib/predictions';
import { TrendBlock } from './blocks/TrendBlock';
import { DeltaChip } from './DeltaChip';
import { Icon, Pressable, Text } from './primitives';

/**
 * The series a story cites, drawn under its title (`Article.chart`), over the
 * hook: a resting card shows that the story has one.
 *
 * The number in the prose is a claim; this is where the reader sees it
 * against its own history — oil at $114 is a different sentence after a month
 * at $80 than after a month at $120. It is the card a press opens, resolved by
 * `lib/story-chart.ts` to the same object the menu row holds, so the chart
 * here, the card and the strip cannot disagree about the series or the move.
 *
 * Built like `OddsLine`, which it replaces when the cited series is a
 * contract: ruled above and below and never filled, so it does not read as a
 * continuation of the prose, and one spring press that opens the full card.
 * Small by rule: the open story is one height for every story, and a chart
 * the size of the card's own would make every story that carries one scroll.
 * So it is the subject, the reading, the move and its date on one line, and
 * the line under it over its time axis — no value axis, no scrub (a drag
 * across it is the deck's swipe), and a strait's 90-day average as the dashed
 * rule the card draws. The months under the line are what say how long it
 * runs: the move beside the reading is a week's, and the line is a quarter.
 */
export const StoryChart = memo(function StoryChart({
  card,
  pressable = true,
  onPress,
}: {
  card: GraphCard;
  /** A press on it opens its card: true while its story is open. At rest the
   *  whole story card is one button, and the chevron would promise a chart
   *  where the press opens the story. */
  pressable?: boolean;
  onPress?: (card: GraphCard) => void;
}) {
  const { colors } = useTheme();
  const handlePress = useCallback(() => onPress?.(card), [card, onPress]);
  const belief = card.kind === 'belief';
  // The strip's name for it. A strait gets `ships` back here: this line
  // prints the reading (`50`) with no unit, and the strip, which dropped the
  // word, prints none.
  const name = stripLabel(card);
  const subject = belief ? card.title : card.id.startsWith('strait-') ? `${name} ships` : name;
  const observed = observationDate(card.asOf);
  // The week, as the strip and the menu print it: one number per thing
  // wherever it is printed. The card's own window (`since Aug 10`) put a
  // ▲24% under a story while the strip over it said Oil ▼12%. A series with
  // no week — a monthly print, a contract — keeps the card's move, and the
  // chip prints its window either way.
  const delta = gaugeMove(card)?.delta ?? card.delta;
  const move = delta ? spokenDelta(delta) : null;
  const spoken = (
    belief
      ? [`Traders price ${subject} at ${card.reading}`, move, MARKET_CAVEAT]
      : [
          `${subject}, ${card.reading}${card.readingNote ? ` ${card.readingNote}` : ''}`,
          move,
          observed,
        ]
  )
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      onPress={handlePress}
      style={[styles.frame, { borderColor: colors.rule }]}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint="Opens the chart"
    >
      {/* A contract states its question before its price: a percentage
          without an outcome has no meaning (DESIGN.md, the card tiers). */}
      {belief ? (
        <Text variant="labelXs" tone="secondary" numberOfLines={2}>
          {`traders price · ${subject}`}
        </Text>
      ) : null}
      <View style={styles.reading}>
        {belief ? null : (
          <Text variant="labelXs" numberOfLines={1} style={styles.subject}>
            {subject}
          </Text>
        )}
        <Text variant="tabularEmphasis" scale={1.25}>
          {card.reading}
        </Text>
        {delta ? <DeltaChip delta={delta} /> : null}
        <View style={styles.spacer} />
        {observed ? (
          <Text variant="labelXs" tone="secondary" numberOfLines={1}>
            {observed}
          </Text>
        ) : null}
        {/* What says the line can be pressed. A chart in an article reads as
            a figure, and nothing about this one said otherwise; the menu's
            rows mark "this opens a page" with the same chevron. Its room is
            kept at rest, so nothing moves when the story opens. */}
        {onPress ? (
          <View
            style={[styles.chevron, !pressable && styles.hidden]}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Icon name="chevron-forward" size="sm" tone="secondary" />
          </View>
        ) : null}
      </View>
      {/* The button's label already speaks the reading; the chart's own
          image label would announce the same series a second time. */}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <TrendBlock
          values={card.series.multi ? undefined : card.series.values}
          series={card.series.multi}
          periods={card.series.periods}
          label={card.series.label}
          unit={card.series.unit}
          highlight={card.series.highlight}
          reference={card.series.reference}
          shape={card.series.shape}
          domain={card.series.domain}
          inverted={card.series.inverted}
          variant="inline"
          scrubbable={false}
        />
      </View>
      {belief ? (
        <Text variant="labelXs" tone="secondary">
          {MARKET_CAVEAT}
        </Text>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  // `OddsLine`'s frame, so the two data lines a story can carry are one
  // shape: rules, no fill — a tinted box would spend the chromatic budget on
  // a price.
  frame: {
    marginBottom: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  reading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SPACING.sm,
    marginBottom: SPACING.xxs,
  },
  subject: {
    flexShrink: 1,
  },
  spacer: {
    flex: 1,
  },
  // Centred on the row, which is otherwise set on the text's baseline.
  chevron: { alignSelf: 'center', marginLeft: -SPACING.xxs },
  hidden: { opacity: 0 },
});
