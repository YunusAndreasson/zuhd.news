import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  type BottomSheetModal,
} from '@gorhom/bottom-sheet';
import type { Article, ArticleSource, Category, Chokepoint, Entity } from '@shared/types';
import { useNetworkState } from 'expo-network';
import * as SplashScreen from 'expo-splash-screen';
import { createRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { ChokepointSheet } from '../components/ChokepointSheet';
import { ContextSheet } from '../components/ContextSheet';
import { CountrySheet } from '../components/CountrySheet';
import { EntitySheet } from '../components/EntitySheet';
import { ErrorState } from '../components/ErrorState';
import type { TapResult } from '../components/globe/MiniGlobe';
import { MenuSheet } from '../components/MenuSheet';
import { SourcesSheet } from '../components/SourcesSheet';
import { Toast, type ToastRef } from '../components/Toast';
import { CATEGORIES, EDITORIAL, OPACITY } from '../constants/theme';
import { useArticles } from '../hooks/useArticles';
import { useBriefingPlayer } from '../hooks/useBriefingPlayer';
import { useChokepoints } from '../hooks/useChokepoints';
import { useContextBrief } from '../hooks/useContextBrief';
import { useHeatmap } from '../hooks/useHeatmap';
import { useTheme } from '../hooks/useTheme';
import { useTrendsSnapshot } from '../hooks/useTrendsSnapshot';
import { getSnapshot as getBookmarks, toggle as toggleBookmark } from '../lib/bookmark-store';
import { hapticImpact, hapticNotification, hapticTick } from '../lib/haptics';
import { usePendingNotification } from './_hooks/usePendingNotification';
import { useZoomCycle } from './_hooks/useZoomCycle';

const listRefs = CATEGORIES.map(() => createRef<ArticleListRef>());

export default function HomeScreen() {
  const { colors } = useTheme();
  const { current: currentZoom, toggle: handleZoomToggle } = useZoomCycle();
  const menuSheetRef = useRef<BottomSheetModal>(null);
  const sourcesSheetRef = useRef<BottomSheetModal>(null);
  const countrySheetRef = useRef<BottomSheetModal>(null);
  const chokepointSheetRef = useRef<BottomSheetModal>(null);
  const contextSheetRef = useRef<BottomSheetModal>(null);
  const entitySheetRef = useRef<BottomSheetModal>(null);
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
  const { chokepoints } = useChokepoints();
  const { byId: indicatorsById } = useTrendsSnapshot();
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

  // Sheet payloads (refs come from useSheetRefs above)
  const [sheetSources, setSheetSources] = useState<ArticleSource[]>([]);
  const [countrySheet, setCountrySheet] = useState<TapResult | null>(null);
  const [activeChokepoint, setActiveChokepoint] = useState<Chokepoint | null>(null);
  const [activeEntity, setActiveEntity] = useState<Entity | null>(null);
  const activeIndicator = useMemo(
    () => (activeEntity ? (indicatorsById.get(activeEntity.indicatorId) ?? null) : null),
    [activeEntity, indicatorsById],
  );
  const {
    brief: contextBrief,
    loading: contextLoading,
    fetchBrief: fetchContext,
  } = useContextBrief();
  const [contextThreadLabel, setContextThreadLabel] = useState<string | undefined>();

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

  const handleSourcesPress = useCallback((article: Article) => {
    hapticImpact();
    setSheetSources(article.sources);
    sourcesSheetRef.current?.present();
  }, []);

  const handleTimeAgoPress = useCallback((article: Article) => {
    hapticTick();
    const exact = new Date(article.addedAt).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    toastRef.current?.show(exact, undefined, 'top');
  }, []);

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

  // Ref for handleCountryPress, kept stable so the memoized renderItem in
  // ArticleList doesn't invalidate on every chokepoint refetch.
  const chokepointsRef = useRef(chokepoints);
  chokepointsRef.current = chokepoints;

  // Flat feed across categories — memoized so downstream memos keyed on it
  // (e.g. ChokepointSheet's findRelatedArticles) don't invalidate every render.
  const flatArticles = useMemo(() => Object.values(grouped).flat(), [grouped]);

  const handleEntityPress = useCallback(
    (entity: Entity) => {
      // Don't present the sheet if we can't resolve the indicator — the
      // reader taps, nothing happens, worse UX than no tap affordance at
      // all. This shouldn't fire in practice (extractor only emits ids
      // that exist in the catalog), but snapshot vs frontmatter can drift
      // briefly after a deploy.
      if (!indicatorsById.get(entity.indicatorId)) return;
      hapticTick();
      setActiveEntity(entity);
      entitySheetRef.current?.present();
    },
    [indicatorsById],
  );

  const handleCountryPress = useCallback(
    (result: TapResult) => {
      hapticImpact();
      if (result.chokepointId) {
        const cp = chokepointsRef.current.find((c) => c.id === result.chokepointId);
        if (cp) {
          setActiveChokepoint(cp);
          chokepointSheetRef.current?.present();
        }
        return;
      }
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

  const handleMenuToast = useCallback((message: string) => {
    toastRef.current?.show(message, undefined, 'top');
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

  usePendingNotification(
    loading,
    grouped,
    handleSelectArticle,
    briefingPlayer.toggle,
    !!(briefing?.available && briefing.date),
  );

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
                chokepoints={chokepoints}
                viewportHeight={pagerHeight}
                catIndex={catIndex}
                lastSeenAt={lastSeenAt}
                onRefresh={handleRefresh}
                onEndReached={handleEndReached}
                onCaughtUp={handleCaughtUp}
                onBookmarkPress={handleArticleBookmark}
                onSourcesPress={handleSourcesPress}
                onTimeAgoPress={handleTimeAgoPress}
                onEntityPress={handleEntityPress}
                onCountryPress={handleCountryPress}
                onArticleChange={handleArticleChange}
                progressesSV={categoryProgresses}
                zoomClipOverride={currentZoom.clip}
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
          zoomLabel={currentZoom.label}
          onBriefingPress={briefingPlayer.toggle}
          onZoomPress={handleZoomToggle}
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
        onToast={handleMenuToast}
      />

      <CountrySheet
        sheetRef={countrySheetRef}
        country={countrySheet}
        bottomInset={insets.bottom}
        renderBackdrop={renderBackdrop}
        onDismiss={() => setCountrySheet(null)}
      />

      <ChokepointSheet
        sheetRef={chokepointSheetRef}
        chokepoint={activeChokepoint}
        articles={flatArticles}
        bottomInset={insets.bottom}
        renderBackdrop={renderBackdrop}
        onDismiss={() => setActiveChokepoint(null)}
        onArticlePress={(slug, category) => {
          chokepointSheetRef.current?.dismiss();
          handleSelectArticle(slug, category);
        }}
      />

      <EntitySheet
        sheetRef={entitySheetRef}
        entity={activeEntity}
        indicator={activeIndicator}
        articles={flatArticles}
        bottomInset={insets.bottom}
        renderBackdrop={renderBackdrop}
        onDismiss={() => setActiveEntity(null)}
        onArticlePress={(slug, category) => {
          entitySheetRef.current?.dismiss();
          handleSelectArticle(slug, category);
        }}
      />

      <SourcesSheet
        sheetRef={sourcesSheetRef}
        sources={sheetSources}
        bottomInset={insets.bottom}
        renderBackdrop={renderBackdrop}
        onDismiss={() => setSheetSources([])}
      />

      <ContextSheet
        sheetRef={contextSheetRef}
        brief={contextBrief}
        loading={contextLoading}
        threadLabel={contextThreadLabel}
        bottomInset={insets.bottom}
        renderBackdrop={renderBackdrop}
        onDismiss={() => {
          setContextThreadLabel(undefined);
        }}
        onCountryPress={({ countryName, data }) => {
          setCountrySheet({
            countryName,
            location: null,
            localTime: null,
            data,
          });
          countrySheetRef.current?.present();
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
