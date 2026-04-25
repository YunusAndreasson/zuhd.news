import { COUNTRY_DATA } from '@shared/countries/country-data';
import { displayNameFromCode } from '@shared/countries/iso';
import type { Article, Entity } from '@shared/types';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback, useMemo } from 'react';
import { type GestureResponderEvent, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
} from 'react-native-reanimated';
import { HIT_SLOP, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { computeFontScale, formatTimeAgo } from '../lib/article-utils';
import { hapticImpact, hapticTick } from '../lib/haptics';
import { COUNTRY_URL_SCHEME, makeMarkdownStyles, renderSentences } from '../lib/markdown';
import { useOpenLink } from '../lib/open-link';
import type { MiniGlobeRef, TapResult } from './globe/MiniGlobe';
import { Text } from './primitives';

const GRADIENT_HEIGHT_TOP = 32;
const GRADIENT_HEIGHT_BOTTOM = 72;

interface ArticlePageProps {
  article: Article;
  itemHeight: number;
  screenWidth: number;
  index: number;
  scrollY: SharedValue<number>;
  onBookmarkPress?: (article: Article) => void;
  onSourcesPress?: (article: Article) => void;
  onTimeAgoPress?: (article: Article) => void;
  /** Tap handler for in-body entity mentions (oil, Hormuz, Bitcoin…). */
  onEntityPress?: (entity: Entity) => void;
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
    (e: GestureResponderEvent) => {
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
      accessibilityLabel="Globe map"
      accessibilityHint="Select a country for details"
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
  onSourcesPress,
  onTimeAgoPress,
  onEntityPress,
  showEarlierDivider,
  globeRef,
  globeYOffset,
  onCountryPress,
  tick: _tick,
}: ArticlePageProps) {
  const { colors, font, typography, textVariants, bgAlpha } = useTheme();
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

    const opacity = interpolate(
      off,
      [-itemHeight, 0, itemHeight * 0.4],
      [0, 1, 0],
      Extrapolation.CLAMP,
    );

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

  const fontScale = useMemo(
    () => computeFontScale(article.title, article.sentences),
    [article.title, article.sentences],
  );

  const bodyFontSize = fontScale < 1 ? Math.round(typography.sizeBase * fontScale) : undefined;

  const mdStyles = useMemo(
    () => makeMarkdownStyles(colors, font, typography),
    [colors, font, typography],
  );

  const rawOpenLink = useOpenLink();
  // Intercept `country:XX` markdown links and dispatch them through the same
  // TapResult-shaped callback that the globe's hit-tester uses, so the
  // existing CountrySheet plumbing in app/index.tsx opens without a new
  // prop chain. Anything else (http, mailto…) falls through to the browser.
  const openLink = useCallback(
    (url: string) => {
      if (url.startsWith(COUNTRY_URL_SCHEME)) {
        const cc = url.slice(COUNTRY_URL_SCHEME.length).toUpperCase();
        const countryName = displayNameFromCode(cc);
        if (!countryName || !onCountryPress) return;
        const data = COUNTRY_DATA[countryName] ?? null;
        hapticTick();
        onCountryPress({ countryName, location: null, localTime: null, data });
        return;
      }
      rawOpenLink(url);
    },
    [rawOpenLink, onCountryPress],
  );

  const handleSourcesPress = useCallback(() => {
    onSourcesPress?.(article);
  }, [article, onSourcesPress]);

  const handleTimeAgoPress = useCallback(() => {
    onTimeAgoPress?.(article);
  }, [article, onTimeAgoPress]);

  // Inline source link — rendered as nested RN Text because it lives inside
  // a markdown-styled sentence composite, not as a standalone `<Text variant>`.
  // `hitSlop` on inline <Text> with `onPress` expands the tap target around
  // the small-caps word so it's comfortable to thumb at the end of the body.
  const sourceCount = article.sources.length;
  const sourcesTrailing = useMemo(() => {
    if (sourceCount === 0 || !onSourcesPress) return null;
    return (
      <Animated.Text style={textVariants.labelXs}>
        {'\u2002'}
        <Animated.Text
          onPress={handleSourcesPress}
          // @ts-expect-error — `hitSlop` on inline Text with onPress expands the tap target at runtime (RN docs) but isn't surfaced on TextProps
          hitSlop={HIT_SLOP}
          style={{ color: colors.accent }}
        >
          {sourceCount === 1 ? 'source' : 'sources'}
        </Animated.Text>
      </Animated.Text>
    );
  }, [sourceCount, onSourcesPress, handleSourcesPress, textVariants.labelXs, colors.accent]);

  const body = useMemo(
    () =>
      renderSentences(
        article.sentences,
        mdStyles,
        typography,
        bodyFontSize,
        article.location,
        timeAgo,
        openLink,
        sourcesTrailing,
        onTimeAgoPress ? handleTimeAgoPress : undefined,
        article.entities,
        onEntityPress,
      ),
    [
      article.sentences,
      article.location,
      article.entities,
      mdStyles,
      typography,
      bodyFontSize,
      timeAgo,
      openLink,
      sourcesTrailing,
      onTimeAgoPress,
      handleTimeAgoPress,
      onEntityPress,
    ],
  );

  const handleLongPress = useCallback(() => {
    onBookmarkPress?.(article);
  }, [article, onBookmarkPress]);

  return (
    <View style={[styles.container, { height: itemHeight }]}>
      <GlobeTapZone
        globeRef={globeRef}
        globeYOffset={globeYOffset}
        onTap={onCountryPress}
        impact={hapticImpact}
      />

      <LinearGradient
        colors={[bgAlpha(0), bgAlpha(0.4), bgAlpha(0.8), colors.bg]}
        locations={[0, 0.3, 0.7, 1]}
        style={[styles.gradientTop, { width: screenWidth }]}
        pointerEvents="none"
      />

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
              <View style={[styles.earlierLine, { backgroundColor: colors.rule }]} />
              <Text variant="labelXs" tone="secondary">
                {'caught up'}
              </Text>
              <View style={[styles.earlierLine, { backgroundColor: colors.rule }]} />
            </View>
          )}
          <Text
            variant="display"
            tone="emphasis"
            scale={fontScale}
            numberOfLines={3}
            style={styles.title}
          >
            {article.title}
          </Text>
          {body}
        </Animated.View>
      </Pressable>

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
    paddingTop: 0,
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
    marginTop: -SPACING.sm,
  },
  earlierLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  title: {
    marginBottom: SPACING.md,
    fontVariant: ['oldstyle-nums'],
  },
  globeTapZone: {
    ...StyleSheet.absoluteFillObject,
  },
});
