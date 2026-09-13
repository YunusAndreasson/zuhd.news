import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { type LayoutChangeEvent, type ScrollView, StyleSheet, View } from 'react-native';
import { categoryMarkColor, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import type { StoryRow } from '../lib/map-feed';
import type { NowItem } from '../lib/now';
import { FeedRow } from './map/FeedRow';
import { Text } from './primitives';
import { SheetScrollView } from './SheetContent';
import { type BaseSheetProps, SheetLayout } from './SheetLayout';

/**
 * Every story, as a list — a place to jump from, not the way in.
 *
 * The sheet over the globe used to *be* this list, and a list of three-to-
 * five-word headlines turned out to be a poor front door: nothing in a title
 * says why it is worth opening. The front door is the story card now. This is
 * what a reader reaches for to scan the whole day, or to get to the story the
 * swipe would take twenty cards to reach.
 *
 * **Its header holds the menu** — settings and pages — at the trailing edge.
 * The top bar gave that button a fixed slot beside the gauges on every glance;
 * here it is one tap from the list a reader already opens for the rest of the
 * day.
 *
 * It is also the accessible path. The globe is hidden from screen readers, so
 * every live Red alert and every story has a row here.
 *
 * Rows are not indexed by any camera, so they take their natural height and a
 * long headline wraps instead of clamping.
 */

interface IndexSheetProps extends BaseSheetProps {
  rows: StoryRow[];
  now: NowItem[];
  found: ReadonlySet<string>;
  /** The story on the card under the sheet. Marked, so a reader twenty
   *  swipes in can see where they are in the day. */
  currentSlug: string | null;
  /** The sheet is presented — the moment to bring the current row into view. */
  open: boolean;
  onSelect: (slug: string) => void;
  onNowPress: (item: NowItem) => void;
  /** Settings and pages, from the sheet's header. */
  onMenuPress: () => void;
}

/** The ink step on the row whose story is on the card. */
const CURRENT_MARK = 'on the card';

const StoryIndexRow = memo(function StoryIndexRow({
  row,
  found,
  current,
  onPress,
  onLayoutRow,
}: {
  row: StoryRow;
  found: boolean;
  current: boolean;
  onPress: (slug: string) => void;
  onLayoutRow: (slug: string, y: number) => void;
}) {
  const { colors } = useTheme();
  const handlePress = useCallback(() => onPress(row.slug), [onPress, row.slug]);
  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => onLayoutRow(row.slug, e.nativeEvent.layout.y),
    [onLayoutRow, row.slug],
  );
  const label = [row.title, current ? CURRENT_MARK : null, found ? 'found' : null]
    .filter(Boolean)
    .join(', ');
  return (
    <View onLayout={handleLayout}>
      <FeedRow
        title={row.title}
        meta={row.meta}
        mark={current ? CURRENT_MARK : row.mark}
        odds={row.odds}
        found={found}
        hue={categoryMarkColor(row.article.category, colors)}
        onPress={handlePress}
        accessibilityLabel={label}
        accessibilityHint={
          row.odds ? `Shows the story. Traders price this at ${row.odds}` : 'Shows the story'
        }
      />
    </View>
  );
});

const NowIndexRow = memo(function NowIndexRow({
  item,
  onPress,
}: {
  item: NowItem;
  onPress: (item: NowItem) => void;
}) {
  const handlePress = useCallback(() => onPress(item), [item, onPress]);
  return (
    <FeedRow
      title={item.title}
      meta={item.kicker}
      mark="current"
      onPress={handlePress}
      accessibilityLabel={`${item.title}, ${item.kicker}`}
      accessibilityHint="Opens the alert"
    />
  );
});

export const IndexSheet = memo(function IndexSheet({
  sheetRef,
  bottomInset,
  onDismiss,
  rows,
  now,
  found,
  currentSlug,
  open,
  onSelect,
  onNowPress,
  onMenuPress,
}: IndexSheetProps) {
  // Opened twenty stories in, the list used to start at the top, and the
  // reader had to find their place in the day by hand. It opens with the row
  // above the current one at the top instead, so what came just before is in
  // view too. Offsets are collected as rows lay out; whichever of the row and
  // the sheet arrives second does the scroll.
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef(new Map<string, number>());
  const scrolledFor = useRef<string | null>(null);
  // Held in refs so the layout callback stays stable: a callback that changed
  // with the current slug would re-render every row on every swipe of the deck.
  const stateRef = useRef({ open, currentSlug, rows });
  stateRef.current = { open, currentSlug, rows };
  const scrollToCurrent = useCallback(() => {
    const { open: isOpen, currentSlug: slug, rows: list } = stateRef.current;
    if (!isOpen || !slug || scrolledFor.current === slug) return;
    const y = offsets.current.get(slug);
    if (y === undefined) return;
    const index = list.findIndex((r) => r.slug === slug);
    const above = index > 0 ? offsets.current.get(list[index - 1]?.slug ?? '') : undefined;
    scrollRef.current?.scrollTo({ y: above ?? y, animated: false });
    scrolledFor.current = slug;
  }, []);
  const handleLayoutRow = useCallback(
    (slug: string, y: number) => {
      offsets.current.set(slug, y);
      if (slug === stateRef.current.currentSlug) scrollToCurrent();
    },
    [scrollToCurrent],
  );
  useEffect(() => {
    if (!open) {
      scrolledFor.current = null;
      return;
    }
    if (currentSlug) scrollToCurrent();
  }, [currentSlug, open, scrollToCurrent]);

  // Stable, so the memoised sheet does not re-render on every parent render.
  const menuAction = useMemo(
    () => ({ icon: 'menu' as const, label: 'Settings and pages', onPress: onMenuPress }),
    [onMenuPress],
  );

  return (
    <SheetLayout
      sheetRef={sheetRef}
      onDismiss={onDismiss}
      handleTitle="today"
      handleAction={menuAction}
    >
      <SheetScrollView ref={scrollRef} bottomInset={bottomInset}>
        {now.length > 0 ? (
          <>
            <Text variant="labelXs" tone="emphasis" style={styles.heading}>
              now
            </Text>
            {now.map((item) => (
              <NowIndexRow key={item.id} item={item} onPress={onNowPress} />
            ))}
            <Text variant="labelXs" tone="emphasis" style={styles.heading}>
              stories
            </Text>
          </>
        ) : null}
        {rows.map((row) => (
          <StoryIndexRow
            key={row.slug}
            row={row}
            found={found.has(row.slug)}
            current={row.slug === currentSlug}
            onPress={onSelect}
            onLayoutRow={handleLayoutRow}
          />
        ))}
      </SheetScrollView>
    </SheetLayout>
  );
});

const styles = StyleSheet.create({
  heading: { paddingTop: SPACING.md, paddingBottom: SPACING.xs },
});
