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
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
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
import { FRAMING_WIDEST } from '../components/globe/projection';
import { HintOverlay } from '../components/HintOverlay';
import { MarketBrowserSheet } from '../components/MarketBrowserSheet';
import { MenuSheet } from '../components/MenuSheet';
import { GlobeGestureLayer } from '../components/map/GlobeGestureLayer';
import { MapHeader } from '../components/map/MapHeader';
import { MapSheet, type MapSheetDetent, type MapSheetRef } from '../components/map/MapSheet';
import { EndCard, StoryCard } from '../components/map/StoryCard';
import { StoryDeck, type StoryDeckRef } from '../components/map/StoryDeck';
import { StoryDock } from '../components/map/StoryDock';
import { StoryMeasure } from '../components/map/StoryMeasure';
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
  EDITORIAL,
  VARIANT_CAP,
} from '../constants/theme';
import { useAnalysis } from '../hooks/useAnalysis';
import type { AppReturn } from '../hooks/useArticles';
import { useArticles } from '../hooks/useArticles';
import { useCameraFlight } from '../hooks/useCameraFlight';
import { useChokepoints } from '../hooks/useChokepoints';
import { useConflictEvents } from '../hooks/useConflictEvents';
import { useGdacsAlerts } from '../hooks/useGdacsAlerts';
import { useHeatmap } from '../hooks/useHeatmap';
import { useMarketSignals } from '../hooks/useMarketSignals';
import { useMarkets } from '../hooks/useMarkets';
import { useOnboardingHints } from '../hooks/useOnboardingHints';
import { useFamineAreas, useGenocideSituations, useThermalEvents } from '../hooks/useOverlays';
import { usePendingNotification } from '../hooks/usePendingNotification';
import { useReadTracking } from '../hooks/useReadTracking';
import { useHardwareBack } from '../hooks/useSwipeBack';
import { usePreferences, useTheme } from '../hooks/useTheme';
import { useTrendsSnapshot } from '../hooks/useTrendsSnapshot';
import { announce } from '../lib/announce';
import { articleTime, formatTimeAgo } from '../lib/article-utils';
import { getSnapshot as getBookmarks, toggle as toggleBookmark } from '../lib/bookmark-store';
import { buildInstrumentCards, straitCardFor } from '../lib/cards/markets';
import type { SwipeCard } from '../lib/cards/rank';
import { buildRankedInstruments } from '../lib/cards/sections';
import { computeDeckLayout, openStoryHeight } from '../lib/deck-layout';
import { fetchJson } from '../lib/fetchJson';
import { getSnapshot as getFound, markFound, pruneFound, useFoundSlugs } from '../lib/found-store';
import { markLanded, useFreshSlugs } from '../lib/fresh-store';
import { arcDegrees, DECK_SETTLE_MS, flyCurve, flyMs } from '../lib/globe-camera';
import { hapticError, hapticImpact, hapticNotification, hapticTick } from '../lib/haptics';
import { buildStoryRows, cameraTrackOf } from '../lib/map-feed';
import { exchangeCard, exchangeDelta, exchangeIsStale } from '../lib/markets';
import {
  leadWithTopStories,
  orderNewsRiver,
  type RiverArticle,
  recentRiver,
  riverAnchor,
} from '../lib/news-order';
import {
  buildNowSurfaces,
  type LatLng,
  linkedGaugeIds,
  type NowItem,
  STRIP_SLOTS,
  type StripItem,
} from '../lib/now';
import {
  getSnapshot as getOnboarding,
  markHintDone,
  recordArticleSnap,
} from '../lib/onboarding-store';
import { useOpenLink } from '../lib/open-link';
import { oddsByStory, oddsLabels, type StoryOdds } from '../lib/predictions';
import { getSnapshot as getReadSlugs, pruneRead } from '../lib/read-store';
import { resumeLanding, unreadNewBehind } from '../lib/resume-landing';
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

/** The handlers a measured card is given: it is never shown or touched. */
const noop = () => {};

/** Longest a sheet hand-off waits for the first sheet's dismissal before
 *  presenting the next anyway — past a platform sheet's own close transition. */
const SHEET_HANDOFF_FLOOR_MS = 700;

interface FocusOptions {
  cameraEpoch?: number;
  /** A mark was tapped: the camera waits for its burst before it flies. */
  afterBurst?: boolean;
  /** Grow the card into the whole story. */
  grow?: boolean;
}

