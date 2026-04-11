import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback, useMemo } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
} from 'react-native-reanimated';
import { LAYOUT, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { computeFontScale, formatTimeAgo } from '../lib/article-utils';
import { hapticImpact } from '../lib/haptics';
import { makeMarkdownStyles, renderSentences } from '../lib/markdown';
import type { Article, ContextPressHandler, SourcePressHandler } from '../types';
import { ActionLabel } from './ActionLabel';
import type { MiniGlobeRef, TapResult } from './globe/MiniGlobe';

const GRADIENT_HEIGHT_TOP = 28;
const GRADIENT_HEIGHT_BOTTOM = 40;

interface ArticlePageProps {
  article: Article;
  itemHeight: number;
  screenWidth: number;
  index: number;
  scrollY: SharedValue<number>;
  onSourcePress?: SourcePressHandler;
  onContextPress?: ContextPressHandler;
  onBookmarkPress?: (article: Article) => void;
  showEarlierDivider?: boolean;
  globeRef?: React.RefObject<MiniGlobeRef | null>;
  globeYOffset?: React.RefObject<number>;
  onCountryPress?: (result: TapResult) => void;
  tick?: number;
  isBreaking?: boolean;
  onBreakingPress?: (coverage: number) => void;
}

function GlobeTapZone({
  globeRef,
  globeYOffset,
  onTap,
  impact,
}: {
  globeRef?: React.RefObject<MiniGlobeRef | null>;
  globeYOffset?: React.RefObject<number>;
  onTap?: (result: TapResult) => void;
  impact: () => void;
}) {
  const handleTap = useCallback(
    (e: { nativeEvent: { pageX: number; pageY: number } }) => {
      const yOff = globeYOffset?.current ?? 0;
      const result = globeRef?.current?.hitTest(e.nativeEvent.pageX, e.nativeEvent.pageY - yOff);
      if (!result) return;
      impact();
      onTap?.(result);
    },
    [impact, globeRef, globeYOffset, onTap],
  );

  return (
    <Pressable
      style={styles.globeTapZone}
      onPress={handleTap}
      accessibilityRole="button"
      accessibilityLabel="Tap map to view country"
    />
  );
}

export const ArticlePage = memo(function ArticlePage({
  article,
  itemHeight,
  screenWidth,
  index,
  scrollY,
  onSourcePress,
  onContextPress,
  onBookmarkPress,
  showEarlierDivider,
  globeRef,
  globeYOffset,
  onCountryPress,
  tick: _tick,
  isBreaking,
  onBreakingPress,
}: ArticlePageProps) {
  const { colors, font, typography, textStyles, bgAlpha } = useTheme();
  const timeAgo = formatTimeAgo(article.addedAt);
  const pageStart = index * itemHeight;
  const reduceMotion = useReducedMotion();

  const offset = useDerivedValue(() => {
    'worklet';
    if (index === 0 && scrollY.value <= 0) return 0;
    return scrollY.value - pageStart;
  });

  const fadeStyle = useAnimatedStyle(() => {
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
  const fontScale = useMemo(
    () => computeFontScale(article.title, article.sentences),
    [article.title, article.sentences],
  );

  const titleFontSize = Math.round(typography.sizeH1 * fontScale);
  const bodyFontSize = fontScale < 1 ? Math.round(typography.sizeBase * fontScale) : undefined;

  const titleSizeStyle =
    fontScale < 1
      ? {
          fontSize: titleFontSize,
          lineHeight: titleFontSize * typography.leadingHeading,
        }
      : null;

  const mdStyles = useMemo(
    () => makeMarkdownStyles(colors, font, typography),
    [colors, font, typography],
  );

  const body = useMemo(
    () => renderSentences(article.sentences, mdStyles, typography, bodyFontSize, article.location),
    [article.sentences, mdStyles, typography, bodyFontSize, article.location],
  );

  const articleUrl = `https://zuhd.news/a/${article.slug}`;

  const handleShare = useCallback(() => {
    hapticImpact();
    Share.share({ message: `${article.title}\n\n${articleUrl}` }).catch(() => {});
  }, [article.title, articleUrl]);

  const handleLongPress = useCallback(() => {
    onBookmarkPress?.(article);
  }, [article, onBookmarkPress]);

  return (
    <View style={[styles.container, { height: itemHeight }]}>
      {/* Globe tap zone — behind content, full card size */}
      <GlobeTapZone
        globeRef={globeRef}
        globeYOffset={globeYOffset}
        onTap={onCountryPress}
        impact={hapticImpact}
      />

      {/* Top gradient — dissolves globe into content */}
      <LinearGradient
        colors={[bgAlpha(0), bgAlpha(0.4), bgAlpha(0.8), colors.bg]}
        locations={[0, 0.3, 0.7, 1]}
        style={[styles.gradientTop, { width: screenWidth }]}
        pointerEvents="none"
      />

      {/* Content zone — title, body, meta all grouped together */}
      <Pressable
        style={[styles.content, { backgroundColor: colors.bg }]}
        onLongPress={handleLongPress}
        delayLongPress={400}
      >
        {showEarlierDivider && (
          <View style={styles.earlierDivider}>
            <View style={[styles.earlierLine, { backgroundColor: colors.accent }]} />
            <Text
              style={[styles.earlierLabel, textStyles.smallCaps, { fontSize: typography.sizeBase, color: colors.accent }]}
            >
              caught up
            </Text>
            <View style={[styles.earlierLine, { backgroundColor: colors.accent }]} />
          </View>
        )}
        <Animated.View style={fadeStyle}>
          <Text
            selectable
            style={[
              styles.title,
              {
                ...font.bold,
                fontSize: typography.sizeH1,
                lineHeight: typography.sizeH1 * typography.leadingHeading,
                color: colors.textEmphasis,
              },
              titleSizeStyle,
            ]}
            numberOfLines={3}
          >
            {article.title}
          </Text>
          {body}

          {/* Meta — status left, actions right */}
          <View style={styles.meta}>
            <View style={styles.metaGroup}>
              {isBreaking && (
                <Pressable
                  onPress={() => onBreakingPress?.(article.eventCoverage ?? 0)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Breaking news indicator"
                >
                  <Ionicons name="flame" size={typography.sizeSm} color={colors.textSecondary} />
                </Pressable>
              )}
              <Text style={[styles.metaDim, textStyles.smallCaps, textStyles.textShadow]}>
                {timeAgo}
              </Text>
            </View>
            <View style={styles.metaGroup}>
              {article.threadId && onContextPress && (
                <ActionLabel label="context" onPress={() => onContextPress(article.threadId!)} />
              )}
              {article.sources.length > 0 ? (
                <ActionLabel
                  label={article.sources.length === 1 ? 'source' : 'sources'}
                  onPress={() =>
                    onSourcePress?.(
                      article.sources[0]?.name ?? '',
                      article.sources,
                      article.sentimentDivergence,
                    )
                  }
                />
              ) : null}
              <ActionLabel label="share" onPress={handleShare} />
            </View>
          </View>
        </Animated.View>
      </Pressable>

      {/* Gradient dissolves content into globe — fades with body */}
      <Animated.View style={fadeStyle} pointerEvents="none">
        <LinearGradient
          colors={[colors.bg, bgAlpha(0.8), bgAlpha(0.4), bgAlpha(0)]}
          locations={[0, 0.3, 0.7, 1]}
          style={[styles.gradientBottom, { width: screenWidth }]}
        />
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  content: {
    paddingHorizontal: SPACING.screenPadding,
  },
  gradientTop: {
    height: GRADIENT_HEIGHT_TOP,
  },
  gradientBottom: {
    height: GRADIENT_HEIGHT_BOTTOM,
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
  },
  earlierLabel: {},
  title: {
    marginBottom: SPACING.lg,
    fontVariant: ['oldstyle-nums'],
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  metaGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  metaDim: {},
  globeTapZone: {
    ...StyleSheet.absoluteFillObject,
  },
});
