import { memo, type ReactNode, useCallback, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
} from 'react-native-reanimated';
import { MAX_FONT_SCALE, SPACING, titleFontScale } from '../../constants/theme';
import type { CardDelta, GraphCard } from '../../lib/cards/types';
import { SourceCaption } from '../blocks/SourceCaption';
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

/** The column's own vertical padding — `paddingTop` plus `paddingBottom` from
 *  `styles.column`. It sits on the ScrollView's content container, outside the
 *  view whose height `onContentLayout` measures, so any comparison between
 *  that height and the page has to add it back. Kept beside the style it
 *  mirrors; the two must move together. */
const COLUMN_PAD_V = SPACING.md + (SPACING.xxl + SPACING.md);

/** A reading that has grown past ~11 characters ("10,086,781") no longer fits
 *  the phone at full scale, and shrinking the type is better than truncating a
 *  number — a famine figure missing its last digit is a different figure. */
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
  card: GraphCard;
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
  card: GraphCard;
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
  card: GraphCard;
  /** Full page height. The card owns the whole screen, like an article does. */
  itemHeight: number;
  /** This card's position in the column, for the arrival animation. */
  index: number;
  /** The column's scroll offset, shared with the UI thread. */
  scrollY: SharedValue<number>;
  /** Reports that this card consumed part of a vertical gesture before the
   * parent pager saw its remainder. */
  onInnerScrollConsumed?: (index: number) => void;
  /** The block that makes this card its kind — a chart, rows, figures. */
  children?: ReactNode;
}

export const CardFrame = memo(function CardFrame({
  card,
  itemHeight,
  index,
  scrollY,
  onInnerScrollConsumed,
  children,
}: CardFrameProps) {
  const reduceMotion = useReducedMotion();

  /**
   * The inner column only scrolls when it has to.
   *
   * The comment below has always claimed that at default type nothing
   * scrolls, and it was not true: a card an inch taller than the page scrolls,
   * and because `nestedScrollEnabled` only hands the gesture back *at the
   * ends*, the first swipe up on such a card scrolled its last inch into view
   * instead of paging to the next card. The reader's swipe did something —
   * just not the thing the app spent two axes teaching them it does.
   *
   * So the scroll view is switched off until the content is measurably taller
   * than the page it sits in. Then every swipe on a card that fits belongs to
   * the pager, which is the behaviour the rest of the app has.
   */
  const [scrollable, setScrollable] = useState(false);
  const innerStartY = useRef(0);
  const innerConsumed = useRef(false);
  const innerDragging = useRef(false);
  const onContentLayout = useCallback(
    (e: LayoutChangeEvent) => {
      // `COLUMN_PAD_V` is added because the padding is *not* inside the
      // measured view, whatever the comment here used to claim. It lives on
      // the ScrollView's `contentContainerStyle`, which is the measured view's
      // parent — so the layout height read here is 80pt shorter than the
      // content the scroll view actually holds.
      //
      // The consequence was a silent one, which is why it survived: a card
      // whose content landed inside that 80pt band measured as fitting, so the
      // scroll never armed, and the last 80pt was clipped by `styles.page`
      // with no gesture able to reach it. The Kerch Strait card lost the tail
      // of its closing sentence and its source caption entirely — a card
      // citing IMF PortWatch that never said so. A card that overflows is
      // supposed to scroll; this made it silently truncate instead.
      //
      // One point of slack absorbs sub-pixel rounding, which would otherwise
      // arm the scroll view on a card that fits exactly.
      const needed = e.nativeEvent.layout.height + COLUMN_PAD_V > itemHeight + 1;
      setScrollable((was) => (was === needed ? was : needed));
    },
    [itemHeight],
  );
  const onInnerBeginDrag = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    innerDragging.current = true;
    innerStartY.current = e.nativeEvent.contentOffset.y;
    innerConsumed.current = false;
  }, []);
  const onInnerEndDrag = useCallback(() => {
    innerDragging.current = false;
  }, []);
  const onInnerScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (
        !innerDragging.current ||
        innerConsumed.current ||
        Math.abs(e.nativeEvent.contentOffset.y - innerStartY.current) <= 1
      )
        return;
      innerConsumed.current = true;
      onInnerScrollConsumed?.(index);
    },
    [index, onInnerScrollConsumed],
  );

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
      {/* A card can outgrow the page at large Dynamic Type — the parts are
          prose, not a fixed layout — so the column scrolls rather than
          clipping part four, which is the part worth reading. At default type
          nothing scrolls. `nestedScrollEnabled` hands the gesture back to the
          vertical pager at the ends. */}
      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.column}
        showsVerticalScrollIndicator={false}
        scrollEnabled={scrollable}
        onScrollBeginDrag={onInnerBeginDrag}
        onScrollEndDrag={onInnerEndDrag}
        onScroll={onInnerScroll}
        scrollEventThrottle={16}
        // `nestedScrollEnabled`, and the comment that used to sit here argued
        // the opposite. It was right about the failure it feared and wrong
        // about the cost of avoiding it.
        //
        // The fear: handing the leftover of a swipe to the pager is how this
        // column once parked itself between two pages — the parent moves
        // without ever having been dragged, so `pagingEnabled`, which only
        // snaps a gesture the list received itself, has nothing to snap.
        //
        // The cost, measured on a device rather than reasoned about: Android
        // defaults nested scrolling to *off*, so the parent list intercepted
        // every vertical drag and this ScrollView never received one at all.
        // `scrollEnabled` was moot. A card taller than the page did not scroll
        // — it silently truncated, clipped by `styles.page`. Four cards did it
        // at default type (the Kerch strait, the fifteen-currency table, the
        // nisab, wheat-and-rice), and each lost its source caption, so a card
        // citing IMF PortWatch never said so. Truncating the attribution is
        // worse than any gesture awkwardness.
        //
        // What makes it safe is `CardPager`'s `settleToPage`, which was built
        // for exactly this arrival: a drag end arms the check, momentum
        // starting disarms it, momentum ending runs it, and a timer catches a
        // scroll that stopped dead between two pages. That is the guard
        // `mobile/CLAUDE.md` calls the one that "makes it impossible" — it
        // exists, and this is the case it exists for.
        //
        // The remaining cost is one extra swipe to leave a card that scrolls:
        // the first reaches the end of the table, the second pages. That is
        // what every list-inside-a-pager does, and it is legible in a way that
        // a sentence cut off mid-word is not.
        nestedScrollEnabled
      >
        <View onLayout={onContentLayout}>
          <Animated.View style={arrival}>
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
            {card.lead || card.kicker ? (
              <Text variant="labelXs" tone="secondary">
                {card.lead ? (
                  <Text variant="labelXs" tone="emphasis">
                    {card.kicker ? 'current · ' : 'current'}
                  </Text>
                ) : null}
                {card.kicker}
              </Text>
            ) : null}

            {/* Measurements answer first; a belief asks first. A bare “62%”
                is not a useful fact until the reader knows which outcome it
                prices, while “$89 a barrel” is already self-describing. */}
            {card.kind === 'belief' ? (
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
            <Animated.View style={[styles.block, arrival]}>{children}</Animated.View>
          ) : null}

          <Animated.View style={[styles.analysis, arrival]}>
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
          </Animated.View>
        </View>
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  page: { overflow: 'hidden' },
  fill: { flex: 1 },
  column: {
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
  analysis: { marginTop: SPACING.lg },
  supporting: { marginTop: SPACING.sm },
  source: { marginTop: SPACING.md },
});
