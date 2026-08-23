import { memo, type ReactNode, useCallback, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
} from 'react-native-reanimated';
import { MAX_FONT_SCALE, OPACITY, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import type { Card } from '../../lib/cards/types';
import { CLOSE_GUTTER } from '../BackToIndexButton';
import { SourceCaption } from '../blocks/SourceCaption';
import { Pressable, Text } from '../primitives';
import { DeltaChip } from './DeltaChip';

/**
 * The five-part anatomy, as a component.
 *
 * Every card in `markets` and `conditions` is this shell with one block in the
 * middle. The order is not decoration — it is the reading order a person
 * actually uses: the number at arm's length, then what it did, then what it
 * is, then why it reaches them, then which of today's stories it touches.
 *
 * Rendered order, which is no longer the order the parts are numbered in:
 *
 *   kicker → reading + note + delta   part 1
 *   title
 *   block                             the chart, table or figures
 *   changed                           part 3
 *   whatItIs                          part 2
 *   why                               part 4
 *   related, source
 *
 * Part two is the odd one, and it is deliberate. It is the only part of a card
 * that is the same sentence tomorrow — what a barrel of crude *is* does not
 * move — and directly under the title it was the first prose a reader met, so
 * an app opened every morning led with its most static text and made the
 * reader travel through it to reach the part that had news in it. Below the
 * block it is still one scroll from the reading, which is where a reader who
 * has never met this indicator will look, and out of the way of one who has
 * met it forty times. The numbering is left alone because `types.ts` and
 * DESIGN.md describe the anatomy, not the sequence.
 *
 * Part four is the one that justifies the section existing. Without it a card
 * is a tile on a dashboard; with it the reader learns something they can
 * repeat. It is written by the pipeline (`standing`), never composed here.
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
 * One pointer from a card into today's corpus.
 *
 * Part five named two headlines and then did nothing with them: they rendered
 * as plain `Text`, so the one place a card says "this number is in that story"
 * was the one place a reader could not follow it. Getting there meant
 * remembering the headline, crossing to `news` and swiping the river until it
 * turned up.
 *
 * It stays a caption rather than becoming an `ArticleRow` — the sheets can
 * afford that row's title-sized type and screen-padding gutters, a card that
 * has to fit five parts on one page cannot. What it borrows from the row is
 * the behaviour: a real button, a tick, and the title as its label.
 *
 * Non-interactive when no handler reaches it, on `SourceRow`'s rule — a row
 * with nothing behind it is not a control, and announcing one to a screen
 * reader is worse than announcing none.
 */
const RelatedRow = memo(function RelatedRow({
  slug,
  title,
  onPress,
}: {
  slug: string;
  title: string;
  onPress?: (slug: string) => void;
}) {
  const handlePress = useCallback(() => onPress?.(slug), [onPress, slug]);
  const body = (
    <Text variant="caption" tone="default" style={styles.relatedRow}>
      {title}
    </Text>
  );
  if (!onPress) return body;
  return (
    <Pressable
      haptic="tick"
      onPress={handlePress}
      hitSlop={{ top: 4, bottom: 4, left: 16, right: 16 }}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      {body}
    </Pressable>
  );
});

interface CardFrameProps {
  card: Card;
  /** Full page height. The card owns the whole screen, like an article does. */
  itemHeight: number;
  /** This card's position in the column, for the arrival animation. */
  index: number;
  /** The column's scroll offset, shared with the UI thread. */
  scrollY: SharedValue<number>;
  /** The block that makes this card its kind — a chart, rows, figures. */
  children?: ReactNode;
  /** Open one of the stories part five names. Absent where nothing can
   *  navigate, which is what makes those rows render as plain text. */
  onArticlePress?: (slug: string) => void;
  /**
   * Where this card's own scroll sits, reported up to the pull-to-close.
   *
   * Only a card taller than the page scrolls at all — `scrollable` below — and
   * only the card on screen can be touched, so a card that fits never writes
   * and this stays zero, which is what arms the gesture. A reader who has
   * scrolled a tall card down and drags down again is scrolling back up
   * through their own content, and closing the card under them would be the
   * worst thing this feature could do. `CardPager` resets it on every settle.
   */
  innerOffset?: SharedValue<number>;
}

export const CardFrame = memo(function CardFrame({
  card,
  itemHeight,
  index,
  scrollY,
  children,
  onArticlePress,
  innerOffset,
}: CardFrameProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const readingScale = card.reading.length > LONG_READING ? LONG_READING_SCALE : READING_SCALE;

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
  const innerScrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      'worklet';
      if (innerOffset) innerOffset.value = e.contentOffset.y;
    },
  });

  const [scrollable, setScrollable] = useState(false);
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

  /**
   * The middle dot between the unit and the move, when there is a move.
   *
   * `readingMeta` wraps, and a separator is a statement about two things
   * sharing a line — so on the one card whose unit fills the row ("ounces of
   * silver to one of gold") the dot stayed behind on line one with nothing
   * after it, pointing at a blank margin, while the chip it was separating
   * sat on line two. It is spent rather than unmounted: dropping it would
   * return ~20pt to line one, which could un-wrap the row, which would bring
   * the dot back, which would wrap it again. Keeping the width makes the
   * measurement a fixed point.
   *
   * The threshold is half the chip's own height rather than a constant. Under
   * `alignItems: 'center'` an unwrapped chip sits at y ≈ 0 because it is the
   * tallest thing in the row; for a shorter chip to clear half its own height
   * the label beside it would have to be taller than the chip by more than the
   * chip, which two single-line labels cannot do at any Dynamic Type setting.
   */
  const [deltaWrapped, setDeltaWrapped] = useState(false);
  const onDeltaLayout = useCallback((e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    const wrapped = y > height / 2;
    setDeltaWrapped((was) => (was === wrapped ? was : wrapped));
  }, []);

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
      <Animated.ScrollView
        style={styles.fill}
        contentContainerStyle={styles.column}
        showsVerticalScrollIndicator={false}
        scrollEnabled={scrollable}
        // Reports this card's own scroll to the pull-to-close — see
        // `innerOffset`. A worklet rather than a JS callback so a card that
        // scrolls costs nothing extra on the thread the globe is budgeted on.
        onScroll={innerScrollHandler}
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
              why this screen exists. A condition card and a disrupted strait
              are on screen because their data changed this morning; the
              nisab and the gold-to-silver ratio are standing reference that
              happens to have moved a little. Until this mark they arrived in
              identical weight, so the distinction was one the reader could
              only make by already knowing which cards the app gates.

              An ink step, not a colour and not opacity — DESIGN.md is
              explicit that quiet is ink, and the chromatic budget is already
              spent on the delta chip and on `colors.determination`. Nested
              rather than a flex row so the two halves share a baseline and a
              screen reader gets one phrase. */}
            {/* The kicker is level with the back control on every card,
              scrolling or not, so it keeps the gutter unconditionally. It
              costs nothing: the longest kicker in the app is four short words
              of small caps and stops less than halfway across. */}
            <Text variant="labelXs" tone="secondary" style={styles.gutter}>
              {card.lead ? (
                <Text variant="labelXs" tone="emphasis">
                  {'today · '}
                </Text>
              ) : null}
              {card.kicker}
            </Text>

            {/* The reading and its note read as one unit: a number and the
              thing it counts. Kept adjacent with no gap so they do not read
              as two facts. */}
            <Text
              variant="display"
              tone={
                card.kind === 'condition' && card.emphasis === 'determination'
                  ? 'determination'
                  : 'emphasis'
              }
              scale={readingScale}
              style={styles.reading}
              maxFontSizeMultiplier={MAX_FONT_SCALE.tabular}
              accessibilityRole="header"
            >
              {card.reading}
            </Text>
            {/* The unit and the move on one line. They belong to the number
              directly above them rather than to each other, and giving each
              its own row spent two lines of a screen that has five parts to
              fit — the divider is enough to keep them apart. */}
            {card.readingNote || card.delta ? (
              <View style={styles.readingMeta}>
                {card.readingNote ? (
                  // Two lines, not one. The note is the only place some cards
                  // name their window — the strait's reads "ships a day, week
                  // to 16 Aug" — and at a raised Dynamic Type setting a
                  // one-line clamp takes the tail, which is the date. The card
                  // then still carries the `today ·` mark with nothing saying
                  // which week it counted, which is the exact silence the note
                  // was added to break. Nothing changes at default type: every
                  // note in the app fits on one line there.
                  <Text variant="labelSm" tone="secondary" numberOfLines={2}>
                    {card.readingNote}
                  </Text>
                ) : null}
                {card.readingNote && card.delta ? (
                  <Text
                    variant="labelSm"
                    tone="secondary"
                    style={deltaWrapped ? styles.separatorSpent : undefined}
                  >
                    ·
                  </Text>
                ) : null}
                {card.delta ? (
                  <View onLayout={onDeltaLayout}>
                    <DeltaChip delta={card.delta} />
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* The title takes the gutter only on a card that scrolls, which
              is the only card whose title ever travels up to the control's
              line. Reserving it unconditionally would cost 42pt of the widest
              line on every card in the app to fix a state most of them can
              never enter — and this title wraps rather than truncates, so the
              bill would be paid in second lines. */}
            <Text
              variant="title"
              tone="default"
              style={[styles.title, scrollable && styles.gutter]}
            >
              {card.title}
            </Text>
          </Animated.View>

          {children ? (
            <Animated.View style={[styles.block, arrival]}>{children}</Animated.View>
          ) : null}

          <Animated.View style={arrival}>
            {card.changed ? (
              <Text variant="bodyEmphasis" style={styles.part}>
                {card.changed}
              </Text>
            ) : null}

            {/* The definition, and it sits *below* the block rather than
              between the title and it.

              This is the one part of a card that does not change. The reading
              is new every morning, `changed` is new every morning, the related
              stories are today's — and this sentence is the same sentence it
              was yesterday, because what a barrel of crude *is* does not move.
              Directly under the title it was the first prose a reader met, so
              an app opened every day showed its most static text first and
              made the reader scroll past it to reach the part that had news in
              it. On `outlook`'s top card that cost was paid twice over: the
              generic explanation of a prediction contract, every morning,
              above the chart that had actually moved.

              Below the block it is still one screen from the reading and still
              ahead of `standing`, so a reader who has never met this indicator
              finds it exactly where the unfamiliar number sent them — one
              scroll down — while a reader who has met it forty times never has
              to travel through it. Same words, same card, ordered by how often
              they are worth reading. */}
            {card.whatItIs ? (
              <Text variant="body" tone="accent" style={styles.part}>
                {card.whatItIs}
              </Text>
            ) : null}

            {/* Part four. Set apart by a rule rather than a heading — it is a
              different kind of sentence from everything above it (standing
              knowledge, not today's reading) and the reader should feel the
              gear change without being told about it. */}
            {card.why ? (
              <View style={styles.why}>
                <View style={[styles.rule, { backgroundColor: colors.rule }]} />
                {/* Whose paragraph this is, when the card holds more than one
                  thing. Same small-caps register as the related-stories
                  header, because it does the same job: it labels the block
                  under it rather than saying anything itself. Absent on a
                  single-instrument card, where the title is already the
                  answer. */}
                {card.whyLabel ? (
                  <Text variant="labelXs" tone="secondary" style={styles.whyLabel}>
                    {card.whyLabel}
                  </Text>
                ) : null}
                <Text variant="body">{card.why}</Text>
              </View>
            ) : null}

            {card.related && card.related.length > 0 ? (
              <View style={styles.related}>
                <Text variant="labelXs" tone="secondary">
                  {`in ${card.related.length} of today's stories`}
                </Text>
                {card.related.map((r) => (
                  <RelatedRow key={r.slug} slug={r.slug} title={r.title} onPress={onArticlePress} />
                ))}
              </View>
            ) : null}

            {card.sourceLabel ? (
              <View style={styles.source}>
                <SourceCaption label={card.sourceLabel} />
              </View>
            ) : null}
          </Animated.View>
        </View>
      </Animated.ScrollView>
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
  readingMeta: {
    marginTop: SPACING.xxs,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  // Invisible, not absent — see `deltaWrapped`. Removing it from the layout
  // would change the wrap it was measured from, which is why this is an
  // opacity tier and not a conditional render.
  separatorSpent: { opacity: OPACITY.hidden },
  title: { marginTop: SPACING.smPlus },
  /** Keeps a header line clear of the pinned back control. See `CLOSE_SIZE`. */
  gutter: { paddingRight: CLOSE_GUTTER },
  part: { marginTop: SPACING.smPlus },
  block: { marginTop: SPACING.smPlus },
  why: { marginTop: SPACING.md },
  rule: { height: 1, marginBottom: SPACING.md },
  whyLabel: { marginBottom: SPACING.xs },
  related: { marginTop: SPACING.md, gap: SPACING.xxs },
  relatedRow: { marginTop: SPACING.xxs },
  source: { marginTop: SPACING.md },
});
