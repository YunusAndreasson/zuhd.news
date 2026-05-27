import { COUNTRY_DATA } from '@shared/countries/country-data';
import { displayNameFromCode } from '@shared/countries/iso';
import type { Article, Entity } from '@shared/types';
import { memo, useCallback, useMemo } from 'react';
import {
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
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
import { hapticImpact, hapticTick } from '../lib/haptics';
import { COUNTRY_URL_SCHEME, makeMarkdownStyles, renderSentences } from '../lib/markdown';
import { useOpenLink } from '../lib/open-link';
import type { MiniGlobeRef, TapResult } from './globe/MiniGlobe';
import { Text } from './primitives';

// Title's distance from the container top. Smaller than the prior 32px gap
// so the headline sits closer to the CategoryBar; the article backdrop
// gradient (rendered once in ArticleList) handles the top map-bleed.
const CONTENT_PADDING_TOP = 18;

// Reader-only text scale. Bumps the article-page title and body ~4% so the
// reader feels a touch more relaxed than the rest of the app, paired with
// the slightly tighter `SPACING.articlePadding` to widen the column. The
// scale lives local because it's a per-surface tuning; the padding lives
// in `SPACING` so `CategoryBar` can mirror it.
const READER_TEXT_SCALE = 1.04;

interface ArticlePageProps {
  article: Article;
  itemHeight: number;
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

  // The hit-test relies on the precise tap coordinates, which screen-reader
  // activations can't supply (VoiceOver/TalkBack fire at the element's
  // geometric centre). Hide the zone from the a11y tree so reader users
  // aren't sent to a "lottery country" sheet; inline country/entity links
  // in prose remain the non-spatial path to the same sheets.
  return (
    <Pressable
      style={styles.globeTapZone}
      onPress={handleTap}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

export const ArticlePage = memo(function ArticlePage({
  article,
  itemHeight,
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
  const { colors, font, typography } = useTheme();
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

  // Reader scale always applies — for short articles (fontScale=1) it lifts
  // the body from sizeBase to a slightly larger reader size; for long
  // articles (fontScale<1) it partially counteracts the auto-shrink so
  // readability stays comfortable.
  const readerScale = fontScale * READER_TEXT_SCALE;
  const bodyFontSize = Math.round(typography.sizeBase * readerScale);

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

  const sourceCount = article.sources.length;
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
      onTimeAgoPress,
      handleTimeAgoPress,
      onEntityPress,
    ],
  );

  const handleLongPress = useCallback(() => {
    onBookmarkPress?.(article);
  }, [article, onBookmarkPress]);

  // Tap anywhere on the body opens the sources sheet. Inline tappables
  // (entity, country, time-ago, the explicit "sources" word) capture first,
  // so this only fires for blank prose. Disabled when there's nothing to show.
  const bodyTapEnabled = sourceCount > 0 && !!onSourcesPress;
  const bookmarkEnabled = !!onBookmarkPress;
  const isInteractive = bodyTapEnabled || bookmarkEnabled;

  // Spell out both gestures for assistive tech. Single-tap and long-press
  // are otherwise undiscoverable to screen-reader users (the gestures are
  // visual conventions). `accessibilityActions` registers the long-press
  // in the rotor / TalkBack local context menu so it can be invoked
  // explicitly even when the wrapper is treated as one focusable element.
  const accessibilityHint = bodyTapEnabled
    ? bookmarkEnabled
      ? 'Open sources. Long press to bookmark.'
      : 'Open sources'
    : bookmarkEnabled
      ? 'Long press to bookmark'
      : undefined;
  const accessibilityActions = useMemo(
    () => (bookmarkEnabled ? [{ name: 'longpress', label: 'Bookmark' }] : undefined),
    [bookmarkEnabled],
  );
  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === 'longpress') {
        onBookmarkPress?.(article);
      }
    },
    [article, onBookmarkPress],
  );

  return (
    <View style={[styles.container, { height: itemHeight }]}>
      <GlobeTapZone
        globeRef={globeRef}
        globeYOffset={globeYOffset}
        onTap={onCountryPress}
        impact={hapticImpact}
      />

      {/* Layout container — owns the column padding only, never a touch
          target. `pointerEvents="box-none"` so taps that miss the inner
          Pressable's text bounds (paddingTop, paddingBottom, side gutters,
          the empty space below short articles, the caught-up divider)
          fall straight through to GlobeTapZone underneath. The previous
          structure put the Pressable on the outside, which made the whole
          padded region open the sources sheet — including the strip above
          the title (felt like the globe but wasn't) and the empty space
          below the last sentence on short articles. */}
      <View style={styles.contentLayout} pointerEvents="box-none">
        <Animated.View style={fadeStyle} pointerEvents="box-none">
          {showEarlierDivider && (
            <View
              style={styles.earlierDivider}
              accessible
              accessibilityLabel="Caught up — earlier articles below"
            >
              <View style={[styles.earlierLine, { backgroundColor: colors.rule }]} />
              <Text variant="labelSm" tone="secondary">
                {'caught up'}
              </Text>
              <View style={[styles.earlierLine, { backgroundColor: colors.rule }]} />
            </View>
          )}
          <Pressable
            onPress={bodyTapEnabled ? handleSourcesPress : undefined}
            onLongPress={bookmarkEnabled ? handleLongPress : undefined}
            delayLongPress={400}
            accessibilityRole={isInteractive ? 'button' : undefined}
            accessibilityHint={accessibilityHint}
            accessibilityActions={accessibilityActions}
            onAccessibilityAction={bookmarkEnabled ? handleAccessibilityAction : undefined}
          >
            <Text
              variant="display"
              tone="emphasis"
              scale={readerScale}
              numberOfLines={3}
              style={styles.title}
            >
              {article.title}
            </Text>
            {body}
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  contentLayout: {
    paddingHorizontal: SPACING.articlePadding,
    paddingTop: CONTENT_PADDING_TOP,
    // Clear the BottomActionBar across all platforms. The bar's top edge
    // sits at `max(bottomInset, SPACING.sm) + ~24px pill height` from the
    // screen bottom; on Android with no inset that's only 32px, which the
    // previous SPACING.xl matched exactly (zero buffer). SPACING.xxl gives
    // ≥16px of breathing room everywhere and ~26px on devices with a home
    // indicator — enough to feel deliberate, not enough to waste viewport.
    paddingBottom: SPACING.xxl,
  },
  // The "caught up" divider is the only place the app surfaces its
  // anti-doomscroll philosophy in pixels — the moment a reader hits the
  // articles they've already seen. Visual weight reflects that:
  //   • symmetric vertical breathing (was hugged to the title via a
  //     negative marginTop) so the moment has its own room
  //   • 1px rule (was hairlineWidth) so the line reads as a deliberate
  //     section break rather than a hairline divider
  //   • labelSm small caps (was labelXs) — one tier up so the milestone
  //     label carries through at glance distance without shouting
  earlierDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginVertical: SPACING.lg,
  },
  earlierLine: {
    flex: 1,
    height: 1,
  },
  title: {
    marginBottom: SPACING.md,
  },
  globeTapZone: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
});
