import { memo, type ReactNode, useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
} from 'react-native-reanimated';
import { MAX_FONT_SCALE, SPACING, titleFontScale } from '../../constants/theme';
import { useInnerScrollReporter } from '../../hooks/useInnerScrollReporter';
import type { CardStatus } from '../../lib/card-history';
import type { CardDelta, DeckCard } from '../../lib/cards/types';
import { observationLabel } from '../../lib/data-freshness';
import { useOpenLink } from '../../lib/open-link';
import { SourceCaption } from '../blocks/SourceCaption';
import { OverflowEndCue } from '../OverflowEndCue';
import { Icon, Text } from '../primitives';

/**
 * The card anatomy, as a component.
 *
 * Every data card is this shell with one block in the middle. The order is not
 * decoration: measurements lead with their value, beliefs lead with the
 * question that gives their percentage meaning, and both continue through the
 * graph, live `standing` analysis and supporting movement context. The section
 * rail already owns progress, and the analysis already carries the news
 * context, so this shell does not repeat either as card furniture.
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

/**
 * Which way the number went, and what that does to the person reading.
 *
 * Two channels on purpose (see `CardDelta`): the caret says the direction, the
 * colour says the consequence. Both are always present, and the colour is a
 * three-value channel rather than a two-value one that is sometimes absent —
 * a card about the price of oil gets a caret in rose, a card about bitcoin
 * gets one in slate, and slate is the app saying it will not tell you whether
 * that is good news. The near-white fallback this used to take is gone: it was
 * indistinguishable from the label text beside it, so the reader's first job
 * was deciding whether a chip was coloured at all.
 */
const DeltaChip = memo(function DeltaChip({ delta }: { delta: CardDelta }) {
  const tone = delta.valence;
  return (
    <View style={styles.delta}>
      {delta.direction !== 'flat' ? (
        <View style={styles.deltaCaret}>
          <Icon name={delta.direction === 'up' ? 'caret-up' : 'caret-down'} size="sm" tone={tone} />
        </View>
      ) : null}
      {/* Semibold tabular type makes the move readable *as a number* inside a
          mixed metadata row. Set like the regular unit or small-caps window,
          it disappears into them and defeats the point of taking the move out
          of a sentence. */}
      <Text
        variant="tabularEmphasis"
        tone={tone}
        scale={1.15}
        maxFontSizeMultiplier={MAX_FONT_SCALE.tabular}
      >
        {delta.magnitude}
      </Text>
      {delta.window ? (
        <Text variant="labelXs" tone="secondary" numberOfLines={1} style={styles.deltaWindow}>
          {delta.window}
        </Text>
      ) : null}
    </View>
  );
});

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
  status?: CardStatus;
  card: DeckCard;
  /** Full page height. The card owns the whole screen, like an article does. */
  itemHeight: number;
  /** This card's position in the column, for the arrival animation. */
  index: number;
  /** The column's scroll offset, shared with the UI thread. */
  scrollY: SharedValue<number>;
  /** Reports that this card consumed part of a vertical gesture before the
   * parent pager saw its remainder. */
  onInnerScrollConsumed?: (index: number) => void;
  onReadingScrollStart?: () => void;
  hasNext?: boolean;
  /** Changes when the active section label is pressed. */
  resetScrollKey?: number;
  /** The block that makes this card its kind — a chart, rows, figures. It
   *  stays outside the prose scroll region so vertical swipes here page. */
  children?: ReactNode;
}

