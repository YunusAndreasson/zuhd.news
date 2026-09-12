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
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ArticleListRef } from '../components/ArticleList';
import {
  BriefingChrome,
  type BriefingChromeRef,
  type BriefingStatus,
} from '../components/BriefingChrome';
import { CardSheet } from '../components/CardSheet';
import { ChokepointSheet } from '../components/ChokepointSheet';
import { ConflictSheet } from '../components/ConflictSheet';
import { CountrySheet } from '../components/CountrySheet';
import { DisambiguationSheet } from '../components/DisambiguationSheet';
import { DisasterSheet } from '../components/DisasterSheet';
import { EmptyState } from '../components/EmptyState';
import { EntitySheet } from '../components/EntitySheet';
import { ErrorState } from '../components/ErrorState';
import { MiniGlobe, type MiniGlobeRef, type TapResult } from '../components/globe/MiniGlobe';
import { HintOverlay } from '../components/HintOverlay';
import { InstrumentsSheet } from '../components/InstrumentsSheet';
import { MenuSheet } from '../components/MenuSheet';
import { GlobeGestureLayer } from '../components/map/GlobeGestureLayer';
import { IndicatorStrip } from '../components/map/IndicatorStrip';
import { MapFeed } from '../components/map/MapFeed';
import { MapHeader } from '../components/map/MapHeader';
import { MapSheet, type MapSheetDetent, type MapSheetRef } from '../components/map/MapSheet';
import { SheetMasthead } from '../components/map/SheetMasthead';
import { NotificationPrimerSheet } from '../components/NotificationPrimerSheet';
import { Screen } from '../components/primitives';
import { ReaderLayer } from '../components/reader/ReaderLayer';
import type { BottomSheetMethodsRef } from '../components/SheetLayout';
import { SourcesSheet } from '../components/SourcesSheet';
import { Toast, type ToastRef } from '../components/Toast';
import { CATEGORIES, EASING, EDITORIAL, SPACING } from '../constants/theme';
import { useAnalysis } from '../hooks/useAnalysis';
import { useArticles } from '../hooks/useArticles';
import { useChokepoints } from '../hooks/useChokepoints';
import { useConflictEvents } from '../hooks/useConflictEvents';
import { useGdacsAlerts } from '../hooks/useGdacsAlerts';
import { useHeatmap } from '../hooks/useHeatmap';
import { useMarketSignals } from '../hooks/useMarketSignals';
import { useOnboardingHints } from '../hooks/useOnboardingHints';
import { usePendingNotification } from '../hooks/usePendingNotification';
import { usePreferences, useTheme } from '../hooks/useTheme';
import { useTrendsSnapshot } from '../hooks/useTrendsSnapshot';
import { useZoomCycle } from '../hooks/useZoomCycle';
import { articleTime, formatExactTime, formatTimeAgo } from '../lib/article-utils';
import { getSnapshot as getBookmarks, toggle as toggleBookmark } from '../lib/bookmark-store';
import { buildInstrumentCards } from '../lib/cards/markets';
import type { SwipeCard } from '../lib/cards/rank';
import { buildRankedInstruments } from '../lib/cards/sections';
import { hapticImpact, hapticNotification, hapticTick } from '../lib/haptics';
import { buildStoryRows, cameraTrackOf, type StoryRow } from '../lib/map-feed';
import { orderNewsRiver, type RiverArticle } from '../lib/news-order';
import { buildNowSurfaces, type LatLng, type NowItem, type StripItem } from '../lib/now';
import { getSnapshot as getOnboarding, markHintDone } from '../lib/onboarding-store';
import { useOpenLink } from '../lib/open-link';
import { oddsByStory, oddsLabels, type StoryOdds } from '../lib/predictions';

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
 *   **the strip**   three gauges, ranked, above the earth
 *   **the earth**   one canvas, mounted here, turned to whatever matters most
 *   **the sheet**   the app's only list — what is flashing, then the day
 *   **the reader**  a layer over all of it, not a place you navigate to
 *
 * The globe is owned by this component rather than by the news column, and
 * that is the load-bearing part: the map and the reader are two layers over
 * one canvas, so opening a story is the earth continuing to turn rather than
 * a cut to a second earth.
 */

