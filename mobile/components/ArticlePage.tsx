import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
} from 'react-native-reanimated';
import { MAX_FONT_SCALE, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { computeFontScale, formatTimeAgo } from '../lib/article-utils';
import { hapticImpact } from '../lib/haptics';
import { makeMarkdownStyles, renderSentences } from '../lib/markdown';
import type { Article } from '../types';
import type { MiniGlobeRef, TapResult } from './globe/MiniGlobe';

const GRADIENT_HEIGHT_TOP = 32;
const GRADIENT_HEIGHT_BOTTOM = 72;

interface ArticlePageProps {
  article: Article;
  itemHeight: number;
  screenWidth: number;
  index: number;
  scrollY: SharedValue<number>;
  onBookmarkPress?: (article: Article) => void;
  showEarlierDivider?: boolean;
  globeRef?: React.RefObject<MiniGlobeRef | null>;
  globeYOffset?: React.RefObject<number>;
  onCountryPress?: (result: TapResult) => void;
  tick?: number;
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
      const tapX = e.nativeEvent.pageX;
      const tapY = e.nativeEvent.pageY - yOff;
      const result = globeRef?.current?.hitTest(tapX, tapY);
      if (!result) return;
      globeRef?.current?.showPulse(tapX, tapY);
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
  onBookmarkPress,
  showEarlierDivider,
  globeRef,
  globeYOffset,
  onCountryPress,
  tick: _tick,
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
    const off = offset.value;

    // Fade — visible throughout the swipe so you always see what you're
    // scrolling toward. Gentle fade-in from below, slightly faster fade-out
    // as the article scrolls past.
    const opacity = interpolate(
      off,
      [-itemHeight, 0, itemHeight * 0.4],
      [0, 1, 0],
      Extrapolation.CLAMP,
    );

    // Parallax — content rises gently into place and lifts away on exit,
    // creating spatial depth between the globe layer and the text layer.
    const translateY = interpolate(
      off,
      [-itemHeight * 0.3, 0, itemHeight * 0.4],
      [14, 0, -6],
      Extrapolation.CLAMP,
    );

    return {
      opacity,
      transform: [{ translateY }],
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
    () =>
      renderSentences(
        article.sentences,
        mdStyles,
        typography,
        bodyFontSize,
        article.location,
        timeAgo,
      ),
    [article.sentences, mdStyles, typography, bodyFontSize, article.location, timeAgo],
  );

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
        <Animated.View style={fadeStyle}>
          {showEarlierDivider && (
            <View
              style={styles.earlierDivider}
              accessible
              accessibilityLabel="Caught up — earlier articles below"
            >
              <View style={[styles.earlierLine, { backgroundColor: colors.accent }]} />
              <Text
                style={[textStyles.smallCapsBase, { color: colors.accent }]}
                maxFontSizeMultiplier={MAX_FONT_SCALE.label}
              >
                {'caught up'}
              </Text>
              <View style={[styles.earlierLine, { backgroundColor: colors.accent }]} />
            </View>
          )}
          <Text
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
            maxFontSizeMultiplier={MAX_FONT_SCALE.heading}
          >
            {article.title}
          </Text>
          {body}
        </Animated.View>
      </Pressable>

      {/* Gradient dissolves content into globe — stays opaque to mask the
          bottom edge of the solid content background during text fade. */}
      <LinearGradient
        colors={[colors.bg, bgAlpha(0.8), bgAlpha(0.35), bgAlpha(0)]}
        locations={[0, 0.2, 0.55, 1]}
        style={[styles.gradientBottom, { width: screenWidth }]}
        pointerEvents="none"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  content: {
    paddingHorizontal: SPACING.screenPadding,
    paddingBottom: SPACING.xl,
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
  title: {
    marginBottom: SPACING.lg,
    fontVariant: ['oldstyle-nums'],
  },
  globeTapZone: {
    ...StyleSheet.absoluteFillObject,
  },
});
