import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { MAX_FONT_SCALE, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { formatTimeAgo } from '../lib/article-utils';
import { displayLocation } from '../lib/place-names';
import type { Category } from '../types';
import { HapticPressable } from './HapticPressable';

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
  const titleFontSize = useMemo(() => {
    const scale = title.length > 70 ? 0.92 : title.length > 50 ? 0.96 : 1;
    return Math.round(typography.sizeLg * scale);
  }, [title, typography.sizeLg]);
  const handlePress = useCallback(() => {
    onPress(slug, category);
  }, [slug, category, onPress]);

  const handleLongPress = useCallback(() => {
    onLongPress?.(slug);
  }, [slug, onLongPress]);

  return (
    <HapticPressable
      onPress={handlePress}
      onLongPress={onLongPress ? handleLongPress : undefined}
      delayLongPress={delayLongPress}
      style={[styles.row, { borderBottomColor: colors.rule }]}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint="Double tap to read, long press to save"
    >
      <Text
        style={{
          ...font.semiBold,
          fontSize: titleFontSize,
          lineHeight: titleFontSize * typography.leadingHeading,
          color: colors.text,
        }}
        numberOfLines={2}
        maxFontSizeMultiplier={MAX_FONT_SCALE.heading}
      >
        {title}
      </Text>
      <Text
        style={[textStyles.smallCapsXs, { marginTop: SPACING.xs }]}
        maxFontSizeMultiplier={MAX_FONT_SCALE.label}
      >
        {category} · {formatTimeAgo(addedAt)}
        {location ? ` · ${displayLocation(location)}` : ''}
      </Text>
    </HapticPressable>
  );
});

const styles = StyleSheet.create({
  row: {
    paddingVertical: SPACING.screenPadding,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
