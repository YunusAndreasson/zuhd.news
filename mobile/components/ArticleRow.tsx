import type { Category } from '@shared/types';
import { memo, useCallback, useMemo } from 'react';
import { SPACING, titleFontScale } from '../constants/theme';
import { formatTimeAgo } from '../lib/article-utils';
import { displayLocation } from '../lib/place-names';
import { Box, Pressable, Text } from './primitives';

interface ArticleRowProps {
  slug: string;
  title: string;
  addedAt: number;
  category: Category;
  location: string | null;
  /**
   * How many newsrooms covered this event.
   *
   * Optional, and deliberately supplied by `NewsIndex` alone. It is the sort
   * key of the news column (`lib/news-order.ts`), so on that list it explains
   * the order the reader is looking at — 140 above 119 above 116, all the way
   * down to the stories carrying no count at all, which sink. On the three
   * other lists this same row draws — search results, saved stories, the
   * related strips inside `EntitySheet` and `ChokepointSheet` — the ordering
   * is something else entirely, and a prominence number beside a list not
   * ranked by prominence would be the app asserting an order it does not
   * have. Absent there, and absent on the ~2 in 3 articles the feed ships
   * without one, where a `0` would read as "nobody covered it" rather than
   * "not counted".
   */
  eventCoverage?: number | null;
  onPress: (slug: string, category: Category) => void;
  onLongPress?: (slug: string) => void;
  delayLongPress?: number;
}

export const ArticleRow = memo(function ArticleRow({
  slug,
  title,
  addedAt,
  category,
  location,
  eventCoverage,
  onPress,
  onLongPress,
  delayLongPress = 400,
}: ArticleRowProps) {
  const titleScale = useMemo(() => titleFontScale(title.length), [title]);

  // `Pressable` merges its children for accessibility, so the meta line under
  // the headline is not announced at all — everything a screen reader gets
  // from this row is the label. The count is the one thing on the line that
  // is a judgement rather than a filing detail, so it goes in.
  const label = useMemo(
    () => (eventCoverage ? `${title}. Covered by ${eventCoverage} newsrooms.` : title),
    [title, eventCoverage],
  );

  const handlePress = useCallback(() => {
    onPress(slug, category);
  }, [slug, category, onPress]);

  const handleLongPress = useCallback(() => {
    onLongPress?.(slug);
  }, [slug, onLongPress]);

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={onLongPress ? handleLongPress : undefined}
      delayLongPress={delayLongPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Box paddingY="screenPadding" rule="bottom">
        <Text variant="title" scale={titleScale} numberOfLines={2}>
          {title}
        </Text>
        <Text variant="labelXs" style={{ marginTop: SPACING.xs }}>
          {category} · {formatTimeAgo(addedAt)}
          {location ? ` · ${displayLocation(location)}` : ''}
          {eventCoverage ? ` · ${eventCoverage} newsrooms` : ''}
        </Text>
      </Box>
    </Pressable>
  );
});
