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
import { type LayoutChangeEvent, Platform, Share, StyleSheet, View } from 'react-native';
import PagerView, {
  type PagerViewOnPageScrollEvent,
  type PagerViewOnPageSelectedEvent,
} from 'react-native-pager-view';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArticleList, type ArticleListRef } from '../components/ArticleList';
import { BottomActionBar } from '../components/BottomActionBar';
import { BriefingBar } from '../components/BriefingBar';
import { ChokepointSheet } from '../components/ChokepointSheet';
import { ConflictSheet } from '../components/ConflictSheet';
import { CountrySheet } from '../components/CountrySheet';
import { CardPager, type CardPagerRef } from '../components/cards/CardPager';
import { DisambiguationSheet } from '../components/DisambiguationSheet';
import { DisasterSheet } from '../components/DisasterSheet';
import { EmptyState } from '../components/EmptyState';
import { EntitySheet } from '../components/EntitySheet';
import { ErrorState } from '../components/ErrorState';
import type { TapResult } from '../components/globe/MiniGlobe';
import { HintOverlay } from '../components/HintOverlay';
import { MenuSheet } from '../components/MenuSheet';
import { NotificationPrimerSheet } from '../components/NotificationPrimerSheet';
import { Screen } from '../components/primitives';
import { SectionBar } from '../components/SectionBar';
import type { BottomSheetMethodsRef } from '../components/SheetLayout';
import { SourcesSheet } from '../components/SourcesSheet';
import { Toast, type ToastRef } from '../components/Toast';
import { CATEGORIES, EDITORIAL, SECTIONS } from '../constants/theme';
import { useArticles } from '../hooks/useArticles';
import { useBriefingPlayer } from '../hooks/useBriefingPlayer';
import { useChokepoints } from '../hooks/useChokepoints';
import { useConflictEvents } from '../hooks/useConflictEvents';
import { useDeterminations } from '../hooks/useDeterminations';
import { useGdacsAlerts } from '../hooks/useGdacsAlerts';
import { useHeatmap } from '../hooks/useHeatmap';
import { useIpc } from '../hooks/useIpc';
import { useOnboardingHints } from '../hooks/useOnboardingHints';
import { usePendingNotification } from '../hooks/usePendingNotification';
import { usePreferences, useTheme } from '../hooks/useTheme';
import { useTrendsSnapshot } from '../hooks/useTrendsSnapshot';
import { useZoomCycle } from '../hooks/useZoomCycle';
import { formatExactTime } from '../lib/article-utils';
import { getSnapshot as getBookmarks, toggle as toggleBookmark } from '../lib/bookmark-store';
import { buildConditionCards } from '../lib/cards/conditions';
import { buildInstrumentCards } from '../lib/cards/markets';
import { prepareSwipeCards, type SwipeCard } from '../lib/cards/rank';
import { hapticImpact, hapticNotification, hapticTick } from '../lib/haptics';
import { orderNewsRiver, type RiverArticle } from '../lib/news-order';
import { getSnapshot as getOnboarding, markHintDone } from '../lib/onboarding-store';

/** `news` is leftmost because it is the section with something new to say five
 *  times a day. The rail's order is the app's claim about what matters, and it
 *  is written down once — in `SECTIONS`. */
const NEWS = SECTIONS.indexOf('news');

/** One pager per instrument column, indexed the same way as `SECTIONS` so a
 *  section's slot in the progress array, its ref and its label all agree. */
const cardPagerRefs = SECTIONS.map(() => createRef<CardPagerRef>());
const newsListRef = createRef<ArticleListRef>();

/** Empty-state copy per instrument column. A column is empty when the
 *  snapshot did not carry its series, which is a quiet degrade, not an error. */
