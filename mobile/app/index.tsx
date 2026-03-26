import { Ionicons } from '@expo/vector-icons';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { useNetworkState } from 'expo-network';
import * as SplashScreen from 'expo-splash-screen';
import { FullWindowOverlay } from 'react-native-screens';

function SheetContainer({ children }: { children?: React.ReactNode }) {
  return <FullWindowOverlay>{children}</FullWindowOverlay>;
}

import {
  Activity,
  createRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import {
  Dimensions,
  type LayoutChangeEvent,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import PagerView, { type PagerViewOnPageSelectedEvent } from 'react-native-pager-view';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArticleList, type ArticleListRef } from '../components/ArticleList';
import { CategoryBar } from '../components/CategoryBar';
import { ContextSheet } from '../components/ContextSheet';
import type { TapResult } from '../components/globe/MiniGlobe';
import { SheetHandle } from '../components/SheetHandle';
import { Toast, type ToastRef } from '../components/Toast';
import { SOURCES } from '../constants/sources';
import {
  CATEGORIES,
  COLORS,
  EDITORIAL,
  FONT,
  LAYOUT,
  PRESSED_STYLE,
  SPACING,
  TEXT_STYLES,
  TYPOGRAPHY,
} from '../constants/theme';
import { useArticles } from '../hooks/useArticles';
import { useBriefingPlayer } from '../hooks/useBriefingPlayer';
import { useContextBrief } from '../hooks/useContextBrief';
import { useHeatmap } from '../hooks/useHeatmap';
import { hapticImpact, hapticTick } from '../lib/haptics';
import type { ArticleSource } from '../types';

function KeyStat({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.keyStat}>
      <Text selectable style={styles.keyStatValue}>{value}</Text>
      <Text selectable style={styles.keyStatLabel}>{label}</Text>
    </View>
  );
}

function ccToFlag(cc: string): string {
  return cc
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65));
}

function CountryRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.countryRow}>
      <Text selectable style={styles.countryRowLabel}>{label}</Text>
      <Text selectable style={styles.countryRowValue}>{value}</Text>
    </View>
  );
}

const listRefs = CATEGORIES.map(() => createRef<ArticleListRef>());

