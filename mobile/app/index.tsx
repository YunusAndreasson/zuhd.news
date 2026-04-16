import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  type BottomSheetModal,
} from '@gorhom/bottom-sheet';
import { useNetworkState } from 'expo-network';
import * as SplashScreen from 'expo-splash-screen';
import { createRef, useCallback, useEffect, useRef, useState } from 'react';
import {
  InteractionManager,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import PagerView, { type PagerViewOnPageSelectedEvent } from 'react-native-pager-view';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArticleList, type ArticleListRef } from '../components/ArticleList';
import { BookmarkSheet } from '../components/BookmarkSheet';
import { BriefingBar } from '../components/BriefingBar';
import { CategoryBar } from '../components/CategoryBar';
import { ContextSheet } from '../components/ContextSheet';
import { CountrySheet } from '../components/CountrySheet';
import type { TapResult } from '../components/globe/MiniGlobe';
import { MenuSheet } from '../components/MenuSheet';
import { SearchSheet } from '../components/SearchSheet';
import { SettingsSheet } from '../components/SettingsSheet';
import { Toast, type ToastRef } from '../components/Toast';
import {
  CATEGORIES,
  EDITORIAL,
  LAYOUT,
  MAX_FONT_SCALE,
  PRESSED_STYLE,
  SPACING,
} from '../constants/theme';
import { useArticles } from '../hooks/useArticles';
import { useBriefingPlayer } from '../hooks/useBriefingPlayer';
import { useContextBrief } from '../hooks/useContextBrief';
import { useHeatmap } from '../hooks/useHeatmap';
import { useTheme } from '../hooks/useTheme';
import { getSnapshot as getBookmarks, toggle as toggleBookmark } from '../lib/bookmark-store';
import { hapticImpact, hapticNotification, hapticTick } from '../lib/haptics';
import { clear as clearPendingSlug, get as getPendingSlug } from '../lib/pending-notification';
import type { Article, ArticleSource, Category } from '../types';

const listRefs = CATEGORIES.map(() => createRef<ArticleListRef>());

