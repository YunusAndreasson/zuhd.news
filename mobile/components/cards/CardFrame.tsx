import { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { MAX_FONT_SCALE, SPACING, titleFontScale } from '../../constants/theme';
import type { DeckCard } from '../../lib/cards/types';
import { observationDate } from '../../lib/data-freshness';
import { useOpenLink } from '../../lib/open-link';
import { SourceCaption } from '../blocks/SourceCaption';
import { DeltaChip } from '../DeltaChip';
import { Text } from '../primitives';

/**
 * The card anatomy, as a component.
 *
 * Every data card is this shell with one block in the middle. The order is not
 * decoration: measurements lead with their value, beliefs lead with the
 * question that gives their percentage meaning, and both continue through the
 * graph, live `standing` analysis and supporting movement context. The analysis
 * already carries the news context, so this shell does not repeat it as card
 * furniture.
 */

/** The reading is the largest thing on the screen and the only thing sized
 *  above `display`. `display` is 28pt; a reading has to survive being read at
 *  arm's length, across a room, in sunlight. 1.55 rather than the 1.7 this
 *  started at: the difference is invisible at a glance and it is ~10pt of the
 *  budget that decides whether part four lands above the fold. */
const READING_SCALE = 1.55;

/** A reading that has grown past ~11 characters ("10,086,781") no longer fits
 *  the phone at full scale, and shrinking the type is better than truncating a
 *  number. */
const LONG_READING = 9;
const LONG_READING_SCALE = 1.25;

/** The focal number, its unit and its movement are one answer. Keeping this
 * group independent from the title lets a measurement lead with the answer
 * while a belief first states the question that gives its percentage meaning. */
const CardReading = memo(function CardReading({
  card,
  afterTitle = false,
}: {
  card: DeckCard;
  afterTitle?: boolean;
}) {
  const readingScale = card.reading.length > LONG_READING ? LONG_READING_SCALE : READING_SCALE;

  return (
    <View>
      <Text
        variant="display"
        tone="emphasis"
        scale={readingScale}
        style={[styles.reading, afterTitle && styles.readingAfterTitle]}
        maxFontSizeMultiplier={MAX_FONT_SCALE.tabular}
      >
        {card.reading}
      </Text>
      {card.readingNote || card.delta ? (
        <View style={styles.readingMeta}>
          {card.readingNote ? (
            <Text variant="caption" tone="secondary" numberOfLines={1}>
              {card.readingNote}
            </Text>
          ) : null}
          {card.readingNote && card.delta ? (
            <Text variant="caption" tone="secondary">
              ·
            </Text>
          ) : null}
          {card.delta ? <DeltaChip delta={card.delta} /> : null}
        </View>
      ) : null}
    </View>
  );
});

const CardTitle = memo(function CardTitle({
  card,
  afterMetric = false,
}: {
  card: DeckCard;
  afterMetric?: boolean;
}) {
  return (
    <Text
      variant="title"
      tone="default"
      scale={titleFontScale(card.title.length)}
      style={afterMetric ? styles.titleAfterMetric : styles.titleBeforeMetric}
      accessibilityRole="header"
    >
      {card.title}
    </Text>
  );
});

interface CardFrameProps {
  card: DeckCard;
  /** The block that makes this card its kind — a chart, rows, figures. */
  children?: ReactNode;
}

export const CardFrame = memo(function CardFrame({ card, children }: CardFrameProps) {
  const observed = observationDate(card.asOf);
  const openLink = useOpenLink();

  // The one word, if any, that opens the kicker line.
  const mark = card.lead ? 'current' : null;

  return (
    <View style={styles.column}>
      <View testID="card-page-header">
        {/* The one line of metadata a card carries: what kind of thing this
              is, and the date its number was observed. On a gated card it
              opens with the one word that says why the screen exists —
              `current` for a strait whose data just cleared a freshness gate.
              Without the mark a
              disrupted strait and the gold-to-silver ratio arrive in
              identical weight, and the reader can only tell them apart by
              already knowing which cards the app gates.

              An ink step, not a colour and not opacity — DESIGN.md is
              explicit that quiet is ink, and the chromatic budget is already
              spent on the delta chip. Nested rather than a flex row so the
              halves share a baseline and a screen reader gets one phrase.

              "New to you" and "Previously viewed" used to be a second line
              of small caps directly under this one. The deck already groups
              unseen cards ahead of the caught-up page and viewed ones behind
              it, so both restated the reader's position in the register the
              kicker was already using — one more line to decipher before
              reaching the number. */}
        {mark || card.kicker || observed ? (
          <Text variant="labelXs" tone="secondary">
            {mark ? (
              <Text variant="labelXs" tone="emphasis">
                {card.kicker || observed ? `${mark} · ` : mark}
              </Text>
            ) : null}
            {card.kicker}
            {card.kicker && observed ? ' · ' : null}
            {observed}
          </Text>
        ) : null}

        {/* Measurements answer first; a belief and a date ask first. A bare
                “62%” is not a useful fact until the reader knows which outcome
                it prices, and “in 3 weeks” is not one until they know what
                lands — while “$89 a barrel” is already self-describing. */}
        {card.kind === 'belief' || card.kind === 'scheduled' ? (
          <>
            <CardTitle card={card} />
            <CardReading card={card} afterTitle />
          </>
        ) : (
          <>
            <CardReading card={card} />
            <CardTitle card={card} afterMetric />
          </>
        )}
      </View>

      {children ? (
        <View style={styles.block} testID="card-chart-region">
          {children}
        </View>
      ) : null}

      {/* The card is one column, scrolled by its sheet. It used to be a page of
            fixed height with the analysis in a scroll view of its own — the
            shape of a full-screen pager, where a vertical drag had to page.
            In a sheet that nesting only hid the source caption behind a
            second scroll a reader had no reason to look for. */}
      <View style={styles.analysis} testID="card-text-region">
        {card.why ? <Text variant="body">{card.why}</Text> : null}

        {card.changed ? (
          <Text variant="caption" tone="secondary" style={card.why ? styles.supporting : undefined}>
            {card.changed}
          </Text>
        ) : null}

        {card.sourceLabel ? (
          <View style={styles.source}>
            <SourceCaption label={card.sourceLabel} />
          </View>
        ) : null}
        {/* Citations sit under the source caption as one right-aligned
                  group, in the same quiet tier. They were left-aligned
                  caption rows prefixed "Source ·", which read as more
                  supporting copy — a fourth paragraph — rather than as the
                  attribution they are. */}
        {card.sources?.map((source) => (
          <Text
            key={source.url}
            variant="caption"
            tone="secondary"
            numberOfLines={1}
            accessibilityRole="link"
            onPress={() => openLink(source.url)}
            style={styles.sourceLink}
          >
            {source.label}
          </Text>
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  column: {
    paddingHorizontal: SPACING.articlePadding,
    paddingTop: SPACING.md,
    // A card's last element is a caption rather than prose, so it needs one
    // more tier of room than `ArticlePage`'s `SPACING.xxl`. That was learned
    // when the cards were full-screen pages under a row of action pills —
    // at `xxl` alone the source caption sat under the share pill. Cards open
    // in a sheet now, where the same extra tier keeps the caption clear of
    // the sheet's bottom edge and the home indicator.
    paddingBottom: SPACING.xxl + SPACING.md,
  },
  reading: { marginTop: SPACING.xxs },
  readingAfterTitle: { marginTop: SPACING.md },
  readingMeta: {
    marginTop: SPACING.xxs,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  titleAfterMetric: { marginTop: SPACING.smPlus },
  titleBeforeMetric: { marginTop: SPACING.sm },
  block: { marginTop: SPACING.md },
  analysis: { marginTop: SPACING.lg },
  supporting: { marginTop: SPACING.sm },
  source: { marginTop: SPACING.md },
  sourceLink: { marginTop: SPACING.xs, textAlign: 'right' },
});
