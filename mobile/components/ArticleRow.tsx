import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { PRESSED_STYLE, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { formatTimeAgo } from '../lib/article-utils';
import { hapticImpact } from '../lib/haptics';
import type { Category } from '../types';

export interface ArticleRowItem {
  slug: string;
  title: string;
  addedAt: number;
  category: Category;
  location: string | null;
}

interface ArticleRowProps {
  item: ArticleRowItem;
  onPress: (slug: string, category: Category) => void;
}

export const ArticleRow = memo(function ArticleRow({ item, onPress }: ArticleRowProps) {
  const { colors, font, typography, textStyles } = useTheme();
  const handlePress = useCallback(() => {
    hapticImpact();
    onPress(item.slug, item.category);
  }, [item.slug, item.category, onPress]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.rule },
        pressed && PRESSED_STYLE,
      ]}
      accessibilityRole="button"
      accessibilityLabel={item.title}
    >
      <Text
        style={{ fontFamily: font.semiBold, fontSize: typography.sizeBase, color: colors.text }}
        numberOfLines={2}
      >
        {item.title}
      </Text>
      <Text
        style={[textStyles.smallCapsXs, { color: colors.textSecondary, marginTop: SPACING.xs }]}
      >
        {item.category} · {formatTimeAgo(item.addedAt)}
        {item.location ? ` · ${item.location}` : ''}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