export default function HomeScreen() {
  const { colors, font, typography } = useTheme();
  const {
    grouped,
    briefing,
    loading,
    error,
    lastSeenAt,
    refresh,
    retry,
    tick,
    resetKey,
    generated,
    injectArticle,
  } = useArticles();
  const heatmapPoints = useHeatmap(generated);
  const network = useNetworkState();
  const insets = useSafeAreaInsets();
  const briefingPlayer = useBriefingPlayer(
    briefing?.available ? briefing.date : undefined,
    briefing?.duration,
  );

  // Active article tracking (for bottom action bar)
  const currentArticlesRef = useRef<(Article | null)[]>([null, null, null, null]);
  const [activeArticle, setActiveArticle] = useState<Article | null>(null);

  // Sheet refs
  const menuSheetRef = useRef<BottomSheetModal>(null);
  const [digSources, setDigSources] = useState<ArticleSource[]>([]);

  const countrySheetRef = useRef<BottomSheetModal>(null);
  const [countrySheet, setCountrySheet] = useState<TapResult | null>(null);
  const searchSheetRef = useRef<BottomSheetModal>(null);
  const bookmarkSheetRef = useRef<BottomSheetModal>(null);
  const settingsSheetRef = useRef<BottomSheetModal>(null);
  const contextSheetRef = useRef<BottomSheetModal>(null);
  const {
    brief: contextBrief,
    loading: contextLoading,
    fetchBrief: fetchContext,
  } = useContextBrief();
  const [contextThreadLabel, setContextThreadLabel] = useState<string | undefined>();

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        pressBehavior="close"
        opacity={LAYOUT.backdropOpacity}
      />
    ),
    [],
  );

  const handleSelectArticle = useCallback(
    (slug: string, category: Category) => {
      searchSheetRef.current?.dismiss();
      bookmarkSheetRef.current?.dismiss();
      const catIndex = CATEGORIES.indexOf(category);
      if (catIndex < 0) return;

      // If the article rotated out of the feed, inject the bookmarked copy
      const inFeed = groupedRef.current[category]?.some((a) => a.slug === slug);
      if (!inFeed) {
        const bookmark = getBookmarks().find((b) => b.article.slug === slug);
        if (bookmark) {
          injectArticle(bookmark.article, category);
        } else {
          toastRef.current?.show('Article no longer available');
          return;
        }
      }

      pagerRef.current?.setPage(catIndex);
      // Wait for pager animation to complete before scrolling
      InteractionManager.runAfterInteractions(() => {
        listRefs[catIndex]?.current?.scrollToSlug?.(slug);
      });
    },
    [injectArticle],
  );

  const handleArticleBookmark = useCallback((article: Article) => {
    const catIndex = currentCategoryRef.current;
    const category = CATEGORIES[catIndex] ?? 'politics';
    const added = toggleBookmark(article, category);
    hapticNotification();
    toastRef.current?.show(added ? 'Saved' : 'Removed');
  }, []);

  const handleMenuPress = useCallback(() => {
    hapticImpact();
    menuSheetRef.current?.present();
  }, []);

  const handleSettingsPress = useCallback(() => {
    menuSheetRef.current?.dismiss();
    setTimeout(() => settingsSheetRef.current?.present(), 250);
  }, []);

  const handleMenuSearch = useCallback(() => {
    menuSheetRef.current?.dismiss();
    setTimeout(() => searchSheetRef.current?.present(), 250);
  }, []);

  const handleMenuBookmark = useCallback(() => {
    menuSheetRef.current?.dismiss();
    setTimeout(() => bookmarkSheetRef.current?.present(), 250);
  }, []);

  const handleDeeperPress = useCallback(() => {
    if (!activeArticle) return;
    hapticImpact();
    // Capture article metadata at open time
    setDigSources(activeArticle.sources);

    // Fetch context if article has a thread
    if (activeArticle.threadId) {
      const allArticles = Object.values(groupedRef.current).flat();
      const match = allArticles.find((a) => a.threadId === activeArticle.threadId);
      setContextThreadLabel(match?.threadLabel);
      fetchContext(activeArticle.threadId);
    } else {
      setContextThreadLabel(undefined);
    }
    contextSheetRef.current?.present();
  }, [activeArticle, fetchContext]);

  const handleBottomShare = useCallback(() => {
    if (!activeArticle) return;
    hapticImpact();
    const url = `https://zuhd.news/a/${activeArticle.slug}`;
    const title = activeArticle.title;
    const content = Platform.select({
      ios: { url, title },
      default: { message: `${title}\n${url}`, title },
    });
    if (!content) return;
    Share.share(
      content,
      Platform.select({
        ios: { subject: `${title} \u2014 zuhd.news` },
        default: { dialogTitle: 'Share' },
      }),
    ).catch(() => {});
  }, [activeArticle]);

  const handleArticleChange = useCallback((article: Article, catIndex: number) => {
    currentArticlesRef.current[catIndex] = article;
    if (catIndex === currentCategoryRef.current) {
      setActiveArticle(article);
    }
  }, []);

  const handleCountryPress = useCallback(
    (result: TapResult) => {
      hapticImpact();
      // Hotspot glow tap → toast with tap-to-navigate
      if (result.isHotspot) {
        const label = result.hotspotLabels?.[0] ?? result.countryName;
        if (!label) return;
        toastRef.current?.show(label, () => {
          // Find article matching this hotspot label
          for (const cat of CATEGORIES) {
            const articles = groupedRef.current[cat];
            if (!articles) continue;
            const match = articles.find((a) => {
              if (a.threadLabel) {
                const prefix = a.threadLabel.includes(':')
                  ? a.threadLabel.slice(0, a.threadLabel.indexOf(':'))
                  : a.threadLabel;
                if (prefix === label) return true;
              }
              return a.title === label;
            });
            if (match) {
              handleSelectArticle(match.slug, cat);
              return;
            }
          }
        });
        return;
      }
      // Country/dot tap → sheet
      setCountrySheet(result);
      countrySheetRef.current?.present();
    },
    [handleSelectArticle],
  );

  const handleCountryStoryPress = useCallback(
    (label: string) => {
      // Find article matching this hotspot label (threadLabel prefix or title)
      for (const cat of CATEGORIES) {
        const articles = groupedRef.current[cat];
        if (!articles) continue;
        const match = articles.find((a) => {
          if (a.threadLabel) {
            const prefix = a.threadLabel.includes(':')
              ? a.threadLabel.slice(0, a.threadLabel.indexOf(':'))
              : a.threadLabel;
            if (prefix === label) return true;
          }
          return a.title === label;
        });
        if (match) {
          countrySheetRef.current?.dismiss();
          handleSelectArticle(match.slug, cat);
          return;
        }
      }
    },
    [handleSelectArticle],
  );

  const pagerRef = useRef<PagerView>(null);
  const toastRef = useRef<ToastRef>(null);

  const [currentCategory, setCurrentCategory] = useState(0);

  // Refs for values used inside stable callbacks — avoids breaking downstream memos
  const groupedRef = useRef(grouped);
  groupedRef.current = grouped;
  const lastSeenAtRef = useRef(lastSeenAt);
  lastSeenAtRef.current = lastSeenAt;
  const currentCategoryRef = useRef(currentCategory);
  currentCategoryRef.current = currentCategory;

  const [pagerHeight, setPagerHeight] = useState(0);
  const onPagerLayout = useCallback((e: LayoutChangeEvent) => {
    setPagerHeight(e.nativeEvent.layout.height);
  }, []);

  const pagerOffset = useSharedValue(0);
  const categoryProgresses = useSharedValue([0, 0, 0, 0]);

  const onPageSelected = useCallback(
    (e: PagerViewOnPageSelectedEvent) => {
      const page = e.nativeEvent.position;
      pagerOffset.value = page;
      hapticTick();
      setCurrentCategory(page);
      setActiveArticle(currentArticlesRef.current[page] ?? null);
    },
    [pagerOffset],
  );

  const onPageScroll = useCallback(
    (e: { nativeEvent: { position: number; offset: number } }) => {
      pagerOffset.value = e.nativeEvent.position + e.nativeEvent.offset;
    },
    [pagerOffset],
  );

  const onCategoryPress = useCallback(
    (index: number) => {
      if (index === currentCategory && index < CATEGORIES.length) {
        listRefs[index]?.current?.scrollToTop();
      } else {
        pagerRef.current?.setPage(index);
      }
      hapticTick();
    },
    [currentCategory],
  );

  const handleCaughtUp = useCallback(() => {
    toastRef.current?.show('Caught up', undefined, 'top');
  }, []);

  const handleEndReached = useCallback((catIndex: number) => {
    const cat = CATEGORIES[catIndex];
    if (!cat) return;
    toastRef.current?.show('End \u00B7 tap for top', () =>
      listRefs[catIndex]?.current?.scrollToTop(),
    );
  }, []);

  const handleRefresh = useCallback(async () => {
    hapticImpact();
    try {
      const n = await refresh();
      if (n > 0) {
        const allArticles = Object.values(groupedRef.current).flat();
        const words = allArticles
          .filter((a) => a.addedAt > lastSeenAtRef.current)
          .reduce((sum, a) => sum + a.sentences.join(' ').split(/\s+/).length, 0);
        const mins = Math.max(1, Math.ceil(words / EDITORIAL.readingWpm));
        toastRef.current?.show(`${n} new · ~${mins} min read`, undefined, 'top');
        // Scroll to top so new/breaking articles are visible
        listRefs[currentCategoryRef.current]?.current?.scrollToTop();
      } else {
        toastRef.current?.show('Already up to date', undefined, 'top');
      }
    } catch {
      toastRef.current?.show('Could not refresh', undefined, 'top');
    }
  }, [refresh]);

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  // Navigate to article from push notification tap
  useEffect(() => {
    if (loading) return;
    const slug = getPendingSlug();
    if (!slug) return;
    clearPendingSlug();
    // Find which category has this article
    for (const cat of CATEGORIES) {
      const found = grouped[cat]?.some((a) => a.slug === slug);
      if (found) {
        setTimeout(() => {
          const catIndex = CATEGORIES.indexOf(cat);
          pagerRef.current?.setPage(catIndex);
          setTimeout(() => listRefs[catIndex]?.current?.scrollToSlug?.(slug), 150);
        }, 100);
        break;
      }
    }
  }, [loading, grouped]);

  if (loading) return null;

  if (error && Object.values(grouped).every((a) => a.length === 0)) {
    const offline = network.isInternetReachable === false;
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <Text
          style={[
            styles.errorText,
            { ...font.regular, fontSize: typography.sizeBase, color: colors.text },
          ]}
        >
          {offline ? 'No connection.' : 'Could not load articles.'}
        </Text>
        <Text
          style={[
            styles.errorHint,
            { ...font.regular, fontSize: typography.sizeSm, color: colors.textSecondary },
          ]}
        >
          {offline ? 'Connect to the internet and reopen.' : error}
        </Text>
        <Pressable
          onPress={() => {
            hapticImpact();
            retry();
          }}
          style={({ pressed }) => pressed && PRESSED_STYLE}
          hitSlop={LAYOUT.hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Text
            style={[
              styles.retryText,
              { ...font.semiBold, fontSize: typography.sizeSm, color: colors.text },
            ]}
          >
            Try again
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <CategoryBar
        pagerOffset={pagerOffset}
        categoryProgresses={categoryProgresses}
        currentCategory={currentCategory}
        onCategoryPress={onCategoryPress}
        onMenuPress={handleMenuPress}
      />

      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        onPageSelected={onPageSelected}
        onPageScroll={onPageScroll}
        onLayout={onPagerLayout}
        overdrag
        offscreenPageLimit={1}
      >
        {CATEGORIES.map((cat, catIndex) => (
          <View key={cat} collapsable={false}>
            {pagerHeight > 0 && (
              <ArticleList
                ref={listRefs[catIndex]}
                articles={grouped[cat]}
                heatmapPoints={heatmapPoints}
                viewportHeight={pagerHeight}
                catIndex={catIndex}
                lastSeenAt={lastSeenAt}
                onRefresh={handleRefresh}
                onEndReached={handleEndReached}
                onCaughtUp={handleCaughtUp}
                onBookmarkPress={handleArticleBookmark}
                onCountryPress={handleCountryPress}
                onArticleChange={handleArticleChange}
                progressesSV={categoryProgresses}
                tick={tick}
                resetKey={resetKey}
              />
            )}
          </View>
        ))}
      </PagerView>

      <Toast ref={toastRef} />

      {/* Bottom bar: [briefing] ---- [context] [sources] [share] */}
      {!(briefingPlayer.playing || briefingPlayer.elapsed > 0) && (
        <View
          style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, SPACING.sm) }]}
          pointerEvents="box-none"
        >
          {/* Briefing — far left, separated */}
          {briefing?.available && briefing.date && (
            <Pressable
              onPress={briefingPlayer.toggle}
              hitSlop={LAYOUT.hitSlop}
              style={({ pressed }) => [
                styles.actionPill,
                { backgroundColor: colors.pillBg },
                pressed && PRESSED_STYLE,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Listen to daily briefing"
            >
              <Text
                style={{
                  ...font.smallCaps,
                  fontSize: typography.sizeXs,
                  letterSpacing: typography.trackingCaps,
                  color: colors.textEmphasis,
                }}
                maxFontSizeMultiplier={MAX_FONT_SCALE.chrome}
              >
                listen
              </Text>
            </Pressable>
          )}

          {/* Spacer pushes article actions to the right */}
          <View style={styles.bottomSpacer} />

          {/* Article actions — right side, closest to thumb */}
          <View style={styles.articleActions}>
            <Pressable
              onPress={handleBottomShare}
              hitSlop={LAYOUT.hitSlop}
              style={({ pressed }) => [
                styles.actionPill,
                { backgroundColor: colors.pillBg },
                pressed && PRESSED_STYLE,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Share article"
            >
              <Text
                style={{
                  ...font.smallCaps,
                  fontSize: typography.sizeXs,
                  letterSpacing: typography.trackingCaps,
                  color: colors.textEmphasis,
                }}
                maxFontSizeMultiplier={MAX_FONT_SCALE.chrome}
              >
                share
              </Text>
            </Pressable>
            <Pressable
              onPress={handleDeeperPress}
              hitSlop={LAYOUT.hitSlop}
              style={({ pressed }) => [
                styles.actionPill,
                { backgroundColor: colors.pillBg },
                pressed && PRESSED_STYLE,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Context about this story"
            >
              <Text
                style={{
                  ...font.smallCaps,
                  fontSize: typography.sizeXs,
                  letterSpacing: typography.trackingCaps,
                  color: colors.textEmphasis,
                }}
                maxFontSizeMultiplier={MAX_FONT_SCALE.chrome}
              >
                context
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Briefing player — shown while playing or paused mid-listen */}
      {briefing?.available &&
        briefing.date &&
        (briefingPlayer.playing || briefingPlayer.elapsed > 0) && (
          <BriefingBar
            playing={briefingPlayer.playing}
            elapsed={briefingPlayer.elapsed}
            duration={briefingPlayer.duration}
            date={briefing.date}
            onToggle={briefingPlayer.toggle}
            onSeek={briefingPlayer.seek}
            onClose={briefingPlayer.close}
          />
        )}

      <MenuSheet
        sheetRef={menuSheetRef}
        bottomInset={insets.bottom}
        renderBackdrop={renderBackdrop}
        onDismiss={() => {}}
        onSearchPress={handleMenuSearch}
        onBookmarkPress={handleMenuBookmark}
        onSettingsPress={handleSettingsPress}
      />

      <CountrySheet
        sheetRef={countrySheetRef}
        country={countrySheet}
        bottomInset={insets.bottom}
        renderBackdrop={renderBackdrop}
        onDismiss={() => setCountrySheet(null)}
        onStoryPress={handleCountryStoryPress}
      />

      <ContextSheet
        sheetRef={contextSheetRef}
        sources={digSources}
        brief={contextBrief}
        loading={contextLoading}
        threadLabel={contextThreadLabel}
        bottomInset={insets.bottom}
        renderBackdrop={renderBackdrop}
        onDismiss={() => {
          setDigSources([]);
          setContextThreadLabel(undefined);
        }}
      />

      <BookmarkSheet
        sheetRef={bookmarkSheetRef}
        bottomInset={insets.bottom}
        renderBackdrop={renderBackdrop}
        onSelectArticle={handleSelectArticle}
        onDismiss={() => {}}
      />

      <SearchSheet
        sheetRef={searchSheetRef}
        grouped={grouped}
        bottomInset={insets.bottom}
        renderBackdrop={renderBackdrop}
        onSelectArticle={handleSelectArticle}
        onDismiss={() => {}}
      />

      <SettingsSheet
        sheetRef={settingsSheetRef}
        bottomInset={insets.bottom}
        renderBackdrop={renderBackdrop}
        onDismiss={() => {}}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  pager: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  errorText: {
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  errorHint: {
    textAlign: 'center',
  },
  retryText: {
    marginTop: SPACING.lg,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    zIndex: 10,
  },
  bottomSpacer: {
    flex: 1,
  },
  articleActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  actionPill: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    ...LAYOUT.floatingShadow,
  },
});
