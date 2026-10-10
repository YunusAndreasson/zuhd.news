import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import {
  citedAnnotations,
  moveSince,
  moveUnitOf,
  spanReference,
  windowReference,
} from '../../lib/cards/card-chart';
import type { SwipeCard } from '../../lib/cards/rank';
import type { CardFigure, CardSeries } from '../../lib/cards/types';
import { MONTH_AGO } from '../../lib/cards/week';
import { cardWindows } from '../../lib/cards/week-move';
import { TrendBlock } from '../blocks/TrendBlock';
import { DeltaChip } from '../DeltaChip';
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
function FigureLabel({ figure }: { figure: CardFigure }) {
  return (
    <Text variant="caption" tone="secondary" style={styles.figureLabel}>
      {figure.note ? `${figure.label} · ${figure.note}` : figure.label}
    </Text>
  );
}

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
          {/* A group's basis, once, in the chart caption's register. */}
          {f.group && f.group !== figures[i - 1]?.group ? (
            <Text variant="labelXs" style={styles.figureGroup}>
              {f.group}
            </Text>
          ) : null}
          <View style={styles.figureMainRow}>
            {/* A figure's move is a chip, at the row's own size, in its
                colour. Folded into the label as `· −82%` it was four moves in
                grey under a card whose own move was red. */}
            {f.delta ? (
              <View style={styles.figureSubject}>
                <FigureLabel figure={f} />
                <DeltaChip delta={f.delta} window={false} scale={1} />
              </View>
            ) : (
              <FigureLabel figure={f} />
            )}
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
  onStoryPress,
}: {
  card: SwipeCard;
  /** Opens one of the stories the card cites. */
  onStoryPress?: (slug: string) => void;
}) {
  return (
    <CardFrame card={card} onStoryPress={onStoryPress}>
      {renderBody(card)}
    </CardFrame>
  );
});

/**
 * The card's chart, and it can be read off.
 *
 * It was `scrubbable={false}` for as long as cards were pages on a pager,
 * where a horizontal drag on the chart ate the swipe to the next card. A card
 * is a sheet now, whose only gesture is vertical, and a chart nobody can put a
 * number on was the most-reached chart in the app.
 *
 * Two things are drawn besides the line. One is where the card's longest
 * move began: thirty days ago where it prints the three windows
 * (`spanReference`), and otherwise the day its own chip names
 * (`windowReference`), so "since Jul 24" has a place on the chart. The other
 * is the stories the desk cited, numbered as they are listed under the
 * analysis. A scrub reads the move from the day under the finger
 * (`moveSince`).
 */
const CardTrend = memo(function CardTrend({
  card,
  series,
  showLabel = true,
}: {
  card: SwipeCard;
  series: CardSeries;
  showLabel?: boolean;
}) {
  const { cited } = card;
  const reference = useMemo(() => {
    if (series.reference) return series.reference;
    const windows = cardWindows(card);
    return windows
      ? spanReference(series, windows.from, MONTH_AGO)
      : windowReference(series, card.delta);
  }, [card, series]);
  const annotations = useMemo(() => citedAnnotations(series, cited), [series, cited]);
  const unit = moveUnitOf(card, series);
  const since = useCallback((index: number) => moveSince(series, index, unit), [series, unit]);
  return (
    <TrendBlock
      values={series.multi ? undefined : series.values}
      series={series.multi}
      periods={series.periods}
      label={series.label}
      unit={series.unit}
      highlight={series.highlight}
      reference={reference}
      annotations={annotations}
      shape={series.shape}
      domain={series.domain}
      inverted={series.inverted}
      moveSince={since}
      variant="context"
      showLabel={showLabel}
    />
  );
});

function renderBody(card: SwipeCard) {
  switch (card.kind) {
    case 'reading':
      return (
        <>
          {card.figures ? <Figures figures={card.figures} /> : null}
          <CardTrend
            card={card}
            series={card.series}
            showLabel={
              !['per cent', 'index points', 'index'].includes(card.series.label.toLowerCase()) &&
              card.series.label !== card.readingNote
            }
          />
        </>
      );

    case 'belief':
      // The explicit source link below the account opens the market. The
      // chart itself is solely for inspecting its history.
      return <CardTrend card={card} series={card.series} />;

    // The history of the thing being decided, where the desk publishes one —
    // two years of the Fed target range under "FOMC decides in 18 days". Where
    // it does not, the frame closes up rather than leaving a chart's worth of
    // empty space: a countdown and the account of what is at stake are a whole
    // card on their own.
    case 'scheduled':
      return (
        <>
          {card.figures ? <Figures figures={card.figures} /> : null}
          {card.series ? <CardTrend card={card} series={card.series} /> : null}
        </>
      );
  }
}

const styles = StyleSheet.create({
  figures: { marginBottom: SPACING.md },
  figureGroup: { marginBottom: SPACING.xs },
  // Tight rows. A figure list is two or three lines of data between the
  // card's opening and its chart, and every point of padding here comes
  // straight off the bottom of part four.
  figureRow: { paddingVertical: SPACING.xs },
  // The label and its move wrap as one group, clear of the value's column.
  figureSubject: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: SPACING.sm,
  },
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
