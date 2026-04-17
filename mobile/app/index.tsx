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
  Share,
  StyleSheet,
  View,
} from 'react-native';
import PagerView, {
  type PagerViewOnPageScrollEvent,
  type PagerViewOnPageSelectedEvent,
} from 'react-native-pager-view';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArticleList, type ArticleListRef } from '../components/ArticleList';
import { BottomActionBar } from '../components/BottomActionBar';
import { BriefingBar } from '../components/BriefingBar';
import { CategoryBar } from '../components/CategoryBar';
import { ContextSheet } from '../components/ContextSheet';
import { CountrySheet } from '../components/CountrySheet';
import { ErrorState } from '../components/ErrorState';
import type { TapResult } from '../components/globe/MiniGlobe';
import { MenuSheet } from '../components/MenuSheet';
import { Toast, type ToastRef } from '../components/Toast';
import { CATEGORIES, EDITORIAL, OPACITY } from '../constants/theme';
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
  const { colors } = useTheme();
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

  // Active article tracking (for bottom action bar). Kept in a ref — the
  // selected article only feeds callbacks (share, context), never JSX, so
  // state here would re-render the whole HomeScreen tree on every snap.
  const currentArticlesRef = useRef<(Article | null)[]>([null, null, null, null]);
  const activeArticleRef = useRef<Article | null>(null);

  // Sheet refs
  const menuSheetRef = useRef<BottomSheetModal>(null);
  const [digSources, setDigSources] = useState<ArticleSource[]>([]);

  const countrySheetRef = useRef<BottomSheetModal>(null);
  const [countrySheet, setCountrySheet] = useState<TapResult | null>(null);
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
        opacity={OPACITY.backdrop}
      />
    ),
    [],
  );

  const handleSelectArticle = useCallback(
    (slug: string, category: Category) => {
      menuSheetRef.current?.dismiss();
      const catIndex = CATEGORIES.indexOf(category);
      if (catIndex < 0) return;

      // If the article rotated out of the feed, inject the bookmarked copy
      const inFeed = groupedRef.current[category].some((a) => a.slug === slug);
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

  const handleDeeperPress = useCallback(() => {
    const active = activeArticleRef.current;
    if (!active) return;
    hapticImpact();
    // Capture article metadata at open time
    setDigSources(active.sources);

    // Fetch context if article has a thread
    if (active.threadId) {
      const allArticles = Object.values(groupedRef.current).flat();
      const match = allArticles.find((a) => a.threadId === active.threadId);
      setContextThreadLabel(match?.threadLabel);
      fetchContext(active.threadId);
    } else {
      setContextThreadLabel(undefined);
    }
    contextSheetRef.current?.present();
  }, [fetchContext]);

  const handleBottomShare = useCallback(() => {
    const active = activeArticleRef.current;
    if (!active) return;
    hapticImpact();
    const url = `https://zuhd.news/a/${active.slug}`;
    const title = active.title;
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
  }, []);

  const handleArticleChange = useCallback((article: Article, catIndex: number) => {
    currentArticlesRef.current[catIndex] = article;
    if (catIndex === currentCategoryRef.current) {
      activeArticleRef.current = article;
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
            const match = groupedRef.current[cat].find((a) => {
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
        const match = groupedRef.current[cat].find((a) => {
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
      activeArticleRef.current = currentArticlesRef.current[page] ?? null;
    },
    [pagerOffset],
  );

  const onPageScroll = useCallback(
    (e: PagerViewOnPageScrollEvent) => {
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
    for (const cat of CATEGORIES) {
      if (grouped[cat].some((a) => a.slug === slug)) {
        handleSelectArticle(slug, cat);
        break;
      }
    }
  }, [loading, grouped, handleSelectArticle]);

  if (loading) return null;

  if (error && Object.values(grouped).every((a) => a.length === 0)) {
    return (
      <ErrorState offline={network.isInternetReachable === false} error={error} onRetry={retry} />
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

      {!(briefingPlayer.playing || briefingPlayer.elapsed > 0) && (
        <BottomActionBar
          bottomInset={insets.bottom}
          showBriefing={!!(briefing?.available && briefing.date)}
          onBriefingPress={briefingPlayer.toggle}
          onSharePress={handleBottomShare}
          onContextPress={handleDeeperPress}
        />
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
        grouped={grouped}
        onSelectArticle={handleSelectArticle}
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
});
