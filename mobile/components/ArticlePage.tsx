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
import { SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { computeFontScale, formatTimeAgo } from '../lib/article-utils';
import { hapticImpact } from '../lib/haptics';
import { makeMarkdownStyles, renderSentences } from '../lib/markdown';
import type { Article } from '../types';
import type { MiniGlobeRef, TapResult } from './globe/MiniGlobe';

const GRADIENT_HEIGHT_TOP = 24;
const GRADIENT_HEIGHT_BOTTOM = 56;

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
  onBookmarkPress,
  showEarlierDivider,
  globeRef,
  globeYOffset,
  onCountryPress,
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

      {/* Content + gradients fade together — reveals globe during swipe transitions */}
      <Animated.View style={fadeStyle} pointerEvents="box-none">
        <LinearGradient
          colors={[bgAlpha(0), bgAlpha(0.25), bgAlpha(0.7), colors.bg]}
          locations={[0, 0.4, 0.75, 1]}
          style={[styles.gradientTop, { width: screenWidth }]}
          pointerEvents="none"
        />

        <Pressable
          style={[styles.content, { backgroundColor: colors.bg }]}
          onLongPress={handleLongPress}
          delayLongPress={400}
        >
          {showEarlierDivider && (
            <View style={styles.earlierDivider}>
              <View style={[styles.earlierLine, { backgroundColor: colors.accent }]} />
              <Text
                style={[
                  styles.earlierLabel,
                  textStyles.smallCaps,
                  { fontSize: typography.sizeBase, color: colors.accent },
                ]}
              >
                caught up
              </Text>
              <View style={[styles.earlierLine, { backgroundColor: colors.accent }]} />
            </View>
          )}
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
        </Pressable>

        <LinearGradient
          colors={[bgAlpha(0.88), bgAlpha(0.45), bgAlpha(0.1), bgAlpha(0)]}
          locations={[0, 0.3, 0.7, 1]}
          style={[styles.gradientBottom, { width: screenWidth }]}
          pointerEvents="none"
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
    paddingBottom: SPACING.sm,
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
  globeTapZone: {
    ...StyleSheet.absoluteFillObject,
  },
});
