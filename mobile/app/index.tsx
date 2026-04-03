import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  type BottomSheetModal,
} from '@gorhom/bottom-sheet';
import { useNetworkState } from 'expo-network';
import * as SplashScreen from 'expo-splash-screen';
import { Activity, createRef, useCallback, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import PagerView, { type PagerViewOnPageSelectedEvent } from 'react-native-pager-view';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionButtons } from '../components/ActionButtons';
import { ArticleList, type ArticleListRef } from '../components/ArticleList';
import { BookmarkSheet } from '../components/BookmarkSheet';
import { BriefingBar } from '../components/BriefingBar';
import { CategoryBar } from '../components/CategoryBar';
import { ContextSheet } from '../components/ContextSheet';
import { CountrySheet } from '../components/CountrySheet';
import type { TapResult } from '../components/globe/MiniGlobe';
import { SearchSheet } from '../components/SearchSheet';
import { SettingsSheet } from '../components/SettingsSheet';
import { Toast, type ToastRef } from '../components/Toast';
import { CATEGORIES, EDITORIAL, LAYOUT, PRESSED_STYLE, SPACING } from '../constants/theme';
import { useArticles } from '../hooks/useArticles';
import { useBriefingPlayer } from '../hooks/useBriefingPlayer';
import { useContextBrief } from '../hooks/useContextBrief';
import { useHeatmap } from '../hooks/useHeatmap';
import { useTheme } from '../hooks/useTheme';
import { toggle as toggleBookmark } from '../lib/bookmark-store';
import { hapticImpact, hapticNotification, hapticTick } from '../lib/haptics';
import type { Article, Category } from '../types';

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
  } = useArticles();
  const heatmapPoints = useHeatmap(generated);
  const network = useNetworkState();
  const insets = useSafeAreaInsets();
  const briefingPlayer = useBriefingPlayer(
    briefing?.available ? briefing.date : undefined,
    briefing?.duration,
  );

  // Sheet refs
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

  const handleSearchPress = useCallback(() => {
    hapticImpact();
    searchSheetRef.current?.present();
  }, []);

  const handleSelectArticle = useCallback((slug: string, category: Category) => {
    searchSheetRef.current?.dismiss();
    bookmarkSheetRef.current?.dismiss();
    const catIndex = CATEGORIES.indexOf(category);
    if (catIndex < 0) return;
    pagerRef.current?.setPage(catIndex);
    // Wait for pager to settle, then scroll to the article
    setTimeout(() => {
      listRefs[catIndex]?.current?.scrollToSlug?.(slug);
    }, 150);
  }, []);

  const handleBookmarkPress = useCallback(() => {
    hapticImpact();
    bookmarkSheetRef.current?.present();
  }, []);

  const handleArticleBookmark = useCallback((article: Article) => {
    const catIndex = currentCategoryRef.current;
    const category = CATEGORIES[catIndex] ?? 'politics';
    const added = toggleBookmark(article, category);
    hapticNotification();
    toastRef.current?.show(added ? 'Saved' : 'Removed');
  }, []);

  const handleSettingsPress = useCallback(() => {
    hapticImpact();
    settingsSheetRef.current?.present();
  }, []);

  const handleContextPress = useCallback(
    (threadId: string) => {
      hapticImpact();
      // Find the thread label from any article in the current view
      const allArticles = Object.values(groupedRef.current).flat();
      const match = allArticles.find((a) => a.threadId === threadId);
      setContextThreadLabel(match?.threadLabel);
      fetchContext(threadId);
      contextSheetRef.current?.present();
    },
    [fetchContext],
  );

  const handleBreakingPress = useCallback((coverage: number) => {
    hapticImpact();
    toastRef.current?.show(`${coverage}+ sources reporting`);
  }, []);

  const handleCountryPress = useCallback((result: TapResult) => {
    hapticImpact();
    // Hotspot glow tap → toast (event label or country name)
    if (result.isHotspot) {
      const label = result.hotspotLabels?.[0] ?? result.countryName;
      if (label) toastRef.current?.show(label);
      return;
    }
    // Country/dot tap → sheet
    setCountrySheet(result);
    countrySheetRef.current?.present();
  }, []);

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
      hapticImpact();
    },
    [currentCategory],
  );

  const handleCaughtUp = useCallback(() => {
    toastRef.current?.show('Caught up', undefined, 'top');
  }, []);

  const handleEndReached = useCallback((catIndex: number) => {
    const cat = CATEGORIES[catIndex];
    if (!cat) return;
    const count = groupedRef.current[cat]?.length ?? 0;
    toastRef.current?.show(`All ${count} articles \u00B7 tap to scroll up`, () =>
      listRefs[catIndex]?.current?.scrollToTop(),
    );
  }, []);

  const handleRefresh = useCallback(async () => {
    hapticTick();
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

  if (loading) return null;

  if (error && Object.values(grouped).every((a) => a.length === 0)) {
    const offline = network.isInternetReachable === false;
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <Text
          style={[
            styles.errorText,
            { fontFamily: font.regular, fontSize: typography.sizeBase, color: colors.text },
          ]}
        >
          {offline ? 'No connection.' : 'Could not load articles.'}
        </Text>
        <Text
          style={[
            styles.errorHint,
            { fontFamily: font.regular, fontSize: typography.sizeSm, color: colors.textSecondary },
          ]}
        >
          {offline ? 'Connect to the internet and reopen.' : error}
        </Text>
        <Pressable
          onPress={retry}
          style={({ pressed }) => pressed && PRESSED_STYLE}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Text
            style={[
              styles.retryText,
              { fontFamily: font.semiBold, fontSize: typography.sizeSm, color: colors.text },
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
        onSettingsPress={handleSettingsPress}
      />

      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        onPageSelected={onPageSelected}
        onPageScroll={onPageScroll}
        onLayout={onPagerLayout}
        overdrag
      >
        {CATEGORIES.map((cat, catIndex) => (
          <View key={cat} collapsable={false}>
            <Activity mode={catIndex === currentCategory ? 'visible' : 'hidden'}>
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
                  onContextPress={handleContextPress}
                  onBookmarkPress={handleArticleBookmark}
                  onCountryPress={handleCountryPress}
                  onBreakingPress={handleBreakingPress}
                  progressesSV={categoryProgresses}
                  tick={tick}
                  resetKey={resetKey}
                />
              )}
            </Activity>
          </View>
        ))}
      </PagerView>

      <Toast ref={toastRef} />

      {briefing?.available && briefing.date ? (
        <BriefingBar
          playing={briefingPlayer.playing}
          elapsed={briefingPlayer.elapsed}
          duration={briefingPlayer.duration}
          date={briefing.date}
          onToggle={briefingPlayer.toggle}
          onSeek={briefingPlayer.seek}
          onSearchPress={handleSearchPress}
          onBookmarkPress={handleBookmarkPress}
        />
      ) : (
        <View
          style={[styles.bottomActions, { paddingBottom: Math.max(insets.bottom, SPACING.sm) }]}
          pointerEvents="box-none"
        >
          <ActionButtons onSearchPress={handleSearchPress} onBookmarkPress={handleBookmarkPress} />
        </View>
      )}

      <CountrySheet
        sheetRef={countrySheetRef}
        country={countrySheet}
        bottomInset={insets.bottom}
        renderBackdrop={renderBackdrop}
        onDismiss={() => setCountrySheet(null)}
      />

      <ContextSheet
        sheetRef={contextSheetRef}
        brief={contextBrief}
        loading={contextLoading}
        threadLabel={contextThreadLabel}
        bottomInset={insets.bottom}
        renderBackdrop={renderBackdrop}
        onDismiss={() => setContextThreadLabel(undefined)}
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
  bottomActions: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
});
