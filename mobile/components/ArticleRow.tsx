import { memo, useCallback, useMemo } from 'react';
import { SPACING, titleFontScale } from '../constants/theme';
import { formatTimeAgo } from '../lib/article-utils';
import { displayLocation } from '../lib/place-names';
import type { Category } from '../types';
import { Box, Pressable, Text } from './primitives';

interface ArticleRowProps {
  slug: string;
  title: string;
  addedAt: number;
  category: Category;
  location: string | null;
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
  onPress,
  onLongPress,
  delayLongPress = 400,
}: ArticleRowProps) {
  const titleScale = useMemo(() => titleFontScale(title.length), [title]);

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
      accessibilityLabel={title}
    >
      <Box paddingY="screenPadding" rule="bottom">
        <Text variant="title" scale={titleScale} numberOfLines={2}>
          {title}
        </Text>
        <Text variant="labelXs" style={{ marginTop: SPACING.xs }}>
          {category} · {formatTimeAgo(addedAt)}
          {location ? ` · ${displayLocation(location)}` : ''}
        </Text>
      </Box>
    </Pressable>
  );
});
