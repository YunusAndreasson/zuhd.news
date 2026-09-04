import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import type { CardStatus } from '../../lib/card-history';
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

/** Secondary figures — nisab's two metals, a strait's watched vessel class.
 *
 *  One line per figure, at caption size: the question on the left, its answer
 *  on the right, and a note folded into the question rather than stacked
 *  under it. They were three type treatments across two lines — a caption
 *  label, a small-caps note, a body-sized semibold value — plus a hairline
 *  rule between rows and a hairline bar beneath them, which is a table's
 *  worth of furniture for two facts that sit between a title and a chart.
 *  The value is semibold at the label's size, not the body's: a figure the
 *  size of the prose competed with the title above it for second place, and
 *  second place belongs to the title.
 *
 *  The bar stays where a weight exists. On the nisab card it is the proof for
 *  "set by silver" — the two thresholds differ by an order of magnitude, and
 *  a bar shows that in a way two numbers do not. It is also the only rule the
 *  list draws, so the rows do not need another. */
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
          style={styles.figureRow}
        >
          <View style={styles.figureMainRow}>
            <Text variant="caption" tone="secondary" style={styles.figureLabel}>
              {f.note ? `${f.label} · ${f.note}` : f.label}
            </Text>
            <Text variant="captionEmphasis" style={styles.figureValue}>
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
  onReadingScrollStart,
  hasNext,
  resetScrollKey,
  status,
}: {
  card: SwipeCard;
  itemHeight: number;
  index: number;
  scrollY: SharedValue<number>;
  onInnerScrollConsumed?: (index: number) => void;
  onReadingScrollStart?: () => void;
  hasNext?: boolean;
  resetScrollKey?: number;
  status?: CardStatus;
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
      onReadingScrollStart={onReadingScrollStart}
      hasNext={hasNext}
      resetScrollKey={resetScrollKey}
      status={status}
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
      reference={series.reference}
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

    // The history of the thing being decided, where the desk publishes one —
    // two years of the Fed target range under "FOMC decides in 18 days". Where
    // it does not, the frame closes up rather than leaving a chart's worth of
    // empty space: a countdown and the account of what is at stake are a whole
    // card on their own.
    case 'scheduled':
      return card.series ? <CardTrend series={card.series} /> : null;
  }
}

const styles = StyleSheet.create({
  figures: { marginBottom: SPACING.md },
  // Tight rows. A figure list is two or three lines of data between the
  // card's opening and its chart, and every point of padding here comes
  // straight off the bottom of part four.
  figureRow: { paddingVertical: SPACING.xs },
  figureLabel: { flexShrink: 1 },
  figureMainRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  // Tabular so a column of right-aligned figures lines up digit for digit.
  figureValue: { flexShrink: 0, textAlign: 'right', fontVariant: ['tabular-nums'] },
  figureBarTrack: {
    height: StyleSheet.hairlineWidth,
    marginTop: SPACING.xs,
    overflow: 'hidden',
  },
  figureBarFill: { height: '100%' },
});