const newsListRef = createRef<ArticleListRef>();

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

/** The sheet at rest, as a fraction of the window. Enough for the masthead,
 *  the block and a couple of stories — the day's shape without covering the
 *  earth it sits under. */
const SHEET_PEEK_FRACTION = 0.38;
/** Expanded. Not 1: a strip of globe stays visible so the sheet reads as
 *  sitting over the map rather than having replaced it. */
const SHEET_FULL_FRACTION = 0.88;

/** How much of the band between the strip and the sheet the disc fills. */
const GLOBE_FILL = 0.46;

/** Flight time when the camera is sent somewhere — a strip slot, a NOW row,
 *  the day's opening view. Long enough to read as travel over a surface. */
const FLY_MS = 700;

export default function HomeScreen() {
  const { colors, textVariants } = useTheme();
  const { preferences } = usePreferences();
  const reduceMotion = useReducedMotion();
  const { current: currentZoom, toggle: handleZoomToggle, step: handleZoomStep } = useZoomCycle();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const menuSheetRef = useRef<BottomSheetMethodsRef>(null);
  const primerSheetRef = useRef<BottomSheetMethodsRef>(null);
  const sourcesSheetRef = useRef<BottomSheetMethodsRef>(null);
  const countrySheetRef = useRef<BottomSheetMethodsRef>(null);
  const chokepointSheetRef = useRef<BottomSheetMethodsRef>(null);
  const disasterSheetRef = useRef<BottomSheetMethodsRef>(null);
  const conflictSheetRef = useRef<BottomSheetMethodsRef>(null);
  const disambiguationSheetRef = useRef<BottomSheetMethodsRef>(null);
  const entitySheetRef = useRef<BottomSheetMethodsRef>(null);
  const cardSheetRef = useRef<BottomSheetMethodsRef>(null);
  const instrumentsSheetRef = useRef<BottomSheetMethodsRef>(null);
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
  const { byId: indicatorsById, snapshot: trends } = useTrendsSnapshot();
  const { byId: analysis } = useAnalysis();
  const { cards: marketSignals, signals: rawSignals } = useMarketSignals();
  const network = useNetworkState();

  const [briefingVisible, setBriefingVisible] = useState(false);
  const [briefingStatus, setBriefingStatus] = useState<BriefingStatus>({
    available: false,
    resumable: false,
  });
  const [readerOpen, setReaderOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  /** Where the sheet has settled. The globe only takes touches at peek: when
   *  the sheet is expanded the earth is a sliver behind it, translated and
   *  faded, and a tap there would hit-test against geometry that has moved. */
  const [sheetDetent, setSheetDetent] = useState<MapSheetDetent>('peek');

  // Active article tracking (for share). Kept in a ref — the selected article
  // only feeds callbacks, never JSX, so state here would re-render the whole
  // screen on every snap.
  const activeArticleRef = useRef<RiverArticle | null>(null);

  // Sheet payloads
  const [sheetSources, setSheetSources] = useState<ArticleSource[]>([]);
  const [sheetDivergence, setSheetDivergence] = useState<number | null>(null);
  const [countrySheet, setCountrySheet] = useState<TapResult | null>(null);
  const [activeChokepoint, setActiveChokepoint] = useState<Chokepoint | null>(null);
  const [activeAlert, setActiveAlert] = useState<GdacsAlert | null>(null);
  const [activeConflict, setActiveConflict] = useState<ConflictEvent | null>(null);
  const [chooserCandidates, setChooserCandidates] = useState<TapResult[]>([]);
  const [activeEntity, setActiveEntity] = useState<Entity | null>(null);
  const [activeCard, setActiveCard] = useState<SwipeCard | null>(null);
  // The three payload-less sheets need explicit open flags so the hint overlay
  // can yield the airspace; every other sheet's openness is derived from its
  // payload state above.
  const [menuOpen, setMenuOpen] = useState(false);
  const [primerOpen, setPrimerOpen] = useState(false);
  const [instrumentsOpen, setInstrumentsOpen] = useState(false);

  // ---------------------------------------------------------------------
  // The camera
  //
  // One scroll offset, written by whichever list is in front — the sheet's
  // when the map is showing, the reader's when it is not. One value rather
  // than two so the globe's prop identity never changes; `itemHeight` is what
  // switches, because a sheet row and a full-screen article page are
  // different distances through the same track.
  // ---------------------------------------------------------------------
  const cameraScrollY = useSharedValue(0);
  const cameraOwner = useSharedValue(0);
  const cameraLat = useSharedValue(0);
  const cameraLng = useSharedValue(0);
  const sheetProgress = useSharedValue(0);
  const listOffset = useSharedValue(0);
  const headerHeight = useSharedValue(0);
  const readerProgress = useSharedValue(0);
  /** The story the reader is opening onto. A slug, not an index: a bookmark
   *  that has rotated out of the feed is injected in the same render the
   *  reader opens in, so its index does not exist until after that commit. */
  const pendingReaderSlugRef = useRef<string | null>(null);
  /** Mirrors `readerOpen` onto the UI thread for the globe's fade. */
  const readerOpenSV = useSharedValue(0);
  /** Set the first time the reader moves the camera themselves. The opening
   *  orientation is a statement the app makes once; after that the camera is
   *  the reader's and re-aiming it would be the app talking over them. */
  const cameraClaimedRef = useRef(false);
  const restingTargetRef = useRef<string | null>(null);

  const toastRef = useRef<ToastRef>(null);

  // ---------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------
  const [topChromeHeight, setTopChromeHeight] = useState(0);
  const onTopChromeLayout = useCallback((e: LayoutChangeEvent) => {
    setTopChromeHeight(e.nativeEvent.layout.height);
  }, []);

  const sheetPeek = Math.round(screenHeight * SHEET_PEEK_FRACTION);
  const sheetFull = Math.round(screenHeight * SHEET_FULL_FRACTION);

  // The earth sits in the band between the strip and the sheet at rest, and
  // is sized to the smaller of what the width and that band allow. As a
  // backdrop it was `0.9 × width` — wider than the screen, deliberately — but
  // a disc that size on this screen would be three-quarters hidden behind the
  // list.
  const globeBand = Math.max(120, screenHeight - sheetPeek - topChromeHeight);
  const globeRadius = Math.round(Math.min(screenWidth * GLOBE_FILL, globeBand * GLOBE_FILL));
  const globeCenterY = Math.round(topChromeHeight + globeBand / 2);

  // Row height, computed once from the resolved type rather than measured.
  // The list lays out with this number and the camera divides by it, so they
  // have to be one number; a row that grew to fit its title would put the
  // globe on the wrong story. Titles clamp to two lines instead — the reader
  // is where long text lives and it has no such constraint.
  const rowHeight = useMemo(() => {
    const titleLine = textVariants.title.lineHeight ?? 26;
    const metaLine = textVariants.labelXs.lineHeight ?? 13;
    return Math.round(SPACING.smPlus * 2 + titleLine * 2 + SPACING.xs + metaLine);
  }, [textVariants]);

  // ---------------------------------------------------------------------
  // Derived content
  // ---------------------------------------------------------------------
  const river = useMemo(() => orderNewsRiver(grouped), [grouped]);

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
  const marketMarks = useMemo(
    () =>
      [...strip, ...now]
        .filter((item) => item.id.startsWith('market-signal:') && item.coords)
        .map((item) => ({
          id: item.id,
          // The exchange, not the ticker: the mark stands for a place, and
          // `Borsa İstanbul` is a place where `BIST 100` is a number.
          label: 'label' in item ? item.label : item.kicker,
          lat: (item.coords as LatLng)[0],
          lng: (item.coords as LatLng)[1],
        })),
    [strip, now],
  );

  const odds = useMemo(() => oddsByStory(trends), [trends]);
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

  const dateLabel = useMemo(() => {
    const built = generated ? Date.parse(generated) : Number.NaN;
    const when = Number.isFinite(built) ? new Date(built) : new Date();
    return when.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  }, [generated]);

  // ---------------------------------------------------------------------
  // Refs for stable callbacks
  // ---------------------------------------------------------------------
  const groupedRef = useRef(grouped);
  groupedRef.current = grouped;
  const generatedRef = useRef(generated);
  generatedRef.current = generated;
  const chokepointsRef = useRef(chokepoints);
  chokepointsRef.current = chokepoints;
  const gdacsAlertsRef = useRef(gdacsAlerts);
  gdacsAlertsRef.current = gdacsAlerts;
  const conflictEventsRef = useRef(conflictEvents);
  conflictEventsRef.current = conflictEvents;
  const storyRowsRef = useRef(storyRows);
  storyRowsRef.current = storyRows;
  const rankedRef = useRef(rankedInstruments);
  rankedRef.current = rankedInstruments;
  const readerOpenRef = useRef(readerOpen);
  readerOpenRef.current = readerOpen;

  // ---------------------------------------------------------------------
  // Camera control
  // ---------------------------------------------------------------------
  /** Send the camera somewhere and hold it there until the reader scrolls.
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

  /** A finger on the list takes the camera back. Fires from the scroll
   *  worklet's begin-drag, never from `onScroll`, so a programmatic scroll
   *  cannot silently reclaim it. */
  const handleListDragStart = useCallback(() => {
    cameraClaimedRef.current = true;
    cameraOwner.value = 0;
  }, [cameraOwner]);

  // The opening view. The whole planet turns to the loudest thing on it, and
  // that thing carries a label — which is also the only signifier the globe
  // has ever had that it is addressable at all.
  useEffect(() => {
    if (cameraClaimedRef.current) return;
    const target = strip.find((item) => item.coords);
    if (!target?.coords) return;
    if (restingTargetRef.current === target.id) return;
    restingTargetRef.current = target.id;
    flyTo(target.coords);
  }, [strip, flyTo]);

  // ---------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------
  /**
   * Open the reader on a story.
   *
   * The camera is held on that story's dateline through the whole transition
   * (`flyTo` sets `cameraOwner = 1`), and that hold is what makes opening
   * seamless rather than a flicker. Opening switches `itemHeight` from a sheet
   * row to a full screen while the shared scroll offset still belongs to the
   * sheet; for as long as the scroll owned the camera there would be a frame
   * where sheet row three reads as reader page 0.04. Held on a target, the
   * reaction ignores the offset entirely, and the reader's first real swipe
   * (`onDragStart`) hands it back.
   */
  const openReaderAt = useCallback(
    (slug: string) => {
      pendingReaderSlugRef.current = slug;
      const row = storyRowsRef.current.find((r) => r.slug === slug);
      // No coordinates: leave the camera where it is rather than hold it on a
      // stale target. `getCoords` falls back all the way to source HQ, so in
      // practice every story has a place.
      if (row?.coords) flyTo(row.coords);
      if (readerOpenRef.current) {
        // Already reading, so the open effect will not run again — jump now.
        // One frame of deferral lets a just-injected bookmark commit first.
        requestAnimationFrame(() => newsListRef.current?.scrollToSlug(slug));
        return;
      }
      setReaderOpen(true);
    },
    [flyTo],
  );

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
          injectArticle(bookmark.article, category);
        } else {
          toastRef.current?.show('Article no longer available');
          return;
        }
      }
      openReaderAt(slug);
    },
    [injectArticle, openReaderAt],
  );

  const handleStoryPress = useCallback(
    (row: StoryRow) => {
      hapticImpact();
      openReaderAt(row.slug);
    },
    [openReaderAt],
  );

  /**
   * Close the reader onto the map.
   *
   * The camera is held on the story that was being read, for the same reason
   * opening holds it — `itemHeight` is about to switch back while the offset
   * still belongs to the reader. Setting the target directly rather than
   * flying: the scroll-driven camera was already resting on that page, so the
   * globe is already there and there is nothing to animate. The map then shows
   * where the story you just read is, until a drag on the sheet takes over.
   */
  const handleCloseReader = useCallback(() => {
    const active = activeArticleRef.current;
    const row = active ? storyRowsRef.current.find((r) => r.slug === active.slug) : undefined;
    if (row?.coords) {
      cameraLat.value = row.coords[0];
      cameraLng.value = row.coords[1];
      cameraOwner.value = 1;
    }
    setReaderOpen(false);
  }, [cameraLat, cameraLng, cameraOwner]);

  const openCard = useCallback((card: SwipeCard) => {
    setActiveCard(card);
    cardSheetRef.current?.present();
  }, []);

  const handleStripPress = useCallback(
    (item: StripItem) => {
      hapticImpact();
      markHintDone('globe');
      flyTo(item.coords);
      openCard(item.card);
    },
    [flyTo, openCard],
  );

  const handleNowPress = useCallback(
    (item: NowItem) => {
      hapticImpact();
      flyTo(item.coords);
      if (item.kind === 'hazard' && item.gdacsEventId) {
        const alert = gdacsAlertsRef.current.find((a) => a.eventid === item.gdacsEventId);
        if (alert) {
          setActiveAlert(alert);
          disasterSheetRef.current?.present();
        }
        return;
      }
      if (item.card) openCard(item.card);
    },
    [flyTo, openCard],
  );

  // After the reader — or the map — has committed. `MiniGlobe` is a child, so
  // its effects have already re-registered the camera reaction against the new
  // `itemHeight` by the time this runs. This parks the shared offset where the
  // surface now in front really is, so that when a drag hands the camera back
  // it resumes from there and not from the other surface's offset.
  useEffect(() => {
    readerOpenSV.value = readerOpen ? 1 : 0;
    if (readerOpen) {
      const slug = pendingReaderSlugRef.current;
      const index = slug ? storyRowsRef.current.findIndex((r) => r.slug === slug) : -1;
      cameraScrollY.value = Math.max(0, index) * Math.max(1, screenHeight);
      if (slug) newsListRef.current?.scrollToSlug(slug);
    } else {
      cameraScrollY.value = Math.max(0, listOffset.value - headerHeight.value);
    }
  }, [readerOpen, readerOpenSV, cameraScrollY, headerHeight, listOffset, screenHeight]);

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
      openCard(card);
    },
    [openCard],
  );

  // ---------------------------------------------------------------------
  // Globe taps — unchanged dispatch, one new destination
  // ---------------------------------------------------------------------
  const handleCountryPress = useCallback(
    (result: TapResult) => {
      hapticImpact();
      // Any path here — globe tap, marker tap, or inline country link — proves
      // the reader found the map layer; the globe hint retires on all of them.
      markHintDone('globe');
      cameraClaimedRef.current = true;
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
      if (result.marketSignalId) {
        const card = rankedRef.current.find((c) => c.id === result.marketSignalId);
        if (card) openCard(card);
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
    [handleSelectArticle, openCard],
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
    hapticImpact();
    markHintDone('sources');
    setSheetSources(article.sources);
    setSheetDivergence(article.sentimentDivergence ?? null);
    sourcesSheetRef.current?.present();
  }, []);

  const handleTimeAgoPress = useCallback((article: Article) => {
    hapticTick();
    toastRef.current?.show(formatExactTime(articleTime(article)), undefined, 'top');
  }, []);

  const handleShare = useCallback(() => {
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
        ios: { subject: `${title} — zuhd.news` },
        default: { dialogTitle: 'Share' },
      }),
    ).catch(() => {});
  }, []);

  const handleArticleChange = useCallback((article: RiverArticle) => {
    activeArticleRef.current = article;
  }, []);

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
    sheetSources.length > 0 ||
    countrySheet !== null ||
    activeChokepoint !== null ||
    activeAlert !== null ||
    activeConflict !== null ||
    activeCard !== null ||
    chooserCandidates.length > 0 ||
    activeEntity !== null;
  const sheetOpenRef = useRef(sheetOpen);
  sheetOpenRef.current = sheetOpen;

  const { activeHint, dismissActiveHint } = useOnboardingHints({
    ready: !loading && heatmapReady,
    suppressed: sheetOpen || briefingVisible,
    surface: readerOpen ? 'reader' : 'map',
  });

  const notificationsOnRef = useRef(preferences.notifications);
  notificationsOnRef.current = preferences.notifications;
  const primerTriedRef = useRef(false);

  const handleCaughtUp = useCallback(() => {
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

  const handleMenuDismiss = useCallback(() => setMenuOpen(false), []);
  const handleCountryDismiss = useCallback(() => setCountrySheet(null), []);
  const handleDisasterDismiss = useCallback(() => setActiveAlert(null), []);
  const handleConflictDismiss = useCallback(() => setActiveConflict(null), []);
  const handleChooserDismiss = useCallback(() => setChooserCandidates([]), []);
  const handleChokepointDismiss = useCallback(() => setActiveChokepoint(null), []);
  const handleEntityDismiss = useCallback(() => setActiveEntity(null), []);
  const handlePrimerDismiss = useCallback(() => setPrimerOpen(false), []);
  const handleCardDismiss = useCallback(() => setActiveCard(null), []);
  const handleInstrumentsDismiss = useCallback(() => setInstrumentsOpen(false), []);
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
  const handleChokepointArticlePress = useCallback(
    (slug: string, category: Category) => {
      chokepointSheetRef.current?.dismiss();
      handleSelectArticle(slug, category);
    },
    [handleSelectArticle],
  );
  const handleEntityArticlePress = useCallback(
    (slug: string, category: Category) => {
      entitySheetRef.current?.dismiss();
      handleSelectArticle(slug, category);
    },
    [handleSelectArticle],
  );

  const handleEndReached = useCallback(() => {
    toastRef.current?.show('Back to top', () => newsListRef.current?.scrollToTop());
  }, []);

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

  // The earth recedes as the sheet rises — up a little and quieter — so an
  // expanded list reads as sitting over the map rather than beside a globe
  // competing with it. A transform and an opacity, never a reprojection: this
  // tracks a finger at 60fps and `callReproject` is ~5 ms. Finger-tracked, so
  // it is exempt from Reduce Motion like the sheet itself. Full strength while
  // reading: the globe behind the reader's prose is its backdrop.
  const globeStyle = useAnimatedStyle(() => {
    const p = readerOpenSV.value === 1 ? 0 : sheetProgress.value;
    return {
      opacity: interpolate(p, [0, 1], [1, 0.4], Extrapolation.CLAMP),
      transform: [
        { translateY: interpolate(p, [0, 1], [0, -globeBand * 0.2], Extrapolation.CLAMP) },
      ],
    };
  });

  const handleHeaderLayout = useCallback(
    (e: LayoutChangeEvent) => {
      headerHeight.value = e.nativeEvent.layout.height;
    },
    [headerHeight],
  );

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

  const renderList = useCallback(
    ({
      scrollEnabled,
      onScrollOffset,
    }: {
      scrollEnabled: boolean;
      onScrollOffset: typeof listOffset;
    }) => (
      <MapFeed
        rows={storyRows}
        now={now}
        rowHeight={rowHeight}
        scrollEnabled={scrollEnabled}
        listOffset={onScrollOffset}
        cameraScrollY={cameraScrollY}
        headerHeight={headerHeight}
        onHeaderLayout={handleHeaderLayout}
        onDragStart={handleListDragStart}
        onStoryPress={handleStoryPress}
        onNowPress={handleNowPress}
        onInstrumentsPress={handleInstrumentsPress}
        onRefresh={handleRefresh}
        refreshing={refreshing}
        bottomInset={insets.bottom}
      />
    ),
    [
      cameraScrollY,
      handleHeaderLayout,
      handleInstrumentsPress,
      handleListDragStart,
      handleNowPress,
      handleRefresh,
      handleStoryPress,
      headerHeight,
      insets.bottom,
      now,
      refreshing,
      rowHeight,
      storyRows,
    ],
  );

  const masthead = useMemo(
    () => (
      <SheetMasthead
        dateLabel={dateLabel}
        storyCount={river.length}
        briefingAvailable={briefingStatus.available}
        briefingResumable={briefingStatus.resumable}
        briefingDuration={briefingStatus.duration}
        onBriefingPress={handleBriefingPress}
      />
    ),
    [briefingStatus, dateLabel, handleBriefingPress, river.length],
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
      <Animated.View style={[styles.globeLayer, globeStyle]} pointerEvents="none">
        <MiniGlobe
          ref={globeRef}
          articles={river}
          heatmapPoints={heatmapPoints}
          chokepoints={chokepoints}
          gdacsAlerts={gdacsAlerts}
          conflictEvents={conflictEvents}
          marketMarks={marketMarks}
          scrollY={cameraScrollY}
          itemHeight={readerOpen ? Math.max(1, screenHeight) : rowHeight}
          cameraTrack={cameraTrack}
          cameraOwner={cameraOwner}
          cameraLat={cameraLat}
          cameraLng={cameraLng}
          width={screenWidth}
          height={screenHeight}
          radius={globeRadius}
          centerY={globeCenterY}
          zoomClipOverride={currentZoom.clip}
          tick={tick}
        />
      </Animated.View>

      <GlobeGestureLayer
        globeRef={globeRef}
        canvasTop={0}
        cameraOwner={cameraOwner}
        cameraLat={cameraLat}
        cameraLng={cameraLng}
        clip={currentZoom.clip ?? 90}
        onTap={handleCountryPress}
        onZoomStep={handleZoomStep}
        onImpact={hapticImpact}
        enabled={!readerOpen && sheetDetent === 'peek'}
      />

      <View style={styles.topChrome} onLayout={onTopChromeLayout} pointerEvents="box-none">
        <MapHeader
          onMenuPress={handleMenuPress}
          onZoomPress={handleZoomToggle}
          zoomLabel={currentZoom.label}
        />
        <IndicatorStrip items={strip} onSelect={handleStripPress} />
      </View>

      <MapSheet
        ref={mapSheetRef}
        peek={sheetPeek}
        full={sheetFull}
        progress={sheetProgress}
        header={masthead}
        renderList={renderList}
        onDetentChange={setSheetDetent}
      />

      <ReaderLayer
        visible={readerOpen}
        articles={river}
        viewportHeight={screenHeight}
        lastSeenAt={lastSeenAt}
        progressSV={readerProgress}
        scrollY={cameraScrollY}
        globeRef={globeRef}
        resolvableEntityIds={resolvableEntityIds}
        tick={tick}
        listRef={newsListRef}
        onClose={handleCloseReader}
        onRefresh={handleRefresh}
        onEndReached={handleEndReached}
        onCaughtUp={handleCaughtUp}
        onCountryPress={handleCountryPress}
        onBookmarkPress={handleArticleBookmark}
        onSourcesPress={handleSourcesPress}
        onTimeAgoPress={handleTimeAgoPress}
        onEntityPress={handleEntityPress}
        onArticleChange={handleArticleChange}
        onReadingScrollStart={dismissActiveHint}
        onShare={handleShare}
        onDragStart={handleListDragStart}
        oddsBySlug={odds}
        onOddsPress={handleOddsPress}
      />

      <Toast ref={toastRef} />

      <HintOverlay
        hint={activeHint}
        onDismiss={dismissActiveHint}
        bottomInset={insets.bottom}
        // Over the reader there is nothing at the bottom to clear; over the
        // map there is the sheet at rest.
        bottomOffset={readerOpen ? 0 : sheetPeek}
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

      <CardSheet
        sheetRef={cardSheetRef}
        bottomInset={insets.bottom}
        card={activeCard}
        onDismiss={handleCardDismiss}
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

      <DisambiguationSheet
        sheetRef={disambiguationSheetRef}
        candidates={chooserCandidates}
        chokepoints={chokepoints}
        alerts={gdacsAlerts}
        conflictEvents={conflictEvents}
        instruments={rankedInstruments}
        bottomInset={insets.bottom}
        onDismiss={handleChooserDismiss}
        onSelect={handleChooserSelect}
      />

      <ChokepointSheet
        sheetRef={chokepointSheetRef}
        chokepoint={activeChokepoint}
        articles={river}
        bottomInset={insets.bottom}
        onDismiss={handleChokepointDismiss}
        onArticlePress={handleChokepointArticlePress}
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
