import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { useNetworkState } from 'expo-network';
import * as SplashScreen from 'expo-splash-screen';
import { createRef, useCallback, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import PagerView, { type PagerViewOnPageSelectedEvent } from 'react-native-pager-view';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AboutPage } from '../components/AboutPage';
import { ArticleList, type ArticleListRef } from '../components/ArticleList';
import type { TapResult } from '../components/globe/MiniGlobe';

import { CategoryBar } from '../components/CategoryBar';

import { Toast, type ToastRef } from '../components/Toast';
import { SOURCES } from '../constants/sources';
import { CATEGORIES, COLORS, FONT, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useArticles } from '../hooks/useArticles';
import { useBriefingPlayer } from '../hooks/useBriefingPlayer';
import { useHaptic } from '../hooks/useHaptic';

function CountrySection({ label, items }: { label: string; items: (string | null | undefined)[] }) {
  const text = items.filter(Boolean).join(' · ');
  if (!text) return null;
  return (
    <>
      <Text style={styles.countrySectionLabel}>{label}</Text>
      <Text style={styles.countryContext}>{text}</Text>
    </>
  );
}

const listRefs = CATEGORIES.map(() => createRef<ArticleListRef>());

export default function HomeScreen() {
  const { grouped, briefing, loading, error, lastSeenAt, refresh, retry, tick } = useArticles();
  const { impact } = useHaptic();
  const network = useNetworkState();
  const insets = useSafeAreaInsets();
  const briefingPlayer = useBriefingPlayer(
    briefing?.available ? briefing.date : undefined,
    briefing?.duration,
  );

  // Sheet refs
  const sourceSheetRef = useRef<BottomSheetModal>(null);
  const [sourceSheet, setSourceSheet] = useState<string | null>(null);
  const [sourceSheetSources, setSourceSheetSources] = useState<Array<{name: string; country?: string | null}>>([]);
  const countrySheetRef = useRef<BottomSheetModal>(null);
  const [countrySheet, setCountrySheet] = useState<TapResult | null>(null);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        pressBehavior="close"
      />
    ),
    [],
  );

  const handleConceptPress = useCallback(
    (concept: string) => {
      impact();
      // Count articles across all categories that share this concept
      const allArticles = Object.values(grouped).flat();
      const related = allArticles.filter(
        (a) => a.concepts?.includes(concept) || a.title.includes(concept),
      );
      if (related.length > 1) {
        toastRef.current?.show(`${concept} · ${related.length} articles`);
      } else {
        toastRef.current?.show(concept);
      }
    },
    [impact, grouped],
  );

  const handleSourcePress = useCallback(
    (sourceName: string, allSources?: Array<{name: string; country?: string | null}>) => {
      impact();
      setSourceSheet(sourceName);
      setSourceSheetSources(allSources ?? []);
      sourceSheetRef.current?.present();
    },
    [impact],
  );

  const handleCountryPress = useCallback(
    (result: TapResult) => {
      impact();
      setCountrySheet(result);
      countrySheetRef.current?.present();
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
  const categoryProgresses = useSharedValue([0, 0, 0, 0]);

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
        const allArticles = Object.values(grouped).flat();
        const words = allArticles
          .filter((a) => a.addedAt > lastSeenAt)
          .reduce((sum, a) => sum + a.sentences.join(' ').split(/\s+/).length, 0);
        const mins = Math.max(1, Math.ceil(words / 238));
        toastRef.current?.show(`${n} new · ~${mins} min read`, undefined, 'top');
      } else {
        toastRef.current?.show('Already up to date', undefined, 'top');
      }
    } catch {
      toastRef.current?.show('Could not refresh', undefined, 'top');
    }
  }, [impact, refresh, grouped, lastSeenAt]);

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  if (loading) return null;

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
        briefingAvailable={briefing?.available ?? false}
        briefingPlaying={briefingPlayer.playing}
        onBriefingPress={briefingPlayer.toggle}
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
                onConceptPress={handleConceptPress}
                onCountryPress={handleCountryPress}
                pagerIdle={pagerIdle}
                progressesSV={categoryProgresses}
                tick={tick}
              />
            )}
          </View>
        ))}
        <View key="about" collapsable={false}>
          <AboutPage />
        </View>
      </PagerView>

      <Toast ref={toastRef} />

      {/* Source sheet */}
      <BottomSheetModal
        ref={sourceSheetRef}
        enableDynamicSizing
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.sheetHandle}
        onDismiss={() => { setSourceSheet(null); setSourceSheetSources([]); }}
      >
        <BottomSheetView
          style={[styles.sheetContent, { paddingBottom: insets.bottom + SPACING.lg }]}
        >
          {sourceSheetSources.length > 1 ? (
            <>
              <Text style={styles.sheetLabel}>
                {sourceSheetSources.length} SOURCES
              </Text>
              {sourceSheetSources.map((s, i) => {
                const info = SOURCES[s.name];
                return (
                  <View key={i} style={styles.sourceRow}>
                    <Text style={styles.sheetTitle}>{s.name}</Text>
                    {s.country && <Text style={styles.sourceCountry}>{s.country}</Text>}
                    {info && <Text style={styles.sheetBody}>{info.description}</Text>}
                  </View>
                );
              })}
            </>
          ) : sourceInfo ? (
            <>
              <Text style={styles.sheetLabel}>
                {sourceInfo.type.toUpperCase()} · {sourceInfo.location.toUpperCase()}
              </Text>
              <Text style={styles.sheetTitle}>{sourceSheet}</Text>
              <Text style={styles.sheetBody}>{sourceInfo.description}</Text>
            </>
          ) : null}
        </BottomSheetView>
      </BottomSheetModal>

      {/* Country sheet */}
      <BottomSheetModal
        ref={countrySheetRef}
        enableDynamicSizing
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.sheetHandle}
        onDismiss={() => setCountrySheet(null)}
      >
        <BottomSheetView
          style={[styles.sheetContent, { paddingBottom: insets.bottom + SPACING.lg }]}
        >
          {countrySheet?.data && (
            <>
              {/* Identity */}
              <Text style={styles.sheetLabel}>
                {[
                  countrySheet.data.region?.toUpperCase(),
                  countrySheet.data.landlocked ? 'LANDLOCKED' : null,
                  !countrySheet.data.independent ? 'DISPUTED' : null,
                  countrySheet.localTime,
                ].filter(Boolean).join(' · ')}
              </Text>
              <View style={styles.countryIdentity}>
                <Text style={styles.countryFlag}>{countrySheet.data.flag}</Text>
                <View style={styles.countryIdentityText}>
                  <Text style={styles.countryName}>{countrySheet.data.official}</Text>
                  {countrySheet.location && countrySheet.location !== countrySheet.data.capital && (
                    <Text style={styles.sheetBody}>{countrySheet.location}</Text>
                  )}
                </View>
              </View>

              {/* Geography & People */}
              <CountrySection label="geography & people" items={[
                countrySheet.data.capital ? `Capital ${countrySheet.data.capital}` : null,
                countrySheet.data.population,
                countrySheet.data.area,
                countrySheet.data.languages,
              ]} />

              {/* Economy */}
              <CountrySection label="economy" items={[
                countrySheet.data.gdp ? `GDP ${countrySheet.data.gdp}` : null,
                countrySheet.data.gdpPerCapita ? `${countrySheet.data.gdpPerCapita}/capita` : null,
                countrySheet.data.currency
                  ? `${countrySheet.data.currency}${countrySheet.data.currencySymbol ? ` ${countrySheet.data.currencySymbol}` : ''}`
                  : null,
              ]} />

              {/* Society */}
              <CountrySection label="society" items={[
                countrySheet.data.lifeExpectancy ? `Life expectancy ${countrySheet.data.lifeExpectancy}` : null,
                countrySheet.data.internetPct ? `${countrySheet.data.internetPct} online` : null,
              ]} />

              {/* Military */}
              <CountrySection label="military" items={[
                countrySheet.data.military,
                countrySheet.data.militaryPctGdp ? `${countrySheet.data.militaryPctGdp} of GDP` : null,
              ]} />
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
  sourceRow: {
    marginBottom: SPACING.md,
  },
  sourceCountry: {
    fontFamily: FONT.smallCaps,
    fontSize: TYPOGRAPHY.sizeXs,
    letterSpacing: TYPOGRAPHY.trackingCaps,
    color: COLORS.accent,
    marginBottom: SPACING.xs,
  },
  countryIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  countryIdentityText: {
    flex: 1,
  },
  countryFlag: {
    fontSize: 36,
  },
  countryName: {
    fontFamily: FONT.bold,
    fontSize: TYPOGRAPHY.sizeBase,
    color: COLORS.text,
  },
  countrySectionLabel: {
    fontFamily: FONT.smallCaps,
    fontSize: TYPOGRAPHY.sizeSm,
    color: COLORS.accent,
    letterSpacing: TYPOGRAPHY.trackingCaps,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  countryContext: {
    fontFamily: FONT.regular,
    fontSize: TYPOGRAPHY.sizeSm,
    lineHeight: TYPOGRAPHY.sizeSm * TYPOGRAPHY.leadingBody,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
});
