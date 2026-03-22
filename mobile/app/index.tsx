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
import { useBriefingPlayer } from '../hooks/useBriefingPlayer';
import { useHaptic } from '../hooks/useHaptic';

const listRefs = CATEGORIES.map(() => createRef<ArticleListRef>());

export default function HomeScreen() {
  const { grouped, briefing, loading, error, lastSeenAt, refresh, retry, tick } = useArticles();
  const { impact } = useHaptic();
  const network = useNetworkState();
  const insets = useSafeAreaInsets();
  const briefingPlayer = useBriefingPlayer(briefing?.available ? briefing.date : undefined);

  // Sheet refs
  const sourceSheetRef = useRef<BottomSheetModal>(null);
  const [sourceSheet, setSourceSheet] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} pressBehavior="close" />
    ),
    [],
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
        toastRef.current?.show(`${n} new article${n > 1 ? 's' : ''}`, undefined, 'top');
      } else {
        toastRef.current?.show('Already up to date', undefined, 'top');
      }
    } catch {
      toastRef.current?.show('Could not refresh', undefined, 'top');
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
                onSourcePress={handleSourcePress}
                pagerIdle={pagerIdle}
                progressesSV={categoryProgresses}
                tick={tick}
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

      {briefing?.available && (currentCategory < CATEGORIES.length || briefingPlayer.playing) && !sheetOpen && (
        <BriefingButton playing={briefingPlayer.playing} onPress={briefingPlayer.toggle} />
      )}
      <Toast ref={toastRef} />

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
    backgroundColor: COLORS.sheetBg,
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
});
