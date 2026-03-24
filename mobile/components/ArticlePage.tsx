import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import { memo, useCallback, useMemo } from 'react';
import { Dimensions, Pressable, Share, StyleSheet, Text, View } from 'react-native';
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

import type { MiniGlobeRef, TapResult } from './globe/MiniGlobe';
import type { Article } from '../types';
import { ActionLabel } from './ActionLabel';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRADIENT_HEIGHT = 24;

interface ArticlePageProps {
  article: Article;
  itemHeight: number;
  index: number;
  scrollY: SharedValue<number>;
  onSourcePress?: (sourceName: string, allSources?: Array<{name: string; country?: string | null}>) => void;
  showEarlierDivider?: boolean;
  globeRef?: React.RefObject<MiniGlobeRef | null>;
  globeYOffset?: React.RefObject<number>;
  onCountryPress?: (result: TapResult) => void;
}

function formatTimeAgo(addedAt: number): string {
  const ms = Date.now() - addedAt;
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const date = new Date(addedAt);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function GlobeTapZone({ globeRef, globeYOffset, onTap }: {
  globeRef?: React.RefObject<MiniGlobeRef | null>;
  globeYOffset?: React.RefObject<number>;
  onTap?: (result: TapResult) => void;
}) {
  const { impact } = useHaptic();

  const handleTap = useCallback((e: { nativeEvent: { pageX: number; pageY: number } }) => {
    const yOff = globeYOffset?.current ?? 0;
    const result = globeRef?.current?.hitTest(e.nativeEvent.pageX, e.nativeEvent.pageY - yOff);
    if (!result) return;
    impact();
    onTap?.(result);
  }, [impact, globeRef, globeYOffset, onTap]);

  return <Pressable style={styles.globeTapZone} onPress={handleTap} />;
}

export const ArticlePage = memo(function ArticlePage({
  article,
  itemHeight,
  index,
  scrollY,
  onSourcePress,
  showEarlierDivider,
  globeRef,
  globeYOffset,
  onCountryPress,
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
    return Math.max(0.85, threshold / contentLength);
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
    impact();
    Share.share({
      message: `${article.title}\n\nhttps://zuhd.news/a/${article.slug}`,
    }).catch(() => {});
  }, [impact, article.title, article.slug]);

  return (
    <View style={[styles.container, { height: itemHeight }]}>
      {/* Globe tap zone — behind content, full card size */}
      <GlobeTapZone globeRef={globeRef} globeYOffset={globeYOffset} onTap={onCountryPress} />

      {/* Top gradient — dissolves globe into content */}
      <Canvas style={styles.gradient} pointerEvents="none">
        <Rect x={0} y={0} width={SCREEN_WIDTH} height={GRADIENT_HEIGHT}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, GRADIENT_HEIGHT)}
            colors={[`${COLORS.bg}00`, COLORS.bg]}
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
          <Text style={[styles.title, titleSizeStyle]} numberOfLines={3}>
            {article.title}
          </Text>
          {body}

          {/* Meta — status left, actions right */}
          <View style={styles.meta}>
            <View style={styles.metaGroup}>
              {article.eventCoverage != null && article.eventCoverage >= 100 && (
                <View style={styles.breakingPill}>
                  <Text style={styles.breakingText}>breaking</Text>
                </View>
              )}
              <Text style={styles.metaDim}>{timeAgo}</Text>
            </View>
            <View style={styles.metaGroup}>
              {article.sources && article.sources.length > 0 ? (
                <ActionLabel
                  label="sources"
                  icon="chevron-down"
                  onPress={() => onSourcePress?.(article.sources![0]?.name ?? '', article.sources)}
                />
              ) : null}
              <ActionLabel label="share" icon="arrow-up-outline" onPress={handleShare} />
            </View>
          </View>
        </Animated.View>
      </View>

      {/* Gradient dissolves content into globe — fades with body */}
      <Animated.View style={fadeStyle} pointerEvents="none">
        <Canvas style={styles.gradient}>
          <Rect x={0} y={0} width={SCREEN_WIDTH} height={GRADIENT_HEIGHT}>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(0, GRADIENT_HEIGHT)}
              colors={[COLORS.bg, `${COLORS.bg}00`]}
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
  gradient: {
    width: SCREEN_WIDTH,
    height: GRADIENT_HEIGHT,
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
    marginBottom: SPACING.md,
    fontVariant: ['oldstyle-nums'],
  },
  breakingPill: {
    backgroundColor: COLORS.text,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  breakingText: {
    fontFamily: FONT.smallCaps,
    fontSize: TYPOGRAPHY.sizeXs,
    color: COLORS.bg,
    letterSpacing: TYPOGRAPHY.trackingCaps,
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
    gap: SPACING.sm,
  },
  metaDim: {
    fontFamily: FONT.smallCaps,
    fontSize: TYPOGRAPHY.sizeSm,
    color: COLORS.accent,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  globeTapZone: {
    ...StyleSheet.absoluteFillObject,
  },
});
