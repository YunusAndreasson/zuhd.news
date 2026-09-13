import { COUNTRY_DATA, type CountryData } from '@shared/countries/country-data';
import { topojsonNameFromCode } from '@shared/countries/iso';
import type {
  Article,
  ArticleSource,
  Category,
  ConflictEvent,
  Entity,
  GdacsAlert,
} from '@shared/types';
import type { Transforms3d } from '@shopify/react-native-skia';
import { useNetworkState } from 'expo-network';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  Platform,
  Share,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  type SharedValue,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BriefingChrome,
  type BriefingChromeRef,
  type BriefingStatus,
} from '../components/BriefingChrome';
import { CardSheet } from '../components/CardSheet';
import { ConflictSheet } from '../components/ConflictSheet';
import { type CountryHazard, CountrySheet } from '../components/CountrySheet';
import { DisambiguationSheet } from '../components/DisambiguationSheet';
import { DisasterSheet } from '../components/DisasterSheet';
import { EmptyState } from '../components/EmptyState';
import { EntitySheet } from '../components/EntitySheet';
import { ErrorState } from '../components/ErrorState';
import {
  COLLECT_MS,
  MiniGlobe,
  type MiniGlobeRef,
  type TapResult,
} from '../components/globe/MiniGlobe';
import { HintOverlay } from '../components/HintOverlay';
import { IndexSheet } from '../components/IndexSheet';
import { InstrumentsSheet } from '../components/InstrumentsSheet';
import { MenuSheet } from '../components/MenuSheet';
import { GlobeGestureLayer } from '../components/map/GlobeGestureLayer';
import { MapHeader } from '../components/map/MapHeader';
import { MapSheet, type MapSheetDetent, type MapSheetRef } from '../components/map/MapSheet';
import { SheetMasthead } from '../components/map/SheetMasthead';
import { EndCard, StoryCard } from '../components/map/StoryCard';
import { StoryDeck } from '../components/map/StoryDeck';
import { NotificationPrimerSheet } from '../components/NotificationPrimerSheet';
import { type OverlaySelection, OverlaySheet } from '../components/OverlaySheet';
import { Screen } from '../components/primitives';
import type { BottomSheetMethodsRef } from '../components/SheetLayout';
import { SourcesSheet } from '../components/SourcesSheet';
import { Toast, type ToastRef } from '../components/Toast';
import {
  API_BASE,
  CATEGORIES,
  categoryMarkColor,
  EASING,
  EDITORIAL,
  SPACING,
  VARIANT_CAP,
} from '../constants/theme';
import { useAnalysis } from '../hooks/useAnalysis';
import { useArticles } from '../hooks/useArticles';
import { useChokepoints } from '../hooks/useChokepoints';
import { useConflictEvents } from '../hooks/useConflictEvents';
import { useGdacsAlerts } from '../hooks/useGdacsAlerts';
import { useHeatmap } from '../hooks/useHeatmap';
import { useMarketSignals } from '../hooks/useMarketSignals';
import { useOnboardingHints } from '../hooks/useOnboardingHints';
import { useFamineAreas, useGenocideSituations, useThermalEvents } from '../hooks/useOverlays';
import { usePendingNotification } from '../hooks/usePendingNotification';
import { useReadTracking } from '../hooks/useReadTracking';
import { useHardwareBack } from '../hooks/useSwipeBack';
import { usePreferences, useTheme } from '../hooks/useTheme';
import { useTrendsSnapshot } from '../hooks/useTrendsSnapshot';
import { articleTime, formatTimeAgo } from '../lib/article-utils';
import { getSnapshot as getBookmarks, toggle as toggleBookmark } from '../lib/bookmark-store';
import { buildInstrumentCards, straitCardFor } from '../lib/cards/markets';
import type { SwipeCard } from '../lib/cards/rank';
import { buildRankedInstruments } from '../lib/cards/sections';
import { computeDeckLayout, grownGlobeTransform, grownReach } from '../lib/deck-layout';
import { fetchJson } from '../lib/fetchJson';
import { getSnapshot as getFound, markFound, pruneFound, useFoundSlugs } from '../lib/found-store';
import { hapticImpact, hapticNotification, hapticTick } from '../lib/haptics';
import { buildStoryRows, cameraTrackOf } from '../lib/map-feed';
import { orderNewsRiver, type RiverArticle, recentRiver } from '../lib/news-order';
import { buildNowSurfaces, type LatLng, type NowItem, type StripItem } from '../lib/now';
import {
  getSnapshot as getOnboarding,
  markHintDone,
  recordArticleSnap,
} from '../lib/onboarding-store';
import { useOpenLink } from '../lib/open-link';
import { oddsByStory, oddsLabels, type StoryOdds } from '../lib/predictions';
import { pruneRead, useReadSlugs } from '../lib/read-store';
import { maybeRequestReview } from '../lib/store-review';
import { articleFromStory, isStoryPayload } from '../lib/story-payload';
import { buildStoryPlaces, foundProgress } from '../lib/story-places';

/**
 * One screen.
 *
 * There used to be four, on a horizontal rail: a river of stories and three
 * decks of data cards, with a globe living behind the first as a backdrop.
 * That shape asked the reader to hold a taxonomy — to remember that chokepoint
 * traffic was filed under "shipping" — and it left the app's best surface,
 * a live earth with every story and hazard already plotted on it, looking like
 * wallpaper. It was tappable the whole time. Nothing said so.
 *
 * What replaced it:
 *
 *   **the strip**   every mover, largest first, swiped sideways above the earth
 *   **the earth**   one canvas, mounted here, turned to the story in front
 *   **the sheet**   one story at a time, swiped sideways; pulled up, it is
 *                   the whole story, with the earth still above it
 *
 * The first version of this screen put a list of headlines in the sheet and a
 * full-screen reader over everything. Both were wrong the same way: a list of
 * three-to-five-word titles gives nobody a reason to open one, and a reader
 * that covers the map loses the one thing this screen is for. A list-first
 * front door had already been tried once and abandoned for swipe-first news.
 */

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

/** Flight time when the camera is sent somewhere — a strip slot, an alert row,
 *  a story's mark. Long enough to read as travel over a surface. */
const FLY_MS = 700;

/** How close, in degrees, the camera must be to the story in front for a swipe
 *  to take it over mid-drag rather than fly once the swipe lands. */
const HANDOFF_DEGREES = 1;

interface FocusOptions {
  /** A mark was tapped: the camera waits for its burst before it flies. */
  afterBurst?: boolean;
  /** Grow the card into the whole story. */
  grow?: boolean;
}

