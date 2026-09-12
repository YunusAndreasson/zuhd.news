import type { Category } from '@shared/types';
import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { categoryMarkColor, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { formatTimeAgo } from '../lib/article-utils';
import { displayLocation } from '../lib/place-names';
import { Box, Pressable, Text } from './primitives';

interface ArticleRowProps {
  slug: string;
  title: string;
  /** When the story happened — `articleTime(article)`, never `addedAt`, which
   *  is one value per editorial cycle. */
  time: number;
  category: Category;
  location: string | null;
  onPress: (slug: string, category: Category) => void;
  onLongPress?: (slug: string) => void;
  delayLongPress?: number;
}

export const ArticleRow = memo(function ArticleRow({
  slug,
  title,
  time,
  category,
  location,
  onPress,
  onLongPress,
  delayLongPress = 400,
}: ArticleRowProps) {
  const { colors } = useTheme();

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
        {/* `rowTitle`, like the sheet's river: a list of headlines is one
            tier under the story it opens. The dot is the story's globe hue. */}
        <Text variant="rowTitle" numberOfLines={2}>
          {title}
        </Text>
        <View style={styles.meta}>
          <View style={[styles.dot, { backgroundColor: categoryMarkColor(category, colors) }]} />
          <Text variant="labelXs" numberOfLines={1} style={styles.metaText}>
            {category} · {formatTimeAgo(time)}
            {location ? ` · ${displayLocation(location)}` : ''}
          </Text>
        </View>
      </Box>
    </Pressable>
  );
});

const DOT = 7;

const styles = StyleSheet.create({
  meta: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.xs },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, marginRight: SPACING.xs },
  metaText: { flex: 1 },
});
