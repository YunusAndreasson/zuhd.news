import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  type BottomSheetModal,
} from '@gorhom/bottom-sheet';
import { COUNTRY_DATA, type CountryData } from '@shared/countries/country-data';
import type {
  Article,
  ArticleSource,
  Category,
  Chokepoint,
  ConflictEvent,
  Entity,
  GdacsAlert,
} from '@shared/types';
import { useNetworkState } from 'expo-network';
import * as SplashScreen from 'expo-splash-screen';
import { createRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { ConflictSheet } from '../components/ConflictSheet';
import { CountrySheet } from '../components/CountrySheet';
import { DisambiguationSheet } from '../components/DisambiguationSheet';
import { DisasterSheet } from '../components/DisasterSheet';
import { EntitySheet } from '../components/EntitySheet';
import { ErrorState } from '../components/ErrorState';
import type { TapResult } from '../components/globe/MiniGlobe';
import { HintOverlay } from '../components/HintOverlay';
import { MenuSheet } from '../components/MenuSheet';
import { NotificationPrimerSheet } from '../components/NotificationPrimerSheet';
import { SourcesSheet } from '../components/SourcesSheet';
import { Toast, type ToastRef } from '../components/Toast';
import { CATEGORIES, EDITORIAL, OPACITY } from '../constants/theme';
import { useArticles } from '../hooks/useArticles';
import { useBriefingPlayer } from '../hooks/useBriefingPlayer';
import { useChokepoints } from '../hooks/useChokepoints';
import { useConflictEvents } from '../hooks/useConflictEvents';
import { useGdacsAlerts } from '../hooks/useGdacsAlerts';
import { useHeatmap } from '../hooks/useHeatmap';
import { useOnboardingHints } from '../hooks/useOnboardingHints';
import { usePendingNotification } from '../hooks/usePendingNotification';
import { usePreferences, useTheme } from '../hooks/useTheme';
import { useTrendsSnapshot } from '../hooks/useTrendsSnapshot';
import { useZoomCycle } from '../hooks/useZoomCycle';
import { formatExactTime } from '../lib/article-utils';
import { getSnapshot as getBookmarks, toggle as toggleBookmark } from '../lib/bookmark-store';
import { hapticImpact, hapticNotification, hapticTick } from '../lib/haptics';
import { getSnapshot as getOnboarding, markHintDone } from '../lib/onboarding-store';

const listRefs = CATEGORIES.map(() => createRef<ArticleListRef>());

// Present the notification primer after the "Caught up" toast has cleared
// (2s passive duration) plus a breath, so the two moments read as sequential
// rather than stacked.
const PRIMER_PRESENT_DELAY_MS = 2600;

export default function HomeScreen() {
  const { colors } = useTheme();
  const { preferences } = usePreferences();
  const { current: currentZoom, toggle: handleZoomToggle } = useZoomCycle();
  const menuSheetRef = useRef<BottomSheetModal>(null);
  const primerSheetRef = useRef<BottomSheetModal>(null);
  const sourcesSheetRef = useRef<BottomSheetModal>(null);
  const countrySheetRef = useRef<BottomSheetModal>(null);
  const chokepointSheetRef = useRef<BottomSheetModal>(null);
  const disasterSheetRef = useRef<BottomSheetModal>(null);
  const conflictSheetRef = useRef<BottomSheetModal>(null);
  const disambiguationSheetRef = useRef<BottomSheetModal>(null);
  const entitySheetRef = useRef<BottomSheetModal>(null);
  const pagerRef = useRef<PagerView>(null);
  const pendingArticleNavigationRef = useRef<{ page: number; slug: string } | null>(null);
  const completeArticleNavigation = useCallback((page: number) => {
    const pending = pendingArticleNavigationRef.current;
    if (!pending || pending.page !== page) return;
    pendingArticleNavigationRef.current = null;
    listRefs[page]?.current?.scrollToSlug(pending.slug);
  }, []);
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
    generated,
    injectArticle,
  } = useArticles();
  const { points: heatmapPoints, ready: heatmapReady } = useHeatmap(generated);
  const { chokepoints } = useChokepoints();
  const { alerts: gdacsAlerts, details: gdacsDetails } = useGdacsAlerts();
  const { events: conflictEvents } = useConflictEvents();
  const { byId: indicatorsById } = useTrendsSnapshot();
  const network = useNetworkState();
  const insets = useSafeAreaInsets();
  const briefingPlayer = useBriefingPlayer(briefing?.date, briefing?.duration);

  // Active article tracking (for bottom action bar). Kept in a ref — the
  // selected article only feeds callbacks (share, context), never JSX, so
  // state here would re-render the whole HomeScreen tree on every snap.
  const currentArticlesRef = useRef<(Article | null)[]>([null, null, null, null]);
  const activeArticleRef = useRef<Article | null>(null);

  // Sheet payloads (refs come from useSheetRefs above)
  const [sheetSources, setSheetSources] = useState<ArticleSource[]>([]);
  const [countrySheet, setCountrySheet] = useState<TapResult | null>(null);
  const [activeChokepoint, setActiveChokepoint] = useState<Chokepoint | null>(null);
  const [activeAlert, setActiveAlert] = useState<GdacsAlert | null>(null);
  const [activeConflict, setActiveConflict] = useState<ConflictEvent | null>(null);
  const [chooserCandidates, setChooserCandidates] = useState<TapResult[]>([]);
  const [activeEntity, setActiveEntity] = useState<Entity | null>(null);
  // The two payload-less sheets need explicit open flags so the hint overlay
  // can yield the airspace; every other sheet's openness is derived from its
  // payload state above.
  const [menuOpen, setMenuOpen] = useState(false);
  const [primerOpen, setPrimerOpen] = useState(false);
  const activeIndicator = useMemo(
    () => (activeEntity ? (indicatorsById.get(activeEntity.indicatorId) ?? null) : null),
    [activeEntity, indicatorsById],
  );
  const handleSelectArticle = useCallback(
    (slug: string, category: Category) => {
      menuSheetRef.current?.dismiss();
      // `category` can be a caller's best guess (related-story strips,
      // notification payloads) — trust the feed first and navigate to the
      // category that actually contains the article.
      const actual = CATEGORIES.find((c) => groupedRef.current[c].some((a) => a.slug === slug));
      const target = actual ?? category;
      const catIndex = CATEGORIES.indexOf(target);
      if (catIndex < 0) return;

      // If the article rotated out of the feed, inject the bookmarked copy
      if (!actual) {
        const bookmark = getBookmarks().find((b) => b.article.slug === slug);
        if (bookmark) {
          injectArticle(bookmark.article, target);
        } else {
          toastRef.current?.show('Article no longer available');
          return;
        }
      }

      pendingArticleNavigationRef.current = { page: catIndex, slug };
      if (catIndex === currentCategoryRef.current) {
        // Same-page navigation has no onPageSelected event. Defer one frame so
        // a just-injected bookmarked article has committed to the FlatList.
        requestAnimationFrame(() => completeArticleNavigation(catIndex));
      } else {
        pagerRef.current?.setPage(catIndex);
      }
    },
    [completeArticleNavigation, injectArticle],
  );

  const handleArticleBookmark = useCallback((article: Article) => {
    const catIndex = currentCategoryRef.current;
    const category = CATEGORIES[catIndex] ?? 'politics';
    const added = toggleBookmark(article, category);
    markHintDone('bookmark');
    hapticNotification();
    if (added) {
      toastRef.current?.show('Saved to bookmarks');
    } else {
      // Removal is one swipe/long-press away from being accidental — offer a
      // one-tap undo (actionable toast lingers 4s) that re-adds the bookmark.
      toastRef.current?.show('Removed — tap to undo', () => {
        toggleBookmark(article, category);
        hapticTick();
      });
    }
  }, []);

  const handleMenuPress = useCallback(() => {
    hapticImpact();
    setMenuOpen(true);
    menuSheetRef.current?.present();
  }, []);

  const handleBriefingPress = useCallback(() => {
    if (!briefingPlayer.available) {
      // No briefing surfaced by the feed (mp3 cleaned up after 7 days, or
      // the pipeline has been broken longer). Don't attempt playback —
      // the URL would 404 and the give-up timer would stall the UI.
      hapticTick();
      toastRef.current?.show('No briefing available', undefined, 'top');
      return;
    }
    briefingPlayer.toggle();
  }, [briefingPlayer.available, briefingPlayer.toggle]);

  const handleSourcesPress = useCallback((article: Article) => {
    hapticImpact();
    markHintDone('sources');
    setSheetSources(article.sources);
    sourcesSheetRef.current?.present();
  }, []);

  const handleTimeAgoPress = useCallback((article: Article) => {
    hapticTick();
    toastRef.current?.show(formatExactTime(article.addedAt), undefined, 'top');
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
  const gdacsAlertsRef = useRef(gdacsAlerts);
  gdacsAlertsRef.current = gdacsAlerts;
  const conflictEventsRef = useRef(conflictEvents);
  conflictEventsRef.current = conflictEvents;

  // Flat feed across categories — memoized so downstream memos keyed on it
  // (e.g. ChokepointSheet's findRelatedArticles) don't invalidate every render.
  // Each article carries its real feed category so related-story rows don't
  // have to guess it back from concept tags (which never name a category).
  const flatArticles = useMemo(
    () => CATEGORIES.flatMap((c) => grouped[c].map((a) => ({ ...a, category: c }))),
    [grouped],
  );

  // Active GDACS alerts whose primary or affected-country list includes the
  // currently open country. Phase 1 matches by full country name (GDACS uses
  // the same long-form names as our shared/countries dataset for the major
  // jurisdictions); mismatches simply yield an empty strip.
  const countryAlerts = useMemo<GdacsAlert[]>(() => {
    const name = countrySheet?.countryName;
    if (!name) return [];
    const score = (l: GdacsAlert['alertlevel']) => (l === 'Red' ? 2 : l === 'Orange' ? 1 : 0);
    return gdacsAlerts
      .filter((a) => a.country === name || a.affectedCountries.includes(name))
      .sort((a, b) => score(b.alertlevel) - score(a.alertlevel));
  }, [countrySheet?.countryName, gdacsAlerts]);

  const handleCountryAlertPress = useCallback((alert: GdacsAlert) => {
    setActiveAlert(alert);
    disasterSheetRef.current?.present();
  }, []);

  // Hop into the CountrySheet by country name, synthesizing a minimal
  // TapResult (no globe location/time). Shared by the disaster/conflict
  // sheets' onCountryPress. `data` defaults to the shared dataset lookup.
  const openCountry = useCallback(
    (countryName: string, data: CountryData | null = COUNTRY_DATA[countryName] ?? null) => {
      setCountrySheet({ countryName, location: null, localTime: null, data });
      countrySheetRef.current?.present();
    },
    [],
  );

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
      // Any path here — globe tap, marker tap, or inline country link — proves
      // the reader found the map layer; the globe hint retires on all of them.
      markHintDone('globe');
      // Multiple overlapping markers — surface a chooser instead of
      // arbitrarily picking one. The chooser fires onSelect with the
      // chosen candidate, which is dispatched back through this same
      // handler (sans candidates field) to open its target sheet.
      if (result.candidates && result.candidates.length > 1) {
        setChooserCandidates(result.candidates);
        disambiguationSheetRef.current?.present();
        return;
      }
      if (result.gdacsEventId) {
        const alert = gdacsAlertsRef.current.find((a) => a.eventid === result.gdacsEventId);
        if (alert) {
          setActiveAlert(alert);
          disasterSheetRef.current?.present();
        }
        return;
      }
      if (result.conflictEventId) {
        const evt = conflictEventsRef.current.find((e) => e.id === result.conflictEventId);
        if (evt) {
          setActiveConflict(evt);
          conflictSheetRef.current?.present();
        }
        return;
      }
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
      pagerOffset.set(page);
      hapticTick();
      setCurrentCategory(page);
      activeArticleRef.current = currentArticlesRef.current[page] ?? null;
      completeArticleNavigation(page);
    },
    [completeArticleNavigation, pagerOffset],
  );

  const onPageScroll = useCallback(
    (e: PagerViewOnPageScrollEvent) => {
      pagerOffset.set(e.nativeEvent.position + e.nativeEvent.offset);
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

  // --- Onboarding: hint pills + notification primer ---
  const briefingVisible = briefingPlayer.playing || briefingPlayer.elapsed > 0;
  const sheetOpen =
    menuOpen ||
    primerOpen ||
    sheetSources.length > 0 ||
    countrySheet !== null ||
    activeChokepoint !== null ||
    activeAlert !== null ||
    activeConflict !== null ||
    chooserCandidates.length > 0 ||
    activeEntity !== null;
  const sheetOpenRef = useRef(sheetOpen);
  sheetOpenRef.current = sheetOpen;
  const { activeHint, dismissActiveHint } = useOnboardingHints({
    ready: !loading && heatmapReady,
    suppressed: sheetOpen || briefingVisible,
  });
  const notificationsOnRef = useRef(preferences.notifications);
  notificationsOnRef.current = preferences.notifications;
  const primerTriedRef = useRef(false);

  const handleCaughtUp = useCallback(() => {
    toastRef.current?.show('Caught up', undefined, 'top');
    // The "caught up" moment is the app's one demonstrated-value point — the
    // only place the notification primer may appear. Any prior answer
    // (primer, legacy cold prompt, OS permission state) blocks it;
    // `earlierIndex` requires a prior lastSeenAt, so it can never fire on a
    // cold first launch.
    if (primerTriedRef.current) return;
    if (getOnboarding().primer.status !== 'pending' || notificationsOnRef.current) return;
    primerTriedRef.current = true;
    setTimeout(() => {
      if (sheetOpenRef.current) return;
      setPrimerOpen(true);
      primerSheetRef.current?.present();
    }, PRIMER_PRESENT_DELAY_MS);
  }, []);

  const handleMenuToast = useCallback((message: string) => {
    toastRef.current?.show(message, undefined, 'top');
  }, []);

  const handleEndReached = useCallback((catIndex: number) => {
    const cat = CATEGORIES[catIndex];
    if (!cat) return;
    toastRef.current?.show('Tap for top', () => listRefs[catIndex]?.current?.scrollToTop());
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

  // Hold the splash until we have something for *every* visible layer:
  // article cache loaded AND heatmap (the largest globe canvas) ready.
  // The mount-only globe layers (chokepoints, GDACS, conflicts, trends)
  // each cache locally, so they typically resolve before heatmap on warm
  // launches. The 8s fallback in _layout.tsx covers any stall.
  useEffect(() => {
    if (!loading && heatmapReady) SplashScreen.hideAsync();
  }, [loading, heatmapReady]);

  usePendingNotification(loading, grouped, handleSelectArticle, briefingPlayer.toggle);

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
                gdacsAlerts={gdacsAlerts}
                conflictEvents={conflictEvents}
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
              />
            )}
          </View>
        ))}
      </PagerView>

      <Toast ref={toastRef} />

      <HintOverlay hint={activeHint} onDismiss={dismissActiveHint} bottomInset={insets.bottom} />

      {!briefingVisible && (
        <BottomActionBar
          bottomInset={insets.bottom}
          zoomLabel={currentZoom.label}
          onBriefingPress={handleBriefingPress}
          onZoomPress={handleZoomToggle}
          onSharePress={handleBottomShare}
        />
      )}

      {/* Briefing player — shown while playing or paused mid-listen */}
      {briefingVisible && (
        <BriefingBar
          playing={briefingPlayer.playing}
          elapsed={briefingPlayer.elapsed}
          duration={briefingPlayer.duration}
          date={briefingPlayer.date}
          onToggle={briefingPlayer.toggle}
          onSeek={briefingPlayer.seek}
          onClose={briefingPlayer.close}
        />
      )}

      <MenuSheet
        sheetRef={menuSheetRef}
        bottomInset={insets.bottom}
        renderBackdrop={renderBackdrop}
        onDismiss={() => setMenuOpen(false)}
        grouped={grouped}
        onSelectArticle={handleSelectArticle}
        onToast={handleMenuToast}
      />

      <CountrySheet
        sheetRef={countrySheetRef}
        country={countrySheet}
        activeAlerts={countryAlerts}
        onAlertPress={handleCountryAlertPress}
        bottomInset={insets.bottom}
        renderBackdrop={renderBackdrop}
        onDismiss={() => setCountrySheet(null)}
      />

      <DisasterSheet
        sheetRef={disasterSheetRef}
        alert={activeAlert}
        details={gdacsDetails}
        bottomInset={insets.bottom}
        renderBackdrop={renderBackdrop}
        onDismiss={() => setActiveAlert(null)}
        onCountryPress={(countryName) => {
          // Hop from disaster → country: dismiss this sheet, then present
          // the country sheet. CountryAlerts memo will re-fire and the strip
          // in the country sheet will surface the disaster (and any others
          // affecting the same country).
          disasterSheetRef.current?.dismiss();
          openCountry(countryName);
        }}
      />

      <ConflictSheet
        sheetRef={conflictSheetRef}
        event={activeConflict}
        bottomInset={insets.bottom}
        renderBackdrop={renderBackdrop}
        onDismiss={() => setActiveConflict(null)}
        onCountryPress={(countryName) => {
          conflictSheetRef.current?.dismiss();
          openCountry(countryName);
        }}
      />

      <DisambiguationSheet
        sheetRef={disambiguationSheetRef}
        candidates={chooserCandidates}
        chokepoints={chokepoints}
        alerts={gdacsAlerts}
        conflictEvents={conflictEvents}
        bottomInset={insets.bottom}
        renderBackdrop={renderBackdrop}
        onDismiss={() => setChooserCandidates([])}
        onSelect={(candidate) => {
          // Dismiss the chooser first so its dismiss animation overlaps
          // the target sheet's enter animation; the candidate carries no
          // `candidates` field, so handleCountryPress takes the normal
          // single-hit branches.
          disambiguationSheetRef.current?.dismiss();
          handleCountryPress(candidate);
        }}
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

      <NotificationPrimerSheet
        sheetRef={primerSheetRef}
        bottomInset={insets.bottom}
        renderBackdrop={renderBackdrop}
        onDismiss={() => setPrimerOpen(false)}
        onToast={handleMenuToast}
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
