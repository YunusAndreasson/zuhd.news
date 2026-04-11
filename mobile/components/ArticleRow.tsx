import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { PRESSED_STYLE, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { formatTimeAgo } from '../lib/article-utils';
import { hapticImpact } from '../lib/haptics';
import { displayLocation } from '../lib/place-names';
import type { Category } from '../types';

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
  const { colors, font, typography, textStyles } = useTheme();
  const handlePress = useCallback(() => {
    hapticImpact();
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
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.rule },
        pressed && PRESSED_STYLE,
      ]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <Text
        style={{ fontFamily: font.semiBold, fontSize: typography.sizeLg, lineHeight: typography.sizeLg * typography.leadingHeading, color: colors.text }}
        numberOfLines={2}
      >
        {title}
      </Text>
      <Text
        style={[textStyles.smallCapsXs, { marginTop: SPACING.xs }]}
      >
        {category} · {formatTimeAgo(addedAt)}
        {location ? ` · ${displayLocation(location)}` : ''}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    paddingVertical: SPACING.md + 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