const EMPTY_COPY: Record<string, { message: string; hint: string }> = {
  markets: { message: 'no market readings yet', hint: 'No market series are available' },
  currencies: {
    message: 'no currency readings yet',
    hint: 'No exchange-rate series are available',
  },
  straits: { message: 'no strait readings yet', hint: 'No shipping histories are available' },
  predictions: {
    message: 'no predictions yet',
    hint: 'No prediction contracts are available',
  },
  calendar: {
    message: 'nothing scheduled soon',
    hint: 'No tracked event falls in the next 10 days',
  },
  humanitarian: {
    message: 'no fresh humanitarian updates',
    hint: 'This section shows newly published conditions and determinations',
  },
  attention: { message: 'no attention readings yet', hint: 'No pageview series are available' },
};

// Give the reader time to arrive at the caught-up boundary and read it before
// anything asks them for something. The delay used to be measured against the
// "Caught up" toast's 2s dwell; that toast is gone, but the interval is still
// the right one — it is the pause between the app saying you can stop and the
// app asking a favour.
const PRIMER_PRESENT_DELAY_MS = 2600;

// How long the splash may wait on the heatmap *after* articles are ready.
// The heatmap degrades gracefully to an empty layer, so it must not hold a
// launch whose content is already on screen — without this cap a slow
// heatmap parks the user on the splash until the 8s `_layout.tsx` fallback.
const HEATMAP_SPLASH_GRACE_MS = 1200;

