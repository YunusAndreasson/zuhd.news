import { memo, useMemo, useCallback } from 'react';
import { View, Text, Pressable, Share, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { COLORS, FONT, TYPOGRAPHY, SPACING } from '../constants/theme';
import { renderSentences } from '../lib/markdown';
import type { Article } from '../types';

interface ArticlePageProps {
  article: Article;
  itemHeight: number;
  index: number;
  scrollY: SharedValue<number>;
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
}: ArticlePageProps) {
  const timeAgo = formatTimeAgo(article.addedAt);
  const pageStart = index * itemHeight;
  const reduceMotion = useReducedMotion();

  const offset = useDerivedValue(() => {
    'worklet';
    if (index === 0 && scrollY.value <= 0) return 0;
    return scrollY.value - pageStart;
  });

  const fadeRange = [-itemHeight * 0.2, 0];

  const titleStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { opacity: 1 };
    return {
      opacity: interpolate(offset.value, fadeRange, [0.12, 1], Extrapolation.CLAMP),
    };
  });

  const bodyStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { opacity: 1 };
    return {
      opacity: interpolate(offset.value, fadeRange, [0, 1], Extrapolation.CLAMP),
    };
  });

  const body = useMemo(() => renderSentences(article.sentences), [article.sentences]);

  const handleLongPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const url = `https://zuhd.news/#${article.slug}`;
    Share.share({
      title: article.title,
      message: article.title,
      url,
    }).catch(() => {});
  }, [article.title, article.slug]);

  return (
    <Pressable style={[styles.container, { height: itemHeight }]} onLongPress={handleLongPress}>
      <Animated.View style={titleStyle}>
        <Text style={styles.title}>{article.title}</Text>
      </Animated.View>
      <Animated.View style={bodyStyle}>
        {body}
        <Text style={styles.source}>
          {article.source ? article.source.toUpperCase() : ''} · {timeAgo}
        </Text>
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.screenPadding,
    paddingTop: SPACING.lg,
  },
  title: {
    fontFamily: FONT.bold,
    fontSize: TYPOGRAPHY.sizeH1,
    lineHeight: TYPOGRAPHY.sizeH1 * TYPOGRAPHY.leadingHeading,
    color: COLORS.white,
    marginBottom: SPACING.lg,
  },
  source: {
    fontFamily: FONT.semiBold,
    fontSize: TYPOGRAPHY.sizeXs,
    color: COLORS.textSecondary,
    letterSpacing: TYPOGRAPHY.trackingCaps,
    marginTop: SPACING.lg,
  },
});
