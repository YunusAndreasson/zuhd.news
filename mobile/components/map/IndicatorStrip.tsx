import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useReducedMotion } from 'react-native-reanimated';
import { MAX_FONT_SCALE, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { CONTROL_ROW } from '../../lib/deck-layout';
import { hapticTick } from '../../lib/haptics';
import type { StripItem } from '../../lib/now';
import { nearestOffsetIndex, sameOffsets, stripSnapOffsets } from '../../lib/strip-snap';
import { DeltaChip } from '../DeltaChip';
import { Icon, Pressable, Text } from '../primitives';

/**
 * The gauges above the earth, swiped sideways across `MapHeader`.
 *
 * The brief was "keep the indicators of whether things are going up and down
 * on the markets and straits, but put them at the top" — and then, having
 * lived with three fixed slots, "the rail should be swipeable, with markets,
 * straits and currencies all there, the most dramatic change at the left".
 *
 * **Every reading that moved this week, largest move first.** Every slot is
 * one quantity, the move over the past seven days (`gaugeMove`), so the sort is
 * a comparison. It used to sort each card's own delta, which put a strait's gap
 * from its 90-day normal beside an index's four sessions beside a currency's
 * whole series. A glance at the carets and their colour is
 * the whole read; the number is there for whoever stops.
 *
 * Slots grow to fit the full label and percentage without wrapping. A partial
 * slot at the edge signals that the row continues.
 *
 * **A swipe lands on a slot, never between two.** The row is sized for 3.4
 * slots across, so a clean boundary at both edges is impossible — four tenths
 * of a slot always falls somewhere. It falls at the right, where the partial
 * slot is the sign the row continues; the left edge is the one that is
 * guaranteed, and every rest position is a slot's own left edge, exactly where
 * the first slot sits at rest. The row used to stop wherever the finger left
 * it, so a fling routinely settled with the leftmost label cut mid-word
 * against the inset, which reads as broken rather than as a row with more in
 * it. The landings are measured rather than a pitch, because a longer name
 * widens its slot (`lib/strip-snap.ts`); the end of the row is the one landing
 * that is not a slot start, since the last slots begin past the furthest the
 * row can scroll and `all →` still has to be reachable.
 *
 * **Still no marquee.** The row moves when a finger moves it. A ticker moves
 * when nothing has happened, which is the engagement mechanic `foundation.md`
 * names in the list of things this is not.
 *
 * Each slot carries its label and week's percentage move on one line.
 * Absolute readings and graphs live in the detail sheet. Accessibility
 * speaks the common seven-day window per item without taking space in the row.
 *
 * **`all →` ends the row.** The instruments without a move — the nisab, the
 * contracts, the dates — and the full ranked list live in `InstrumentsSheet`,
 * and the end of a row that is sorted from loudest to quietest is where a
 * reader who wants more has already arrived. It used to sit under the NOW
 * block in the news sheet, which is for news.
 *
 * **The row is Gesture Handler's `ScrollView`, not React Native's.** The
 * globe's pan sits under the whole header, and Gesture Handler finds the
 * handlers for a touch by walking the views under the finger: a plain
 * `ScrollView` has none, so a drag that began between two slots, or on the
 * blank end of one, was never the row's — the row stayed put and the earth
 * turned. The wrapper puts a native handler on the row itself, which ends
 * that walk at the row (2026-09-19).
 *
 * Tapping a slot turns the planet to that mark and opens its card. That is
 * also how a reader learns the globe is addressable at all — the mapping is
 * created by the action, since nothing about a dot on a sphere announces it.
 * The slot stays marked, and the globe rings the place, for as long as its card
 * is open, so the reader can see which gauge the ring belongs to.
 *
 * **An open story marks the gauges it is tied to** — those whose desk
 * analysis cites it, or that it names (`linkedGaugeIds`) — with the same bar
 * in the story's category hue, and the row scrolls the first of them into
 * view. The order does not change: a row sorted by the size of the move is a
 * comparison, and pulling a slot forward for a story would break it.
 */

/** The mark under the slot whose card is open. Reserved on every slot, so
 *  selecting one does not move the row. */
const SELECTED_BAR = 2;
/** What the selection mark adds to a gauge's height, for `MapHeader`, which
 *  holds the row at a gauge's height before the gauges arrive. */
export const GAUGE_EXTRA = SPACING.xxs + SELECTED_BAR;

/** Minimum slot width rhythm; labels and moves may widen individual slots. */
const VISIBLE_SLOTS = 3.4;

const Slot = memo(function Slot({
  item,
  width,
  selected,
  linkedColor,
  onPress,
  onPlaced,
}: {
  item: StripItem;
  width: number;
  selected: boolean;
  /** The open story's hue, when this gauge is tied to it. */
  linkedColor?: string;
  onPress: (item: StripItem) => void;
  onPlaced: (id: string, x: number) => void;
}) {
  const { colors } = useTheme();
  const handlePress = useCallback(() => onPress(item), [item, onPress]);
  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => onPlaced(item.id, e.nativeEvent.layout.x),
    [item.id, onPlaced],
  );

  // Spoken as one sentence. A screen reader landing on separate numbers with
  // no subject is the strip's version of the globe's lottery-country problem,
  // and unlike the globe this one is cheap to fix.
  const spoken = [
    item.label,
    item.reading,
    item.readingNote,
    item.delta.direction !== 'flat'
      ? `${item.delta.direction} ${item.delta.magnitude}`
      : 'unchanged',
    item.delta.window,
    linkedColor ? 'in the open story' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      onPress={handlePress}
      haptic="none"
      style={[styles.slot, { minWidth: width }]}
      onLayout={handleLayout}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityState={{ selected }}
      accessibilityHint="Turns the globe to this and opens its card"
    >
      <View style={styles.value}>
        <Text
          variant="labelXsTight"
          numberOfLines={1}
          maxFontSizeMultiplier={MAX_FONT_SCALE.chrome}
        >
          {item.short}
        </Text>
        <DeltaChip delta={item.delta} window={false} scale={1} />
      </View>
      <View
        style={[
          styles.selected,
          {
            backgroundColor: selected ? colors.textEmphasis : (linkedColor ?? 'transparent'),
          },
        ]}
      />
    </Pressable>
  );
});