export default function HomeScreen() {
  const { colors } = useTheme();
  const { preferences } = usePreferences();
  const { current: currentZoom, toggle: handleZoomToggle } = useZoomCycle();
  const menuSheetRef = useRef<BottomSheetMethodsRef>(null);
  const primerSheetRef = useRef<BottomSheetMethodsRef>(null);
  const sourcesSheetRef = useRef<BottomSheetMethodsRef>(null);
  const countrySheetRef = useRef<BottomSheetMethodsRef>(null);
  const chokepointSheetRef = useRef<BottomSheetMethodsRef>(null);
  const disasterSheetRef = useRef<BottomSheetMethodsRef>(null);
  const conflictSheetRef = useRef<BottomSheetMethodsRef>(null);
  const disambiguationSheetRef = useRef<BottomSheetMethodsRef>(null);
  const entitySheetRef = useRef<BottomSheetMethodsRef>(null);
  const pagerRef = useRef<PagerView>(null);
  // There is one article column now, so a pending navigation is just a slug
  // waiting for the pager to finish arriving at `news`.
  const pendingSlugRef = useRef<string | null>(null);
  const completeArticleNavigation = useCallback((page: number) => {
    if (page !== NEWS) return;
    const slug = pendingSlugRef.current;
    if (!slug) return;
    pendingSlugRef.current = null;
    newsListRef.current?.scrollToSlug(slug);
  }, []);
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
  const { events: conflictEvents, snapshot: conflictSnapshot } = useConflictEvents();
  const { byId: indicatorsById, snapshot: trends } = useTrendsSnapshot();
  const { snapshot: ipc } = useIpc();
  const { determinations } = useDeterminations();
  const network = useNetworkState();
  const insets = useSafeAreaInsets();
  const briefingPlayer = useBriefingPlayer(briefing?.date, briefing?.duration);

  // Active article tracking (for bottom action bar). Kept in a ref — the
  // selected article only feeds callbacks (share, context), never JSX, so
  // state here would re-render the whole HomeScreen tree on every snap.
  const activeArticleRef = useRef<RiverArticle | null>(null);

  // Sheet payloads (refs come from useSheetRefs above)
  const [sheetSources, setSheetSources] = useState<ArticleSource[]>([]);
  const [sheetDivergence, setSheetDivergence] = useState<number | null>(null);
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
  // The ids `EntitySheet` can actually resolve. Derived once here rather than
  // per article page — every page would otherwise rebuild the same set.
  const resolvableEntityIds = useMemo(() => new Set(indicatorsById.keys()), [indicatorsById]);
  const activeIndicator = useMemo(
    () => (activeEntity ? (indicatorsById.get(activeEntity.indicatorId) ?? null) : null),
    [activeEntity, indicatorsById],
  );
  const handleSelectArticle = useCallback(
    (slug: string, category: Category) => {
      menuSheetRef.current?.dismiss();
      // `category` is still in the signature because callers (bookmarks,
      // notification payloads, related-story rows) know it and the feed is
      // still grouped by it underneath. Navigation no longer depends on it:
      // every article lives in one column now.
      const actual = CATEGORIES.find((c) => groupedRef.current[c].some((a) => a.slug === slug));

      // If the article rotated out of the feed, inject the bookmarked copy
      if (!actual) {
        const bookmark = getBookmarks().find((b) => b.article.slug === slug);
        if (bookmark) {
          injectArticle(bookmark.article, category);
        } else {
          toastRef.current?.show('Article no longer available');
          return;
        }
      }

      pendingSlugRef.current = slug;
      if (currentSectionRef.current === NEWS) {
        // Same-page navigation has no onPageSelected event. Defer one frame so
        // a just-injected bookmarked article has committed to the FlatList.
        requestAnimationFrame(() => completeArticleNavigation(NEWS));
      } else {
        programmaticPageRef.current = true;
        pagerRef.current?.setPage(NEWS);
      }
    },
    [completeArticleNavigation, injectArticle],
  );

  const handleArticleBookmark = useCallback((article: RiverArticle) => {
    // The article carries its own category now. It used to be inferred from
    // which tab you were on, which was right only because the tab *was* the
    // category — an assumption that would have silently mis-filed every
    // bookmark the moment the axis started carrying sections.
    const category = article.category;
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
    setSheetDivergence(article.sentimentDivergence ?? null);
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

  const handleArticleChange = useCallback((article: RiverArticle) => {
    activeArticleRef.current = article;
  }, []);

  // Ref for handleCountryPress, kept stable so the memoized renderItem in
  // ArticleList doesn't invalidate on every chokepoint refetch.
  const chokepointsRef = useRef(chokepoints);
  chokepointsRef.current = chokepoints;
  const gdacsAlertsRef = useRef(gdacsAlerts);
  gdacsAlertsRef.current = gdacsAlerts;
  const conflictEventsRef = useRef(conflictEvents);
  conflictEventsRef.current = conflictEvents;

  // The news column: every article, ordered by how many newsrooms covered the
  // event rather than by which lane it arrived in. See `lib/news-order.ts` —
  // the four categories became a kicker on the card when the horizontal axis
  // was needed for sections.
  //
  // Memoized because downstream memos key on it (ChokepointSheet's
  // findRelatedArticles, the card builders' tie-to-the-news), and because
  // every article carries its real category so nothing downstream has to
  // guess it back from concept tags, which never name one.
  const river = useMemo(() => orderNewsRiver(grouped), [grouped]);

  // Both card columns are pure functions of payloads already in memory. The
  // builders return a shorter column rather than a broken screen when a
  // payload is missing, so neither of these needs a loading state.
  const columns = useMemo(
    () => buildInstrumentCards({ trends, chokepoints, articles: river }),
    [trends, chokepoints, river],
  );
  // Standing conditions are events, not furniture: each is gated on its own
  // data being new, so this is empty on almost every day and leads the column
  // on the day a determination is published or a fresh famine analysis lands.
  // See the header of `lib/cards/conditions.ts` for the audit that settled it.
  const conditionCards = useMemo(
    () =>
      buildConditionCards({
        ipc,
        conflict: conflictSnapshot,
        gdacsAlerts,
        determinations,
      }),
    [ipc, conflictSnapshot, gdacsAlerts, determinations],
  );

  // The horizontal axis names subjects a reader can choose directly. The
  // builder owns the instrument taxonomy; gated humanitarian cards have their
  // own explicit destination before the shared smart ranking is applied.
  const sectionCards = useMemo<Record<string, SwipeCard[]>>(
    () => ({
      markets: prepareSwipeCards(columns.markets, river),
      currencies: prepareSwipeCards(columns.currencies, river),
      straits: prepareSwipeCards(columns.straits, river),
      predictions: prepareSwipeCards(columns.predictions, river),
      calendar: prepareSwipeCards(columns.calendar, river),
      humanitarian: prepareSwipeCards(conditionCards, river),
      attention: prepareSwipeCards(columns.attention, river),
    }),
    [columns, conditionCards, river],
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

  const [currentSection, setCurrentSection] = useState(NEWS);

  // Refs for values used inside stable callbacks — avoids breaking downstream memos
  const groupedRef = useRef(grouped);
  groupedRef.current = grouped;
  const lastSeenAtRef = useRef(lastSeenAt);
  lastSeenAtRef.current = lastSeenAt;
  const currentSectionRef = useRef(currentSection);
  currentSectionRef.current = currentSection;

  const [pagerHeight, setPagerHeight] = useState(0);
  const onPagerLayout = useCallback((e: LayoutChangeEvent) => {
    setPagerHeight(e.nativeEvent.layout.height);
  }, []);

  const pagerOffset = useSharedValue(0);
  const sectionProgresses = useSharedValue(SECTIONS.map(() => 0));

  // Set when a tab tap dispatches `setPage`, so the `onPageSelected` that
  // lands ~250ms later (once the pager transition finishes) doesn't tick a
  // second time. A *swiped* page change has no tap to precede it, so the flag
  // is clear and `onPageSelected` owns the haptic.
  const programmaticPageRef = useRef(false);

  const onPageSelected = useCallback(
    (e: PagerViewOnPageSelectedEvent) => {
      const page = e.nativeEvent.position;
      pagerOffset.set(page);
      if (programmaticPageRef.current) {
        programmaticPageRef.current = false;
      } else {
        hapticTick();
      }
      setCurrentSection(page);
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

  // Tapping the label you are already on returns that column to the top —
  // the one gesture the rail offers beyond saying where you are.
  const onSectionPress = useCallback(
    (index: number) => {
      if (index === currentSection) {
        if (index === NEWS) newsListRef.current?.scrollToTop();
        else cardPagerRefs[index]?.current?.scrollToTop();
      } else {
        // Claim the haptic here rather than letting `onPageSelected` fire it
        // when the transition lands — feedback belongs on the touch, not a
        // quarter-second after it. Matches `CountryCardsCarousel.goToPage`.
        programmaticPageRef.current = true;
        pagerRef.current?.setPage(index);
      }
      hapticTick();
    },
    [currentSection],
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
    // No toast here any more. It announced "Caught up" in floating chrome one
    // swipe before the reader reached the divider that says the same thing in
    // the column — one fact, two places. The divider owns the moment now
    // (see ArticlePage's earlier-boundary); this callback is purely the
    // primer gate.
    //
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

  const handleEndReached = useCallback(() => {
    toastRef.current?.show('Back to top', () => newsListRef.current?.scrollToTop());
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
        newsListRef.current?.scrollToTop();
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
  // ...but the heatmap only gets a grace period, not a veto. Trading a brief
  // globe pop-in for up to 7s of extra splash is the wrong deal, especially on
  // a first launch. hideAsync() rejects if the splash is already gone (the
  // _layout fallback may have fired), so both paths swallow that.
  useEffect(() => {
    if (loading) return;
    if (heatmapReady) {
      SplashScreen.hideAsync().catch(() => {});
      return;
    }
    const timer = setTimeout(
      () => SplashScreen.hideAsync().catch(() => {}),
      HEATMAP_SPLASH_GRACE_MS,
    );
    return () => clearTimeout(timer);
  }, [loading, heatmapReady]);

  usePendingNotification(loading, grouped, handleSelectArticle, briefingPlayer.toggle);

  // The splash normally covers this whole state. But `_layout.tsx` force-hides
  // it after SPLASH_FALLBACK_MS (8s) while the feed keeps retrying for up to
  // ~30s (10s timeout x retry: 2) — so on a cold first launch over a slow
  // connection there is a window where the splash is gone and we still have no
  // articles. Returning null there paints a bare `colors.bg` void, which reads
  // as a crashed app. Render the standard empty state instead so the launch
  // always has content.
  if (loading)
    return (
      <Screen>
        {/* "loading" + "fetching" said the same thing twice, and foundation.md
            is explicit that information appears exactly once. By the time this
            is visible the splash has already run its 8s, so the useful thing to
            say is that the wait is abnormal — not to restate the spinner. */}
        <EmptyState message="loading" hint="This is taking longer than usual" />
      </Screen>
    );

  if (error && Object.values(grouped).every((a) => a.length === 0)) {
    return (
      <ErrorState offline={network.isInternetReachable === false} error={error} onRetry={retry} />
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <SectionBar
        pagerOffset={pagerOffset}
        sectionProgresses={sectionProgresses}
        currentSection={currentSection}
        onSectionPress={onSectionPress}
        onMenuPress={handleMenuPress}
      />

      {/* The stories, then one page per family of instruments. The globe lives
          on the first page only — it is the backdrop to the stories it
          locates, and there is nothing on a wheat price for it to point at.
          One instance now instead of one per category, which is also the
          cheapest perf win in this change. */}
      <PagerView
        ref={pagerRef}
        style={styles.pager}
        initialPage={NEWS}
        onPageSelected={onPageSelected}
        onPageScroll={onPageScroll}
        onLayout={onPagerLayout}
        overdrag
        offscreenPageLimit={1}
      >
        <View key={SECTIONS[NEWS]} collapsable={false}>
          {pagerHeight > 0 && (
            <ArticleList
              ref={newsListRef}
              articles={river}
              heatmapPoints={heatmapPoints}
              chokepoints={chokepoints}
              gdacsAlerts={gdacsAlerts}
              conflictEvents={conflictEvents}
              viewportHeight={pagerHeight}
              sectionIndex={NEWS}
              lastSeenAt={lastSeenAt}
              onRefresh={handleRefresh}
              onEndReached={handleEndReached}
              onCaughtUp={handleCaughtUp}
              onBookmarkPress={handleArticleBookmark}
              onSourcesPress={handleSourcesPress}
              onTimeAgoPress={handleTimeAgoPress}
              onEntityPress={handleEntityPress}
              resolvableEntityIds={resolvableEntityIds}
              onCountryPress={handleCountryPress}
              onArticleChange={handleArticleChange}
              progressesSV={sectionProgresses}
              zoomClipOverride={currentZoom.clip}
              tick={tick}
            />
          )}
        </View>

        {SECTIONS.filter((s) => s !== 'news').map((section) => {
          const index = SECTIONS.indexOf(section);
          const copy = EMPTY_COPY[section];
          return (
            <View key={section} collapsable={false}>
              {pagerHeight > 0 && (
                <CardPager
                  ref={cardPagerRefs[index]}
                  cards={sectionCards[section] ?? []}
                  viewportHeight={pagerHeight}
                  sectionIndex={index}
                  progressesSV={sectionProgresses}
                  emptyMessage={copy?.message ?? 'nothing here yet'}
                  emptyHint={copy?.hint}
                />
              )}
            </View>
          );
        })}
      </PagerView>

      <Toast ref={toastRef} />

      <HintOverlay hint={activeHint} onDismiss={dismissActiveHint} bottomInset={insets.bottom} />

      {!briefingVisible && (
        <BottomActionBar
          bottomInset={insets.bottom}
          zoomLabel={currentZoom.label}
          onBriefingPress={handleBriefingPress}
          onZoomPress={handleZoomToggle}
          articleActions={currentSection === NEWS}
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
        onDismiss={() => setCountrySheet(null)}
      />

      <DisasterSheet
        sheetRef={disasterSheetRef}
        alert={activeAlert}
        details={gdacsDetails}
        bottomInset={insets.bottom}
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
        articles={river}
        bottomInset={insets.bottom}
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
        articles={river}
        bottomInset={insets.bottom}
        onDismiss={() => setActiveEntity(null)}
        onArticlePress={(slug, category) => {
          entitySheetRef.current?.dismiss();
          handleSelectArticle(slug, category);
        }}
      />

      <SourcesSheet
        sheetRef={sourcesSheetRef}
        sources={sheetSources}
        divergence={sheetDivergence}
        bottomInset={insets.bottom}
        onDismiss={() => {
          setSheetSources([]);
          setSheetDivergence(null);
        }}
      />

      <NotificationPrimerSheet
        sheetRef={primerSheetRef}
        bottomInset={insets.bottom}
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
