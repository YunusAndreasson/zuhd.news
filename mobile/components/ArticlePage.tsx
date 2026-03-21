import { memo, useCallback, useMemo } from 'react';
import { Pressable, Share, StyleSheet, Text } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
} from 'react-native-reanimated';
import { COLORS, FONT, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useHaptic } from '../hooks/useHaptic';
import { renderSentences } from '../lib/markdown';
import type { Article } from '../types';

interface ArticlePageProps {
  article: Article;
  itemHeight: number;
  index: number;
  scrollY: SharedValue<number>;
  isNew: boolean;
  onThreadPress?: (article: Article) => void;
  onSourcePress?: (sourceName: string) => void;
}

function formatTimeAgo(addedAt: number): string {
  const ms = Date.now() - addedAt;
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const date = new Date(addedAt);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export const ArticlePage = memo(function ArticlePage({
  article,
  itemHeight,
  index,
  scrollY,
  isNew,
  onThreadPress,
  onSourcePress,
}: ArticlePageProps) {
  const { impact } = useHaptic();
  const timeAgo = formatTimeAgo(article.addedAt);
  const pageStart = index * itemHeight;
  const reduceMotion = useReducedMotion();

  const offset = useDerivedValue(() => {
    'worklet';
    if (index === 0 && scrollY.value <= 0) return 0;
    return scrollY.value - pageStart;
  });

  const titleStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { opacity: 1 };
    return {
      opacity: interpolate(offset.value, [-itemHeight, 0], [0.12, 1], Extrapolation.CLAMP),
    };
  });

  const bodyStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { opacity: 1 };
    return {
      opacity: interpolate(offset.value, [-itemHeight, 0], [0, 1], Extrapolation.CLAMP),
    };
  });

  // Scale fonts down for long articles so content fits the snap viewport.
  // Title chars count double (larger font, ~2x vertical impact per char).
  const contentLength = article.title.length * 2 + article.sentences.join(' ').length;
  const fontScale = useMemo(() => {
    const threshold = 450;
    if (contentLength <= threshold) return 1;
    return Math.max(0.85, threshold / contentLength);
  }, [contentLength]);

  const titleFontSize = Math.round(TYPOGRAPHY.sizeH1 * fontScale);
  const bodyFontSize = fontScale < 1 ? Math.round(TYPOGRAPHY.sizeBase * fontScale) : undefined;

  const titleSizeStyle =
    fontScale < 1
      ? {
          fontSize: titleFontSize,
          lineHeight: titleFontSize * TYPOGRAPHY.leadingHeading,
        }
      : null;

  const body = useMemo(
    () => renderSentences(article.sentences, bodyFontSize),
    [article.sentences, bodyFontSize],
  );

  const handleLongPress = useCallback(() => {
    impact();
    Share.share({
      message: `${article.title}\n\nhttps://zuhd.news/a/${article.slug}`,
    }).catch(() => {});
  }, [impact, article.title, article.slug]);

  return (
    <Pressable style={[styles.container, { height: itemHeight }]} onLongPress={handleLongPress}>
      <Animated.View style={titleStyle}>
        <Text style={[styles.title, titleSizeStyle]} numberOfLines={3}>
          {article.title}
        </Text>
      </Animated.View>
      <Animated.View style={bodyStyle}>
        {body}
        <Text style={styles.source}>
          {isNew ? 'NEW · ' : ''}
          {article.source ? (
            <Text onPress={() => onSourcePress?.(article.source!)} style={styles.sourceTap}>
              {article.source.toUpperCase()}
            </Text>
          ) : null}
          {article.source ? ' · ' : ''}
          {timeAgo}
          {article.threadLabel && (article.threadArticleCount ?? 0) >= 3 && (
            <Text onPress={() => onThreadPress?.(article)} style={styles.contextTap}>
              {' · context \u203A'}
            </Text>
          )}
        </Text>
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.screenPadding,
    paddingTop: SPACING.lg,
    overflow: 'hidden',
  },
  title: {
    fontFamily: FONT.bold,
    fontSize: TYPOGRAPHY.sizeH1,
    lineHeight: TYPOGRAPHY.sizeH1 * TYPOGRAPHY.leadingHeading,
    color: COLORS.white,
    marginBottom: SPACING.lg,
    fontVariant: ['oldstyle-nums'],
  },
  source: {
    fontFamily: FONT.semiBold,
    fontSize: TYPOGRAPHY.sizeXs,
    color: COLORS.textSecondary,
    letterSpacing: TYPOGRAPHY.trackingCaps,
    marginTop: SPACING.lg,
  },
  sourceTap: {
    textDecorationLine: 'underline',
    textDecorationColor: COLORS.rule,
  },
  contextTap: {
    color: COLORS.accent,
  },
});
