import { memo, useCallback, useMemo } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
} from 'react-native-reanimated';
import { COLORS, FONT, SPACING, TYPOGRAPHY } from '../constants/theme';
import { ActionLabel } from './ActionLabel';
import { useHaptic } from '../hooks/useHaptic';
import { renderSentences } from '../lib/markdown';
import type { Article } from '../types';

interface ArticlePageProps {
  article: Article;
  itemHeight: number;
  index: number;
  scrollY: SharedValue<number>;
  onSourcePress?: (sourceName: string) => void;
  showEarlierDivider?: boolean;
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
  onSourcePress,
  showEarlierDivider,
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
      opacity: interpolate(
        offset.value,
        [-itemHeight, 0, itemHeight * 0.5],
        [0.12, 1, 0],
        Extrapolation.CLAMP,
      ),
    };
  });

  const bodyStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { opacity: 1 };
    return {
      opacity: interpolate(
        offset.value,
        [-itemHeight, 0, itemHeight * 0.4],
        [0, 1, 0],
        Extrapolation.CLAMP,
      ),
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

  const handleShare = useCallback(() => {
    impact();
    Share.share({
      message: `${article.title}\n\nhttps://zuhd.news/a/${article.slug}`,
    }).catch(() => {});
  }, [impact, article.title, article.slug]);

  return (
    <View style={[styles.container, { height: itemHeight }]}>
      {showEarlierDivider && (
        <View style={styles.earlierDivider}>
          <View style={styles.earlierLine} />
          <Text style={styles.earlierLabel}>caught up</Text>
          <View style={styles.earlierLine} />
        </View>
      )}
      <Animated.View style={titleStyle}>
        <Text style={[styles.title, titleSizeStyle]} numberOfLines={3}>
          {article.title}
        </Text>
      </Animated.View>
      <Animated.View style={bodyStyle}>
        {body}
        <View style={styles.meta}>
          {/* Attribution cluster: source + time */}
          <View style={styles.metaGroup}>
            {article.source ? (
              <ActionLabel
                label={article.source.toLowerCase()}
                icon="chevron-down"
                onPress={() => onSourcePress?.(article.source!)}
              />
            ) : null}
            <Text style={styles.metaDim}>{timeAgo}</Text>
          </View>

          <View style={styles.metaGroup}>
            <ActionLabel
              label="share"
              icon="arrow-up-outline"
              onPress={handleShare}
            />
          </View>
        </View>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.screenPadding,
    paddingTop: SPACING.xxl,
    overflow: 'hidden',
  },
  earlierDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
    marginTop: -SPACING.md,
  },
  earlierLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.accent,
  },
  earlierLabel: {
    fontFamily: FONT.smallCaps,
    fontSize: TYPOGRAPHY.sizeBase,
    color: COLORS.accent,
    letterSpacing: TYPOGRAPHY.trackingCaps,
  },
  title: {
    fontFamily: FONT.bold,
    fontSize: TYPOGRAPHY.sizeH1,
    lineHeight: TYPOGRAPHY.sizeH1 * TYPOGRAPHY.leadingHeading,
    color: COLORS.white,
    marginBottom: SPACING.lg,
    fontVariant: ['oldstyle-nums'],
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.xl,
  },
  metaGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  metaDim: {
    fontFamily: FONT.smallCaps,
    fontSize: TYPOGRAPHY.sizeSm,
    color: COLORS.accent,
  },
});
