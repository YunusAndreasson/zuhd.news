import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { useNetworkState } from 'expo-network';
import { createRef, useCallback, useRef, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import PagerView, { type PagerViewOnPageSelectedEvent } from 'react-native-pager-view';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AboutPage } from '../components/AboutPage';
import { ArticleList, type ArticleListRef } from '../components/ArticleList';
import { BriefingButton } from '../components/BriefingButton';
import { CategoryBar } from '../components/CategoryBar';
import { GlobePage } from '../components/GlobePage';
import { Toast, type ToastRef } from '../components/Toast';
import { SOURCES } from '../constants/sources';
import { CATEGORIES, COLORS, FONT, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useArticles } from '../hooks/useArticles';
import { useHaptic } from '../hooks/useHaptic';
import type { Article } from '../types';

function formatTimeAgo(addedAt: number): string {
  const hours = Math.floor((Date.now() - addedAt) / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return new Date(addedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const listRefs = CATEGORIES.map(() => createRef<ArticleListRef>());

export default function HomeScreen() {
  const { grouped, briefing, loading, error, lastSeenAt, refresh, retry } = useArticles();
  const { impact } = useHaptic();
  const network = useNetworkState();
  const insets = useSafeAreaInsets();

  // Sheet refs
  const threadSheetRef = useRef<BottomSheetModal>(null);
  const sourceSheetRef = useRef<BottomSheetModal>(null);
  const [threadSheet, setThreadSheet] = useState<Article | null>(null);
  const [threadArticles, setThreadArticles] = useState<Article[]>([]);
  const [sourceSheet, setSourceSheet] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} pressBehavior="close" />
    ),
    [],
  );

  const getThreadArticles = useCallback(
    (threadId: string): Article[] => {
      return Object.values(grouped)
        .flat()
        .filter((a) => a.threadId === threadId)
        .sort((a, b) => b.addedAt - a.addedAt);
    },
    [grouped],
  );

  const handleThreadPress = useCallback(
    (article: Article) => {
      if (!article.threadId) return;
      impact();
      setThreadSheet(article);
      setThreadArticles(getThreadArticles(article.threadId));
      setSheetOpen(true);
      threadSheetRef.current?.present();
    },
    [impact, getThreadArticles],
  );

  const handleSourcePress = useCallback(
    (sourceName: string) => {
      impact();
      setSourceSheet(sourceName);
      setSheetOpen(true);
      sourceSheetRef.current?.present();
    },
    [impact],
  );

  const pagerRef = useRef<PagerView>(null);
  const toastRef = useRef<ToastRef>(null);

  const [currentCategory, setCurrentCategory] = useState(0);
  const pagerIdle = useRef(true);

  const [pagerHeight, setPagerHeight] = useState(0);
  const onPagerLayout = useCallback((e: LayoutChangeEvent) => {
    setPagerHeight(e.nativeEvent.layout.height);
  }, []);

  const pagerOffset = useSharedValue(0);
  const categoryProgresses = useSharedValue([0, 0, 0, 0, 0]);

  const onPageSelected = useCallback(
    (e: PagerViewOnPageSelectedEvent) => {
      const page = e.nativeEvent.position;
      setCurrentCategory(page);
      pagerOffset.value = page;
      impact();
    },
    [impact, pagerOffset],
  );

  const onPageScroll = useCallback(
    (e: { nativeEvent: { position: number; offset: number } }) => {
      pagerOffset.value = e.nativeEvent.position + e.nativeEvent.offset;
    },
    [pagerOffset],
  );

  const onPageScrollStateChanged = useCallback(
    (e: { nativeEvent: { pageScrollState: string } }) => {
      pagerIdle.current = e.nativeEvent.pageScrollState === 'idle';
    },
    [],
  );

  const onCategoryPress = useCallback(
    (index: number) => {
      if (index === currentCategory && index < CATEGORIES.length) {
        listRefs[index]?.current?.scrollToTop();
      } else {
        pagerRef.current?.setPage(index);
      }
      impact();
    },
    [impact, currentCategory],
  );

  const handleRefresh = useCallback(async () => {
    impact();
    try {
      const n = await refresh();
      if (n > 0) {
        toastRef.current?.show(`${n} new article${n > 1 ? 's' : ''}`);
      } else {
        toastRef.current?.show('Already up to date');
      }
    } catch {
      toastRef.current?.show('Could not refresh');
    }
  }, [impact, refresh]);

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>zuhd.news</Text>
      </View>
    );
  }

  if (error && Object.values(grouped).every((a) => a.length === 0)) {
    const offline = network.isInternetReachable === false;
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {offline ? 'No connection.' : 'Could not load articles.'}
        </Text>
        <Text style={styles.errorHint}>
          {offline ? 'Connect to the internet and reopen.' : error}
        </Text>
        <Pressable
          onPress={retry}
          style={({ pressed }) => pressed && { opacity: 0.5 }}
          hitSlop={12}
        >
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const sourceInfo = sourceSheet ? SOURCES[sourceSheet] : null;

  return (
    <View style={styles.screen}>
      <CategoryBar
        pagerOffset={pagerOffset}
        categoryProgresses={categoryProgresses}
        onCategoryPress={onCategoryPress}
      />

      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={0}
        onPageSelected={onPageSelected}
        onPageScroll={onPageScroll}
        onPageScrollStateChanged={onPageScrollStateChanged}
        onLayout={onPagerLayout}
        overdrag
      >
        {CATEGORIES.map((cat, catIndex) => (
          <View key={cat} collapsable={false}>
            {pagerHeight > 0 && (
              <ArticleList
                ref={listRefs[catIndex]}
                articles={grouped[cat]}
                viewportHeight={pagerHeight}
                catIndex={catIndex}
                lastSeenAt={lastSeenAt}
                onRefresh={handleRefresh}
                onEndReached={() =>
                  toastRef.current?.show(
                    `All ${grouped[cat].length} articles \u00B7 tap to scroll up`,
                    () => listRefs[catIndex]?.current?.scrollToTop(),
                  )
                }
                onThreadPress={handleThreadPress}
                onSourcePress={handleSourcePress}
                pagerIdle={pagerIdle}
                progressesSV={categoryProgresses}
              />
            )}
          </View>
        ))}
        <View key="globe" collapsable={false}>
          <GlobePage
            grouped={grouped}
            visible={currentCategory === CATEGORIES.length}
            onRefresh={refresh}
            onToast={(msg) => toastRef.current?.show(msg)}
          />
        </View>
        <View key="about" collapsable={false}>
          <AboutPage />
        </View>
      </PagerView>

      {currentCategory < CATEGORIES.length && briefing?.available && !sheetOpen && (
        <BriefingButton date={briefing.date} />
      )}
      <Toast ref={toastRef} />

      {/* Thread sheet */}
      <BottomSheetModal
        ref={threadSheetRef}
        enableDynamicSizing
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.sheetHandle}
        onDismiss={() => { setThreadSheet(null); setSheetOpen(false); }}
      >
        <BottomSheetView
          style={[styles.sheetContent, { paddingBottom: insets.bottom + SPACING.lg }]}
        >
          {threadSheet && (
            <>
              <Text style={styles.sheetLabel}>
                {threadSheet.threadArc?.toUpperCase()} · DAY {threadSheet.threadDay}
              </Text>
              <Text style={styles.sheetTitle}>{threadSheet.threadLabel}</Text>
              {threadSheet.threadSummary && (
                <Text style={styles.sheetBody}>{threadSheet.threadSummary}</Text>
              )}
              {threadArticles.length > 1 && (
                <View style={styles.timeline}>
                  <Text style={styles.timelineHeader}>
                    {threadArticles.length} IN YOUR FEED · {threadSheet.threadArticleCount} TOTAL
                  </Text>
                  {threadArticles.map((a) => (
                    <View key={a.slug} style={styles.timelineItem}>
                      <View
                        style={[
                          styles.timelineDot,
                          a.slug === threadSheet.slug && styles.timelineDotActive,
                        ]}
                      />
                      <View style={styles.timelineText}>
                        <Text
                          style={[
                            styles.timelineTitle,
                            a.slug === threadSheet.slug && styles.timelineTitleActive,
                          ]}
                          numberOfLines={1}
                        >
                          {a.title}
                        </Text>
                        <Text style={styles.timelineSource}>
                          {a.source?.toUpperCase()} · {formatTimeAgo(a.addedAt)}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </BottomSheetView>
      </BottomSheetModal>

      {/* Source sheet */}
      <BottomSheetModal
        ref={sourceSheetRef}
        enableDynamicSizing
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.sheetHandle}
        onDismiss={() => { setSourceSheet(null); setSheetOpen(false); }}
      >
        <BottomSheetView
          style={[styles.sheetContent, { paddingBottom: insets.bottom + SPACING.lg }]}
        >
          {sourceInfo && (
            <>
              <Text style={styles.sheetLabel}>
                {sourceInfo.type.toUpperCase()} · {sourceInfo.location.toUpperCase()}
              </Text>
              <Text style={styles.sheetTitle}>{sourceSheet}</Text>
              <Text style={styles.sheetBody}>{sourceInfo.description}</Text>
            </>
          )}
        </BottomSheetView>
      </BottomSheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  pager: {
    flex: 1,
  },
  center: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  loadingText: {
    fontFamily: FONT.bold,
    fontSize: TYPOGRAPHY.sizeWordmark,
    color: COLORS.textSecondary,
  },
  errorText: {
    fontFamily: FONT.regular,
    fontSize: TYPOGRAPHY.sizeBase,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  errorHint: {
    fontFamily: FONT.regular,
    fontSize: TYPOGRAPHY.sizeSm,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  retryText: {
    fontFamily: FONT.semiBold,
    fontSize: TYPOGRAPHY.sizeSm,
    color: COLORS.text,
    marginTop: SPACING.lg,
  },
  // Bottom sheets
  sheetBg: {
    backgroundColor: '#1c1c1c',
  },
  sheetHandle: {
    backgroundColor: COLORS.rule,
    width: 36,
  },
  sheetContent: {
    padding: SPACING.screenPadding,
  },
  sheetLabel: {
    fontFamily: FONT.semiBold,
    fontSize: TYPOGRAPHY.sizeXs,
    color: COLORS.textSecondary,
    letterSpacing: TYPOGRAPHY.trackingCaps,
    marginBottom: SPACING.sm,
  },
  sheetTitle: {
    fontFamily: FONT.bold,
    fontSize: TYPOGRAPHY.sizeBase,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  sheetBody: {
    fontFamily: FONT.regular,
    fontSize: TYPOGRAPHY.sizeSm,
    lineHeight: TYPOGRAPHY.sizeSm * TYPOGRAPHY.leadingBody,
    color: COLORS.textSecondary,
  },
  timeline: {
    marginTop: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.rule,
    paddingTop: SPACING.md,
  },
  timelineHeader: {
    fontFamily: FONT.semiBold,
    fontSize: TYPOGRAPHY.sizeXs,
    color: COLORS.accent,
    letterSpacing: TYPOGRAPHY.trackingCaps,
    marginBottom: SPACING.md,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  timelineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.rule,
    marginTop: 5,
  },
  timelineDotActive: {
    backgroundColor: COLORS.text,
  },
  timelineText: {
    flex: 1,
  },
  timelineTitle: {
    fontFamily: FONT.regular,
    fontSize: TYPOGRAPHY.sizeSm,
    color: COLORS.textSecondary,
  },
  timelineTitleActive: {
    fontFamily: FONT.semiBold,
    color: COLORS.text,
  },
  timelineSource: {
    fontFamily: FONT.regular,
    fontSize: TYPOGRAPHY.sizeXs,
    color: COLORS.accent,
    marginTop: 2,
  },
});
