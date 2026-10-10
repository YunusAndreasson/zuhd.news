import type { CountryData } from '@shared/countries/country-data';
import type {
  Article,
  ArticleSource,
  Category,
  ConflictEvent,
  Entity,
  GdacsAlert,
} from '@shared/types';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
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
import { COLLECT_MS, MiniGlobe, type MiniGlobeRef } from '../components/globe/MiniGlobe';
import { FRAMING_WIDEST } from '../components/globe/projection';
import { HintOverlay } from '../components/HintOverlay';
import { MenuSheet } from '../components/MenuSheet';
import { ALERT_ROW, AlertPill } from '../components/map/AlertPill';
import { GlobeGestureLayer } from '../components/map/GlobeGestureLayer';
import { MapHeader } from '../components/map/MapHeader';
import { MapSheet, type MapSheetDetent, type MapSheetRef } from '../components/map/MapSheet';
import { EndCard, StoryCard, StoryFooter } from '../components/map/StoryCard';
import { StoryDeck, type StoryDeckRef } from '../components/map/StoryDeck';
import { StoryDock } from '../components/map/StoryDock';
import { StoryMeasure } from '../components/map/StoryMeasure';
import { NotificationPrimerSheet } from '../components/NotificationPrimerSheet';
import { OverlaySheet } from '../components/OverlaySheet';
import { Screen } from '../components/primitives';
import type { BottomSheetMethodsRef } from '../components/SheetLayout';
import { SourcesSheet } from '../components/SourcesSheet';
import { Toast, type ToastRef } from '../components/Toast';
import { CATEGORIES, categoryMarkColor, EDITORIAL, VARIANT_CAP } from '../constants/theme';
import { useAiModels } from '../hooks/useAiModels';
import { useAnalysis } from '../hooks/useAnalysis';
import type { AppReturn } from '../hooks/useArticles';
import { useArticles } from '../hooks/useArticles';
import { useCameraFlight } from '../hooks/useCameraFlight';
import { useChokepoints } from '../hooks/useChokepoints';
import { useCompanies } from '../hooks/useCompanies';
import { useConflictEvents } from '../hooks/useConflictEvents';
import { useGdacsAlerts } from '../hooks/useGdacsAlerts';
import { useHeatmap } from '../hooks/useHeatmap';
import { useLinkedStory } from '../hooks/useLinkedStory';
import { useMarketSignals } from '../hooks/useMarketSignals';
import { useMarkets } from '../hooks/useMarkets';
import { useOffline } from '../hooks/useOffline';
import { useOnboardingHints } from '../hooks/useOnboardingHints';
import {
  useFamineAreas,
  useFamineTotals,
  useGenocideSituations,
  useThermalEvents,
} from '../hooks/useOverlays';
import { usePendingNotification } from '../hooks/usePendingNotification';
import { useReadTracking } from '../hooks/useReadTracking';
import { useStoryOpener } from '../hooks/useStoryOpener';
import { useHardwareBack } from '../hooks/useSwipeBack';
import { usePreferences, useTheme } from '../hooks/useTheme';
import { useTrendsSnapshot } from '../hooks/useTrendsSnapshot';
import { announce } from '../lib/announce';
import { articleTime, formatTimeAgo } from '../lib/article-utils';
import {
  getSnapshot as getBookmarks,
  restore as restoreBookmark,
  toggle as toggleBookmark,
} from '../lib/bookmark-store';
import { markMove } from '../lib/cards/format';
import { buildInstrumentCards, straitCardFor } from '../lib/cards/markets';
import type { SwipeCard } from '../lib/cards/rank';
import { buildRankedInstruments } from '../lib/cards/sections';
import type { CardDelta } from '../lib/cards/types';
import { exchangeMove } from '../lib/cards/week-move';
import { companyGauges } from '../lib/companies';
import { conflictWeekOf } from '../lib/conflict-week';
import { alertsInCountry, countryFacts, marksInCountry } from '../lib/country-hazards';
import { computeDeckLayout, openHeightNeedsMeasuring, openStoryHeight } from '../lib/deck-layout';
import { getSnapshot as getFound, markFound, pruneFound, useFoundSlugs } from '../lib/found-store';
import { markLanded, spendNew, useFreshSlugs } from '../lib/fresh-store';
import { globeGdacsAlerts } from '../lib/gdacs';
import { arcDegrees, crossingFlies } from '../lib/globe-camera';
import { type GlobeTapFrame, IDENTITY_GLOBE_TRANSFORM } from '../lib/globe-display';
import { hapticError, hapticImpact, hapticNotification, hapticSwipe } from '../lib/haptics';
import {
  buildInstrumentCatalog,
  type CatalogGroup,
  type CatalogRow,
} from '../lib/instrument-catalog';
import { buildStoryRows, cameraTrackOf, type StoryRow } from '../lib/map-feed';
import { coverageStory, mapCandidates } from '../lib/map-selection';
import { exchangeCard, exchangeIsStale, exchangesOf } from '../lib/markets';
import type { MenuHazards } from '../lib/menu-hazards';
import { orderNewsRiver, type RiverArticle, recentRiver, riverAnchor } from '../lib/news-order';
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
import { openExternal } from '../lib/open-link';
import type { OverlaySelection } from '../lib/overlays';
import { oddsByStory, oddsLabels, type StoryOdds } from '../lib/predictions';
import { getSnapshot as getReadSlugs, pruneRead } from '../lib/read-store';
import { resumeLanding, unreadNewBehind } from '../lib/resume-landing';
import { maybeRequestReview } from '../lib/store-review';
import { storyCharts } from '../lib/story-chart';
import { buildStoryPlaces, completesFound, foundProgress } from '../lib/story-places';
import { countryTap, type TapResult } from '../lib/tap-result';

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

/** The shortest a pull's `checking for new stories` stays up: long enough to
 *  read four words. */