export default function HomeScreen() {
  const { colors, textVariants } = useTheme();
  const { preferences } = usePreferences();
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight, fontScale } = useWindowDimensions();

  const menuSheetRef = useRef<BottomSheetMethodsRef>(null);
  const primerSheetRef = useRef<BottomSheetMethodsRef>(null);
  const sourcesSheetRef = useRef<BottomSheetMethodsRef>(null);
  const countrySheetRef = useRef<BottomSheetMethodsRef>(null);
  const disasterSheetRef = useRef<BottomSheetMethodsRef>(null);
  const conflictSheetRef = useRef<BottomSheetMethodsRef>(null);
  const disambiguationSheetRef = useRef<BottomSheetMethodsRef>(null);
  const entitySheetRef = useRef<BottomSheetMethodsRef>(null);
  const cardSheetRef = useRef<BottomSheetMethodsRef>(null);
  const overlaySheetRef = useRef<BottomSheetMethodsRef>(null);
  const instrumentsSheetRef = useRef<BottomSheetMethodsRef>(null);
  const indexSheetRef = useRef<BottomSheetMethodsRef>(null);
  const mapSheetRef = useRef<MapSheetRef>(null);
  const globeRef = useRef<MiniGlobeRef>(null);
  const briefingChromeRef = useRef<BriefingChromeRef>(null);

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
  const famineAreas = useFamineAreas();
  const thermalEvents = useThermalEvents();
  const genocideSituations = useGenocideSituations();
  const { byId: indicatorsById, snapshot: trends } = useTrendsSnapshot();
  const { byId: analysis } = useAnalysis();
  const { cards: marketSignals, signals: rawSignals } = useMarketSignals();
  const network = useNetworkState();

  const [briefingVisible, setBriefingVisible] = useState(false);
  const [briefingStatus, setBriefingStatus] = useState<BriefingStatus>({
    available: false,
    resumable: false,
    heard: 0,
  });
  const [refreshing, setRefreshing] = useState(false);
  /** Where the sheet has settled. The globe only takes touches at peek: grown,
   *  the earth is drawn scaled into a band and a tap there would hit-test
   *  against geometry that has moved. */
  const [sheetDetent, setSheetDetent] = useState<MapSheetDetent>('peek');
  const sheetDetentRef = useRef<MapSheetDetent>('peek');
  /** The story in front of the deck. The end card is `storyRows.length`. */
  const [deckIndex, setDeckIndex] = useState(0);
  const deckIndexRef = useRef(0);
  /** The slug in front, so a refresh that inserts stories keeps the reader on
   *  the story they were reading rather than on whatever moved into its slot.
   *  Null until the reader has moved the deck: an untouched deck stays on the
   *  newest story, whichever that is. */
  const currentSlugRef = useRef<string | null>(null);
  /** A story asked for before it was in the river — a bookmark that has
   *  rotated out of the feed is injected, and its row exists a render later. */
  const pendingFocusRef = useRef<({ slug: string } & FocusOptions) | null>(null);
  const flyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sheet payloads
  const [sheetSources, setSheetSources] = useState<ArticleSource[]>([]);
  const [sheetDivergence, setSheetDivergence] = useState<number | null>(null);
  const [countrySheet, setCountrySheet] = useState<TapResult | null>(null);
  const [activeAlert, setActiveAlert] = useState<GdacsAlert | null>(null);
  const [activeConflict, setActiveConflict] = useState<ConflictEvent | null>(null);
  const [chooserCandidates, setChooserCandidates] = useState<TapResult[]>([]);
  const [activeEntity, setActiveEntity] = useState<Entity | null>(null);
  const [activeCard, setActiveCard] = useState<SwipeCard | null>(null);
  const [activeOverlay, setActiveOverlay] = useState<OverlaySelection | null>(null);
  // The payload-less sheets need explicit open flags so the hint overlay can
  // yield the airspace; every other sheet's openness is derived from its
  // payload state above.
  const [menuOpen, setMenuOpen] = useState(false);
  const [primerOpen, setPrimerOpen] = useState(false);
  const [instrumentsOpen, setInstrumentsOpen] = useState(false);
  const [indexOpen, setIndexOpen] = useState(false);

  // ---------------------------------------------------------------------
  // The camera
  //
  // One position in the river, in stories. The deck writes it under a finger
  // on the UI thread; a jump writes it directly. `cameraOwner` says whether it
  // or a target (a drag on the globe, a flight) is moving the earth.
  // ---------------------------------------------------------------------
  const storyProgress = useSharedValue(0);
  const cameraOwner = useSharedValue(0);
  const cameraLat = useSharedValue(0);
  const cameraLng = useSharedValue(0);
  /** Where the globe last drew the camera, whoever owned it — what a gesture
   *  that takes the camera starts from. */
  const viewLat = useSharedValue(0);
  const viewLng = useSharedValue(0);
  /** The pinch's zoom override, and the clips the globe published with it. */
  const zoomActive = useSharedValue(0);
  const zoomAngle = useSharedValue(90);
  const globeClip = useSharedValue(90);
  const storyClip = useSharedValue(90);
  const zoomSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetProgress = useSharedValue(0);
  /** Set the first time the reader moves the camera or the deck themselves. */
  const cameraClaimedRef = useRef(false);

  const toastRef = useRef<ToastRef>(null);

  // ---------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------
  const [topChromeHeight, setTopChromeHeight] = useState(0);
  const onTopChromeLayout = useCallback((e: LayoutChangeEvent) => {
    setTopChromeHeight(e.nativeEvent.layout.height);
  }, []);

  // The sheet at rest is sized from the card's type, not a fraction of the
  // window, and the globe takes what is left — see `lib/deck-layout.ts`.
  const layout = useMemo(
    () =>
      computeDeckLayout({
        width: screenWidth,
        height: screenHeight,
        chromeHeight: topChromeHeight,
        bottomInset: insets.bottom,
        fontScale,
        lines: {
          caption: textVariants.caption.lineHeight ?? 0,
          labelXs: textVariants.labelXs.lineHeight ?? 0,
          title: textVariants.title.lineHeight ?? 0,
          body: textVariants.body.lineHeight ?? 0,
        },
        caps: {
          caption: VARIANT_CAP.caption,
          labelXs: VARIANT_CAP.labelXs,
          title: VARIANT_CAP.title,
          body: VARIANT_CAP.body,
        },
      }),
    [screenWidth, screenHeight, topChromeHeight, insets.bottom, fontScale, textVariants],
  );
  /** Where the grown sheet stops — the story's own height, capped at
   *  `layout.full`. Written by `MapSheet`; read by the globe's transform. */
  const sheetExpanded = useSharedValue(layout.full);
  // The briefing's player floats over the bottom of the sheet while it is up,
  // so the card's last line still has to scroll clear of it.
  const cardBottomInset = insets.bottom + (briefingVisible ? SPACING.xxl : 0);

  // ---------------------------------------------------------------------
  // Derived content
  // ---------------------------------------------------------------------
  // The last day of news, plus any older story a reader asked for by name
  // (`pinStory`) — see `recentRiver`.
  const [pinnedSlugs, setPinnedSlugs] = useState<ReadonlySet<string>>(() => new Set());
  const pinStory = useCallback((slug: string) => {
    setPinnedSlugs((prev) => (prev.has(slug) ? prev : new Set(prev).add(slug)));
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `tick` re-measures the window as stories age past a day while the app is open
  const river = useMemo(
    () => recentRiver(orderNewsRiver(grouped), Date.now(), pinnedSlugs),
    [grouped, pinnedSlugs, tick],
  );

  const columns = useMemo(
    () => buildInstrumentCards({ trends, chokepoints, analysis, articles: river }),
    [trends, chokepoints, analysis, river],
  );

  /** One ranked list across every instrument family. The three desks used to
   *  rank each pool against itself, which could only ever compare a strait
   *  with other straits. */
  const rankedInstruments = useMemo(
    () => buildRankedInstruments(columns, marketSignals, river),
    [columns, marketSignals, river],
  );

  const { strip, now } = useMemo(
    () =>
      buildNowSurfaces({
        ranked: rankedInstruments,
        chokepoints,
        // The card view of a signal carries no geometry — a `Card` never
        // does. Placement reads the raw payload, where the exchange's
        // coordinates are.
        signals: rawSignals,
        gdacsAlerts,
      }),
    [rankedInstruments, chokepoints, rawSignals, gdacsAlerts],
  );

  /**
   * The exchanges the globe draws.
   *
   * Only the flagged ones, and only where a place is honest: `buildNowSurfaces`
   * has already run the placement ladder, so this is a filter rather than a
   * second resolution. Thirty static exchange dots would be noise — a mark is
   * here because its index did something, which is the same rule every card
   * in the app is admitted under.
   */
  const stripRef = useRef(strip);
  stripRef.current = strip;

  const marketMarks = useMemo(
    () =>
      strip
        .filter((item) => item.id.startsWith('market-signal:') && item.coords)
        .map((item) => ({
          id: item.id,
          // The exchange, not the ticker: the mark stands for a place, and
          // `Borsa İstanbul` is a place where `BIST 100` is a number.
          label: item.label,
          // Coloured by the move the server flagged — the card's own chip,
          // which is why the mark exists — not by the gauge's week, so a mark
          // and the card it opens cannot point opposite ways.
          direction: item.card.delta?.direction,
          lat: (item.coords as LatLng)[0],
          lng: (item.coords as LatLng)[1],
        })),
    [strip],
  );

  const odds = useMemo(() => oddsByStory(trends, analysis), [trends, analysis]);
  const oddsLabelBySlug = useMemo(() => oddsLabels(odds), [odds]);

  const storyRows = useMemo(
    () => buildStoryRows({ river, lastSeenAt, odds: oddsLabelBySlug }),
    [river, lastSeenAt, oddsLabelBySlug],
  );
  const cameraTrack = useMemo(() => cameraTrackOf(storyRows), [storyRows]);

  const resolvableEntityIds = useMemo(() => new Set(indicatorsById.keys()), [indicatorsById]);
  const activeIndicator = useMemo(
    () => (activeEntity ? (indicatorsById.get(activeEntity.indicatorId) ?? null) : null),
    [activeEntity, indicatorsById],
  );

  // ---------------------------------------------------------------------
  // Finding the news
  //
  // Every story on the globe is a light until the reader opens it — by
  // tapping its mark, or by reading its card grown — and a found story's mark
  // is no longer drawn. Swiping past a card at rest does not find it: thirty
  // seconds of swiping would otherwise empty the globe. `lib/found-store.ts`
  // holds the set; `lib/story-places.ts` groups the river into the places the
  // marks stand for.
  // ---------------------------------------------------------------------
  const foundSlugs = useFoundSlugs();
  const readSlugs = useReadSlugs();
  const places = useMemo(() => buildStoryPlaces(storyRows), [storyRows]);
  const progress = useMemo(() => foundProgress(storyRows, foundSlugs), [storyRows, foundSlugs]);

  // Against the loaded river only: pruning against an empty one is exactly the
  // partial-payload wipe the store's age guard exists to refuse.
  useEffect(() => {
    if (river.length === 0) return;
    pruneFound(new Set(river.map((a) => a.slug)));
    pruneRead(new Set(river.map((a) => a.slug)));
  }, [river]);

  useEffect(
    () => () => {
      if (flyTimerRef.current) clearTimeout(flyTimerRef.current);
      if (handoffTimerRef.current) clearTimeout(handoffTimerRef.current);
    },
    [],
  );

  // ---------------------------------------------------------------------
  // Refs for stable callbacks
  // ---------------------------------------------------------------------
  const groupedRef = useRef(grouped);
  groupedRef.current = grouped;
  const generatedRef = useRef(generated);
  generatedRef.current = generated;
  const chokepointsRef = useRef(chokepoints);
  chokepointsRef.current = chokepoints;
  const trendsRef = useRef(trends);
  trendsRef.current = trends;
  const gdacsAlertsRef = useRef(gdacsAlerts);
  gdacsAlertsRef.current = gdacsAlerts;
  const conflictEventsRef = useRef(conflictEvents);
  conflictEventsRef.current = conflictEvents;
  const famineAreasRef = useRef(famineAreas);
  famineAreasRef.current = famineAreas;
  const thermalEventsRef = useRef(thermalEvents);
  thermalEventsRef.current = thermalEvents;
  const genocideRef = useRef(genocideSituations);
  genocideRef.current = genocideSituations;
  const storyRowsRef = useRef(storyRows);
  storyRowsRef.current = storyRows;
  const rankedRef = useRef(rankedInstruments);
  rankedRef.current = rankedInstruments;
  const nowRef = useRef(now);
  nowRef.current = now;

  // ---------------------------------------------------------------------
  // Camera control
  // ---------------------------------------------------------------------
  /** Send the camera somewhere and hold it there until the deck takes it back.
   *  The shortest way round: a flight from Tokyo to San Francisco crosses the
   *  Pacific, not Europe and the Atlantic. */
  const flyTo = useCallback(
    (coords: LatLng | null) => {
      if (!coords) return;
      const [lat, lng] = coords;
      let delta = lng - cameraLng.value;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      const duration = reduceMotion ? 0 : FLY_MS;
      cameraOwner.value = 1;
      cameraLat.value = withTiming(lat, { duration, easing: EASING.inOut });
      cameraLng.value = withTiming(cameraLng.value + delta, {
        duration,
        easing: EASING.inOut,
      });
    },
    [cameraLat, cameraLng, cameraOwner, reduceMotion],
  );

  /** A pinch has ended: redraw at full detail once any hand-back has eased. */
  const handleZoomSettle = useCallback((delayMs: number) => {
    if (zoomSettleTimerRef.current) clearTimeout(zoomSettleTimerRef.current);
    zoomSettleTimerRef.current = setTimeout(() => {
      zoomSettleTimerRef.current = null;
      globeRef.current?.settle();
    }, delayMs);
  }, []);

  // ---------------------------------------------------------------------
  // The deck
  // ---------------------------------------------------------------------
  /**
   * Record a find, and mark the day complete once — with the one success
   * haptic the game has — when it was the last light on the globe.
   */
  const findStory = useCallback((slug: string) => {
    if (!markFound(slug)) return;
    const { found, total } = foundProgress(storyRowsRef.current, getFound());
    if (total > 0 && found === total) {
      hapticNotification();
      toastRef.current?.show(
        `All ${total} found · new stories arrive through the day`,
        undefined,
        'top',
      );
    }
  }, []);

  /**
   * Put a story in front of the deck — a tap on its light, a row in the list,
   * a notification, a related story in another sheet.
   *
   * A jump, never an animated swipe: an animated pass from the first story to
   * the thirtieth would send the camera through twenty-nine datelines. The
   * camera is held where it is (`cameraOwner = 1`) the instant the position
   * jumps, then flies. For a tapped light the order is the interaction: the
   * store records the find first, so the next reprojection drops the mark on
   * the frame the burst starts over it; the card swaps at once, so the words
   * arrive with the burst; and the camera waits for the burst to finish, so
   * the colour plays where the mark was instead of being dragged across the
   * earth.
   */
  const focusStory = useCallback(
    (slug: string, options: FocusOptions = {}) => {
      const index = storyRowsRef.current.findIndex((r) => r.slug === slug);
      if (index < 0) {
        pendingFocusRef.current = { slug, ...options };
        // Older than the day but still in the feed: keep it in the river, and
        // the pending focus lands once the river includes it.
        if (CATEGORIES.some((c) => groupedRef.current[c].some((a) => a.slug === slug))) {
          pinStory(slug);
        }
        return;
      }
      pendingFocusRef.current = null;
      const row = storyRowsRef.current[index];
      if (options.afterBurst || options.grow) findStory(slug);
      cameraClaimedRef.current = true;
      if (flyTimerRef.current) clearTimeout(flyTimerRef.current);
      flyTimerRef.current = null;
      if (handoffTimerRef.current) clearTimeout(handoffTimerRef.current);
      handoffTimerRef.current = null;

      const coords = row?.coords ?? null;
      if (coords) cameraOwner.value = 1;
      deckIndexRef.current = index;
      currentSlugRef.current = slug;
      storyProgress.value = index;
      setDeckIndex(index);

      if (coords) {
        if (options.afterBurst && !reduceMotion) {
          flyTimerRef.current = setTimeout(() => flyTo(coords), COLLECT_MS - 120);
        } else {
          flyTo(coords);
        }
      }
      if (options.grow) mapSheetRef.current?.expand();
    },
    [cameraOwner, findStory, flyTo, pinStory, reduceMotion, storyProgress],
  );

  // A focus that arrived before its story did.
  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (pending && storyRows.some((r) => r.slug === pending.slug)) {
      focusStory(pending.slug, pending);
    }
  }, [storyRows, focusStory]);

  // A refresh can insert stories in front of the one being read, or rotate it
  // out. Keep the reader on their story; hold the camera on it while the
  // position shifts so the globe does not slide through the new arrivals.
  useEffect(() => {
    const slug = currentSlugRef.current;
    let index = slug ? storyRows.findIndex((r) => r.slug === slug) : -1;
    if (index < 0) index = Math.min(deckIndexRef.current, storyRows.length);
    if (index === deckIndexRef.current) return;
    const coords = storyRows[index]?.coords;
    if (coords) {
      cameraLat.value = coords[0];
      cameraLng.value = coords[1];
      cameraOwner.value = 1;
    }
    deckIndexRef.current = index;
    storyProgress.value = index;
    setDeckIndex(index);
  }, [storyRows, cameraLat, cameraLng, cameraOwner, storyProgress]);

  const handleSelectArticle = useCallback(
    (slug: string, category: Category) => {
      menuSheetRef.current?.dismiss();
      // `category` is still in the signature because callers (bookmarks,
      // notification payloads, related-story rows) know it and the feed is
      // still grouped by it underneath.
      const actual = CATEGORIES.find((c) => groupedRef.current[c].some((a) => a.slug === slug));
      if (!actual) {
        const bookmark = getBookmarks().find((b) => b.article.slug === slug);
        if (bookmark) {
          // A saved story is usually older than the day's window.
          pinStory(slug);
          injectArticle(bookmark.article, category);
        } else {
          toastRef.current?.show('Article no longer available');
          return;
        }
      }
      focusStory(slug, { grow: true });
    },
    [focusStory, injectArticle, pinStory],
  );

  // The gauge whose card is open: its slot is marked and the globe rings its
  // place until the card closes, so a ring on the planet always has a gauge.
  const [selectedGauge, setSelectedGauge] = useState<StripItem | null>(null);

  const openCard = useCallback((card: SwipeCard) => {
    setActiveCard(card);
    cardSheetRef.current?.present();
  }, []);

  const handleStripPress = useCallback(
    (item: StripItem) => {
      hapticImpact();
      markHintDone('globe');
      flyTo(item.coords);
      setSelectedGauge(item);
      openCard(item.card);
    },
    [flyTo, openCard],
  );

  const handleNowPress = useCallback(
    (item: NowItem) => {
      hapticImpact();
      flyTo(item.coords);
      const alert = gdacsAlertsRef.current.find((a) => a.eventid === item.gdacsEventId);
      if (alert) {
        setActiveAlert(alert);
        disasterSheetRef.current?.present();
      }
    },
    [flyTo],
  );

  const openLink = useOpenLink();
  /** The contract's own card where the deck admitted it; otherwise the market
   *  itself — a price is only worth printing if the reader can check it. */
  const handleOddsPress = useCallback(
    (value: StoryOdds) => {
      hapticTick();
      const card = rankedRef.current.find((c) => c.id === value.id);
      if (card) openCard(card);
      else if (value.marketUrl) openLink(value.marketUrl);
    },
    [openCard, openLink],
  );

  const handleInstrumentsPress = useCallback(() => {
    hapticImpact();
    setInstrumentsOpen(true);
    instrumentsSheetRef.current?.present();
  }, []);

  const handleInstrumentSelect = useCallback(
    (card: SwipeCard) => {
      instrumentsSheetRef.current?.dismiss();
      // A row is its gauge in a list: the same flight and the same ring, when
      // the instrument has a place and a week to show.
      const gauge = strip.find((item) => item.id === card.id) ?? null;
      if (gauge) flyTo(gauge.coords);
      setSelectedGauge(gauge);
      openCard(card);
    },
    [flyTo, openCard, strip],
  );

  const openOverlay = useCallback((selection: OverlaySelection) => {
    setActiveOverlay(selection);
    overlaySheetRef.current?.present();
  }, []);

  // ---------------------------------------------------------------------
  // Globe taps
  // ---------------------------------------------------------------------
  const handleCountryPress = useCallback(
    (result: TapResult) => {
      // No haptic here: every caller — the globe's tap layer, an inline
      // country link, the chooser's row — has already given its own, and a
      // second one on the same touch read as a double knock.
      // Any path here — globe tap, marker tap, or inline country link — proves
      // the reader found the map layer; the globe hint retires on all of them.
      markHintDone('globe');
      cameraClaimedRef.current = true;
      if (result.storySlug) {
        focusStory(result.storySlug, { afterBurst: true });
        return;
      }
      if (result.candidates && result.candidates.length > 1) {
        setChooserCandidates(result.candidates);
        disambiguationSheetRef.current?.present();
        return;
      }
      if (result.genocideId) {
        const situation = genocideRef.current.find((g) => g.id === result.genocideId);
        if (situation) openOverlay({ kind: 'genocide', situation });
        return;
      }
      if (result.famineAreaId) {
        const area = famineAreasRef.current.find((a) => a.id === result.famineAreaId);
        if (area) openOverlay({ kind: 'famine', area });
        return;
      }
      if (result.thermalEventId) {
        const event = thermalEventsRef.current.find((e) => e.id === result.thermalEventId);
        if (event) openOverlay({ kind: 'thermal', event });
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
      if (result.marketSignalId) {
        const card = rankedRef.current.find((c) => c.id === result.marketSignalId);
        if (card) openCard(card);
        return;
      }
      if (result.chokepointId) {
        // The strait's card, the same one its gauge opens. The mark opened a
        // sheet of its own with a different chart, and a strait read one way
        // from the top of the screen and another from the globe.
        const id = `strait-${result.chokepointId}`;
        const cp = chokepointsRef.current.find((c) => c.id === result.chokepointId);
        // Built from the strait alone when the deck has none: the marks come
        // from `chokepoints.json`, the deck waits for `trends.json`.
        const card =
          rankedRef.current.find((c) => c.id === id) ??
          (cp ? straitCardFor(cp, trendsRef.current, new Date()) : null);
        if (card) {
          setSelectedGauge(stripRef.current.find((item) => item.id === id) ?? null);
          openCard(card);
        } else if (cp) {
          toastRef.current?.show(cp.name);
        }
        return;
      }
      // A hotspot is a cluster of coverage, not a thing — it stands for the
      // stories under it, so it opens the top one rather than a sheet about
      // a glow.
      if (result.isHotspot) {
        const label = result.hotspotLabels?.[0] ?? result.countryName;
        if (!label) return;
        toastRef.current?.show(label, () => {
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
      setCountrySheet(result);
      countrySheetRef.current?.present();
    },
    [focusStory, handleSelectArticle, openCard, openOverlay],
  );

  // ---------------------------------------------------------------------
  // The rest of the handlers, carried over
  // ---------------------------------------------------------------------
  const handleArticleBookmark = useCallback((article: RiverArticle) => {
    const category = article.category;
    const added = toggleBookmark(article, category);
    markHintDone('bookmark');
    hapticNotification();
    if (added) {
      toastRef.current?.show('Saved to bookmarks');
    } else {
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
    markHintDone('masthead');
    briefingChromeRef.current?.toggle();
  }, []);
  const handleBriefingUnavailable = useCallback(() => {
    hapticTick();
    toastRef.current?.show('No briefing available', undefined, 'top');
  }, []);
  const handleBriefingPlaybackError = useCallback(() => {
    hapticTick();
    toastRef.current?.show('Couldn’t play briefing — tap to retry', handleBriefingPress, 'top');
  }, [handleBriefingPress]);

  const handleSourcesPress = useCallback((article: Article) => {
    markHintDone('sources');
    setSheetSources(article.sources);
    setSheetDivergence(article.sentimentDivergence ?? null);
    sourcesSheetRef.current?.present();
  }, []);

  const handleShare = useCallback((article: RiverArticle) => {
    hapticImpact();
    const url = `https://zuhd.news/a/${article.slug}`;
    const title = article.title;
    const content = Platform.select({
      ios: { url, title },
      default: { message: `${title}\n${url}`, title },
    });
    if (!content) return;
    Share.share(
      content,
      Platform.select({
        ios: { subject: `${title} — zuhd.news` },
        default: { dialogTitle: 'Share' },
      }),
    ).catch(() => {});
  }, []);

  const countryAlerts = useMemo<GdacsAlert[]>(() => {
    const name = countrySheet?.countryName;
    if (!name) return [];
    const score = (l: GdacsAlert['alertlevel']) => (l === 'Red' ? 2 : l === 'Orange' ? 1 : 0);
    return gdacsAlerts
      .filter((a) => a.country === name || a.affectedCountries.includes(name))
      .sort((a, b) => score(b.alertlevel) - score(a.alertlevel));
  }, [countrySheet?.countryName, gdacsAlerts]);

  /** The hazard marks in the open country, as rows — see `CountrySheet.hazards`.
   *  Thermal anomalies carry no country, only the stories they were joined to,
   *  so they are reachable from those stories rather than from here. */
  const countryHazards = useMemo<CountryHazard[]>(() => {
    const name = countrySheet?.countryName;
    if (!name) return [];
    const rows: CountryHazard[] = [];
    for (const situation of genocideSituations) {
      const country = situation.profile ?? (situation.iso2 && topojsonNameFromCode(situation.iso2));
      if (country !== name) continue;
      rows.push({
        key: `genocide-${situation.id}`,
        title: `Genocide · ${situation.name}`,
        detail: 'as determined by the UN',
        onPress: () => openOverlay({ kind: 'genocide', situation }),
      });
    }
    const areas = famineAreas.filter((a) => a.iso2 && topojsonNameFromCode(a.iso2) === name);
    // Gravest phase first; the rows are a list of places, not a tally.
    areas.sort((a, b) => b.phase - a.phase);
    for (const area of areas) {
      rows.push({
        key: `famine-${area.id}`,
        title: area.area,
        detail: `${area.phaseName.toLowerCase()} · IPC phase ${area.phase}`,
        onPress: () => openOverlay({ kind: 'famine', area }),
      });
    }
    return rows;
  }, [countrySheet?.countryName, famineAreas, genocideSituations, openOverlay]);

  const handleCountryAlertPress = useCallback((alert: GdacsAlert) => {
    setActiveAlert(alert);
    disasterSheetRef.current?.present();
  }, []);

  const openCountry = useCallback(
    (countryName: string, data: CountryData | null = COUNTRY_DATA[countryName] ?? null) => {
      setCountrySheet({ countryName, location: null, localTime: null, data });
      countrySheetRef.current?.present();
    },
    [],
  );

  const handleEntityPress = useCallback(
    (entity: Entity) => {
      if (!indicatorsById.get(entity.indicatorId)) return;
      hapticTick();
      setActiveEntity(entity);
      entitySheetRef.current?.present();
    },
    [indicatorsById],
  );

  const sheetOpen =
    menuOpen ||
    primerOpen ||
    instrumentsOpen ||
    indexOpen ||
    sheetSources.length > 0 ||
    countrySheet !== null ||
    activeAlert !== null ||
    activeConflict !== null ||
    activeCard !== null ||
    activeOverlay !== null ||
    chooserCandidates.length > 0 ||
    activeEntity !== null;
  const sheetOpenRef = useRef(sheetOpen);
  sheetOpenRef.current = sheetOpen;

  const { activeHint, dismissActiveHint } = useOnboardingHints({
    ready: !loading && heatmapReady,
    suppressed: sheetOpen || briefingVisible,
    surface: 'map',
  });

  const notificationsOnRef = useRef(preferences.notifications);
  notificationsOnRef.current = preferences.notifications;
  const primerTriedRef = useRef(false);
  const caughtUpFiredRef = useRef(false);

  /** The reader has swiped onto the first story they had already seen. Said
   *  once a session, with the haptic the old reader gave the same boundary. */
  const handleCaughtUp = useCallback(() => {
    if (caughtUpFiredRef.current) return;
    caughtUpFiredRef.current = true;
    hapticNotification();
    if (primerTriedRef.current) return;
    if (getOnboarding().primer.status !== 'pending' || notificationsOnRef.current) return;
    primerTriedRef.current = true;
    setTimeout(() => {
      if (sheetOpenRef.current) return;
      setPrimerOpen(true);
      primerSheetRef.current?.present();
    }, PRIMER_PRESENT_DELAY_MS);
  }, []);

  /**
   * A finger has started a swipe on the deck.
   *
   * If the camera is still on the story in front — the usual case — the swipe
   * takes it over at once and the earth turns under the finger. If a drag on
   * the globe or a flight has put it somewhere else, it stays there: taking it
   * back mid-drag would snap the earth from where the reader left it. The
   * swipe then flies it once it lands (`handleDeckSettle`).
   */
  const handleDeckDragStart = useCallback(() => {
    cameraClaimedRef.current = true;
    dismissActiveHint();
    if (handoffTimerRef.current) clearTimeout(handoffTimerRef.current);
    handoffTimerRef.current = null;
    if (cameraOwner.value !== 1) return;
    const coords = storyRowsRef.current[deckIndexRef.current]?.coords;
    if (!coords) return;
    let dLng = Math.abs(cameraLng.value - coords[1]) % 360;
    if (dLng > 180) dLng = 360 - dLng;
    if (Math.abs(cameraLat.value - coords[0]) < HANDOFF_DEGREES && dLng < HANDOFF_DEGREES) {
      cameraOwner.value = 0;
    }
  }, [cameraLat, cameraLng, cameraOwner, dismissActiveHint]);

  const handleDeckSettle = useCallback(
    (index: number) => {
      deckIndexRef.current = index;
      setDeckIndex(index);
      hapticTick();
      recordArticleSnap();
      maybeRequestReview();
      const row = storyRowsRef.current[index];
      currentSlugRef.current = row?.slug ?? null;
      if (row) {
        if (row.mark === 'earlier') handleCaughtUp();
        // Reading a story grown is opening it; swiping past one at rest is not.
        if (sheetDetentRef.current === 'full') findStory(row.slug);
      }
      if (cameraOwner.value === 1 && row?.coords) {
        flyTo(row.coords);
        // Hand the camera back to the deck once the flight has landed on the
        // story the deck is on — at that point the two agree and nothing moves.
        handoffTimerRef.current = setTimeout(
          () => {
            handoffTimerRef.current = null;
            if (deckIndexRef.current === index) cameraOwner.value = 0;
          },
          (reduceMotion ? 0 : FLY_MS) + 50,
        );
      }
    },
    [cameraOwner, findStory, flyTo, handleCaughtUp, reduceMotion],
  );

  const goToStory = useCallback(
    (index: number) => {
      const row = storyRowsRef.current[index];
      if (row) focusStory(row.slug);
    },
    [focusStory],
  );
  const handleNextStory = useCallback(() => goToStory(deckIndexRef.current + 1), [goToStory]);
  const handlePreviousStory = useCallback(() => goToStory(deckIndexRef.current - 1), [goToStory]);

  const expandSheet = useCallback(() => {
    mapSheetRef.current?.expand();
  }, []);
  const collapseSheet = useCallback(() => {
    mapSheetRef.current?.collapse();
  }, []);

  const handleDetentChange = useCallback(
    (detent: MapSheetDetent) => {
      sheetDetentRef.current = detent;
      setSheetDetent(detent);
      if (detent !== 'full') return;
      dismissActiveHint();
      const row = storyRowsRef.current[deckIndexRef.current];
      if (row) findStory(row.slug);
    },
    [dismissActiveHint, findStory],
  );

  const handleIndexPress = useCallback(() => {
    hapticImpact();
    markHintDone('masthead');
    setIndexOpen(true);
    indexSheetRef.current?.present();
  }, []);
  const handleIndexSelect = useCallback(
    (slug: string) => {
      indexSheetRef.current?.dismiss();
      focusStory(slug);
    },
    [focusStory],
  );
  const handleIndexNowPress = useCallback(
    (item: NowItem) => {
      indexSheetRef.current?.dismiss();
      handleNowPress(item);
    },
    [handleNowPress],
  );
  const handleMastheadAlertPress = useCallback(() => {
    const item = nowRef.current[0];
    if (item) handleNowPress(item);
  }, [handleNowPress]);

  const handleMenuToast = useCallback((message: string) => {
    toastRef.current?.show(message, undefined, 'top');
  }, []);

  const handleMenuDismiss = useCallback(() => setMenuOpen(false), []);
  const handleCountryDismiss = useCallback(() => setCountrySheet(null), []);
  const handleDisasterDismiss = useCallback(() => setActiveAlert(null), []);
  const handleConflictDismiss = useCallback(() => setActiveConflict(null), []);
  const handleChooserDismiss = useCallback(() => setChooserCandidates([]), []);
  const handleEntityDismiss = useCallback(() => setActiveEntity(null), []);
  const handlePrimerDismiss = useCallback(() => setPrimerOpen(false), []);
  const handleCardDismiss = useCallback(() => {
    setActiveCard(null);
    setSelectedGauge(null);
  }, []);
  const handleCardStoryPress = useCallback(
    async (slug: string) => {
      const inFeed = CATEGORIES.some((c) => groupedRef.current[c].some((a) => a.slug === slug));
      if (inFeed) {
        cardSheetRef.current?.dismiss();
        // The category is re-resolved from the feed.
        handleSelectArticle(slug, 'politics');
        return;
      }
      // A card cites a fortnight of coverage and the feed holds about a day
      // and a half, so most cited stories have to be fetched. The card stays
      // open until the story is in hand: a failed tap loses the reader nothing.
      try {
        const story = await fetchJson(`${API_BASE}/api/story/${slug}.json`, isStoryPayload);
        const resolved = articleFromStory(story);
        if (!resolved) throw new Error('unreadable story');
        pinStory(slug);
        injectArticle(resolved.article, resolved.category);
      } catch {
        toastRef.current?.show('Could not open that story');
        return;
      }
      cardSheetRef.current?.dismiss();
      focusStory(slug, { grow: true });
    },
    [focusStory, handleSelectArticle, injectArticle, pinStory],
  );
  const handleOverlayDismiss = useCallback(() => setActiveOverlay(null), []);
  const handleInstrumentsDismiss = useCallback(() => setInstrumentsOpen(false), []);
  const handleIndexDismiss = useCallback(() => setIndexOpen(false), []);
  const handleSourcesDismiss = useCallback(() => {
    setSheetSources([]);
    setSheetDivergence(null);
  }, []);
  const handleDisasterCountryPress = useCallback(
    (countryName: string) => {
      disasterSheetRef.current?.dismiss();
      openCountry(countryName);
    },
    [openCountry],
  );
  const handleConflictCountryPress = useCallback(
    (countryName: string) => {
      conflictSheetRef.current?.dismiss();
      openCountry(countryName);
    },
    [openCountry],
  );
  const handleChooserSelect = useCallback(
    (candidate: TapResult) => {
      disambiguationSheetRef.current?.dismiss();
      handleCountryPress(candidate);
    },
    [handleCountryPress],
  );
  const handleOverlayArticlePress = useCallback(
    (slug: string, category: Category) => {
      overlaySheetRef.current?.dismiss();
      handleSelectArticle(slug, category);
    },
    [handleSelectArticle],
  );
  const handleOverlayCountryPress = useCallback(
    (countryName: string) => {
      overlaySheetRef.current?.dismiss();
      openCountry(countryName);
    },
    [openCountry],
  );
  const handleEntityArticlePress = useCallback(
    (slug: string, category: Category) => {
      entitySheetRef.current?.dismiss();
      handleSelectArticle(slug, category);
    },
    [handleSelectArticle],
  );

  const handleRefresh = useCallback(async () => {
    hapticImpact();
    setRefreshing(true);
    try {
      const addedArticles = await refresh();
      if (addedArticles.length > 0) {
        const words = addedArticles.reduce(
          (sum, article) => sum + article.sentences.join(' ').split(/\s+/).length,
          0,
        );
        const mins = Math.max(1, Math.ceil(words / EDITORIAL.readingWpm));
        toastRef.current?.show(`${addedArticles.length} new · ~${mins} min read`, undefined, 'top');
      } else {
        const built = generatedRef.current ? Date.parse(generatedRef.current) : Number.NaN;
        toastRef.current?.show(
          Number.isFinite(built)
            ? `Already up to date · ${formatTimeAgo(built)}`
            : 'Already up to date',
          undefined,
          'top',
        );
      }
    } catch {
      toastRef.current?.show('Could not refresh', undefined, 'top');
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  // Android's back puts a grown story down before it leaves the app. The map
  // is the root screen, so without this the one key a reader reaches for to
  // get back down to the globe closed zuhd instead.
  useHardwareBack({ enabled: sheetDetent === 'full', onBack: collapseSheet });

  // The earth steps back as a story grows: the resting disc is scaled into the
  // band left above the grown sheet. A transform, never a reprojection — this
  // tracks a finger at 60fps and a projection is tens of milliseconds. It is
  // finger-tracked, so it is exempt from Reduce Motion like the sheet itself.
  //
  // **Applied inside the canvas, not to the view.** A view transform scales the
  // canvas's pixels, and once zooming grew the planet past the screen that cut
  // a zoomed globe at the canvas's edge and shrank the cut with it: dark bands
  // down both sides of the grown band. Skia applies this one to the drawing,
  // and the projection already reaches the ground it uncovers (`grownReach`).
  const globeTransform = useDerivedValue<Transforms3d>(() => {
    const p = Math.min(1, Math.max(0, sheetProgress.value));
    const grown = grownGlobeTransform(layout, screenHeight, sheetExpanded.value);
    return [{ translateY: p * grown.translateY }, { scale: 1 + p * (grown.scale - 1) }];
  });
  const globeReach = useMemo(() => grownReach(layout, screenHeight), [layout, screenHeight]);

  // Hold the splash until we have something for *every* visible layer.
  useEffect(() => {
    if (loading) return;
    if (heatmapReady) {
      SplashScreen.hide();
      return;
    }
    const timer = setTimeout(() => SplashScreen.hide(), HEATMAP_SPLASH_GRACE_MS);
    return () => clearTimeout(timer);
  }, [loading, heatmapReady]);

  usePendingNotification(loading, grouped, handleSelectArticle, handleBriefingPress);

  const storyCount = storyRows.length;
  const frontIndex = Math.min(deckIndex, storyCount);
  useReadTracking(
    storyRows[frontIndex]?.slug ?? null,
    sheetDetent === 'full' && !sheetOpen && !briefingVisible,
  );

  const keyOfDeck = useCallback(
    (index: number) => storyRows[index]?.slug ?? 'end-of-river',
    [storyRows],
  );
  const storyDetailAt = useCallback((index: number) => {
    const row = storyRowsRef.current[index];
    return row ? `${row.article.category} · ${formatTimeAgo(articleTime(row.article))}` : '';
  }, []);
  const storyHues = useMemo(
    () => storyRows.map((row) => categoryMarkColor(row.article.category, colors)),
    [storyRows, colors],
  );

  const renderStory = useCallback(
    (index: number) => {
      const row = storyRows[index];
      if (!row) return null;
      return (
        <StoryCard
          row={row}
          hue={categoryMarkColor(row.article.category, colors)}
          odds={odds.get(row.slug) ?? null}
          resolvableEntityIds={resolvableEntityIds}
          bottomInset={cardBottomInset}
          onOpen={expandSheet}
          onNext={handleNextStory}
          onPrevious={index > 0 ? handlePreviousStory : undefined}
          onCountryPress={handleCountryPress}
          onEntityPress={handleEntityPress}
          onOddsPress={handleOddsPress}
          onSources={handleSourcesPress}
          onBookmark={handleArticleBookmark}
          onShare={handleShare}
        />
      );
    },
    [
      cardBottomInset,
      colors,
      expandSheet,
      handleArticleBookmark,
      handleCountryPress,
      handleEntityPress,
      handleNextStory,
      handleOddsPress,
      handlePreviousStory,
      handleShare,
      handleSourcesPress,
      odds,
      resolvableEntityIds,
      storyRows,
    ],
  );

  const renderEnd = useCallback(
    () =>
      storyCount === 0 ? (
        <EmptyState message="no stories yet" hint="New coverage arrives through the day" />
      ) : (
        <EndCard bottomInset={cardBottomInset} onAllStories={handleIndexPress} />
      ),
    [cardBottomInset, handleIndexPress, storyCount],
  );

  const renderList = useCallback(
    ({
      scrollEnabled,
      onScrollOffset,
      sheetGesture,
      onContentHeight,
    }: {
      scrollEnabled: boolean;
      onScrollOffset: SharedValue<number>;
      sheetGesture: Parameters<typeof StoryDeck>[0]['sheetGesture'];
      onContentHeight: (height: number) => void;
    }) => (
      <StoryDeck
        count={storyCount}
        peekFade={sheetProgress}
        index={frontIndex}
        progress={storyProgress}
        width={screenWidth}
        sheetGesture={sheetGesture}
        scrollEnabled={scrollEnabled}
        onScrollOffset={onScrollOffset}
        onContentHeight={onContentHeight}
        keyOf={keyOfDeck}
        renderStory={renderStory}
        renderEnd={renderEnd}
        onDragStart={handleDeckDragStart}
        onSettle={handleDeckSettle}
      />
    ),
    [
      frontIndex,
      handleDeckDragStart,
      handleDeckSettle,
      keyOfDeck,
      renderEnd,
      renderStory,
      sheetProgress,
      screenWidth,
      storyCount,
      storyProgress,
    ],
  );

  const masthead = useMemo(
    () => (
      <SheetMasthead
        refreshing={refreshing}
        index={frontIndex}
        count={storyCount}
        position={storyProgress}
        progress={progress}
        alert={now[0]?.title ?? null}
        onPress={handleIndexPress}
        onAlertPress={handleMastheadAlertPress}
        onSeek={goToStory}
        detailAt={storyDetailAt}
        hues={storyHues}
        // While the player bar is up it is the control. A second play button
        // over audio that was already playing said the opposite of what was
        // happening; it returns when the bar hides.
        listenAvailable={briefingStatus.available && !briefingVisible}
        listenResumable={briefingStatus.resumable}
        listenDuration={briefingStatus.duration}
        listenHeard={briefingStatus.heard}
        onListenPress={handleBriefingPress}
      />
    ),
    [
      goToStory,
      storyDetailAt,
      storyHues,
      briefingStatus.available,
      briefingStatus.resumable,
      briefingStatus.duration,
      briefingStatus.heard,
      briefingVisible,
      handleBriefingPress,
      refreshing,
      frontIndex,
      storyCount,
      storyProgress,
      progress,
      now,
      handleIndexPress,
      handleMastheadAlertPress,
    ],
  );

  if (loading)
    return (
      <Screen>
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
      {/* The one earth. Everything below is a layer over it. */}
      <View style={styles.globeLayer} pointerEvents="none">
        <MiniGlobe
          ref={globeRef}
          articles={river}
          heatmapPoints={heatmapPoints}
          chokepoints={chokepoints}
          selectedAt={selectedGauge?.coords ?? null}
          gdacsAlerts={gdacsAlerts}
          conflictEvents={conflictEvents}
          marketMarks={marketMarks}
          places={places}
          foundSlugs={foundSlugs}
          foundProgress={progress}
          famineAreas={famineAreas}
          thermalEvents={thermalEvents}
          genocideSituations={genocideSituations}
          storyProgress={storyProgress}
          cameraTrack={cameraTrack}
          cameraOwner={cameraOwner}
          cameraLat={cameraLat}
          cameraLng={cameraLng}
          width={screenWidth}
          height={screenHeight}
          radius={layout.radius}
          centerY={layout.centerY}
          canvasTransform={globeTransform}
          canvasReach={globeReach}
          zoomActive={zoomActive}
          zoomAngle={zoomAngle}
          clipOut={globeClip}
          storyClipOut={storyClip}
          viewLat={viewLat}
          viewLng={viewLng}
          tick={tick}
        />
      </View>

      <GlobeGestureLayer
        globeRef={globeRef}
        canvasTop={0}
        cameraOwner={cameraOwner}
        cameraLat={cameraLat}
        cameraLng={cameraLng}
        viewLat={viewLat}
        viewLng={viewLng}
        zoomActive={zoomActive}
        zoomAngle={zoomAngle}
        clip={globeClip}
        storyClip={storyClip}
        radius={layout.radius}
        centerX={screenWidth / 2}
        centerY={layout.centerY}
        reduceMotion={reduceMotion}
        onTap={handleCountryPress}
        onZoomSettle={handleZoomSettle}
        onImpact={hapticImpact}
        enabled={sheetDetent === 'peek'}
        collapseMode={sheetDetent === 'full'}
        onCollapse={collapseSheet}
      />

      <View style={styles.topChrome} onLayout={onTopChromeLayout} pointerEvents="box-none">
        <MapHeader
          onMenuPress={handleMenuPress}
          items={strip}
          onSelect={handleStripPress}
          onAll={handleInstrumentsPress}
          recede={sheetProgress}
          gaugesEnabled={sheetDetent !== 'full'}
          selectedId={selectedGauge?.id ?? null}
        />
      </View>

      <MapSheet
        ref={mapSheetRef}
        peek={layout.peek}
        full={layout.full}
        expandedHeight={sheetExpanded}
        progress={sheetProgress}
        header={masthead}
        renderList={renderList}
        onDetentChange={handleDetentChange}
        onPullDown={handleRefresh}
      />

      {/* A top toast starts under the gauges; "12 new · ~9 min read" landed
          on the strip's readings. */}
      <Toast ref={toastRef} topOffset={topChromeHeight} />

      <HintOverlay
        hint={activeHint}
        onDismiss={dismissActiveHint}
        bottomInset={insets.bottom}
        // Above whatever height the sheet has settled at, so the pill never
        // sits on the words it is pointing at.
        bottomOffset={sheetDetent === 'full' ? layout.full : layout.peek}
      />

      <BriefingChrome
        ref={briefingChromeRef}
        date={briefing?.date}
        duration={briefing?.duration}
        onUnavailable={handleBriefingUnavailable}
        onPlaybackError={handleBriefingPlaybackError}
        onVisibilityChange={setBriefingVisible}
        onStatusChange={setBriefingStatus}
      />

      <MenuSheet
        sheetRef={menuSheetRef}
        bottomInset={insets.bottom}
        onDismiss={handleMenuDismiss}
        grouped={grouped}
        onSelectArticle={handleSelectArticle}
        onToast={handleMenuToast}
      />

      <IndexSheet
        sheetRef={indexSheetRef}
        bottomInset={insets.bottom}
        onDismiss={handleIndexDismiss}
        rows={storyRows}
        now={now}
        found={foundSlugs}
        read={readSlugs}
        // Only while open: the slug changes on every swipe, and a closed sheet
        // re-rendered for it on each one. Opening sets both props together, so
        // the sheet still scrolls to the story on the card.
        currentSlug={indexOpen ? (storyRows[frontIndex]?.slug ?? null) : null}
        open={indexOpen}
        onSelect={handleIndexSelect}
        onNowPress={handleIndexNowPress}
      />

      <CardSheet
        sheetRef={cardSheetRef}
        bottomInset={insets.bottom}
        card={activeCard}
        peekHeight={layout.peek}
        onDismiss={handleCardDismiss}
        onStoryPress={handleCardStoryPress}
      />

      <InstrumentsSheet
        sheetRef={instrumentsSheetRef}
        bottomInset={insets.bottom}
        cards={rankedInstruments}
        onSelect={handleInstrumentSelect}
        onDismiss={handleInstrumentsDismiss}
      />

      <CountrySheet
        sheetRef={countrySheetRef}
        country={countrySheet}
        activeAlerts={countryAlerts}
        onAlertPress={handleCountryAlertPress}
        hazards={countryHazards}
        bottomInset={insets.bottom}
        onDismiss={handleCountryDismiss}
      />

      <DisasterSheet
        sheetRef={disasterSheetRef}
        alert={activeAlert}
        details={gdacsDetails}
        bottomInset={insets.bottom}
        onDismiss={handleDisasterDismiss}
        onCountryPress={handleDisasterCountryPress}
      />

      <ConflictSheet
        sheetRef={conflictSheetRef}
        event={activeConflict}
        bottomInset={insets.bottom}
        onDismiss={handleConflictDismiss}
        onCountryPress={handleConflictCountryPress}
      />

      <OverlaySheet
        sheetRef={overlaySheetRef}
        overlay={activeOverlay}
        articles={river}
        bottomInset={insets.bottom}
        onDismiss={handleOverlayDismiss}
        onArticlePress={handleOverlayArticlePress}
        onCountryPress={handleOverlayCountryPress}
      />

      <DisambiguationSheet
        sheetRef={disambiguationSheetRef}
        candidates={chooserCandidates}
        chokepoints={chokepoints}
        alerts={gdacsAlerts}
        conflictEvents={conflictEvents}
        instruments={rankedInstruments}
        famineAreas={famineAreas}
        thermalEvents={thermalEvents}
        genocideSituations={genocideSituations}
        bottomInset={insets.bottom}
        onDismiss={handleChooserDismiss}
        onSelect={handleChooserSelect}
      />

      <EntitySheet
        sheetRef={entitySheetRef}
        entity={activeEntity}
        indicator={activeIndicator}
        articles={river}
        bottomInset={insets.bottom}
        onDismiss={handleEntityDismiss}
        onArticlePress={handleEntityArticlePress}
      />

      <SourcesSheet
        sheetRef={sourcesSheetRef}
        sources={sheetSources}
        divergence={sheetDivergence}
        bottomInset={insets.bottom}
        onDismiss={handleSourcesDismiss}
      />

      <NotificationPrimerSheet
        sheetRef={primerSheetRef}
        bottomInset={insets.bottom}
        onDismiss={handlePrimerDismiss}
        onToast={handleMenuToast}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  globeLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  topChrome: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
});
