import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
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
import { COLORS, FONT, LAYOUT, SPACING, TEXT_STYLES, TYPOGRAPHY } from '../constants/theme';
import { hapticImpact } from '../lib/haptics';
import { renderSentences } from '../lib/markdown';
import type { Article, ContextPressHandler, SourcePressHandler } from '../types';
import { ActionLabel } from './ActionLabel';
import type { MiniGlobeRef, TapResult } from './globe/MiniGlobe';

const GRADIENT_HEIGHT_TOP = 16;
const GRADIENT_HEIGHT_BOTTOM = 40;

interface ArticlePageProps {
  article: Article;
  itemHeight: number;
  screenWidth: number;
  index: number;
  scrollY: SharedValue<number>;
  onSourcePress?: SourcePressHandler;
  onContextPress?: ContextPressHandler;
  showEarlierDivider?: boolean;
  globeRef?: React.RefObject<MiniGlobeRef | null>;
  globeYOffset?: React.RefObject<number>;
  onCountryPress?: (result: TapResult) => void;
  tick?: number;
  isBreaking?: boolean;
}

function formatTimeAgo(addedAt: number): string {
  const ms = Date.now() - addedAt;
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const date = new Date(addedAt);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
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

  return <Pressable style={styles.globeTapZone} onPress={handleTap} />;
}

export const ArticlePage = memo(function ArticlePage({
  article,
  itemHeight,
  screenWidth,
  index,
  scrollY,
  onSourcePress,
  onContextPress,
  showEarlierDivider,
  globeRef,
  globeYOffset,
  onCountryPress,
  tick: _tick,
  isBreaking,
}: ArticlePageProps) {
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
  const fontScale = useMemo(() => {
    const contentLength = article.title.length * 2 + article.sentences.join(' ').length;
    const threshold = 450;
    if (contentLength <= threshold) return 1;
    return Math.max(0.95, threshold / contentLength);
  }, [article.title, article.sentences]);

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
    () => renderSentences(article.sentences, bodyFontSize, article.location),
    [article.sentences, bodyFontSize, article.location],
  );

  const handleShare = useCallback(() => {
    hapticImpact();
    Share.share({
      message: `${article.title}\n\nhttps://zuhd.news/a/${article.slug}`,
    }).catch(() => {});
  }, [article.title, article.slug]);

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
      <Canvas style={[styles.gradientTop, { width: screenWidth }]} pointerEvents="none">
        <Rect x={0} y={0} width={screenWidth} height={GRADIENT_HEIGHT_TOP}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, GRADIENT_HEIGHT_TOP)}
            colors={[`${COLORS.bg}00`, `${COLORS.bg}66`, `${COLORS.bg}CC`, COLORS.bg]}
            positions={[0, 0.3, 0.7, 1]}
          />
        </Rect>
      </Canvas>

      {/* Content zone — title, body, meta all grouped together */}
      <View style={styles.content}>
        {showEarlierDivider && (
          <View style={styles.earlierDivider}>
            <View style={styles.earlierLine} />
            <Text style={styles.earlierLabel}>caught up</Text>
            <View style={styles.earlierLine} />
          </View>
        )}
        <Animated.View style={fadeStyle}>
          <Text selectable style={[styles.title, titleSizeStyle]} numberOfLines={3}>
            {article.title}
          </Text>
          {body}

          {/* Meta — status left, actions right */}
          <View style={styles.meta}>
            <View style={styles.metaGroup}>
              {isBreaking ? (
                <View style={styles.breakingBadge}>
                  <Text style={styles.breakingText}>breaking</Text>
                </View>
              ) : (
                <Text style={styles.metaDim}>{timeAgo}</Text>
              )}
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
      </View>

      {/* Gradient dissolves content into globe — fades with body */}
      <Animated.View style={fadeStyle} pointerEvents="none">
        <Canvas style={[styles.gradientBottom, { width: screenWidth }]}>
          <Rect x={0} y={0} width={screenWidth} height={GRADIENT_HEIGHT_BOTTOM}>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(0, GRADIENT_HEIGHT_BOTTOM)}
              colors={[COLORS.bg, `${COLORS.bg}CC`, `${COLORS.bg}66`, `${COLORS.bg}00`]}
              positions={[0, 0.3, 0.7, 1]}
            />
          </Rect>
        </Canvas>
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
    backgroundColor: COLORS.bg,
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
    backgroundColor: COLORS.accent,
  },
  earlierLabel: {
    ...TEXT_STYLES.smallCaps,
    fontSize: TYPOGRAPHY.sizeBase,
  },
  title: {
    fontFamily: FONT.bold,
    fontSize: TYPOGRAPHY.sizeH1,
    lineHeight: TYPOGRAPHY.sizeH1 * TYPOGRAPHY.leadingHeading,
    color: COLORS.textEmphasis,
    marginBottom: SPACING.md,
    fontVariant: ['oldstyle-nums'],
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  metaGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  metaDim: {
    ...TEXT_STYLES.smallCaps,
    ...TEXT_STYLES.textShadow,
  },
  breakingBadge: {
    backgroundColor: COLORS.textEmphasis,
    paddingHorizontal: SPACING.sm,
    paddingVertical: LAYOUT.pillPaddingV,
    borderRadius: LAYOUT.pillRadius,
  },
  breakingText: {
    fontFamily: FONT.smallCaps,
    fontSize: TYPOGRAPHY.sizeSm,
    letterSpacing: TYPOGRAPHY.trackingCaps,
    color: COLORS.bg,
  },
  globeTapZone: {
    ...StyleSheet.absoluteFillObject,
  },
});