const REFRESH_MIN_MS = 1000;

/** How long the menu keeps the reader's place after it closes. Long enough to
 *  look at the map and come back; after it, the menu opens at its root. */
const MENU_RESUME_MS = 5 * 60_000;

interface FocusOptions {
  /** The scrubber already committed the deck on the UI thread. */
  deckMoved?: boolean;
  cameraEpoch?: number;
  /** A mark was tapped: the camera waits for its burst before it flies. */
  afterBurst?: boolean;
  /** Grow the card into the whole story. */
  grow?: boolean;
  /** A coverage glow was tapped: found as a tapped light is, with no burst
   *  to wait for. */
  find?: boolean;
}

/**
 * Whether the swipe from story `from` to story `to` flies rather than riding
 * the card (`crossingFlies`) — asked once per river for every claim
 * (`ridesFinger`) and again at each release (`handleDeckRelease`). A story with
 * no place has no crossing to fly; a framing the globe cannot say yet is the
 * widest.
 */
function swipeFlies(
  rows: readonly StoryRow[],
  from: number,
  to: number,
  framingFor: (index: number) => number,
): boolean {
  const a = rows[from]?.coords;
  const b = rows[to]?.coords;
  if (!a || !b) return false;
  const toClip = framingFor(to) || FRAMING_WIDEST;
  return crossingFlies(framingFor(from) || toClip, toClip, arcDegrees(a[0], a[1], b[0], b[1]));
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
  const { events: conflictEvents, snapshot: conflictSnapshot } = useConflictEvents();
  /** The source's whole week. The globe draws `conflictEvents`, its last day;
   *  the menu's list and a country's page read the week. */
  const conflictWeek = useMemo(() => conflictWeekOf(conflictSnapshot), [conflictSnapshot]);
  const famineAreas = useFamineAreas();
  const famineTotals = useFamineTotals();
  const thermalEvents = useThermalEvents();
  const genocideSituations = useGenocideSituations();
  const { byId: indicatorsById, snapshot: trends } = useTrendsSnapshot();
  const { byId: analysis } = useAnalysis();
  const { cards: marketSignals, signals: rawSignals } = useMarketSignals();
  const marketsSnapshot = useMarkets();
  // Each with its currency's rates beside it, from the snapshot's one table.
  const exchanges = useMemo(() => exchangesOf(marketsSnapshot), [marketsSnapshot]);
  const companiesSnapshot = useCompanies();
  const companies = useMemo(() => companiesSnapshot?.companies ?? [], [companiesSnapshot]);
  const aiModels = useAiModels();
  const offline = useOffline();

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
  /** A swipe let go whose card has not landed: where it is heading, and the
   *  story to record as found when it lands (it was let go with a story
   *  open). `deckIndexRef` is already there; `deckIndex` follows at the
   *  landing (`handleDeckLanded`). */
  const releasedRef = useRef<{ index: number; find: string | null } | null>(null);
  /** `useReadTracking`'s restart, for a handler declared before the hook. */
  const restartDwellRef = useRef<() => void>(() => {});
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

  // ---------------------------------------------------------------------
  // The camera
  //
  // One position in the river, in stories. The deck writes it under a finger
  // on the UI thread; a jump writes it directly. `cameraOwner` says whether it
  // or a target (a drag on the globe, a flight) is moving the earth.
  // ---------------------------------------------------------------------
  const storyProgress = useSharedValue(0);
  const storyCommitted = useSharedValue(0);
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
  const globeTapFrame = useSharedValue<GlobeTapFrame>({ ...IDENTITY_GLOBE_TRANSFORM, revision: 0 });
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
    landingAt,
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
   * card from the menu — only once the first has gone.
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
  const [measuredStory, setMeasuredStory] = useState<{ height: number } | null>(null);

  // The sheet at rest and open is sized from the card's type, not a fraction
  // of the window or the story in front, and the globe takes what is left —
  // see `lib/deck-layout.ts`.
  const deckInput = useMemo(
    () => ({
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
  const layout = useMemo(
    () => computeDeckLayout({ ...deckInput, storyContent: measuredStory?.height }),
    [deckInput, measuredStory?.height],
  );
  // The briefing's player hangs under the top bar while it is up (it sat on
  // the dock until 2026-09-22), so the cards end above the dock alone, and a
  // top toast starts under the player.
  const [playerHeight, setPlayerHeight] = useState(0);
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

  // ---------------------------------------------------------------------
  // Derived content
  // ---------------------------------------------------------------------
  // The last day of news, plus any older story a reader asked for by name
  // (`pinStory`) — see `recentRiver`.
  const [pinnedSlugs, setPinnedSlugs] = useState<ReadonlySet<string>>(() => new Set());
  const pinStory = useCallback((slug: string) => {
    setPinnedSlugs((prev) => (prev.has(slug) ? prev : new Set(prev).add(slug)));
  }, []);
  // **Time order, newest run first — no top-stories lead** (2026-09-24, the
  // user's request). For a day the most reported stories were moved to the
  // front of the whole river, but the track places every story at its own
  // time, so swiping through them sent the playhead leaping across the day
  // and back. Every swipe is one step on the track; inside a run the most
  // reported come first (`compareHeat`), which moves no cell out of its run.
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
    () => [
      ...buildRankedInstruments(columns, marketSignals, river),
      ...exchanges.map(exchangeCard),
      // The largest companies, as gauges like any other (2026-10-03, the
      // user's request).
      ...companyGauges(companies),
    ],
    [columns, marketSignals, river, exchanges, companies],
  );

  /** Every instrument, in the menu's groups: every published series, the
   *  ranked pool's own cards where it has them (`lib/instrument-catalog.ts`).
   *  Built only while the menu is open — it is opened a few times a week, and
   *  forty-odd extra cards do not belong in every arrival's commit. Closed,
   *  it keeps what it last showed, so the rows do not vanish from a menu
   *  still sliding away. */
  const lastCatalogRef = useRef<CatalogGroup[]>([]);
  const catalog = useMemo(() => {
    if (!menuOpen) return lastCatalogRef.current;
    lastCatalogRef.current = buildInstrumentCatalog({
      ranked: rankedInstruments,
      trends,
      chokepoints,
      analysis,
      articles: river,
      exchanges,
      companies,
      aiModels,
    });
    return lastCatalogRef.current;
  }, [
    menuOpen,
    rankedInstruments,
    trends,
    chokepoints,
    analysis,
    river,
    exchanges,
    companies,
    aiModels,
  ]);

  /** The series each story's prose cites, as the card a press opens — built
   *  only for the few ids the river names, not the whole catalog. */
  const charts = useMemo(
    () =>
      storyCharts(river, {
        ranked: rankedInstruments,
        trends,
        chokepoints,
        analysis,
        articles: river,
        exchanges,
      }),
    [rankedInstruments, trends, chokepoints, analysis, river, exchanges],
  );

  /** The alerts the globe draws, chosen once for the globe and for the
   *  menu's list of them, so the list holds exactly the marks. */
  const globeAlerts = useMemo(() => globeGdacsAlerts(gdacsAlerts), [gdacsAlerts]);

  /** The hazard marks as the globe draws them, for the menu's lists — one
   *  object, kept stable, or the memoised menu re-renders on every commit. */
  const menuHazards = useMemo<MenuHazards>(
    () => ({
      disasters: globeAlerts,
      conflict: conflictEvents,
      famine: famineAreas,
      genocide: genocideSituations,
      fires: thermalEvents,
      famineTotals,
      conflictWeek,
    }),
    [
      globeAlerts,
      conflictEvents,
      famineAreas,
      genocideSituations,
      thermalEvents,
      famineTotals,
      conflictWeek,
    ],
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
  // Each strait's seven-day move, for its label on the globe (`straitMoves`):
  // from the whole strip, not the ten slots, so a strait past the tenth still
  // reads the number its row in the menu's lists does.
  const straitMoves = useMemo(() => {
    const moves: Record<string, CardDelta> = {};
    for (const item of strip) {
      if (item.id.startsWith('strait-')) moves[item.id.slice('strait-'.length)] = item.delta;
    }
    return moves;
  }, [strip]);
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
          // The strip's number, the past seven days: the mark the strip's slot
          // flies to reads what the slot read (`exchangeMove`).
          delta: exchangeMove(exchange, card),
          stale: exchangeIsStale(exchange),
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
        // As a strait's does (`markMove`), an asterisk on an older quote.
        move: `${markMove(item.delta)}${item.stale ? '*' : ''}`,
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
    () => buildStoryRows({ river, fresh, odds: oddsLabelBySlug }),
    [river, fresh, oddsLabelBySlug],
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
  // A live Red alert is one line under the gauges (`AlertPill`), below the
  // player when it is up; a top toast and the globe's market marks start
  // under it, so neither lands on it.
  const alertTitle = now[0]?.title ?? null;
  const alertTop = topChromeHeight + (briefingVisible ? playerHeight : 0);
  const topToastOffset = alertTop + (alertTitle ? ALERT_ROW : 0);
  const marketTop = alertTop + (alertTitle ? ALERT_ROW : 0);
  const marketViewport = useMemo(
    () => ({ top: marketTop, bottom: marketBottom }),
    [marketTop, marketBottom],
  );

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

  // Which crossings ride the finger: the same comparison `handleDeckRelease`
  // makes at the lift, made once per river so the pan can read it on the UI
  // thread the moment it claims a swipe.
  useEffect(() => {
    ridesFinger.value = storyRows.map((_, i) => !swipeFlies(storyRows, i, i + 1, framingFor));
  }, [framingFor, ridesFinger, storyRows]);

  // The story in front, for a swipe to decide whether the camera is still on
  // it. Read from the ref, which a swipe sets as it is let go: `deckIndex`
  // follows a landing later, and a feed arriving in between would write the
  // story being left back as the front.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `deckIndex` is when to run; the ref is what to read
  useEffect(() => {
    setCameraFront(storyRows[deckIndexRef.current]?.coords ?? null);
  }, [deckIndex, setCameraFront, storyRows]);

  /** A pinch has ended: redraw at full detail once any hand-back has eased. */
  const handleZoomSettle = useCallback((delayMs: number, epoch: number) => {
    if (zoomSettleTimerRef.current) clearTimeout(zoomSettleTimerRef.current);
    zoomSettleTimerRef.current = setTimeout(() => {
      zoomSettleTimerRef.current = null;
      globeRef.current?.settle(epoch);
    }, delayMs);
  }, []);

  // ---------------------------------------------------------------------
  // The deck
  // ---------------------------------------------------------------------
  /**
   * Record a find, and mark the day complete once — with the one success
   * haptic the game has — when it was the last light on the globe. Says
   * whether it gave that haptic, so a swipe landing there gives no other.
   * `haptic` is off for a swipe's landing: its lift already gave it
   * (`handleDeckRelease`, by `completesFound`).
   */
  const findStory = useCallback((slug: string, haptic = true): boolean => {
    // Asked before the store is written, and of the same function the lift
    // asks (`handleDeckRelease`): a story with no place completes nothing.
    const completes = completesFound(storyRowsRef.current, getFound(), slug);
    if (!markFound(slug) || !completes) return false;
    const { total } = foundProgress(storyRowsRef.current, getFound());
    if (haptic) hapticNotification();
    toastRef.current?.show(
      `All ${total} found · new stories arrive through the day`,
      undefined,
      'top',
    );
    return true;
  }, []);

  /**
   * Forget a swipe whose landing will not be reported, because the deck is
   * being moved again first (a jump, a scrub, a feed that shifted the
   * indices). Its find is recorded here: the lift already gave that find's
   * haptic, and dropped with the release the story stayed lit and the day's
   * last find was never said.
   */
  const dropRelease = useCallback(() => {
    const released = releasedRef.current;
    releasedRef.current = null;
    if (released?.find) findStory(released.find, false);
  }, [findStory]);

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
      dropRelease();
      if (options.afterBurst || options.grow || options.find) findStory(slug);
      cameraClaimedRef.current = true;

      const coords = row?.coords ?? null;
      // Held before the deck jumps, so the jump cannot drag the camera
      // through every dateline between; the flight hands it back on landing.
      if (coords) holdCamera(options.cameraEpoch);
      deckIndexRef.current = index;
      currentSlugRef.current = slug;
      // `storyCommitted` too, not left to the deck's own sync: that runs when
      // `deckIndex` changes, and with a swipe still landing React can already
      // hold this very story — the one just left — so nothing would change.
      if (!options.deckMoved) {
        storyProgress.value = index;
        storyCommitted.value = index;
      }
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
      dropRelease,
      findStory,
      flyToStory,
      framingFor,
      holdCamera,
      pinStory,
      reduceMotion,
      requestEpoch,
      storyCommitted,
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
    dropRelease();
    // The camera's front too. The effect that sets it ran before this one, on
    // the ref this has just corrected, and runs again only when `deckIndex`
    // changes, which it does not when React already held this index.
    setCameraFront(storyRows[index]?.coords ?? null);
    remapStory(previousIndex, index, sameStory);
    storyCommitted.value = index;
    setDeckIndex(index);
  }, [storyRows, dropRelease, remapStory, setCameraFront, storyCommitted]);

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
      markHintDone('globe');
      flyTo(item.coords);
      setSelectedGauge(item);
      openCard(item.card);
    },
    [flyTo, openCard],
  );

  const handleNowPress = useCallback(
    (item: NowItem) => {
      flyTo(item.coords);
      const alert = gdacsAlertsRef.current.find((a) => a.eventid === item.gdacsEventId);
      if (alert) {
        setActiveAlert(alert);
        disasterSheetRef.current?.present();
      }
    },
    [flyTo],
  );

  /** The contract's own card where the deck admitted it; otherwise the market
   *  itself — a price is only worth printing if the reader can check it. */
  const handleOddsPress = useCallback(
    (value: StoryOdds) => {
      const card = rankedRef.current.find((c) => c.id === value.id);
      if (card) openCard(card);
      else if (value.marketUrl) openExternal(value.marketUrl);
    },
    [openCard],
  );

  /** The gauge a menu row stands for: its slot or its mark, where the globe
   *  can find it. A market signal stands in for its exchange's row under the
   *  signal's id; with no slot, the exchange's mark is still where it is. */
  const gaugeForRow = useCallback(
    (row: CatalogRow): StripItem | null =>
      mapMarkets.find((item) => item.id === row.id) ??
      strip.find((item) => item.id === row.id) ??
      (row.exchange
        ? mapMarkets.find((item) => item.id === `mkt:${row.exchange?.id}`)
        : undefined) ??
      null,
    [strip, mapMarkets],
  );

  /** A strait with nothing to chart has no page: it closes the menu, finds
   *  the strait on the globe, and says its name, as a tap on its mark does.
   *  It is the one row that moves the globe. A row that opens as a page of
   *  the menu leaves the globe alone: the menu covers it, and a reader who
   *  closed the menu came back to an earth turned somewhere they had not
   *  asked for (the user, 2026-10-10). */
  const handleMenuRowSelect = useCallback(
    (row: CatalogRow) => {
      const gauge = gaugeForRow(row);
      if (gauge) flyTo(gauge.coords);
      else if (row.chokepoint) flyTo([row.chokepoint.lat, row.chokepoint.lng]);
      handOffSheet(menuSheetRef, () => toastRef.current?.show(row.chokepoint?.name ?? row.short));
    },
    [flyTo, gaugeForRow, handOffSheet],
  );

  const openOverlay = useCallback((selection: OverlaySelection) => {
    setActiveOverlay(selection);
    overlaySheetRef.current?.present();
  }, []);

  /**
   * Open a hazard mark's sheet — a genocide determination, a famine area, a
   * thermal anomaly, a disaster, a conflict event — from the tap the globe
   * produced on it, or from a row in the menu's `world hazards` that carries
   * the same tap. True when the tap was one of these.
   */
  const openMark = useCallback(
    (result: TapResult): boolean => {
      if (result.genocideId) {
        const situation = genocideRef.current.find((g) => g.id === result.genocideId);
        if (situation) openOverlay({ kind: 'genocide', situation });
        return true;
      }
      if (result.famineAreaId) {
        const area = famineAreasRef.current.find((a) => a.id === result.famineAreaId);
        if (area) openOverlay({ kind: 'famine', area });
        return true;
      }
      if (result.thermalEventId) {
        const event = thermalEventsRef.current.find((e) => e.id === result.thermalEventId);
        if (event) openOverlay({ kind: 'thermal', event });
        return true;
      }
      if (result.gdacsEventId) {
        const alert = gdacsAlertsRef.current.find((a) => a.eventid === result.gdacsEventId);
        if (alert) {
          setActiveAlert(alert);
          disasterSheetRef.current?.present();
        }
        return true;
      }
      if (result.conflictEventId) {
        const evt = conflictEventsRef.current.find((e) => e.id === result.conflictEventId);
        if (evt) {
          setActiveConflict(evt);
          conflictSheetRef.current?.present();
        }
        return true;
      }
      return false;
    },
    [openOverlay],
  );

  // ---------------------------------------------------------------------
  // Globe taps
  // ---------------------------------------------------------------------
  const handleCountryPress = useCallback(
    (result: TapResult, cameraEpoch?: number) => {
      // No haptic here: a press never gives one, and a globe tap has already
      // had its hit (`onImpact` on the tap layer).
      // Any path here — globe tap, marker tap, or inline country link — proves
      // the reader found the map layer; the globe hint retires on all of them.
      markHintDone('globe');
      cameraClaimedRef.current = true;
      const candidates = mapCandidates(result.candidates ?? [result], {
        stories: storyRowsRef.current,
        markets: rankedRef.current,
        chokepoints: chokepointsRef.current,
        alerts: gdacsAlertsRef.current,
        conflicts: conflictEventsRef.current,
        famine: famineAreasRef.current,
        thermal: thermalEventsRef.current,
        genocide: genocideRef.current,
      });
      if (candidates.length === 0) {
        toastRef.current?.show('This map item is no longer available');
        return;
      }
      if (candidates.length > 1) {
        setChooserCandidates(candidates);
        disambiguationSheetRef.current?.present();
        return;
      }
      result = candidates[0] as TapResult;
      if (result.storySlug) {
        focusStory(result.storySlug, { afterBurst: true, cameraEpoch });
        return;
      }
      if (openMark(result)) return;
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
      // A coverage glow opens its newest unfound story just like a beacon.
      // Heatmap history can outlive the river: in that case the country is
      // still useful, but a toast must never promise a story it cannot open.
      if (result.isHotspot) {
        const slug = coverageStory(result, storyRowsRef.current, getFound());
        if (slug) {
          // Found, or the next tap on the glow would pick this story again
          // and never reach the one under it.
          focusStory(slug, { cameraEpoch, find: true });
          return;
        }
        if (!result.countryName) {
          toastRef.current?.show('No current story for this coverage');
          return;
        }
        result = countryTap(result.countryName);
      }
      setCountrySheet(result);
      countrySheetRef.current?.present();
    },
    [focusStory, openCard, openMark],
  );

  // ---------------------------------------------------------------------
  // The rest of the handlers, carried over
  // ---------------------------------------------------------------------
  const handleArticleBookmark = useCallback((article: RiverArticle) => {
    const category = article.category;
    const removed = getBookmarks().find((b) => b.article.slug === article.slug);
    const added = toggleBookmark(article, category);
    markHintDone('bookmark');
    hapticNotification();
    if (added) {
      toastRef.current?.show('Saved');
    } else {
      toastRef.current?.show('Removed — tap to undo', () => {
        if (removed) restoreBookmark(removed);
        hapticNotification();
      });
    }
  }, []);

  /**
   * Open the menu. It opens where the reader left it when they come back
   * within `MENU_RESUME_MS` (2026-09-26: closing it from a card to glance at
   * the map used to cost the way back), and at its root after longer.
   */
  const menuClosedAtRef = useRef(0);
  const [menuRootKey, setMenuRootKey] = useState(0);
  const handleMenuPress = useCallback(() => {
    if (Date.now() - menuClosedAtRef.current > MENU_RESUME_MS) {
      setMenuRootKey((k) => k + 1);
    }
    setMenuOpen(true);
    menuSheetRef.current?.present();
  }, []);

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

  const countryAlerts = useMemo<GdacsAlert[]>(
    () => (countrySheet?.countryName ? alertsInCountry(countrySheet.countryName, gdacsAlerts) : []),
    [countrySheet?.countryName, gdacsAlerts],
  );

  /** The hazard marks in the open country, as rows — see `CountrySheet.hazards`. */
  const countryHazards = useMemo<CountryHazard[]>(() => {
    const name = countrySheet?.countryName;
    if (!name) return [];
    return marksInCountry(name, genocideSituations, famineAreas).map(({ selection, ...mark }) => ({
      ...mark,
      onPress: () => handOffSheet(countrySheetRef, () => openOverlay(selection)),
    }));
  }, [countrySheet?.countryName, famineAreas, genocideSituations, handOffSheet, openOverlay]);

  /** What the hazard sources count in the open country — see `CountrySheet.facts`. */
  const countryFactRows = useMemo(
    () =>
      countrySheet?.countryName
        ? countryFacts(countrySheet.countryName, famineTotals, conflictWeek)
        : [],
    [countrySheet?.countryName, famineTotals, conflictWeek],
  );

  const handleCountryAlertPress = useCallback(
    (alert: GdacsAlert) => {
      handOffSheet(countrySheetRef, () => {
        setActiveAlert(alert);
        disasterSheetRef.current?.present();
      });
    },
    [handOffSheet],
  );

  const openCountry = useCallback((countryName: string, data?: CountryData | null) => {
    setCountrySheet(countryTap(countryName, data));
    countrySheetRef.current?.present();
  }, []);

  const handleEntityPress = useCallback(
    (entity: Entity) => {
      if (!indicatorsById.get(entity.indicatorId)) return;
      setActiveEntity(entity);
      entitySheetRef.current?.present();
    },
    [indicatorsById],
  );

  const sheetOpen =
    menuOpen ||
    primerOpen ||
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
  });

  const notificationsOnRef = useRef(preferences.notifications);
  notificationsOnRef.current = preferences.notifications;
  const primerTriedRef = useRef(false);
  const caughtUpFiredRef = useRef(false);

  /** The reader has swiped onto the first story they had already seen. Said
   *  once a session, with the haptic the old reader gave the same boundary;
   *  returns whether it did. */
  const handleCaughtUp = useCallback((): boolean => {
    if (caughtUpFiredRef.current) return false;
    caughtUpFiredRef.current = true;
    hapticNotification();
    if (primerTriedRef.current) return true;
    if (getOnboarding().primer.status !== 'pending' || notificationsOnRef.current) return true;
    primerTriedRef.current = true;
    primerTimerRef.current = setTimeout(() => {
      primerTimerRef.current = null;
      if (sheetOpenRef.current) return;
      setPrimerOpen(true);
      primerSheetRef.current?.present();
    }, PRIMER_PRESENT_DELAY_MS);
    return true;
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

  /**
   * A swipe has been let go toward another story: the half of a landing that
   * belongs to the hand. Nothing here sets React state. A commit now would
   * fall in the first frames of the card's spring, and Reanimated holds its
   * frames back until a commit has mounted (`StoryDeck`); the screen is told
   * by `handleDeckLanded`.
   */
  const handleDeckRelease = useCallback(
    (index: number) => {
      const leavingIndex = deckIndexRef.current;
      deckIndexRef.current = index;
      const row = storyRowsRef.current[index];
      currentSlugRef.current = row?.slug ?? null;
      // Reading a story grown is opening it; swiping past one at rest is not.
      const find = row && sheetDetentRef.current === 'full' ? row.slug : null;
      releasedRef.current = { index, find };
      // The next swipe's claim reads the front before `deckIndex` has moved.
      setCameraFront(row?.coords ?? null);
      // The story being left is still the one in front until the landing, and
      // its dwell must not run out on the way.
      restartDwellRef.current();
      // A screen reader moves the deck through the card's next/previous
      // actions, and the card that replaces the one it was reading has no
      // focus to announce itself.
      if (row?.title) announce(row.title);
      // One landing, one haptic: caught up or every story found says more
      // than the swipe does, so either takes its place.
      let said = false;
      if (row?.mark === 'earlier') said = handleCaughtUp();
      if (find && completesFound(storyRowsRef.current, getFound(), find)) {
        hapticNotification();
        said = true;
      }
      if (!said) hapticSwipe();
      if (row?.coords) {
        const framing = framingFor(index);
        if (swipeFlies(storyRowsRef.current, leavingIndex, index, framingFor)) {
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
    [flyToStory, flyToStoryIfHeld, framingFor, handleCaughtUp, setCameraFront],
  );

  /**
   * The card is on the story a swipe released it toward, or a finger came
   * down before it was: now the screen is told. Only for a release still
   * waiting, and only while the deck is still heading there. A landing can
   * reach JS after a tap has jumped the deck elsewhere, and its index set
   * then would put React on one story with the cards on another; a jump or a
   * scrub also lands the deck, and neither is a swipe.
   */
  const handleDeckLanded = useCallback(
    (index: number) => {
      const released = releasedRef.current;
      if (released?.index !== index || deckIndexRef.current !== index) return;
      releasedRef.current = null;
      setDeckIndex(index);
      recordArticleSnap();
      maybeRequestReview();
      if (released.find) findStory(released.find, false);
    },
    [findStory],
  );

  const goToStory = useCallback(
    (index: number) => {
      const row = storyRowsRef.current[index];
      if (row) focusStory(row.slug);
    },
    [focusStory],
  );
  const goToScrubbedStory = useCallback(
    (index: number) => {
      const row = storyRowsRef.current[index];
      if (row) focusStory(row.slug, { deckMoved: true });
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
    menuClosedAtRef.current = Date.now();
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
  const explicitStoryRef = useRef(false);
  const frontFlightRef = useRef(false);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') explicitStoryRef.current = false;
    });
    return () => subscription.remove();
  }, []);
  const openResolvedStory = useCallback(
    (slug: string, article?: Article, category?: Category) => {
      pinStory(slug);
      if (article && category) injectArticle(article, category);
      cardSheetRef.current?.dismiss();
      menuSheetRef.current?.dismiss();
      focusStory(slug, { grow: true });
    },
    [focusStory, injectArticle, pinStory],
  );
  const reportStoryError = useCallback(() => {
    toastRef.current?.show('Could not open that story. Please try again.');
  }, []);
  const resolveStory = useStoryOpener(groupedRef, openResolvedStory, reportStoryError);
  const handleCardStoryPress = useCallback(
    (slug: string) => {
      // A notification/link takes precedence over this foreground session's
      // delayed refresh, including a front flight already queued by it.
      explicitStoryRef.current = true;
      frontFlightRef.current = false;
      pendingFocusRef.current = null;
      void resolveStory(slug);
    },
    [resolveStory],
  );
  const handleOverlayDismiss = useCallback(() => {
    setActiveOverlay(null);
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
    setRefreshing(true);
    const startedAt = Date.now();
    // The check is one conditional request, and an unchanged build answers
    // in a blink: `checking for new stories` flashed too fast to read (the
    // user's report, 2026-09-26). It holds for a second, and the answer
    // follows it rather than landing on top of it.
    const held = () =>
      new Promise<void>((resolve) =>
        setTimeout(resolve, Math.max(0, REFRESH_MIN_MS - (Date.now() - startedAt))),
      );
    try {
      const addedArticles = await refresh();
      await held();
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
      await held();
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

  usePendingNotification(loading, grouped, handleCardStoryPress, handleBriefingPress);
  useLinkedStory(loading, grouped, handleCardStoryPress);

  const storyCount = storyRows.length;
  const frontIndex = Math.min(deckIndex, storyCount);
  // Whatever story is in front has been had, however it got there — a swipe,
  // a jump, a mark on the globe, or the deck opening on it.
  const frontSlug = storyRows[frontIndex]?.slug;
  const leftSlugRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    // A feed insertion remaps the held slug in the effect above. This render
    // still has the old numeric index: do not mark its replacement as landed
    // or overwrite the anchor before the remapped render arrives.
    if (frontIndex !== deckIndexRef.current) return;
    // A story read and then left stops saying `new` (`fresh-store` `spent`) —
    // on leaving, so the word never goes off the card being read. The end
    // card has no slug, and leaving for it counts.
    const left = leftSlugRef.current;
    leftSlugRef.current = frontSlug;
    if (left && left !== frontSlug && getReadSlugs().has(left)) spendNew(left);
    if (!frontSlug) return;
    markLanded(frontSlug);
    // The anchor a feed arrival keeps the reader on. Only a swipe or a focus
    // set it, so until the first swipe it was null, and an arrival swapped the
    // story at index 0 in place — the card changed under the reader and the
    // globe snapped to the new story's place with no flight.
    currentSlugRef.current = frontSlug;
    launchFrontSlugRef.current ??= frontSlug;
  }, [frontSlug, frontIndex]);

  // Where a return lands the reader (`lib/resume-landing.ts`). Called inside
  // the arrival's flush, so what is set here renders with the stories:
  // staying needs nothing (the slug anchor above holds the story), a toast
  // appears with them, and the front is the deck's index 0 in that same
  // commit, with the camera held where the reader left it — then flown there
  // once the new front exists (`frontFlightRef`). Decided by an effect a
  // commit later, the old story sat under the new day's times for a second,
  // then the card jumped, then the globe followed.
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
        explicitStory: explicitStoryRef.current,
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
      dropRelease();
      storyProgress.value = 0;
      storyCommitted.value = 0;
      setDeckIndex(0);
      frontFlightRef.current = true;
    },
    [collapseSheet, dropRelease, holdCamera, showNewToast, storyCommitted, storyProgress],
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
  // The gauges an open story is tied to: a screen reader hears it on the bar.
  const openArticle = storyOpen ? storyRows[frontIndex]?.article : undefined;
  const linkedGauges = useMemo(
    () => linkedGaugeIds(stripSlots, openArticle),
    [stripSlots, openArticle],
  );
  // Read at rest as well as open: the resting card is the title and the
  // hook, and most of the day is read that way. Only a platform sheet over
  // the map hides the card.
  restartDwellRef.current = useReadTracking(storyRows[frontIndex]?.slug ?? null, !sheetOpen);

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
  const storyTitleAt = useCallback(
    (index: number) => storyRowsRef.current[index]?.article.title ?? '',
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
  const storyMostCovered = useMemo(() => storyRows.map((row) => row.mostCovered), [storyRows]);

  const renderStory = useCallback(
    (index: number) => {
      const row = storyRows[index];
      if (!row) return null;
      return (
        <StoryCard
          row={row}
          odds={odds.get(row.slug) ?? null}
          chart={charts.get(row.slug) ?? null}
          resolvableEntityIds={resolvableEntityIds}
          // Only the card in front is ever open. Handed to all three mounted
          // cards, every open and close re-rendered the two off-screen
          // neighbours with it (profiled 2026-09-24); a neighbour swiped in
          // while reading takes it on landing, which re-renders it anyway.
          open={storyOpen && index === frontIndex}
          progress={sheetProgress}
          onOpen={expandSheet}
          onNext={handleNextStory}
          onPrevious={index > 0 ? handlePreviousStory : undefined}
          onCountryPress={handleCountryPress}
          onEntityPress={handleEntityPress}
          onOddsPress={handleOddsPress}
          onChartPress={openCard}
        />
      );
    },
    [
      expandSheet,
      handleCountryPress,
      handleEntityPress,
      handleNextStory,
      handleOddsPress,
      handlePreviousStory,
      odds,
      charts,
      openCard,
      resolvableEntityIds,
      sheetProgress,
      storyOpen,
      frontIndex,
      storyRows,
    ],
  );

  // `sources · save · share`, under each card's scroll area (`DeckSlot`).
  const renderStoryFooter = useCallback(
    (index: number) => {
      const row = storyRows[index];
      if (!row) return null;
      return (
        <StoryFooter
          article={row.article}
          open={storyOpen && index === frontIndex}
          onSources={handleSourcesPress}
          onBookmark={handleArticleBookmark}
          onShare={handleShare}
        />
      );
    },
    [frontIndex, handleArticleBookmark, handleShare, handleSourcesPress, storyOpen, storyRows],
  );

  // Only when the measurement could change the open height at all
  // (`openHeightNeedsMeasuring`): on a shorter phone the cap decides it.
  const measureNeeded = useMemo(
    () =>
      openHeightNeedsMeasuring(
        deckInput,
        storyRows.map((row) => row.article.sentences),
      ),
    [deckInput, storyRows],
  );
  // Each card's measured height, by everything that can change it: its text
  // and what hangs off it, and the reader's type and width — never its time
  // or colours, so minute ticks and recolouring measure nothing. It measured
  // the whole river whenever any of it changed, ~44 cards laid out off screen
  // — 742ms of a 1,365ms arrival commit in a dev build (2026-09-23) — for an
  // arrival that brought three. Now only the cards it has no height for.
  const cardHeightsRef = useRef(new Map<string, number>());
  const [cardHeightsVersion, setCardHeightsVersion] = useState(0);
  const cardKeys = useMemo(
    () =>
      !measureNeeded
        ? []
        : storyRows.map((r) =>
            JSON.stringify([
              screenWidth,
              fontScale,
              font,
              typography,
              r.slug,
              r.title,
              r.article.sentences,
              r.article.location,
              r.article.entities,
              r.article.threadArticleCount,
              r.article.threadArc,
              r.article.threadDay,
              odds.has(r.slug),
              // A contract's chart carries two caption lines a reading's
              // does not, so the kind is part of the height.
              charts.get(r.slug)?.kind ?? null,
            ]),
          ),
    [measureNeeded, screenWidth, fontScale, font, typography, storyRows, odds, charts],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: `cardHeightsVersion` is when the ref's map gained heights
  const unmeasured = useMemo(
    () => cardKeys.flatMap((key, i) => (cardHeightsRef.current.has(key) ? [] : [i])),
    [cardKeys, cardHeightsVersion],
  );
  // Every card measured: the open height from them. A card still unmeasured
  // keeps the last height rather than dropping to the estimate and back.
  useEffect(() => {
    if (!measureNeeded) {
      setMeasuredStory(null);
      return;
    }
    if (unmeasured.length > 0 || cardKeys.length === 0) return;
    const heights = cardKeys.map((key) => cardHeightsRef.current.get(key) ?? 0);
    const height = openStoryHeight(heights);
    if (height !== undefined) {
      setMeasuredStory((prev) => (prev?.height === height ? prev : { height }));
    }
  }, [measureNeeded, unmeasured, cardKeys]);
  const renderMeasureCard = useCallback(
    (index: number) => {
      const row = storyRows[index];
      if (!row) return null;
      return (
        <StoryCard
          row={row}
          odds={odds.get(row.slug) ?? null}
          chart={charts.get(row.slug) ?? null}
          resolvableEntityIds={resolvableEntityIds}
          open={false}
          progress={sheetProgress}
          veil={false}
          onOpen={noop}
          onCountryPress={noop}
          onEntityPress={noop}
          onOddsPress={noop}
        />
      );
    },
    [odds, charts, resolvableEntityIds, sheetProgress, storyRows],
  );
  const unmeasuredRef = useRef(unmeasured);
  unmeasuredRef.current = unmeasured;
  const cardKeysRef = useRef(cardKeys);
  cardKeysRef.current = cardKeys;
  const renderUnmeasuredCard = useCallback(
    (j: number) => renderMeasureCard(unmeasuredRef.current[j] ?? -1),
    [renderMeasureCard],
  );
  const handleStoryMeasured = useCallback((heights: number[]) => {
    const cache = cardHeightsRef.current;
    heights.forEach((height, j) => {
      const key = cardKeysRef.current[unmeasuredRef.current[j] ?? -1];
      if (key) cache.set(key, height);
    });
    // Only today's cards: a story that left the river is not coming back
    // with the same width and type.
    const live = new Set(cardKeysRef.current);
    for (const key of cache.keys()) if (!live.has(key)) cache.delete(key);
    setCardHeightsVersion((v) => v + 1);
  }, []);

  const renderEnd = useCallback(
    () =>
      storyCount === 0 ? (
        <EmptyState message="no stories yet" hint="New stories arrive through the day" />
      ) : (
        <EndCard fresh={storyFresh} slugs={storySlugs} />
      ),
    [storyCount, storyFresh, storySlugs],
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
        committedPosition={storyCommitted}
        width={screenWidth}
        sheetGesture={sheetGesture}
        scrollEnabled={scrollEnabled}
        onScrollOffset={onScrollOffset}
        bottomInset={layout.dock}
        keyOf={keyOfDeck}
        renderStory={renderStory}
        renderFooter={renderStoryFooter}
        renderEnd={renderEnd}
        onDragStart={handleDeckDragStart}
        onClaim={claimForDeck}
        onRollback={releaseForDeck}
        onRelease={handleDeckRelease}
        onSettle={handleDeckLanded}
      />
    ),
    [
      claimForDeck,
      releaseForDeck,
      layout.dock,
      frontIndex,
      handleDeckDragStart,
      handleDeckLanded,
      handleDeckRelease,
      keyOfDeck,
      renderEnd,
      renderStory,
      renderStoryFooter,
      sheetProgress,
      screenWidth,
      storyCount,
      storyProgress,
      storyCommitted,
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
        committedPosition={storyCommitted}
        onScrubSeek={goToScrubbedStory}
        progress={progress}
        onSeek={goToStory}
        timeAt={storyTimeAt}
        categoryAt={storyCategoryAt}
        titleAt={storyTitleAt}
        ages={storyAges}
        mostCovered={storyMostCovered}
        hues={storyHues}
        fresh={storyFresh}
        slugs={storySlugs}
        anchorSlug={currentSlugRef.current ?? undefined}
        open={storyOpen}
      />
    ),
    [
      cancelFlight,
      goToStory,
      goToScrubbedStory,
      storyCommitted,
      storyTimeAt,
      storyCategoryAt,
      storyTitleAt,
      storyAges,
      storyMostCovered,
      storyHues,
      storyFresh,
      storySlugs,
      storyOpen,
      refreshing,
      frontIndex,
      storyCount,
      storyProgress,
      progress,
    ],
  );

  if (loading)
    return (
      <Screen>
        <EmptyState message="loading" hint="This is taking longer than usual" />
      </Screen>
    );

  if (error && Object.values(grouped).every((a) => a.length === 0)) {
    return <ErrorState offline={offline} error={error} onRetry={retry} />;
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
          tapFrame={globeTapFrame}
          requestEpoch={requestEpoch}
          articles={river}
          heatmapPoints={heatmapPoints}
          chokepoints={chokepoints}
          straitMoves={straitMoves}
          landingAt={landingAt}
          selectedAt={selectedGauge?.coords ?? null}
          gdacsAlerts={globeAlerts}
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
        tapFrame={globeTapFrame}
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
          selectedId={selectedGauge?.id ?? null}
          linkedIds={linkedGauges}
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

      {alertTitle ? (
        <AlertPill title={alertTitle} top={alertTop} onPress={handleMastheadAlertPress} />
      ) : null}

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

      {unmeasured.length > 0 ? (
        <StoryMeasure
          key={unmeasured.map((i) => cardKeys[i]).join('\n')}
          count={unmeasured.length}
          width={screenWidth}
          renderCard={renderUnmeasuredCard}
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
        recorded={briefing?.generated}
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
        catalog={catalog}
        hazards={menuHazards}
        gdacsDetails={gdacsDetails}
        articles={river}
        onSelectRow={handleMenuRowSelect}
        onStoryPress={handleCardStoryPress}
        rootKey={menuRootKey}
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

      <CountrySheet
        sheetRef={countrySheetRef}
        country={countrySheet}
        activeAlerts={countryAlerts}
        onAlertPress={handleCountryAlertPress}
        hazards={countryHazards}
        facts={countryFactRows}
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
        straitMoves={straitMoves}
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
