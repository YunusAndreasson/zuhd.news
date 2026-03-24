import { Ionicons } from '@expo/vector-icons';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { useNetworkState } from 'expo-network';
import * as SplashScreen from 'expo-splash-screen';
import {
  Activity,
  createRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import { type LayoutChangeEvent, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import PagerView, { type PagerViewOnPageSelectedEvent } from 'react-native-pager-view';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArticleList, type ArticleListRef } from '../components/ArticleList';
import { CategoryBar } from '../components/CategoryBar';
import type { TapResult } from '../components/globe/MiniGlobe';
import { Toast, type ToastRef } from '../components/Toast';
import { SOURCES } from '../constants/sources';
import { CATEGORIES, COLORS, FONT, PRESSED_STYLE, SPACING, TEXT_STYLES, TYPOGRAPHY } from '../constants/theme';
import { useArticles } from '../hooks/useArticles';
import { useBriefingPlayer } from '../hooks/useBriefingPlayer';
import { useHaptic } from '../hooks/useHaptic';
import type { ArticleSource } from '../types';

function KeyStat({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.keyStat}>
      <Text style={styles.keyStatValue}>{value}</Text>
      <Text style={styles.keyStatLabel}>{label}</Text>
    </View>
  );
}

// Country code → flag emoji + full name
const CC_NAMES: Record<string, string> = {
  US: 'United States',
  GB: 'United Kingdom',
  QA: 'Qatar',
  FR: 'France',
  DE: 'Germany',
  ZA: 'South Africa',
  IN: 'India',
  KR: 'South Korea',
  NL: 'Netherlands',
  IL: 'Israel',
  RU: 'Russia',
  PK: 'Pakistan',
  BD: 'Bangladesh',
  HK: 'Hong Kong',
  MY: 'Malaysia',
  ID: 'Indonesia',
  NG: 'Nigeria',
  SE: 'Sweden',
  AR: 'Argentina',
  UY: 'Uruguay',
  CA: 'Canada',
  AU: 'Australia',
  NZ: 'New Zealand',
  EG: 'Egypt',
  TR: 'Türkiye',
  DZ: 'Algeria',
  CN: 'China',
  JP: 'Japan',
  BR: 'Brazil',
  MX: 'Mexico',
  CY: 'Cyprus',
};

function ccToFlag(cc: string): string {
  return cc
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65));
}

function CountryRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.countryRow}>
      <Text style={styles.countryRowLabel}>{label}</Text>
      <Text style={styles.countryRowValue}>{value}</Text>
    </View>
  );
}

const listRefs = CATEGORIES.map(() => createRef<ArticleListRef>());

