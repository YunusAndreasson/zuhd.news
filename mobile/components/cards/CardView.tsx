import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import type { Card, CardFigure } from '../../lib/cards/types';
import { useOpenLink } from '../../lib/open-link';
import { CompareBlock } from '../blocks/CompareBlock';
import { TrendBlock } from '../blocks/TrendBlock';
import { Text } from '../primitives';
import { CardFrame } from './CardFrame';

/**
 * One card, whichever kind it is.
 *
 * Every block renders at `variant="context"`, not `"article"`. A card owns a
 * whole screen and has to fit five parts on it; the article-sized chart (180pt
 * against 148) pushed the source caption and half of part four below the fold
 * on the very first card, and a card that scrolls is a card that did not fit.
 *
 * `components/blocks/` deliberately has no dispatcher — a sheet knows which
 * block it wants and imports it. Cards are the opposite case: a builder emits
 * a union and the pager renders whatever comes out, so there is no call site
 * that could know the kind. The switch belongs here rather than at every
 * consumer.
 *
 * The four kinds differ only in the block, which sits between the title and
 * part three — see `CardFrame` for the rendered order, which stopped matching
 * the part numbering when part two moved below the block:
 *
 *   reading      a series, plus optional secondary figures
 *   comparison   rows that only mean something against each other
 *   belief       a series, framed as a price on an outcome rather than a fact
 *   condition    figures or rows describing a standing state
 */

/** Secondary figures — nisab's two metals, the phase bands, the calendar.
 *  A two-column list rather than a table: the label is the question and the
 *  value is the answer, and a rule between them would imply a total. */
const Figures = memo(function Figures({ figures }: { figures: CardFigure[] }) {
  const { colors } = useTheme();
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
      ))}
    </View>
  );
});

export const CardView = memo(function CardView({
  card,
  itemHeight,
  index,
  scrollY,
  onArticlePress,
}: {
  card: Card;
  itemHeight: number;
  index: number;
  scrollY: SharedValue<number>;
  /** Open one of the stories part five names — see `CardFrame`. */
  onArticlePress?: (slug: string) => void;
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
      onArticlePress={onArticlePress}
    >
      {renderBody(card, onPress)}
    </CardFrame>
  );
});

function renderBody(card: Card, onPress: () => void) {
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
              // The chip's colour, on the chip's own picture. `TrendBlock`
              // narrows it away on a multi-series chart, so `staples` is
              // unaffected; everywhere else the line and the caret above it
              // now make one claim instead of the chip making it alone.
              tone={card.delta?.valence}
              baseline={card.series.baseline}
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
          // Slate on every belief card, and deliberately: `beliefCards` passes
          // no `riseMeans`, so a contract on a ceasefire holding and one on a
          // candidate winning are the same colour. What the reader gets from
          // it here is the third state said out loud — the app is not telling
          // you this is good news — in the same channel as everywhere else.
          tone={card.delta?.valence}
          baseline={card.series.baseline}
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
          {card.figures ? <Figures figures={card.figures} /> : null}
          {/* `context`, like the other three kinds. This was the one branch
              that broke the rule stated at the top of this file, with no
              comment saying why — and an exception with no reason on record
              is usually not one.

              It reaches a single card. Of the four condition builders only
              the conflict card emits `rows`; famine, hazards and the
              determinations all emit `figures`, which never went through
              here. On that card it is worth having: `article` spends
              `SPACING.sm` above and below every row where `context` spends
              `xs`, so a ranked list of countries pays 8pt a row for padding
              that comes straight off the bottom of part four. The
              fifteen-row currency table is the same shape and has always
              rendered at `context`.

              Not verified on device — the conflict gate had not cleared on
              the day this changed, so the card was not in the column. */}
          {card.rows ? (
            <CompareBlock rows={card.rows} label={card.rowsLabel} variant="context" />
          ) : null}
        </>
      );
  }
}

const styles = StyleSheet.create({
  figures: { marginBottom: SPACING.md },
  figureRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: SPACING.md,
    // Tight rows. A figure list is two or three lines of data between the
    // card's opening and its chart, and every point of padding here comes
    // straight off the bottom of part four.
    paddingVertical: SPACING.xs,
  },
  figureLabel: { flexShrink: 1 },
  figureValue: { flexShrink: 0, textAlign: 'right' },
});
