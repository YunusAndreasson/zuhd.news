import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import type { SwipeCard } from '../../lib/cards/rank';
import type { CardFigure, CardSeries } from '../../lib/cards/types';
import { useOpenLink } from '../../lib/open-link';
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
 * The two graph-deck kinds differ only in the visual block below the title and context:
 *
 *   reading      a series, plus optional secondary figures
 *   belief       a series, framed as a price on an outcome rather than a fact
 */

/** Secondary figures — nisab's two metals and similar paired readings.
 *  A two-column list rather than a table: the label is the question and the
 *  value is the answer, and a rule between them would imply a total. */
const Figures = memo(function Figures({ figures }: { figures: CardFigure[] }) {
  const { colors } = useTheme();
  const maxWeight = Math.max(0, ...figures.map((figure) => figure.weight ?? 0));
  return (
    <View style={styles.figures}>
      {figures.map((f, i) => (
        <View
          // Index-keyed, and the label is carried along only so the key stays
          // readable in a React trace. A figure list is positional, rebuilt
          // whole by a pure builder and never reordered, so the index is the
          // honest identity here even when two labels match.
          key={`${i}-${f.label}`}
          style={[
            styles.figureRow,
            i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.rule },
          ]}
        >
          <View style={styles.figureContent}>
            <View style={styles.figureMainRow}>
              <View style={styles.figureLabel}>
                <Text variant="caption" tone="secondary">
                  {f.label}
                </Text>
                {f.note ? (
                  <Text variant="labelXs" tone="secondary">
                    {f.note}
                  </Text>
                ) : null}
              </View>
              <Text variant="bodyEmphasis" style={styles.figureValue}>
                {f.value}
              </Text>
            </View>
            {maxWeight > 0 && f.weight != null ? (
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
  scrollY,
  onInnerScrollConsumed,
}: {
  card: SwipeCard;
  itemHeight: number;
  index: number;
  scrollY: SharedValue<number>;
  onInnerScrollConsumed?: (index: number) => void;
}) {
  const openLink = useOpenLink();
  const onPress = useCallback(() => {
    if (card.link) openLink(card.link);
  }, [card.link, openLink]);

  return (
    <CardFrame
      card={card}
      itemHeight={itemHeight}
      index={index}
      scrollY={scrollY}
      onInnerScrollConsumed={onInnerScrollConsumed}
    >
      {renderBody(card, onPress)}
    </CardFrame>
  );
});

const CardTrend = memo(function CardTrend({
  series,
  onPress,
}: {
  series: CardSeries;
  onPress?: () => void;
}) {
  return (
    <TrendBlock
      values={series.multi ? undefined : series.values}
      series={series.multi}
      periods={series.periods}
      label={series.label}
      unit={series.unit}
      highlight={series.highlight}
      variant="context"
      scrubbable={false}
      onPress={onPress}
    />
  );
});

function renderBody(card: SwipeCard, onPress: () => void) {
  switch (card.kind) {
    case 'reading':
      return (
        <>
          {card.figures ? <Figures figures={card.figures} /> : null}
          <CardTrend series={card.series} />
        </>
      );

    case 'belief':
      // The market page is the only way to check the claim, and a belief
      // card that cannot be checked is just a number with a mood.
      return <CardTrend series={card.series} onPress={card.link ? onPress : undefined} />;
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
  figureLabel: { flexShrink: 1, gap: SPACING.xxs },
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
});
