import { memo, useCallback } from 'react';
import { StyleSheet } from 'react-native';
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
  onSelect: (slug: string) => void;
  onNowPress: (item: NowItem) => void;
}

const StoryIndexRow = memo(function StoryIndexRow({
  row,
  found,
  onPress,
}: {
  row: StoryRow;
  found: boolean;
  onPress: (slug: string) => void;
}) {
  const { colors } = useTheme();
  const handlePress = useCallback(() => onPress(row.slug), [onPress, row.slug]);
  return (
    <FeedRow
      title={row.title}
      meta={row.meta}
      mark={row.mark}
      odds={row.odds}
      found={found}
      hue={categoryMarkColor(row.article.category, colors)}
      onPress={handlePress}
      accessibilityLabel={found ? `${row.title}, found` : row.title}
      accessibilityHint={
        row.odds ? `Shows the story. Traders price this at ${row.odds}` : 'Shows the story'
      }
    />
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
  onSelect,
  onNowPress,
}: IndexSheetProps) {
  return (
    <SheetLayout sheetRef={sheetRef} onDismiss={onDismiss} handleTitle="today">
      <SheetScrollView bottomInset={bottomInset}>
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
          <StoryIndexRow key={row.slug} row={row} found={found.has(row.slug)} onPress={onSelect} />
        ))}
      </SheetScrollView>
    </SheetLayout>
  );
});

const styles = StyleSheet.create({
  heading: { paddingTop: SPACING.md, paddingBottom: SPACING.xs },
});