export default function HomeScreen() {
  const { colors, font, typography, textVariants } = useTheme();
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
  const mapSheetRef = useRef<MapSheetRef>(null);
  const deckRef = useRef<StoryDeckRef>(null);
  /** `handleReturn`, below, for `useArticles` to call inside an arrival. */
  const returnHandlerRef = useRef<((ret: AppReturn) => void) | null>(null);
  const globeRef = useRef<MiniGlobeRef>(null);
  const briefingChromeRef = useRef<BriefingChromeRef>(null);

  const { grouped, briefing, loading, error, refresh, retry, tick, generated, injectArticle } =
    useArticles(returnHandlerRef);
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
  const marketsSnapshot = useMarkets();
  const exchanges = useMemo(() => marketsSnapshot?.exchanges ?? [], [marketsSnapshot]);
  const network = useNetworkState();

  const [briefingVisible, setBriefingVisible] = useState(false);
  const [briefingStatus, setBriefingStatus] = useState<BriefingStatus>({
    available: false,
    resumable: false,
    heard: 0,
  });
  const [refreshing, setRefreshing] = useState(false);
  /** Where the sheet has settled. The globe only turns and hit-tests at peek:
   *  with a story open, the strip of earth above it puts the story down. */
  const [sheetDetent, setSheetDetent] = useState<MapSheetDetent>('peek');
  const sheetDetentRef = useRef<MapSheetDetent>('peek');
  /** The story in front of the deck. The end card is `storyRows.length`. */
  const [deckIndex, setDeckIndex] = useState(0);
  const deckIndexRef = useRef(0);
  /** The slug in front, so a refresh that inserts stories keeps the reader on
   *  the story they were reading rather than on whatever moved into its slot.
   *  Null until the reader has moved the deck: an untouched deck stays on the
   *  newest story. */
  const currentSlugRef = useRef<string | null>(null);
  /** The first story the deck showed: a launch whose reader is still on it
   *  has not started reading (`resumeLanding`). */
  const launchFrontSlugRef = useRef<string | null>(null);
  /** A story asked for before it was in the river — a bookmark that has
   *  rotated out of the feed is injected, and its row exists a render later. */
  const pendingFocusRef = useRef<({ slug: string } & FocusOptions) | null>(null);

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
  const primerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetProgress = useSharedValue(0);
  /** Set the first time the reader moves the camera or the deck themselves. */
  const cameraClaimedRef = useRef(false);
  /** Per story, whether the swipe to the next rides the finger — see
   *  `claimForDeck`. Filled once the globe can say each story's framing. */
  const ridesFinger = useSharedValue<boolean[]>([]);
  /** Flights: a jump travels the way a swipe does, and lands handing the
   *  camera back to the deck (`hooks/useCameraFlight.ts`). */
  const {
    setFront: setCameraFront,
    claimForDeck,
    releaseForDeck,
    cancelFlight,
    hold: holdCamera,
    toStory: flyToStory,
    remapStory,
    requestEpoch,
    toStoryIfHeld: flyToStoryIfHeld,
    toPlace: flyToPlace,
  } = useCameraFlight({
    cameraOwner,
    cameraLat,
    cameraLng,
    viewLat,
    viewLng,
    zoomActive,
    zoomAngle,
    clip: globeClip,
    storyProgress,
    ridesFinger,
  });

  const toastRef = useRef<ToastRef>(null);

  // ---------------------------------------------------------------------
  // One platform sheet at a time
  // ---------------------------------------------------------------------
  /**
   * Move from one platform sheet to the next — a country from a disaster, a
   * card from the instruments list — only once the first has gone.
   *
   * These were a `dismiss()` and a `present()` in the same tick, or a second
   * sheet presented over an open one. `@expo/ui` fires a sheet's close
   * callback after SwiftUI has finished dismissing it precisely so another
   * can be presented then; presented during the transition, UIKit rejects it.
   * So the next sheet waits for the first sheet's `onDismiss`, which runs
   * `runSheetHandOff`. The timer is a floor under that: a sheet that was not
   * actually up sends no dismissal, and the tap must still land.
   */
  const pendingSheetRef = useRef<(() => void) | null>(null);
  const handOffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runSheetHandOff = useCallback(() => {
    if (handOffTimerRef.current) clearTimeout(handOffTimerRef.current);
    handOffTimerRef.current = null;
    const next = pendingSheetRef.current;
    pendingSheetRef.current = null;
    next?.();
  }, []);
  const handOffSheet = useCallback(
    (from: React.RefObject<BottomSheetMethodsRef | null>, next: () => void) => {
      pendingSheetRef.current = next;
      if (handOffTimerRef.current) clearTimeout(handOffTimerRef.current);
      handOffTimerRef.current = setTimeout(runSheetHandOff, SHEET_HANDOFF_FLOOR_MS);
      from.current?.dismiss();
    },
    [runSheetHandOff],
  );
  useEffect(
    () => () => {
      if (handOffTimerRef.current) clearTimeout(handOffTimerRef.current);
    },
    [],
  );

  // ---------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------
  const [topChromeHeight, setTopChromeHeight] = useState(0);
  const onTopChromeLayout = useCallback((e: LayoutChangeEvent) => {
    setTopChromeHeight(e.nativeEvent.layout.height);
  }, []);

  // The card height the open sheet is sized for, from today's cards measured
  // off screen (`StoryMeasure` → `openStoryHeight`), and which set of cards
  // it was measured for. The last height stands until a
  // new measurement finishes, so a refresh does not drop the open story to
  // the estimate and back.
  const [measuredStory, setMeasuredStory] = useState<{ key: string; height: number } | null>(null);

  // The sheet at rest and open is sized from the card's type, not a fraction
  // of the window or the story in front, and the globe takes what is left —
  // see `lib/deck-layout.ts`.
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
        storyContent: measuredStory?.height,
      }),
    [
      screenWidth,
      screenHeight,
      topChromeHeight,
      insets.bottom,
      fontScale,
      textVariants,
      measuredStory?.height,
    ],
  );
  // The briefing's player hangs under the top bar while it is up (it sat on
  // the dock until 2026-09-22), so the cards end above the dock alone, and a
  // top toast starts under the player.
  const [playerHeight, setPlayerHeight] = useState(0);
  const topToastOffset = topChromeHeight + (briefingVisible ? playerHeight : 0);
  // Keyed on its two numbers. Written inline in the JSX, the object was
  // rebuilt whenever the compiler's cached block around `<MiniGlobe>` was, so
  // a swipe landing handed the globe a fresh object with the same two numbers
  // — the only prop that changed — and the memoized globe re-rendered for it
  // (5–13 ms a landing in a dev build, profiled 2026-09-22).
  // An open story's place stays in sight. The sheet covers the resting
  // centre, where the story's place is drawn, so the globe layer rises with
  // the sheet until that centre sits in the band left above it. A view
  // translate — the compositor moves the canvas; nothing reprojects or
  // replays — which the shrink it replaced could not say (2026-09-21).
  const globeLift = layout.storyCenterY - layout.centerY;
  const globeLiftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: globeLift * Math.min(1, Math.max(0, sheetProgress.value)) }],
  }));

  const marketBottom = screenHeight - layout.peek;
  const marketViewport = useMemo(
    () => ({ top: topChromeHeight, bottom: marketBottom }),
    [topChromeHeight, marketBottom],
  );

  // ---------------------------------------------------------------------
  // Derived content
  // ---------------------------------------------------------------------
  // The last day of news, plus any older story a reader asked for by name
  // (`pinStory`) — see `recentRiver`.
  const [pinnedSlugs, setPinnedSlugs] = useState<ReadonlySet<string>>(() => new Set());
  const pinStory = useCallback((slug: string) => {
    setPinnedSlugs((prev) => (prev.has(slug) ? prev : new Set(prev).add(slug)));
  }, []);
  // Then the day's top stories to the front (`leadWithTopStories`): the most
  // reported first, the rest of the day newest first behind them.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `tick` re-measures the window as stories age past a day while the app is open
  const { river, lead: riverLead } = useMemo(() => {
    const now = Date.now();
    return leadWithTopStories(recentRiver(orderNewsRiver(grouped), now, pinnedSlugs), now);
  }, [grouped, pinnedSlugs, tick]);

  const columns = useMemo(
    () => buildInstrumentCards({ trends, chokepoints, analysis, articles: river }),
    [trends, chokepoints, analysis, river],
  );

  /** One ranked list across every instrument family. The three desks used to
   *  rank each pool against itself, which could only ever compare a strait
   *  with other straits. */
  const rankedInstruments = useMemo(
    () => [
      ...buildRankedInstruments(columns, marketSignals, river),
      ...exchanges.map(exchangeCard),
    ],
    [columns, marketSignals, river, exchanges],
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
        exchanges,
        gdacsAlerts,
      }),
    [rankedInstruments, chokepoints, rawSignals, gdacsAlerts, exchanges],
  );

  // What the row shows; `strip` stays whole for the lookups below.
  const stripSlots = useMemo(() => strip.slice(0, STRIP_SLOTS), [strip]);
  const stripRef = useRef(strip);
  stripRef.current = strip;
  const mapMarkets = useMemo(
    () =>
      exchanges.map((exchange) => {
        const card = exchangeCard(exchange);
        return {
          id: card.id,
          // The card's title, not the raw field: it carries the display name
          // (`S&P/BMV IPC`, never the famine scale's `IPC`).
          label: card.title,
          short: card.title,
          reading: card.reading,
          delta: exchangeDelta(exchange),
          stale: exchangeIsStale(exchange),
          spark: card.series?.values ?? [],
          coords: [exchange.lat, exchange.lng] as LatLng,
          card,
        };
      }),
    [exchanges],
  );
  const mapMarketsRef = useRef(mapMarkets);
  mapMarketsRef.current = mapMarkets;
  const marketMarks = useMemo(
    () =>
      mapMarkets.map((item) => ({
        id: item.id,
        // Two lines on the globe: the name, then the move under it, larger.
        label: item.label,
        move: `${item.delta.direction === 'up' ? '↑' : item.delta.direction === 'down' ? '↓' : '−'}${item.delta.magnitude}${item.stale ? '*' : ''}`,
        direction: item.delta.direction,
        lat: item.coords[0],
        lng: item.coords[1],
      })),
    [mapMarkets],
  );

  const odds = useMemo(() => oddsByStory(trends, analysis), [trends, analysis]);
  const oddsLabelBySlug = useMemo(() => oddsLabels(odds), [odds]);

  const fresh = useFreshSlugs();
  const storyRows = useMemo(
    () => buildStoryRows({ river, fresh, odds: oddsLabelBySlug, lead: riverLead }),
    [river, fresh, oddsLabelBySlug, riverLead],
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
      if (zoomSettleTimerRef.current) clearTimeout(zoomSettleTimerRef.current);
      if (primerTimerRef.current) clearTimeout(primerTimerRef.current);
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
  /** Send the camera to a place that is not a story — a gauge, an alert —
   *  and hold it there until the deck takes it back. */
  const flyTo = useCallback(
    (coords: LatLng | null) => {
      if (coords) flyToPlace(coords);
    },
    [flyToPlace],
  );

  /** The clip story `index` rests at, for a flight to land on. */
  const framingFor = useCallback((index: number) => globeRef.current?.framingFor(index) ?? 0, []);

  // Which crossings ride the finger: the same comparison `handleDeckSettle`
  // makes at the lift, made once per river so the pan can read it on the UI
  // thread the moment it claims a swipe.
  useEffect(() => {
    ridesFinger.value = storyRows.map((row, i) => {
      const next = storyRows[i + 1];
      if (!row.coords || !next?.coords) return true;
      const crossing = flyCurve(
        framingFor(i) || FRAMING_WIDEST,
        framingFor(i + 1) || FRAMING_WIDEST,
        arcDegrees(row.coords[0], row.coords[1], next.coords[0], next.coords[1]),
      );
      return flyMs(crossing) <= DECK_SETTLE_MS;
    });
  }, [framingFor, ridesFinger, storyRows]);

  // The story in front, for a swipe to decide whether the camera is still on it.
  useEffect(() => {
    setCameraFront(storyRows[deckIndex]?.coords ?? null);
  }, [deckIndex, setCameraFront, storyRows]);

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
      if (options.cameraEpoch !== undefined && options.cameraEpoch !== requestEpoch.value) return;
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

      const coords = row?.coords ?? null;
      // Held before the deck jumps, so the jump cannot drag the camera
      // through every dateline between; the flight hands it back on landing.
      if (coords) holdCamera(options.cameraEpoch);
      deckIndexRef.current = index;
      currentSlugRef.current = slug;
      storyProgress.value = index;
      setDeckIndex(index);

      if (coords) {
        const framing = framingFor(index);
        flyToStory(
          coords,
          index,
          framing,
          options.afterBurst && !reduceMotion ? COLLECT_MS - 120 : 0,
          options.cameraEpoch,
        );
      }
      if (options.grow) mapSheetRef.current?.expand();
    },
    [
      findStory,
      flyToStory,
      framingFor,
      holdCamera,
      pinStory,
      reduceMotion,
      requestEpoch,
      storyProgress,
    ],
  );

  // A focus that arrived before its story did.
  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (pending && storyRows.some((r) => r.slug === pending.slug)) {
      focusStory(pending.slug, pending);
    }
  }, [storyRows, focusStory]);

  // Keep the selected slug across feed reordering. Only remap indices: a
  // refresh is not a camera action, and must preserve the reader's exploration.
  useEffect(() => {
    const slug = currentSlugRef.current;
    let index = slug ? storyRows.findIndex((r) => r.slug === slug) : -1;
    const sameStory = index >= 0;
    if (index < 0) index = Math.min(deckIndexRef.current, storyRows.length);
    if (index === deckIndexRef.current && (sameStory || !slug)) return;
    const previousIndex = deckIndexRef.current;
    deckIndexRef.current = index;
    currentSlugRef.current = storyRows[index]?.slug ?? null;
    remapStory(previousIndex, index, sameStory);
    setDeckIndex(index);
  }, [storyRows, remapStory]);

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
          toastRef.current?.show('That story is no longer available');
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
      hapticImpact();
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
      // A row is its gauge in a list: the same flight and the same ring, when
      // the instrument has a place and a week to show.
      const gauge =
        mapMarkets.find((item) => item.id === card.id) ??
        strip.find((item) => item.id === card.id) ??
        null;
      if (gauge) flyTo(gauge.coords);
      setSelectedGauge(gauge);
      handOffSheet(instrumentsSheetRef, () => openCard(card));
    },
    [flyTo, handOffSheet, openCard, strip, mapMarkets],
  );

  const openOverlay = useCallback((selection: OverlaySelection) => {
    setActiveOverlay(selection);
    overlaySheetRef.current?.present();
  }, []);

  // ---------------------------------------------------------------------
  // Globe taps
  // ---------------------------------------------------------------------
  const handleCountryPress = useCallback(
    (result: TapResult, cameraEpoch?: number) => {
      // No haptic here: every caller — the globe's tap layer, an inline
      // country link, the chooser's row — has already given its own, and a
      // second one on the same touch read as a double knock.
      // Any path here — globe tap, marker tap, or inline country link — proves
      // the reader found the map layer; the globe hint retires on all of them.
      markHintDone('globe');
      cameraClaimedRef.current = true;
      if (result.storySlug) {
        focusStory(result.storySlug, { afterBurst: true, cameraEpoch });
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
        if (card) {
          const gauge = mapMarketsRef.current.find((item) => item.id === card.id) ?? null;
          setSelectedGauge(gauge);
          openCard(card);
        }
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
      toastRef.current?.show('Saved');
    } else {
      toastRef.current?.show('Removed — tap to undo', () => {
        toggleBookmark(article, category);
        hapticNotification();
      });
    }
  }, []);

  const handleMenuPress = useCallback(() => {
    hapticImpact();
    setMenuOpen(true);
    menuSheetRef.current?.present();
  }, []);
  // `markets` sat in the bar beside the menu until 2026-09-21; it is the
  // menu's first row now, and opens the same browser the strip's `all →` does.
  const handleMenuMarketsPress = useCallback(() => {
    handOffSheet(menuSheetRef, () => {
      setInstrumentsOpen(true);
      instrumentsSheetRef.current?.present();
    });
  }, [handOffSheet]);

  const handleBriefingPress = useCallback(() => {
    markHintDone('masthead');
    briefingChromeRef.current?.toggle();
  }, []);
  const handleBriefingUnavailable = useCallback(() => {
    hapticError();
    toastRef.current?.show('No briefing today yet', undefined, 'top');
  }, []);
  const handleBriefingPlaybackError = useCallback(() => {
    hapticError();
    toastRef.current?.show(
      'Could not play the briefing — tap to try again',
      handleBriefingPress,
      'top',
    );
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
        onPress: () =>
          handOffSheet(countrySheetRef, () => openOverlay({ kind: 'genocide', situation })),
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
        onPress: () => handOffSheet(countrySheetRef, () => openOverlay({ kind: 'famine', area })),
      });
    }
    return rows;
  }, [countrySheet?.countryName, famineAreas, genocideSituations, handOffSheet, openOverlay]);

  const handleCountryAlertPress = useCallback(
    (alert: GdacsAlert) => {
      handOffSheet(countrySheetRef, () => {
        setActiveAlert(alert);
        disasterSheetRef.current?.present();
      });
    },
    [handOffSheet],
  );

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
      hapticImpact();
      setActiveEntity(entity);
      entitySheetRef.current?.present();
    },
    [indicatorsById],
  );

  const sheetOpen =
    menuOpen ||
    primerOpen ||
    instrumentsOpen ||
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
    // Not on the end card either: every lesson there points at a next story
    // or a story to open, and the end card has neither.
    suppressed: sheetOpen || briefingVisible || deckIndex >= storyRows.length,
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
    primerTimerRef.current = setTimeout(() => {
      primerTimerRef.current = null;
      if (sheetOpenRef.current) return;
      setPrimerOpen(true);
      primerSheetRef.current?.present();
    }, PRIMER_PRESENT_DELAY_MS);
  }, []);

  /**
   * A finger has started a swipe on the deck. Whether the camera follows it is
   * decided on the UI thread as the pan claims it (`claimForDeck`); this is
   * the JS half. It used to read the camera from here, and a JS read of a
   * value the UI thread is writing blocks until the UI thread answers.
   */
  const handleDeckDragStart = useCallback(() => {
    cameraClaimedRef.current = true;
    dismissActiveHint();
  }, [dismissActiveHint]);

  const handleDeckSettle = useCallback(
    (index: number) => {
      const leavingIndex = deckIndexRef.current;
      const leaving = storyRowsRef.current[leavingIndex]?.coords ?? null;
      deckIndexRef.current = index;
      setDeckIndex(index);
      hapticTick();
      // A screen reader moves the deck through the card's next/previous
      // actions, and the card that replaces the one it was reading has no
      // focus to announce itself.
      const title = storyRowsRef.current[index]?.title;
      if (title) announce(title);
      recordArticleSnap();
      maybeRequestReview();
      const row = storyRowsRef.current[index];
      currentSlugRef.current = row?.slug ?? null;
      if (row) {
        if (row.mark === 'earlier') handleCaughtUp();
        // Reading a story grown is opening it; swiping past one at rest is not.
        if (sheetDetentRef.current === 'full') findStory(row.slug);
      }
      if (row?.coords) {
        const framing = framingFor(index);
        const travel = leaving
          ? arcDegrees(leaving[0], leaving[1], row.coords[0], row.coords[1])
          : 0;
        const crossing = flyCurve(
          framingFor(leavingIndex) || framing || FRAMING_WIDEST,
          framing || FRAMING_WIDEST,
          travel,
        );
        if (flyMs(crossing) > DECK_SETTLE_MS) {
          // Longer than the card's own landing: the camera leaves the deck
          // here, at the lift, and flies the rest from wherever the finger got
          // it to, at the pace the distance asks for. The landing hands it
          // back.
          flyToStory(row.coords, index, framing);
        } else {
          // The earth was left somewhere else (a drag, a gauge): fly it to the
          // story the swipe landed on. Otherwise the spring is already
          // carrying it and this is a no-op.
          flyToStoryIfHeld(row.coords, index, framing);
        }
      }
    },
    [findStory, flyToStory, flyToStoryIfHeld, framingFor, handleCaughtUp],
  );

  const goToStory = useCallback(
    (index: number) => {
      const row = storyRowsRef.current[index];
      if (row) focusStory(row.slug);
    },
    [focusStory],
  );
  // The card's accessibility actions slide the deck one story, exactly as a
  // swipe would; `goToStory` is a jump, for the scrubber.
  const handleNextStory = useCallback(() => deckRef.current?.step(1), []);
  const handlePreviousStory = useCallback(() => deckRef.current?.step(-1), []);

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

  const handleMastheadAlertPress = useCallback(() => {
    const item = nowRef.current[0];
    if (item) handleNowPress(item);
  }, [handleNowPress]);

  const handleMenuToast = useCallback((message: string) => {
    toastRef.current?.show(message, undefined, 'top');
  }, []);

  const handleMenuDismiss = useCallback(() => {
    setMenuOpen(false);
    runSheetHandOff();
  }, [runSheetHandOff]);
  const handleCountryDismiss = useCallback(() => {
    setCountrySheet(null);
    runSheetHandOff();
  }, [runSheetHandOff]);
  const handleDisasterDismiss = useCallback(() => {
    setActiveAlert(null);
    runSheetHandOff();
  }, [runSheetHandOff]);
  const handleConflictDismiss = useCallback(() => {
    setActiveConflict(null);
    runSheetHandOff();
  }, [runSheetHandOff]);
  const handleChooserDismiss = useCallback(() => {
    setChooserCandidates([]);
    runSheetHandOff();
  }, [runSheetHandOff]);
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
  const handleOverlayDismiss = useCallback(() => {
    setActiveOverlay(null);
    runSheetHandOff();
  }, [runSheetHandOff]);
  const handleInstrumentsDismiss = useCallback(() => {
    setInstrumentsOpen(false);
    runSheetHandOff();
  }, [runSheetHandOff]);
  const handleSourcesDismiss = useCallback(() => {
    setSheetSources([]);
    setSheetDivergence(null);
  }, []);
  const handleDisasterCountryPress = useCallback(
    (countryName: string) => handOffSheet(disasterSheetRef, () => openCountry(countryName)),
    [handOffSheet, openCountry],
  );
  const handleConflictCountryPress = useCallback(
    (countryName: string) => handOffSheet(conflictSheetRef, () => openCountry(countryName)),
    [handOffSheet, openCountry],
  );
  const handleChooserSelect = useCallback(
    (candidate: TapResult) =>
      handOffSheet(disambiguationSheetRef, () => handleCountryPress(candidate)),
    [handOffSheet, handleCountryPress],
  );
  const handleOverlayArticlePress = useCallback(
    (slug: string, category: Category) => {
      overlaySheetRef.current?.dismiss();
      handleSelectArticle(slug, category);
    },
    [handleSelectArticle],
  );
  const handleOverlayCountryPress = useCallback(
    (countryName: string) => handOffSheet(overlaySheetRef, () => openCountry(countryName)),
    [handOffSheet, openCountry],
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
  // Whatever story is in front has been had, however it got there — a swipe,
  // a jump, a mark on the globe, or the deck opening on it.
  const frontSlug = storyRows[frontIndex]?.slug;
  useEffect(() => {
    if (!frontSlug) return;
    markLanded(frontSlug);
    // The anchor a feed arrival keeps the reader on. Only a swipe or a focus
    // set it, so until the first swipe it was null, and an arrival swapped the
    // story at index 0 in place — the card changed under the reader and the
    // globe snapped to the new story's place with no flight.
    currentSlugRef.current = frontSlug;
    launchFrontSlugRef.current ??= frontSlug;
  }, [frontSlug]);

  // Where a return lands the reader (`lib/resume-landing.ts`). Called inside
  // the arrival's flush, so what is set here renders with the stories:
  // staying needs nothing (the slug anchor above holds the story), a toast
  // appears with them, and the front is the deck's index 0 in that same
  // commit, with the camera held where the reader left it — then flown there
  // once the new front exists (`frontFlightRef`). Decided by an effect a
  // commit later, the old story sat under the new day's times for a second,
  // then the card jumped, then the globe followed.
  const frontFlightRef = useRef(false);
  const showNewToast = useCallback(
    (added: number) => {
      toastRef.current?.show(
        `${added} new · tap to see`,
        () => {
          const rows = storyRowsRef.current;
          const readSlugs = getReadSlugs();
          const fresh = rows.map((row) => row.fresh);
          const read = rows.map((row) => readSlugs.has(row.slug));
          let { first } = unreadNewBehind(fresh, read, deckIndexRef.current);
          // All of them ahead of the reader: the first one there instead.
          if (first < 0) first = rows.findIndex((row, i) => row.fresh && !read[i]);
          if (first >= 0) goToStory(first);
        },
        'top',
      );
    },
    [goToStory],
  );
  const handleReturn = useCallback(
    (ret: AppReturn) => {
      const added = ret.added.length;
      const landing = resumeLanding({
        awayMs: ret.awayMs,
        coldStart: ret.coldStart,
        added,
        readerMoved: currentSlugRef.current !== launchFrontSlugRef.current,
      });
      if (landing === 'toast') showNewToast(added);
      if (landing !== 'front') return;
      if (sheetDetentRef.current === 'full') collapseSheet();
      if (deckIndexRef.current === 0 && added === 0) return;
      // Held first, so the deck's jump cannot drag the camera across the
      // stories between; no slug, so the anchor keeps index 0.
      holdCamera();
      deckIndexRef.current = 0;
      currentSlugRef.current = null;
      storyProgress.value = 0;
      setDeckIndex(0);
      frontFlightRef.current = true;
    },
    [collapseSheet, holdCamera, showNewToast, storyProgress],
  );
  useEffect(() => {
    returnHandlerRef.current = handleReturn;
  }, [handleReturn]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `deckIndex` too — a long return that brought nothing re-measures the river but might not change it
  useEffect(() => {
    if (!frontFlightRef.current) return;
    frontFlightRef.current = false;
    const front = storyRows[0];
    if (front) focusStory(front.slug);
  }, [storyRows, deckIndex, focusStory]);
  const storyFresh = useMemo(() => storyRows.map((row) => row.fresh), [storyRows]);
  // Read, and the `‹ n new` pill it decides, live in `StoryDock`: it
  // subscribes to the read store itself, so a story turning read does not
  // re-render this screen.
  const storySlugs = useMemo(() => storyRows.map((row) => row.slug), [storyRows]);
  const storyOpen = sheetDetent === 'full';
  // The gauges an open story is tied to, marked in its hue on the bar.
  const openArticle = storyOpen ? storyRows[frontIndex]?.article : undefined;
  const linkedGauges = useMemo(
    () => linkedGaugeIds(stripSlots, openArticle),
    [stripSlots, openArticle],
  );
  const linkedHue = openArticle ? categoryMarkColor(openArticle.category, colors) : undefined;
  // Read at rest as well as open: the resting card is the title and the
  // hook, and most of the day is read that way. Only a platform sheet over
  // the map hides the card.
  useReadTracking(storyRows[frontIndex]?.slug ?? null, !sheetOpen);

  const keyOfDeck = useCallback(
    (index: number) => storyRows[index]?.slug ?? 'end-of-river',
    [storyRows],
  );
  const storyTimeAt = useCallback((index: number) => {
    const row = storyRowsRef.current[index];
    return row ? formatTimeAgo(articleTime(row.article)) : '';
  }, []);
  const storyCategoryAt = useCallback(
    (index: number) => storyRowsRef.current[index]?.article.category ?? '',
    [],
  );
  const storyHues = useMemo(
    () => storyRows.map((row) => categoryMarkColor(row.article.category, colors)),
    [storyRows, colors],
  );
  // Where each story sits on the dock's day: how long before the river's day
  // ends it ran. Measured when the river is, so it moves with `tick`.
  const storyAges = useMemo(() => {
    const end = riverAnchor(river, Date.now());
    return storyRows.map((row) => end - articleTime(row.article));
  }, [storyRows, river]);
  const storyCoverage = useMemo(() => storyRows.map((row) => row.coverage), [storyRows]);

  const renderStory = useCallback(
    (index: number) => {
      const row = storyRows[index];
      if (!row) return null;
      return (
        <StoryCard
          row={row}
          odds={odds.get(row.slug) ?? null}
          resolvableEntityIds={resolvableEntityIds}
          open={storyOpen}
          progress={sheetProgress}
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
      sheetProgress,
      storyOpen,
      storyRows,
    ],
  );

  // Re-measure when text or its metrics change, including in-app reading
  // preferences and corrections to an existing story. Exclude timestamps
  // and appearance so minute ticks and recolouring don't remount every card.
  const measureKey = useMemo(
    () =>
      JSON.stringify([
        screenWidth,
        fontScale,
        font,
        typography,
        ...storyRows.map((r) => [
          r.slug,
          r.title,
          r.article.sentences,
          r.article.location,
          r.article.entities,
          r.article.threadArticleCount,
          r.article.threadArc,
          r.article.threadDay,
          odds.has(r.slug),
        ]),
      ]),
    [screenWidth, fontScale, font, typography, storyRows, odds],
  );
  const renderMeasureCard = useCallback(
    (index: number) => {
      const row = storyRows[index];
      if (!row) return null;
      return (
        <StoryCard
          row={row}
          odds={odds.get(row.slug) ?? null}
          resolvableEntityIds={resolvableEntityIds}
          open={false}
          progress={sheetProgress}
          veil={false}
          onOpen={noop}
          onCountryPress={noop}
          onEntityPress={noop}
          onOddsPress={noop}
          onSources={noop}
          onBookmark={noop}
          onShare={noop}
        />
      );
    },
    [odds, resolvableEntityIds, sheetProgress, storyRows],
  );
  const handleStoryMeasured = useCallback(
    (heights: number[]) => {
      const height = openStoryHeight(heights);
      if (height !== undefined) setMeasuredStory({ key: measureKey, height });
    },
    [measureKey],
  );

  const renderEnd = useCallback(
    () =>
      storyCount === 0 ? (
        <EmptyState message="no stories yet" hint="New stories arrive through the day" />
      ) : (
        <EndCard />
      ),
    [storyCount],
  );

  const renderList = useCallback(
    ({
      scrollEnabled,
      onScrollOffset,
      sheetGesture,
    }: {
      scrollEnabled: boolean;
      onScrollOffset: SharedValue<number>;
      sheetGesture: Parameters<typeof StoryDeck>[0]['sheetGesture'];
    }) => (
      <StoryDeck
        ref={deckRef}
        count={storyCount}
        peekFade={sheetProgress}
        index={frontIndex}
        progress={storyProgress}
        width={screenWidth}
        sheetGesture={sheetGesture}
        scrollEnabled={scrollEnabled}
        onScrollOffset={onScrollOffset}
        bottomInset={layout.dock}
        keyOf={keyOfDeck}
        renderStory={renderStory}
        renderEnd={renderEnd}
        onDragStart={handleDeckDragStart}
        onClaim={claimForDeck}
        onRollback={releaseForDeck}
        onSettle={handleDeckSettle}
      />
    ),
    [
      claimForDeck,
      releaseForDeck,
      layout.dock,
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

  const dock = useMemo(
    () => (
      <StoryDock
        onClaim={cancelFlight}
        refreshing={refreshing}
        index={frontIndex}
        count={storyCount}
        position={storyProgress}
        progress={progress}
        alert={now[0]?.title ?? null}
        onAlertPress={handleMastheadAlertPress}
        onSeek={goToStory}
        timeAt={storyTimeAt}
        categoryAt={storyCategoryAt}
        ages={storyAges}
        coverage={storyCoverage}
        hues={storyHues}
        fresh={storyFresh}
        slugs={storySlugs}
      />
    ),
    [
      cancelFlight,
      goToStory,
      storyTimeAt,
      storyCategoryAt,
      storyAges,
      storyCoverage,
      storyHues,
      storyFresh,
      storySlugs,
      refreshing,
      frontIndex,
      storyCount,
      storyProgress,
      progress,
      now,
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
      {/* The one earth. Everything below is a layer over it — the open story
          too: the sheet rises over the globe, which slides up with it
          (`globeLiftStyle`) and is never redrawn for it. It used to
          step back as the sheet rose, scaled into the band above it by a
          transform inside the canvas, and that replayed every picture on the
          globe on the UI thread for each frame the sheet moved, with the
          projection carried past the screen for the ground the shrink
          uncovered. Opening a story was slow (2026-09-21); the sheet is
          opaque, so now the globe draws nothing while it moves. */}
      <Animated.View style={[styles.globeLayer, globeLiftStyle]} pointerEvents="none">
        <MiniGlobe
          ref={globeRef}
          articles={river}
          heatmapPoints={heatmapPoints}
          chokepoints={chokepoints}
          selectedAt={selectedGauge?.coords ?? null}
          gdacsAlerts={gdacsAlerts}
          conflictEvents={conflictEvents}
          marketMarks={marketMarks}
          marketViewport={marketViewport}
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
          zoomActive={zoomActive}
          zoomAngle={zoomAngle}
          clipOut={globeClip}
          storyClipOut={storyClip}
          viewLat={viewLat}
          viewLng={viewLng}
          tick={tick}
        />
      </Animated.View>

      <GlobeGestureLayer
        globeRef={globeRef}
        canvasTop={0}
        topChromeHeight={topChromeHeight}
        sheetPeekHeight={layout.peek}
        sheetFullHeight={layout.full}
        sheetProgress={sheetProgress}
        cameraOwner={cameraOwner}
        cameraLat={cameraLat}
        cameraLng={cameraLng}
        viewLat={viewLat}
        viewLng={viewLng}
        zoomActive={zoomActive}
        zoomAngle={zoomAngle}
        cancelFlight={cancelFlight}
        requestEpoch={requestEpoch}
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
          items={stripSlots}
          onSelect={handleStripPress}
          onAll={handleInstrumentsPress}
          selectedId={selectedGauge?.id ?? null}
          linkedIds={linkedGauges}
          linkedColor={linkedHue}
          // While the player bar is up it is the control. A second play button
          // over audio that was already playing said the opposite of what was
          // happening; it returns when the bar hides.
          listenAvailable={briefingStatus.available && !briefingVisible}
          listenResumable={briefingStatus.resumable}
          listenDuration={briefingStatus.duration}
          listenHeard={briefingStatus.heard}
          onListenPress={handleBriefingPress}
        />
      </View>

      <MapSheet
        ref={mapSheetRef}
        peek={layout.peek}
        full={layout.full}
        progress={sheetProgress}
        renderList={renderList}
        onDetentChange={handleDetentChange}
        onPullDown={handleRefresh}
      />

      {/* Pinned to the screen, not the sheet: the same place at rest and open. */}
      {dock}

      {storyCount > 0 && measuredStory?.key !== measureKey ? (
        <StoryMeasure
          key={measureKey}
          count={storyCount}
          width={screenWidth}
          renderCard={renderMeasureCard}
          onMeasured={handleStoryMeasured}
        />
      ) : null}

      {/* A top toast starts under the gauges, and under the player when it is
          up; "12 new · ~9 min read" landed on the strip's readings. A bottom
          one ends above the dock. */}
      <Toast ref={toastRef} topOffset={topToastOffset} bottomOffset={layout.dock} />

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
        topOffset={topChromeHeight}
        onHeightChange={setPlayerHeight}
      />

      <MenuSheet
        sheetRef={menuSheetRef}
        bottomInset={insets.bottom}
        onDismiss={handleMenuDismiss}
        grouped={grouped}
        onSelectArticle={handleSelectArticle}
        onMarketsPress={handleMenuMarketsPress}
        onToast={handleMenuToast}
      />

      <CardSheet
        sheetRef={cardSheetRef}
        bottomInset={insets.bottom}
        card={activeCard}
        peekHeight={layout.peek}
        onDismiss={handleCardDismiss}
        onStoryPress={handleCardStoryPress}
      />

      <MarketBrowserSheet
        sheetRef={instrumentsSheetRef}
        bottomInset={insets.bottom}
        exchanges={exchanges}
        instruments={rankedInstruments.filter((card) => !card.id.startsWith('mkt:'))}
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
