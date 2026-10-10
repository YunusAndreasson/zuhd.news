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
import { MAX_FONT_SCALE, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { nearestIndex, sameItems } from '../../lib/arrays';
import { spokenDelta } from '../../lib/cards/format';
import { CONTROL_ROW } from '../../lib/deck-layout';
import { hapticSwipe } from '../../lib/haptics';
import type { StripItem } from '../../lib/now';
import { stripSnapOffsets } from '../../lib/strip-snap';
import { DeltaChip } from '../DeltaChip';
import { Pressable, Text } from '../primitives';

/** The week's ten largest moves, largest first, in one order wherever the
 * globe is and whatever story is in front. For a day the row followed the
 * globe and the story, and a row that changed under the reader on every
 * swipe was not one they could come back to (the user, 2026-10-10). The full
 * catalog is in the menu; the row does not end on a way into it.
 * Gesture Handler's ScrollView keeps strip swipes from turning the globe.
 */

/** The mark under the slot whose card is open. Reserved on every slot, so
 *  selecting one does not move the row. */
const SELECTED_BAR = 2;
/** What the selection mark adds to a gauge's height, for `MapHeader`, which
 *  holds the row at a gauge's height before the gauges arrive. */
export const GAUGE_EXTRA = SPACING.xxs + SELECTED_BAR;

/**
 * The room between two gauges. A gauge is its name over its move, so the two
 * that belong together are one above the other and a gap is only ever between
 * two different things: it has one job, and one size.
 *
 * The name and the move stood side by side, each slot padded out to a rhythm
 * of 3.4 to the row. A slot was then as wide as both together, a short name
 * carried up to 25pt of padding after it where a long one carried none, and
 * fewer than three were in view (the user, 2026-10-10: "a fairly large gap
 * between the different entities… room for more if we tighten in a smart
 * way"). Stacked, a slot is as wide as the wider of its two lines.
 */
const SLOT_GAP = SPACING.md;
/** Each slot's press reaches half the gap either side, so the targets meet
 *  and a short name (`Oil`) is not a target as narrow as its three letters. */
const SLOT_SLOP = { left: SLOT_GAP / 2, right: SLOT_GAP / 2 };

const Slot = memo(function Slot({
  item,
  selected,
  linked,
  onPress,
  onPlaced,
}: {
  item: StripItem;
  selected: boolean;
  /** Tied to the open story. Spoken, and not drawn: a bar under it only
   *  asked why it was there. */
  linked: boolean;
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
    item.short,
    // The index or the strait by name, after what the slot prints.
    item.short !== item.label ? item.label : null,
    item.reading,
    item.readingNote,
    spokenDelta(item.delta, { window: false }),
    item.delta.window,
    linked ? 'in the open story' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      onPress={handlePress}
      style={styles.slot}
      hitSlop={SLOT_SLOP}
      onLayout={handleLayout}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityState={{ selected }}
      accessibilityHint={
        item.coords ? 'Turns the globe to this and opens its card' : 'Opens its card'
      }
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
            backgroundColor: selected ? colors.textEmphasis : 'transparent',
          },
        ]}
      />
    </Pressable>
  );
});

export const IndicatorStrip = memo(function IndicatorStrip({
  items,
  onSelect,
  selectedId = null,
  linkedIds,
  initialViewport,
}: {
  items: StripItem[];
  onSelect: (item: StripItem) => void;
  /** The gauge whose card is open. */
  selectedId?: string | null;
  /** Gauges tied to the open story. A screen reader hears it; the row does not
   *  move or mark them. */
  linkedIds?: ReadonlySet<string>;
  /** The room the bar will leave, computed by the bar before layout, so the
   *  row's landings are not worked out against a guess and then again. */
  initialViewport?: number;
}) {
  // The room the bar actually leaves, for where the row may come to rest;
  // `initialViewport` is the bar's own arithmetic, and the layout pass only
  // corrects it.
  const { width: screenWidth } = useWindowDimensions();
  const [viewport, setViewport] = useState(initialViewport ?? screenWidth / 2);
  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.width);
    setViewport((prev) => (prev === next ? prev : next));
  }, []);

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
    setOffsets((prev) => (sameItems(prev, next) ? prev : next));
    geometry.current = { offsets: next, max: Math.max(0, content - viewport) };
    // A rotation or a change of type size moves every landing, and the row was
    // resting on one of them. Put it back on the same slot rather than leaving
    // it cut between two — the offsets are only fresh here.
    if (lastViewport.current !== viewport) {
      lastViewport.current = viewport;
      const target = next[Math.min(settled.current, next.length - 1)] ?? 0;
      settled.current = nearestIndex(next, target);
      scrollRef.current?.scrollTo({ x: target, animated: false });
    }
  }, [items, content, viewport, placements]);

  // A tick says the row moved on under a finger. A scroll the row made itself
  // records where it landed and stays quiet: no finger swiped it.
  const handleSettle = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      // Cleared first: a row short enough to need no landings still ends the
      // scroll it was sent on, and a flag left set would silence a real one.
      const quiet = programmatic.current;
      programmatic.current = false;
      if (offsets.length === 0) return;
      const index = nearestIndex(offsets, e.nativeEvent.contentOffset.x);
      if (index === settled.current) return;
      settled.current = index;
      if (!quiet) hapticSwipe();
    },
    [offsets],
  );

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
      // same reason: it pages by the viewport, which is several slots wide.
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
          selected={item.id === selectedId}
          linked={linkedIds?.has(item.id) ?? false}
          onPress={onSelect}
          onPlaced={handlePlaced}
        />
      ))}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  row: {
    // The row runs to the screen's right edge; its content stops on the column.
    paddingRight: SPACING.articlePadding,
    gap: SLOT_GAP,
  },
  slot: { minHeight: CONTROL_ROW, justifyContent: 'center' },
  // The name over its move, both from the slot's left edge: the two lines'
  // own leading is the air between them.
  value: { alignItems: 'flex-start' },
  selected: { height: SELECTED_BAR, marginTop: SPACING.xxs, borderRadius: SELECTED_BAR / 2 },
});