export default function HomeScreen() {
  const { grouped, briefing, loading, error, lastSeenAt, refresh, retry, tick, resetKey } =
    useArticles();
  const { tick: hapticTick, impact } = useHaptic();
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

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        pressBehavior="close"
      />
    ),
    [],
  );

  const handleSourcePress = useCallback(
    (_sourceName: string, allSources?: ArticleSource[], divergence?: number | null) => {
      impact();
      setSourceSheetSources(allSources ?? []);
      setSourceSheetDivergence(divergence ?? null);
      sourceSheetRef.current?.present();
    },
    [impact],
  );

  const handleCountryPress = useCallback(
    (result: TapResult) => {
      impact();
      // Direct hotspot-glow tap (no country data) → toast
      if (result.hotspotLabels?.length && !result.data) {
        toastRef.current?.show(result.hotspotLabels[0]!);
        return;
      }
      // Country tap (may include hotspot labels) → sheet
      setCountrySheet(result);
      countrySheetRef.current?.present();
    },
    [impact],
  );

  const pagerRef = useRef<PagerView>(null);
  const toastRef = useRef<ToastRef>(null);

  const [currentCategory, setCurrentCategory] = useState(0);

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
    [hapticTick, pagerOffset, startTransition],
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
      impact();
    },
    [impact, currentCategory],
  );

  const handleCaughtUp = useCallback(() => {
    toastRef.current?.show('Caught up', undefined, 'top');
  }, []);

  const handleEndReached = useCallback(
    (catIndex: number) => {
      const cat = CATEGORIES[catIndex];
      if (!cat) return;
      const count = grouped[cat]?.length ?? 0;
      toastRef.current?.show(`All ${count} articles \u00B7 tap to scroll up`, () =>
        listRefs[catIndex]?.current?.scrollToTop(),
      );
    },
    [grouped],
  );

  const handleRefresh = useCallback(async () => {
    hapticTick();
    try {
      const n = await refresh();
      if (n > 0) {
        const allArticles = Object.values(grouped).flat();
        const words = allArticles
          .filter((a) => a.addedAt > lastSeenAt)
          .reduce((sum, a) => sum + a.sentences.join(' ').split(/\s+/).length, 0);
        const mins = Math.max(1, Math.ceil(words / 238));
        toastRef.current?.show(`${n} new · ~${mins} min read`, undefined, 'top');
        // Scroll to top so new/breaking articles are visible
        listRefs[currentCategory]?.current?.scrollToTop();
      } else {
        toastRef.current?.show('Already up to date', undefined, 'top');
      }
    } catch {
      toastRef.current?.show('Could not refresh', undefined, 'top');
    }
  }, [hapticTick, refresh, grouped, lastSeenAt, currentCategory]);

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
          style={({ pressed }) => pressed && PRESSED_STYLE}
          hitSlop={12}
        >
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
                  viewportHeight={pagerHeight}
                  catIndex={catIndex}
                  lastSeenAt={lastSeenAt}
                  onRefresh={handleRefresh}
                  onEndReached={handleEndReached}
                  onCaughtUp={handleCaughtUp}
                  onSourcePress={handleSourcePress}
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
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.sheetHandle}
        onDismiss={() => {
          setSourceSheetSources([]);
          setSourceSheetDivergence(null);
          setExpandedSource(null);
        }}
      >
        <BottomSheetView
          style={[styles.sheetContent, { paddingBottom: insets.bottom + SPACING.lg }]}
        >
          {sourceSheetSources.length > 0 ? (
            <>
              <Text style={styles.sheetLabel}>
                {sourceSheetSources.length === 1 ? 'SOURCE' : 'SOURCES'}
              </Text>
              {sourceSheetDivergence != null &&
                sourceSheetDivergence >= 0.2 &&
                sourceSheetSources.length > 1 && (
                  <Text style={styles.divergenceNote}>
                    {sourceSheetDivergence >= 0.35
                      ? 'These sources frame this story very differently.'
                      : 'These sources frame this story differently.'}
                  </Text>
                )}
              {sourceSheetSources.map((s, i) => {
                const info = SOURCES[s.name];
                const cc = s.country?.toUpperCase();
                const countryName = cc ? (CC_NAMES[cc] ?? cc) : null;
                const flag = cc ? ccToFlag(cc) : null;
                const tone =
                  s.sentiment != null
                    ? s.sentiment > 0.2
                      ? 'favorable'
                      : s.sentiment < -0.2
                        ? 'unfavorable'
                        : 'neutral'
                    : null;
                const isExpanded = expandedSource === i;
                return (
                  <Pressable
                    key={i}
                    style={styles.sourceRow}
                    onPress={() => setExpandedSource(isExpanded ? null : i)}
                  >
                    <View style={styles.sourceRowHeader}>
                      <View style={styles.sourceRowLeft}>
                        <Text style={styles.sheetTitle}>
                          {flag ? `${flag} ` : ''}
                          {s.name}
                        </Text>
                        {info && (
                          <Text style={styles.sourceType}>
                            {info.type} · {info.location}
                          </Text>
                        )}
                      </View>
                      <View style={styles.sourceRowRight}>
                        {tone && <Text style={styles.toneLabel}>{tone}</Text>}
                        {info && (
                          <Ionicons
                            name={isExpanded ? 'chevron-up' : 'chevron-down'}
                            size={16}
                            color={COLORS.accent}
                          />
                        )}
                      </View>
                    </View>
                    {isExpanded && info && <Text style={styles.sheetBody}>{info.description}</Text>}
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
              {/* Identity — city + country hero */}
              <View style={styles.countryIdentity}>
                <View style={styles.countryIdentityText}>
                  <Text style={styles.countryLocation}>{countrySheet.countryName}</Text>
                  <Text style={styles.countryName}>{countrySheet.data.official}</Text>
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
                    <Text key={i} style={styles.hotspotValue}>
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
    ...TEXT_STYLES.smallCapsXs,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  divergenceNote: {
    fontFamily: FONT.regular,
    fontSize: TYPOGRAPHY.sizeSm,
    fontStyle: 'italic' as const,
    color: COLORS.accent,
    marginBottom: SPACING.md,
  },
  sheetTitle: {
    fontFamily: FONT.bold,
    fontSize: TYPOGRAPHY.sizeBase,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  correctionLink: {
    ...TEXT_STYLES.smallCapsXs,
    color: COLORS.textSecondary,
    marginTop: SPACING.lg,
    textDecorationLine: 'underline' as const,
  },
  sheetBody: {
    ...TEXT_STYLES.body,
    color: COLORS.accent,
  },
  sourceType: TEXT_STYLES.smallCapsXs,
  sourceRow: {
    marginBottom: SPACING.md,
  },
  sourceRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  sourceRowLeft: {
    flex: 1,
  },
  sourceRowRight: {
    alignItems: 'flex-end',
    gap: SPACING.xs,
    paddingLeft: SPACING.md,
  },
  toneLabel: {
    ...TEXT_STYLES.smallCapsXs,
    color: COLORS.textSecondary,
    opacity: 0.6,
  },
  sourceCountry: {
    ...TEXT_STYLES.smallCapsXs,
    marginBottom: SPACING.xs,
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
    fontSize: 36,
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
