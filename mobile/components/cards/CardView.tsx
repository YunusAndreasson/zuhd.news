import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import type { SwipeCard } from '../../lib/cards/rank';
import type { CardFigure } from '../../lib/cards/types';
import { useOpenLink } from '../../lib/open-link';
import { CompareBlock } from '../blocks/CompareBlock';
import { TrendBlock } from '../blocks/TrendBlock';
import { Text } from '../primitives';
import { CardFrame } from './CardFrame';

/**
 * One card, whichever kind it is.
 *
 * Every block renders at `variant="context"`, not `"article"`. A card owns a
 * whole screen and keeps its daily reading compact; the article-sized chart
 * (180pt against 148) pushed the source caption below the fold on the very
 * first card, and a card that scrolls is a card that did not fit.
 *
 * `components/blocks/` deliberately has no dispatcher — a sheet knows which
 * block it wants and imports it. Cards are the opposite case: a builder emits
 * a union and the pager renders whatever comes out, so there is no call site
 * that could know the kind. The switch belongs here rather than at every
 * consumer.
 *
 * The four kinds differ only in the visual block below the title and context:
 *
 *   reading      a series, plus optional secondary figures
 *   comparison   rows that only mean something against each other
 *   belief       a series, framed as a price on an outcome rather than a fact
 *   condition    figures or rows describing a standing state
 */

/** Secondary figures — nisab's two metals, the phase bands, the calendar.
 *  A two-column list rather than a table: the label is the question and the
 *  value is the answer, and a rule between them would imply a total. */
const Figures = memo(function Figures({
  figures,
  visualStyle = 'distribution',
}: {
  figures: CardFigure[];
  visualStyle?: 'distribution' | 'timeline';
}) {
  const { colors } = useTheme();
  const maxWeight = Math.max(0, ...figures.map((figure) => figure.weight ?? 0));
  return (
    <View style={styles.figures}>
      {figures.map((f, i) => (
        <View
          // Index-keyed, and the label is carried along only so the key stays
          // readable in a React trace. Keying on the label alone was wrong the
          // moment two figures could share one: the calendar prints a date per
          // row and a central bank can publish twice in a day — today's file
          // has US GDP and US PCE both on 26 Aug, which React reported as
          // "Encountered two children with the same key, `26 Aug`" and which
          // lets it drop or duplicate a row. A figure list is positional,
          // rebuilt whole by a pure builder and never reordered, so the index
          // is the honest identity here.
          key={`${i}-${f.label}`}
          style={[
            styles.figureRow,
            i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.rule },
          ]}
        >
          {visualStyle === 'timeline' ? (
            <View style={styles.timelineMark}>
              {i > 0 ? (
                <View style={[styles.timelineBefore, { backgroundColor: colors.rule }]} />
              ) : null}
              <View style={[styles.timelineDot, { backgroundColor: colors.textEmphasis }]} />
              {i < figures.length - 1 ? (
                <View style={[styles.timelineAfter, { backgroundColor: colors.rule }]} />
              ) : null}
            </View>
          ) : null}
          <View style={styles.figureContent}>
            <View style={styles.figureMainRow}>
              <View style={styles.figureLabel}>
                <Text variant="labelSm" tone="secondary">
                  {f.label}
                </Text>
                {f.note ? (
                  <Text variant="caption" tone="secondary">
                    {f.note}
                  </Text>
                ) : null}
              </View>
              <Text variant="bodyEmphasis" style={styles.figureValue}>
                {f.value}
              </Text>
            </View>
            {visualStyle === 'distribution' && maxWeight > 0 && f.weight != null ? (
              <View style={[styles.figureBarTrack, { backgroundColor: colors.rule }]}>
                <View
                  style={[
                    styles.figureBarFill,
                    {
                      backgroundColor: colors.textEmphasis,
                      width: `${Math.max(2, (f.weight / maxWeight) * 100)}%`,
                    },
                  ]}
                />
              </View>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
});

export const CardView = memo(function CardView({
  card,
  itemHeight,
  index,
  total,
  scrollY,
}: {
  card: SwipeCard;
  itemHeight: number;
  index: number;
  total: number;
  scrollY: SharedValue<number>;
}) {
  const openLink = useOpenLink();
  const onPress = useCallback(() => {
    if (card.link) openLink(card.link);
  }, [card.link, openLink]);

  return (
    <CardFrame card={card} itemHeight={itemHeight} index={index} total={total} scrollY={scrollY}>
      {renderBody(card, onPress)}
    </CardFrame>
  );
});

function renderBody(card: SwipeCard, onPress: () => void) {
  switch (card.kind) {
    case 'reading':
      return (
        <>
          {card.figures ? <Figures figures={card.figures} /> : null}
          {card.series ? (
            <TrendBlock
              values={card.series.multi ? undefined : card.series.values}
              series={card.series.multi}
              periods={card.series.periods}
              label={card.series.label}
              unit={card.series.unit}
              highlight={card.series.highlight}
              variant="context"
              scrubbable={false}
            />
          ) : null}
        </>
      );

    case 'belief':
      return (
        <TrendBlock
          values={card.series.values}
          periods={card.series.periods}
          label={card.series.label}
          unit={card.series.unit}
          highlight={card.series.highlight}
          variant="context"
          // A card sits in a horizontal pager and the app is navigated by
          // swiping. A chart-width scrubber eats that swipe.
          scrubbable={false}
          // The market page is the only way to check the claim, and a belief
          // card that cannot be checked is just a number with a mood.
          onPress={card.link ? onPress : undefined}
        />
      );

    case 'comparison':
      return <CompareBlock rows={card.rows} label={card.rowsLabel} variant="context" />;

    case 'condition':
      return (
        <>
          {card.figures ? <Figures figures={card.figures} visualStyle={card.visualStyle} /> : null}
          {card.rows ? (
            <CompareBlock rows={card.rows} label={card.rowsLabel} variant="article" />
          ) : null}
        </>
      );
  }
}

const styles = StyleSheet.create({
  figures: { marginBottom: SPACING.md },
  figureRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: SPACING.md,
    // Tight rows. A figure list is two or three lines of data between the
    // card's opening and its chart, and every point of padding here comes
    // straight off the bottom of part four.
    paddingVertical: SPACING.xs,
  },
  figureLabel: { flexShrink: 1 },
  figureContent: { flex: 1 },
  figureMainRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  figureValue: { flexShrink: 0, textAlign: 'right' },
  figureBarTrack: {
    height: StyleSheet.hairlineWidth,
    marginTop: SPACING.xs,
    overflow: 'hidden',
  },
  figureBarFill: { height: '100%' },
  timelineMark: { width: SPACING.sm, alignItems: 'center' },
  timelineDot: {
    width: SPACING.xs,
    height: SPACING.xs,
    borderRadius: SPACING.xs,
    marginTop: SPACING.xs,
  },
  timelineBefore: {
    position: 'absolute',
    top: 0,
    width: StyleSheet.hairlineWidth,
    height: SPACING.sm,
  },
  timelineAfter: {
    position: 'absolute',
    top: SPACING.sm,
    bottom: -SPACING.sm,
    width: StyleSheet.hairlineWidth,
  },
});