export const CardFrame = memo(function CardFrame({
  card,
  itemHeight,
  index,
  scrollY,
  onInnerScrollConsumed,
  onReadingScrollStart,
  hasNext = false,
  resetScrollKey = 0,
  children,
  status,
}: CardFrameProps) {
  const reduceMotion = useReducedMotion();
  const observed = observationLabel(card.asOf);
  const openLink = useOpenLink();

  // Only the explanatory prose can become an inner scroll region. The metric,
  // title and chart remain direct children of the pager, which gives every
  // touch one vertical owner from touch-down through release.
  const innerScroll = useInnerScrollReporter(index, onInnerScrollConsumed, onReadingScrollStart);
  const textScrollRef = useRef<ScrollView>(null);
  const previousResetScrollKey = useRef(resetScrollKey);

  useEffect(() => {
    if (previousResetScrollKey.current === resetScrollKey) return;
    previousResetScrollKey.current = resetScrollKey;
    textScrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [resetScrollKey]);

  const pageStart = index * itemHeight;
  const offset = useDerivedValue(() => {
    'worklet';
    if (index === 0 && scrollY.value <= 0) return 0;
    return scrollY.value - pageStart;
  });

  /**
   * The card arrives rather than appearing.
   *
   * This is the same interpolation the article reader uses, deliberately: the
   * app already taught the reader that a vertical swipe lifts the next thing
   * into place, and a card column that merely cut from one screen to the next
   * felt like a different app bolted on. The asymmetry is the whole effect —
   * the incoming card rises 14pt into position while the outgoing one leaves
   * only 6pt, so the motion reads as arrival rather than as a conveyor.
   *
   * Tracked off the finger, not fired on mount: with three pages held in the
   * list, a mount animation plays for a card two screens away and is over
   * before anyone sees it.
   */
  const arrival = useAnimatedStyle(() => {
    if (reduceMotion) return { opacity: 1 };
    const off = offset.value;
    return {
      opacity: interpolate(off, [-itemHeight, 0, itemHeight * 0.4], [0, 1, 0], Extrapolation.CLAMP),
      transform: [
        {
          translateY: interpolate(
            off,
            [-itemHeight * 0.3, 0, itemHeight * 0.4],
            [14, 0, -6],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  return (
    <View style={[styles.page, { height: itemHeight }]}>
      <View style={styles.column}>
        <Animated.View style={arrival} testID="card-page-header">
          {/* The kicker line, and on a gated card the one word that says
              why this screen exists. A disrupted strait is on screen because
              its data cleared a currentness gate; the
              nisab and the gold-to-silver ratio are standing reference that
              happens to have moved a little. Until this mark they arrived in
              identical weight, so the distinction was one the reader could
              only make by already knowing which cards the app gates.

              An ink step, not a colour and not opacity — DESIGN.md is
              explicit that quiet is ink, and the chromatic budget is already
              spent on the delta chip. Nested
              rather than a flex row so the two halves share a baseline and a
              screen reader gets one phrase. */}
          {card.lead || card.kicker || observed ? (
            <Text variant="labelXs" tone="secondary">
              {card.lead ? (
                <Text variant="labelXs" tone="emphasis">
                  {card.kicker || observed ? 'current · ' : 'current'}
                </Text>
              ) : null}
              {card.kicker}
              {card.kicker && observed ? ' · ' : null}
              {observed}
            </Text>
          ) : null}

          {status ? (
            <Text variant="labelXs" tone={status === 'updated' ? 'emphasis' : 'secondary'}>
              {status === 'updated'
                ? 'Updated since you last viewed'
                : status === 'viewed'
                  ? 'Previously viewed'
                  : 'New to you'}
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
        </Animated.View>

        {children ? (
          <Animated.View style={[styles.block, arrival]} testID="card-chart-region">
            {children}
          </Animated.View>
        ) : null}

        <View style={styles.analysisViewport} testID="card-text-region">
          <ScrollView
            ref={textScrollRef}
            style={styles.fill}
            pointerEvents={innerScroll.scrollable ? 'auto' : 'box-none'}
            showsVerticalScrollIndicator={innerScroll.scrollable}
            scrollEnabled={innerScroll.scrollable}
            nestedScrollEnabled
            onLayout={innerScroll.onLayout}
            onContentSizeChange={innerScroll.onContentSizeChange}
            onScrollBeginDrag={innerScroll.onScrollBeginDrag}
            onScrollEndDrag={innerScroll.onScrollEndDrag}
            onScroll={innerScroll.onScroll}
            scrollEventThrottle={16}
          >
            <Animated.View style={arrival}>
              {card.why ? <Text variant="body">{card.why}</Text> : null}

              {card.changed ? (
                <Text
                  variant="caption"
                  tone="secondary"
                  style={card.why ? styles.supporting : undefined}
                >
                  {card.changed}
                </Text>
              ) : null}

              {card.sourceLabel ? (
                <View style={styles.source}>
                  <SourceCaption label={card.sourceLabel} />
                </View>
              ) : null}
              {card.sources?.map((source) => (
                <Text
                  key={source.url}
                  variant="caption"
                  tone="secondary"
                  accessibilityRole="link"
                  onPress={() => openLink(source.url)}
                  style={styles.supporting}
                >
                  Source · {source.label}
                </Text>
              ))}
            </Animated.View>
            {innerScroll.scrollable && hasNext ? <OverflowEndCue /> : null}
          </ScrollView>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  page: { overflow: 'hidden' },
  fill: { flex: 1 },
  column: {
    flex: 1,
    paddingHorizontal: SPACING.articlePadding,
    paddingTop: SPACING.md,
    // Clears the BottomActionBar with room to spare. `SPACING.xxl` alone is
    // what `ArticlePage` uses and it is exactly the bar's height on a device
    // with a home indicator — zero buffer, which put the source caption
    // under the SHARE pill on the first card that scrolled. A card's last
    // element is a caption rather than prose, so it needs the extra tier.
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
  // `sm`, not `xs`. The magnitude is set in a variant with no letter-spacing
  // and the window beside it is small-caps that does have some, so a 4pt gap
  // rendered as "33%SINCE JUL 7" — the two ran together and the chip stopped
  // parsing as two things.
  delta: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  // The caret's glyph box centres on the line box, but the caps and figures
  // beside it sit in the upper half of theirs, so a centred triangle reads
  // low. One point up is the whole correction.
  // Pulled back against the gap above: the caret and the number it points at
  // are one unit and must not sit as far apart as the number and its window.
  deltaCaret: { marginBottom: 1, marginRight: -SPACING.xs },
  // The window is the least important half of the chip and the first thing
  // that may be dropped when the row wraps at large Dynamic Type.
  deltaWindow: { flexShrink: 1 },
  titleAfterMetric: { marginTop: SPACING.smPlus },
  titleBeforeMetric: { marginTop: SPACING.sm },
  block: { marginTop: SPACING.md },
  analysisViewport: { flex: 1, minHeight: 0, marginTop: SPACING.lg },
  supporting: { marginTop: SPACING.sm },
  source: { marginTop: SPACING.md },
});