export default function HomeScreen() {
  const { grouped, briefing, loading, error, lastSeenAt, refresh, retry, tick, resetKey, generated } =
    useArticles();
  const heatmapPoints = useHeatmap(generated);
  const network = useNetworkState();
  const insets = useSafeAreaInsets();
  const briefingPlayer = useBriefingPlayer(
    briefing?.available ? briefing.date : undefined,
    briefing?.duration,
  );

  // Sheet refs
  const sourceSheetRef = useRef<BottomSheetModal>(null);
  const [sourceSheetSources, setSourceSheetSources] = useState<ArticleSource[]>([]);
  const [sourceSheetDivergence, setSourceSheetDivergence] = useState<number | null>(null);
  const [expandedSource, setExpandedSource] = useState<number | null>(null);
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
        opacity={LAYOUT.backdropOpacity}
      />
    ),
    [],
  );

  const SourceHandle = useCallback(
    () => <SheetHandle title={sourceSheetSources.length === 1 ? 'source' : 'sources'} />,
    [sourceSheetSources.length],
  );
  const CountryHandle = useCallback(() => <SheetHandle />, []);

  const handleSourcePress = useCallback(
    (_sourceName: string, allSources?: ArticleSource[], divergence?: number | null) => {
      hapticImpact();
      setSourceSheetSources(allSources ?? []);
      setSourceSheetDivergence(divergence ?? null);
      sourceSheetRef.current?.present();
    },
    [],
  );

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

  const handleCountryPress = useCallback((result: TapResult) => {
    hapticImpact();
    // Direct hotspot-glow tap (no country data) → toast
    if (result.hotspotLabels?.length && !result.data) {
      toastRef.current?.show(result.hotspotLabels[0]!);
      return;
    }
    // Country tap (may include hotspot labels) → sheet
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

  const [, startTransition] = useTransition();

  const onPageSelected = useCallback(
    (e: PagerViewOnPageSelectedEvent) => {
      const page = e.nativeEvent.position;
      pagerOffset.value = page;
      hapticTick();
      startTransition(() => {
        setCurrentCategory(page);
      });
    },
    [pagerOffset, startTransition],
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

  const handleEndReached = useCallback(
    (catIndex: number) => {
      const cat = CATEGORIES[catIndex];
      if (!cat) return;
      const count = groupedRef.current[cat]?.length ?? 0;
      toastRef.current?.show(`All ${count} articles \u00B7 tap to scroll up`, () =>
        listRefs[catIndex]?.current?.scrollToTop(),
      );
    },
    [],
  );

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
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {offline ? 'No connection.' : 'Could not load articles.'}
        </Text>
        <Text style={styles.errorHint}>
          {offline ? 'Connect to the internet and reopen.' : error}
        </Text>
        <Pressable onPress={retry} style={({ pressed }) => pressed && PRESSED_STYLE} hitSlop={12}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <CategoryBar
        pagerOffset={pagerOffset}
        categoryProgresses={categoryProgresses}
        currentCategory={currentCategory}
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
                  onSourcePress={handleSourcePress}
                  onContextPress={handleContextPress}
                  onCountryPress={handleCountryPress}
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

      {/* Source sheet */}
      <BottomSheetModal
        ref={sourceSheetRef}
        enableDynamicSizing
        maxDynamicContentSize={Dimensions.get('window').height * LAYOUT.sheetMaxFraction}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBg}
        handleComponent={SourceHandle}
        containerComponent={SheetContainer}
        onDismiss={() => {
          setSourceSheetSources([]);
          setSourceSheetDivergence(null);
          setExpandedSource(null);
        }}
      >
        <BottomSheetScrollView
          contentContainerStyle={[
            styles.sheetContent,
            { paddingBottom: insets.bottom + SPACING.lg },
          ]}
        >
          {sourceSheetSources.length > 0 ? (
            <>
              <Text style={styles.coverageHeading}>
                {sourceSheetDivergence != null &&
                sourceSheetDivergence >= EDITORIAL.divergenceModerate &&
                sourceSheetSources.length > 1
                  ? sourceSheetDivergence >= EDITORIAL.divergenceHigh
                    ? 'These sources frame this story very differently.'
                    : 'These sources frame this story differently.'
                  : 'How this story is covered'}
              </Text>
              {sourceSheetSources.map((s, i) => {
                const info = SOURCES[s.name];
                const cc = s.country?.toUpperCase();
                const flag = cc ? ccToFlag(cc) : null;
                const tone =
                  s.sentiment != null
                    ? s.sentiment > EDITORIAL.sentimentPositive
                      ? 'favorable'
                      : s.sentiment < EDITORIAL.sentimentNegative
                        ? 'unfavorable'
                        : 'neutral'
                    : null;
                const toneWord =
                  tone === 'favorable'
                    ? 'favorably'
                    : tone === 'unfavorable'
                      ? 'critically'
                      : tone === 'neutral'
                        ? 'neutral'
                        : null;
                const isExpanded = expandedSource === i;
                return (
                  <Pressable
                    key={i}
                    style={styles.sourceRow}
                    onPress={() => setExpandedSource(isExpanded ? null : i)}
                  >
                    <View style={styles.sourceRowHeader}>
                      <Text style={styles.sourceName} numberOfLines={1}>
                        {flag ? `${flag} ` : ''}
                        {s.name}
                      </Text>
                      <View style={styles.sourceRowRight}>
                        {toneWord && (
                          <View
                            style={[
                              styles.tonePill,
                              tone === 'favorable' && styles.pillFavorable,
                              tone === 'unfavorable' && styles.pillUnfavorable,
                              tone === 'neutral' && styles.pillNeutral,
                            ]}
                          >
                            <Text style={styles.tonePillText}>{toneWord}</Text>
                          </View>
                        )}
                        <Ionicons
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          size={LAYOUT.iconSm}
                          color={COLORS.accent}
                        />
                      </View>
                    </View>
                    {isExpanded && info && (
                      <>
                        <Text selectable style={styles.sourceType}>
                          {info.type} · {info.location}
                        </Text>
                        <Text selectable style={styles.sheetBody}>{info.description}</Text>
                      </>
                    )}
                  </Pressable>
                );
              })}
              <Text
                style={styles.correctionLink}
                onPress={() => Linking.openURL('mailto:yunus@edenmind.com?subject=Correction')}
              >
                Submit a correction
              </Text>
            </>
          ) : null}
        </BottomSheetScrollView>
      </BottomSheetModal>

      {/* Country sheet */}
      <BottomSheetModal
        ref={countrySheetRef}
        enableDynamicSizing
        maxDynamicContentSize={Dimensions.get('window').height * LAYOUT.sheetMaxFraction}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBg}
        handleComponent={CountryHandle}
        containerComponent={SheetContainer}
        onDismiss={() => setCountrySheet(null)}
      >
        <BottomSheetScrollView
          contentContainerStyle={[
            styles.sheetContent,
            { paddingBottom: insets.bottom + SPACING.lg },
          ]}
        >
          {countrySheet?.data && (
            <>
              {/* Identity — city + country hero */}
              <View style={styles.countryIdentity}>
                <View style={styles.countryIdentityText}>
                  <Text selectable style={styles.countryLocation}>{countrySheet.countryName}</Text>
                  <Text selectable style={styles.countryName}>{countrySheet.data.official}</Text>
                </View>
                <Text style={styles.countryFlag}>{countrySheet.data.flag}</Text>
              </View>

              {/* Key stats — at-a-glance numbers */}
              <View style={styles.countryKeyStats}>
                <KeyStat label="population" value={countrySheet.data.population} />
                <KeyStat label="gdp" value={countrySheet.data.gdp} />
                <KeyStat label="military spend" value={countrySheet.data.military} />
              </View>

              {/* Developing stories — shown when coverage hotspots overlap this country */}
              {countrySheet.hotspotLabels && countrySheet.hotspotLabels.length > 0 && (
                <View style={styles.hotspotSection}>
                  <Text style={styles.sheetLabel}>
                    {countrySheet.hotspotLabels.length === 1
                      ? 'DEVELOPING STORY'
                      : 'DEVELOPING STORIES'}
                  </Text>
                  {countrySheet.hotspotLabels.map((label, i) => (
                    <Text key={i} selectable style={styles.hotspotValue}>
                      {label}
                    </Text>
                  ))}
                </View>
              )}

              {/* Detail rows — ordered by user interest */}
              <CountryRow label="Capital" value={countrySheet.data.capital} />
              <CountryRow label="Languages" value={countrySheet.data.languages} />
              <CountryRow
                label="Currency"
                value={
                  countrySheet.data.currency
                    ? `${countrySheet.data.currency}${countrySheet.data.currencySymbol ? ` ${countrySheet.data.currencySymbol}` : ''}`
                    : null
                }
              />
              <CountryRow label="Local time" value={countrySheet.localTime} />
              <CountryRow label="Area" value={countrySheet.data.area} />
              <CountryRow label="GDP/capita" value={countrySheet.data.gdpPerCapita} />
              <CountryRow label="Life expectancy" value={countrySheet.data.lifeExpectancy} />
              <CountryRow label="Internet" value={countrySheet.data.internetPct} />
              <CountryRow
                label="Region"
                value={[
                  countrySheet.data.region,
                  countrySheet.data.landlocked ? 'Landlocked' : null,
                  !countrySheet.data.independent ? 'Disputed' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              />
            </>
          )}
        </BottomSheetScrollView>
      </BottomSheetModal>

      {/* Context sheet */}
      <ContextSheet
        sheetRef={contextSheetRef}
        brief={contextBrief}
        loading={contextLoading}
        threadLabel={contextThreadLabel}
        bottomInset={insets.bottom}
        renderBackdrop={renderBackdrop}
        onDismiss={() => setContextThreadLabel(undefined)}
      />
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
  sheetContent: {
    padding: SPACING.screenPadding,
  },
  sheetLabel: {
    ...TEXT_STYLES.smallCapsXs,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  coverageHeading: {
    fontFamily: FONT.regular,
    fontSize: TYPOGRAPHY.sizeSm,
    fontStyle: 'italic',
    color: COLORS.accent,
    marginBottom: SPACING.md,
  },
  sheetTitle: {
    fontFamily: FONT.bold,
    fontSize: TYPOGRAPHY.sizeBase,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  correctionLink: {
    ...TEXT_STYLES.smallCapsXs,
    color: COLORS.textSecondary,
    marginTop: SPACING.lg,
    textDecorationLine: 'underline',
  },
  sheetBody: {
    ...TEXT_STYLES.body,
    color: COLORS.accent,
  },
  sourceRow: {
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.rule,
  },
  sourceRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  sourceRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  sourceName: {
    fontFamily: FONT.semiBold,
    fontSize: TYPOGRAPHY.sizeBase,
    color: COLORS.text,
    flex: 1,
  },
  tonePill: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: LAYOUT.pillPaddingV,
    borderRadius: LAYOUT.pillRadius,
  },
  tonePillText: {
    fontFamily: FONT.semiBold,
    fontSize: TYPOGRAPHY.sizeXs,
    color: COLORS.bg,
    letterSpacing: TYPOGRAPHY.trackingCaps,
  },
  pillFavorable: {
    backgroundColor: COLORS.toneFavorable,
  },
  pillUnfavorable: {
    backgroundColor: COLORS.toneUnfavorable,
  },
  pillNeutral: {
    backgroundColor: COLORS.toneNeutral,
  },
  sourceType: {
    ...TEXT_STYLES.smallCapsXs,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  hotspotSection: {
    paddingBottom: SPACING.md,
    marginBottom: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.rule,
  },
  hotspotValue: {
    fontFamily: FONT.regular,
    fontSize: TYPOGRAPHY.sizeSm,
    color: COLORS.text,
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
    fontSize: TYPOGRAPHY.sizeH1 * 1.3,
  },
  countryLocation: {
    fontFamily: FONT.bold,
    fontSize: TYPOGRAPHY.sizeH1 * 0.75,
    lineHeight: TYPOGRAPHY.sizeH1 * 0.75 * TYPOGRAPHY.leadingHeading,
    color: COLORS.textEmphasis,
  },
  countryName: {
    fontFamily: FONT.regular,
    fontSize: TYPOGRAPHY.sizeSm,
    color: COLORS.textSecondary,
  },
  countryKeyStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.rule,
  },
  keyStat: {
    flex: 1,
    alignItems: 'center',
  },
  keyStatValue: {
    fontFamily: FONT.bold,
    fontSize: TYPOGRAPHY.sizeBase,
    color: COLORS.textEmphasis,
    marginBottom: 2,
  },
  keyStatLabel: {
    ...TEXT_STYLES.smallCapsXs,
    color: COLORS.textSecondary,
  },
  countryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING.xs,
  },
  countryRowLabel: {
    ...TEXT_STYLES.smallCaps,
    flex: 1,
  },
  countryRowValue: {
    fontFamily: FONT.regular,
    fontSize: TYPOGRAPHY.sizeSm,
    color: COLORS.text,
    textAlign: 'right',
    flex: 1,
  },
});