export const IndicatorStrip = memo(function IndicatorStrip({
  items,
  onSelect,
  onAll,
  selectedId = null,
  linkedIds,
  linkedColor,
  initialViewport,
}: {
  items: StripItem[];
  onSelect: (item: StripItem) => void;
  /** Opens every instrument as one ranked list. */
  onAll: () => void;
  /** The gauge whose card is open. */
  selectedId?: string | null;
  /** Gauges tied to the open story: marked in `linkedColor`, the first
   *  scrolled into view. */
  linkedIds?: ReadonlySet<string>;
  linkedColor?: string;
  /** The room the bar will leave, computed by the bar before layout, so the
   *  slots are not laid out at a guess and then resized once measured. */
  initialViewport?: number;
}) {
  // Sized from the room the bar actually leaves; `initialViewport` is the
  // bar's own arithmetic, and the layout pass only corrects it.
  const { width: screenWidth } = useWindowDimensions();
  const [viewport, setViewport] = useState(initialViewport ?? screenWidth / 2);
  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.width);
    setViewport((prev) => (prev === next ? prev : next));
  }, []);
  const slotWidth = Math.round((viewport - SPACING.md * Math.floor(VISIBLE_SLOTS)) / VISIBLE_SLOTS);

  const reduceMotion = useReducedMotion();
  const scrollRef = useRef<ScrollView>(null);
  const slotX = useRef(new Map<string, number>());
  // A slot placing itself is not news, so the offsets live in a ref — but the
  // recompute has to know they arrived. The row's own layout and its content's
  // size are both events on views *above* the slots, so either can reach JS
  // first and find nothing measured; this counts the slots that moved instead.
  // React batches a whole layout pass into one render, so twenty-odd slots
  // reporting together cost one.
  const [placements, setPlacements] = useState(0);
  const handlePlaced = useCallback((id: string, x: number) => {
    if (slotX.current.get(id) === x) return;
    slotX.current.set(id, x);
    setPlacements((n) => n + 1);
  }, []);

  // Where the row may come to rest. Each slot reports its own left edge as it
  // lays out, into a ref, because a slot placing itself is not news; what turns
  // those into reachable offsets is the content's width, and that arrives in
  // the same layout pass, so it is what the recompute hangs on.
  const [content, setContent] = useState(0);
  const [offsets, setOffsets] = useState<number[]>([]);
  const handleContentSize = useCallback((w: number) => {
    const next = Math.round(w);
    setContent((prev) => (prev === next ? prev : next));
  }, []);
  // The offset the row is resting on, and whether the row put itself there.
  const settled = useRef(0);
  const programmatic = useRef(false);
  // The last geometry the row scrolled itself against. A ref, not the state
  // above, so moving to a linked gauge does not have to re-run every time a
  // slot re-measures.
  const geometry = useRef<{ offsets: number[]; max: number }>({ offsets: [], max: 0 });
  const lastViewport = useRef(viewport);
  // biome-ignore lint/correctness/useExhaustiveDependencies: placements is an explicit invalidation — the slots' offsets are read from a ref
  useEffect(() => {
    const starts: number[] = [];
    for (const item of items) {
      const x = slotX.current.get(item.id);
      if (x !== undefined) starts.push(x);
    }
    const next = stripSnapOffsets(starts, content, viewport);
    // A fresh array every layout would re-push the whole list to the native
    // side for nothing.
    setOffsets((prev) => (sameOffsets(prev, next) ? prev : next));
    geometry.current = { offsets: next, max: Math.max(0, content - viewport) };
    // A rotation or a change of type size moves every landing, and the row was
    // resting on one of them. Put it back on the same slot rather than leaving
    // it cut between two — the offsets are only fresh here.
    if (lastViewport.current !== viewport) {
      lastViewport.current = viewport;
      const target = next[Math.min(settled.current, next.length - 1)] ?? 0;
      settled.current = nearestOffsetIndex(next, target);
      scrollRef.current?.scrollTo({ x: target, animated: false });
    }
  }, [items, content, viewport, placements]);

  // A tick says the row moved on. A scroll the row made itself records where it
  // landed and stays quiet: the press that caused it has already knocked once.
  const handleSettle = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      // Cleared first: a row short enough to need no landings still ends the
      // scroll it was sent on, and a flag left set would silence a real one.
      const quiet = programmatic.current;
      programmatic.current = false;
      if (offsets.length === 0) return;
      const index = nearestOffsetIndex(offsets, e.nativeEvent.contentOffset.x);
      if (index === settled.current) return;
      settled.current = index;
      if (!quiet) hapticTick();
    },
    [offsets],
  );

  // The first linked gauge, in the row's own order. A story tied to nothing
  // on the row leaves the row where the reader left it.
  const firstLinked = linkedIds?.size ? items.find((item) => linkedIds.has(item.id))?.id : null;
  useEffect(() => {
    if (!firstLinked) return;
    const x = slotX.current.get(firstLinked);
    if (x === undefined) return;
    // The slot's own left edge, which is a landing — it used to stop one gap
    // short of it, so a gauge brought into view sat 16pt in while the first
    // slot at rest sat flush. One vocabulary of rest positions now.
    const { offsets: known, max } = geometry.current;
    const target = Math.max(0, max > 0 ? Math.min(Math.round(x), max) : Math.round(x));
    settled.current = nearestOffsetIndex(known, target);
    // Only an animated scroll ends in a momentum event there is a tick to keep
    // quiet.
    programmatic.current = !reduceMotion;
    scrollRef.current?.scrollTo({ x: target, animated: !reduceMotion });
  }, [firstLinked, reduceMotion]);

  // Nothing to show is not a reason to draw an empty band over the globe. On
  // a cold launch, before trends and chokepoints resolve, the earth simply
  // starts clean.
  if (items.length === 0) return null;

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      // A flung row that runs past its end and springs back is the row
      // performing; it stops at the end and never past it.
      bounces={false}
      overScrollMode="never"
      // Where it stops in between: the nearest slot's own left edge. The
      // deceleration rate is left at the platform's own — a flick should carry
      // as far through a row of twenty-odd gauges as it does today, and only
      // the landing is decided here. `pagingEnabled` would be wrong for the
      // same reason: it pages by the viewport, which is 3.4 slots wide.
      snapToOffsets={offsets.length > 0 ? offsets : undefined}
      onContentSizeChange={handleContentSize}
      onMomentumScrollEnd={handleSettle}
      onLayout={handleLayout}
      contentContainerStyle={styles.row}
      accessibilityLabel="Markets, straits and currencies, largest move over seven days first"
    >
      {items.map((item) => (
        <Slot
          key={item.id}
          item={item}
          width={slotWidth}
          selected={item.id === selectedId}
          linkedColor={linkedIds?.has(item.id) ? linkedColor : undefined}
          onPress={onSelect}
          onPlaced={handlePlaced}
        />
      ))}
      <Pressable
        onPress={onAll}
        haptic="none"
        style={styles.all}
        accessibilityRole="button"
        accessibilityLabel="All instruments"
        accessibilityHint="Opens every market, strait, currency and contract as a ranked list"
      >
        <View style={styles.allRow}>
          <Text variant="labelXsTight" maxFontSizeMultiplier={MAX_FONT_SCALE.chrome}>
            all
          </Text>
          <Icon name="chevron-forward" size="sm" tone="secondary" />
        </View>
      </Pressable>
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  row: {
    // The row runs to the screen's right edge; its content stops on the column.
    paddingRight: SPACING.articlePadding,
    gap: SPACING.md,
  },
  slot: { minHeight: CONTROL_ROW, justifyContent: 'center' },
  value: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  selected: { height: SELECTED_BAR, marginTop: SPACING.xxs, borderRadius: SELECTED_BAR / 2 },
  // Match the single-line gauges, reserving their selection-bar space.
  all: { minHeight: CONTROL_ROW, justifyContent: 'center', paddingBottom: GAUGE_EXTRA },
  allRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
});
