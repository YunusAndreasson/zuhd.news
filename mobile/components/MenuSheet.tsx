import { METRICS, type MetricKey } from '@shared/countries/country-ranking';
import type {
  Category,
  ConflictEvent,
  GdacsAlert,
  GdacsDetail,
  GroupedArticles,
} from '@shared/types';
import Constants from 'expo-constants';
import * as StoreReview from 'expo-store-review';
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  AccessibilityInfo,
  Linking,
  Text as RNText,
  StyleSheet,
  type TextStyle,
  View,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import {
  type AppearanceMode,
  baseFontSize,
  FONT_SOURCE,
  FONT_SYSTEM,
  type FontFamily,
  type FontSize,
  HIT_SLOP,
  LAYOUT,
  SPACING,
} from '../constants/theme';
import { useSheetBackNavigation } from '../hooks/useSheetBackNavigation';
import { useSheetNavigation } from '../hooks/useSheetNavigation';
import { usePreferences, useTheme } from '../hooks/useTheme';
import {
  getSnapshot as getBookmarks,
  subscribe as subscribeBookmarks,
} from '../lib/bookmark-store';
import { spokenDelta } from '../lib/cards/format';
import { conflictChooserDetails } from '../lib/conflict';
import {
  type ConflictWeek,
  conflictWeekByCountry,
  countryWeekLine,
  weekLine,
  weekWindow,
} from '../lib/conflict-week';
import { observationDate } from '../lib/data-freshness';
import {
  formatBytes,
  getSnapshot as getDataUsage,
  subscribe as subscribeDataUsage,
} from '../lib/data-usage';
import { hungerRows } from '../lib/famine-totals';
import { hapticError, hapticNotification, hapticTick } from '../lib/haptics';
import { hazardLead } from '../lib/hazard-leaders';
import {
  type CatalogGroup,
  type CatalogRow,
  GROUP_TITLES,
  type GroupKey,
} from '../lib/instrument-catalog';
import { metricGroups, rankingLeaders } from '../lib/metric-groups';
import type { RiverArticle } from '../lib/news-order';
import { resetOnboarding } from '../lib/onboarding-store';
import {
  type FamineArea,
  type FamineCountryTotal,
  famineBlocks,
  type GenocideSituation,
  type ThermalEvent,
} from '../lib/overlays';
import { MARKET_CAVEAT } from '../lib/predictions';
import { LEADERS_SEPARATOR } from '../lib/row-leaders';
import { settingsSummary } from '../lib/settings-summary';
import { makeStaggerEnter } from '../lib/stagger';
import { countryTap, markTap, type TapResult } from '../lib/tap-result';
import { eraseLocalData } from '../lib/wipe';
import { exchangeTally, groupFigure, hazardParts } from '../lib/world-summary';
import { DeltaChip } from './DeltaChip';
import { EmptyState } from './EmptyState';
import { InstrumentRow } from './InstrumentRow';
import {
  conflictMarkRow,
  famineMarkRow,
  gdacsMarkRow,
  genocideMarkRow,
  MarkRow,
  type MarkRowData,
  thermalMarkRow,
} from './MarkRow';
import {
  type MenuDetail,
  MenuDetailPage,
  menuDetailHandleTitle,
  menuDetailLabel,
} from './MenuDetail';
import { MenuControlRow, MenuRow, SectionLabel } from './MenuRow';
import { Pressable, Text } from './primitives';
import { SegmentedControl, type SegmentOption } from './SegmentedControl';
import { SheetAboutPage } from './SheetAboutPage';
import { SheetBookmarksPage } from './SheetBookmarksPage';
import { SheetFlatList, SheetScrollView } from './SheetContent';
import { SheetHandle } from './SheetHandle';
import { type InfoSection, SheetInfoPage } from './SheetInfoPage';
import { type BaseSheetProps, SheetLayout } from './SheetLayout';
import { SheetMapKeyPage } from './SheetMapKeyPage';
import { SheetSearchPage } from './SheetSearchPage';
import { Toggle } from './Toggle';
import { ZuhdMark } from './ZuhdMark';

const APP_VERSION = Constants.expoConfig?.version ?? '';
const CONTACT_EMAIL = 'contact@zuhd.news';

// ---------------------------------------------------------------------------
// The prose pages' copy. Settings were a registry here too until 2026-09-25;
// they are written out in `renderPage` now, because a flat list of entries
// could not hold the sections they are grouped into.
// ---------------------------------------------------------------------------

const INFO_PAGES = {
  // Every sentence here has to survive someone reading the source. The page
  // previously claimed "No device identifiers, IP addresses, or usage data are
  // logged server-side" while a Pages middleware logged country + path on every
  // app open; the middleware is gone, and the wording below is now scoped to
  // what we actually control rather than to what a CDN does with a TCP
  // connection. Anything added here must be checkable from the repo.
  privacy: {
    sections: [
      {
        // Until 2026-09-25 this also said "No telemetry … No third-party
        // SDKs", and the next section "The app contacts one address". The
        // update check (expo-updates → u.expo.dev, with a per-install
        // `EAS-Client-ID`, every launch) and the push service (exp.host, only
        // with notifications on) made all three untrue. Named in plain words,
        // not by vendor: a reader has no idea what Expo is.
        body: 'No accounts. No analytics. No advertising.',
      },
      {
        heading: 'what the app contacts',
        body: 'Stories, map data and audio come from one address: zuhd-news.pages.dev. The app also checks for updates when it opens, which sends its version and a random number for this install — nothing about what you read. With notifications on, the service that delivers them is contacted too. No analytics, no ad network, no font, map or image service. Source links open in your browser only when you tap them.',
      },
      {
        // Shares its core sentence verbatim with SheetAboutPage's
        // NO_PROFILE_LINE and the store listing. Change it in all three.
        heading: 'what we know about you',
        body: 'Nothing. There are no accounts. The app sends no identifier when it fetches the news, so the news server cannot tell readers apart, and it keeps no record of what anyone reads.',
      },
      {
        heading: 'data used',
        // Measured 2026-09-25 on the built API: feed-lite 22 KB gzipped, the
        // feed plus the eleven snapshots ~112 KB brotli cold, and 304s after
        // (ETags). Briefings are 64 kbps and ran 7.5–10 minutes: 3.6–4.8 MB.
        // It said 15 KB and 3 MB, and Settings counts decoded bytes.
        body: 'The day’s stories are about 20 KB, compressed, and the map’s layers about 100 KB the first time; after that only what has changed is downloaded. There are no images to load. Audio briefings are the exception: about 4 MB each, downloaded only when you press listen. Settings shows what the app has fetched since you opened it, counted before compression, so it reads higher.',
      },
      {
        // Fragments, not a sentence. Six things joined by commas read as a
        // legal inventory; the same six as separate statements read as an
        // answer — and match the cadence of "No ads. No tracking." above.
        heading: 'on this device',
        // Checked against the stores 2026-09-25: the chart-history store went
        // on 09-13, `found` is any story opened, and `read-store` keeps which
        // stories, not a count. Erase keeps display settings and the
        // notification choice, so "all of it" was not true either.
        body: 'Saved stories. Which stories were already here last time, so the new ones can be marked. Which stories you have opened and read. When you last left the app. Your place in a briefing. Which tips you have seen. Your display settings. A cached copy of the latest stories and map data, so they open without a connection and an unchanged file is not downloaded twice.\n\nNone of it leaves the device. You can erase it below.',
      },
      {
        // Written to make opting in feel as safe as it actually is, because it
        // is safe: tokens.js stores `token:<token>` -> '1' with a 90-day TTL,
        // and push.js sends the same payload to every key under that prefix.
        // There is no segmentation to describe because there is none.
        // Deliberately does NOT restate "no way to tell readers apart" — the
        // section above owns that claim, and saying it twice within one page
        // is the kind of protesting-too-much that makes a privacy page read
        // like a disclaimer. This section carries only what is specific to
        // notifications.
        heading: 'notifications',
        body: 'If you turn them on, one thing is stored on our server: the token your phone issues for push delivery. Nothing is attached to it — no account, no email, no history. Everyone who turns notifications on receives the same alert. The token expires after 90 days, and turning notifications off deletes it.',
      },
      {
        heading: 'audio',
        // Since 2026-09-26 the pipeline's Gemini TTS reads the script, Cloud
        // text-to-speech only where a piece fails, and every piece is sent
        // back to Gemini to be transcribed — the check that no sentence was
        // skipped (`scripts/generate-briefing.js`). "Google Cloud
        // text-to-speech" alone had stopped being true, and the second trip
        // is Google's too.
        body: 'Briefing audio is read by Google’s speech models and hosted on our own infrastructure. Google receives the text to read aloud, and the recording back once, to check that no sentence was skipped. It receives nothing about you.',
      },
    ],
  },
} as const satisfies Record<string, { sections: InfoSection[] }>;

type InfoKey = keyof typeof INFO_PAGES;

const FONT_SIZE_OPTIONS: SegmentOption<FontSize>[] = [
  { value: 'small', label: 'small' },
  { value: 'default', label: 'default' },
  { value: 'large', label: 'large' },
];

const FONT_FAMILY_OPTIONS: SegmentOption<FontFamily>[] = [
  { value: 'source', label: 'Source Sans' },
  { value: 'system', label: 'system' },
];

const APPEARANCE_OPTIONS: SegmentOption<AppearanceMode>[] = [
  { value: 'system', label: 'system' },
  { value: 'light', label: 'light' },
  { value: 'dark', label: 'dark' },
];

/** Each family's name set in itself, so the picker shows what it picks. */
const fontFamilyLabel = (v: FontFamily): TextStyle =>
  v === 'source' ? FONT_SOURCE.regular : FONT_SYSTEM.regular;

/** The hazard layers the globe draws, each a list under `world hazards`. */
type HazardKey = 'disasters' | 'conflict' | 'famine' | 'genocide' | 'fires';

type PageKey =
  | InfoKey
  | 'about'
  | 'settings'
  | 'settings & about'
  | 'search'
  | 'saved'
  | 'map key'
  | GroupKey
  | 'world hazards'
  | HazardKey
  | 'country rankings'
  /** Whatever a row opens — a card, a disaster, a country — as a page of the
   *  menu (`MenuDetail`), keyed by the order it was opened in. */
  | `detail:${number}`;

const isInfoKey = (k: PageKey): k is InfoKey => k in INFO_PAGES;

const HAZARD_TITLES: Readonly<Record<HazardKey, string>> = {
  disasters: 'disasters',
  conflict: 'conflict',
  famine: 'famine',
  genocide: 'genocide',
  fires: 'fires',
};
const isHazardKey = (k: PageKey): k is HazardKey => k in HAZARD_TITLES;
const isGroupKey = (k: PageKey): k is GroupKey => k in GROUP_TITLES;
const isDetailKey = (k: PageKey): k is `detail:${number}` => k.startsWith('detail:');

/** What a fixed page is called — in its handle and when a screen reader
 *  announces it. A group's key is a code (`stocks`), which no reader should
 *  hear. Static, not read off the catalog: a list's name does not change when
 *  an arrival rebuilds what is in it. A detail page's title is its detail's
 *  (`menuDetailLabel`). */
function pageTitle(key: PageKey): string {
  if (isGroupKey(key)) return GROUP_TITLES[key];
  if (isHazardKey(key)) return HAZARD_TITLES[key];
  return key;
}

/**
 * The line under each group's list, saying what the numbers are.
 *
 * The rows hide the week the way the strip does (`DeltaChip` prints a window
 * only where it is not the week), so the list is where the week is said —
 * once, not on every row.
 */
const GROUP_NOTES: Readonly<Record<GroupKey, string>> = {
  // A row opens its card here, and the globe turns to its place behind the
  // menu, so closing the menu leaves the reader on it.
  // The number beside each list on the menu's first page is said here, where
  // its members are: an index that does not state its bound reads as the
  // whole market.
  stocks:
    'Moves over the past week: green up, red down. The number beside this list on the menu’s first page is the average of these exchanges’ weeks, each counted once.',
  companies:
    'Twenty of the world’s largest companies by market value. Each share’s price at its last close, and its move over the past week: green up, red down. The number beside this list on the menu’s first page is the average of these weeks.',
  straits:
    'Ships a day, and the move over the past week: green up, red down. The number beside this list on the menu’s first page is the ships through all of these, added up.',
  currencies:
    'Each currency against the dollar, over the past week: green is stronger, red weaker. The number beside this list on the menu’s first page is the middle currency’s move.',
  commodities:
    'Moves over the past week: green up, red down. A price published monthly shows its month. The number beside this list on the menu’s first page is the average of the weekly moves here.',
  rates:
    'What borrowing costs, how fast prices rise and how many are out of work. A central bank’s rate and a monthly figure show the move on the month, in percentage points; the others the past week. Green up, red down.',
  crypto:
    'Each coin’s price in dollars, and its move over the past week: green up, red down. The number beside this list on the menu’s first page is the average of these weeks.',
  // The margin is said here, over the rows: a list has an order, and without
  // it the order reads as a ranking the measure cannot support.
  ai: 'Each lab’s best model on Epoch AI’s capability index, one score made from dozens of tests, and how far that best has risen over the past year. Scores a few points apart are within the measure’s margin.',
  predictions: `What a prediction market prices each outcome at — ${MARKET_CAVEAT}. Moves are in points.`,
  calendar: 'Decisions and releases ahead, nearest first.',
};

/** The hazard layers, in the arrays the globe draws — see `MenuSheetProps`. */
export interface MenuHazards {
  disasters: GdacsAlert[];
  conflict: ConflictEvent[];
  famine: FamineArea[];
  genocide: GenocideSituation[];
  fires: ThermalEvent[];
  /** Each country's caseload, which is not a mark: the famine list leads with
   *  it. Empty on a site that publishes none. */
  famineTotals: FamineCountryTotal[];
  /** The source's whole week. `conflict` is its last day, which is all the
   *  globe draws; the conflict list holds the week. Null until it loads. */
  conflictWeek: ConflictWeek | null;
}

function hazardRows(key: HazardKey, hazards: MenuHazards): MarkRowData[] {
  switch (key) {
    case 'disasters':
      // Gravest last on the globe, so they paint on top; first here.
      return [...hazards.disasters]
        .reverse()
        .map((a) => gdacsMarkRow(a, markTap({ gdacsEventId: a.eventid })));
    case 'conflict': {
      // The chooser's place-and-actors line, so no two rows read alike.
      const events = [...hazards.conflict].sort((a, b) => b.fatalities - a.fatalities);
      const details = conflictChooserDetails(events, { date: false });
      return events.map((e) => {
        const row = conflictMarkRow(e, markTap({ conflictEventId: e.id }));
        return { ...row, secondary: details.get(e.id) || row.secondary };
      });
    }
    case 'famine':
      return [...hazards.famine]
        .sort((a, b) => b.phase - a.phase)
        .map((a) => famineMarkRow(a, markTap({ famineAreaId: a.id })));
    case 'genocide':
      return hazards.genocide.map((g) => genocideMarkRow(g, markTap({ genocideId: g.id })));
    case 'fires':
      return [...hazards.fires]
        .sort((a, b) => b.frp - a.frp)
        .map((e) => thermalMarkRow(e, markTap({ thermalEventId: e.id })));
  }
}

/**
 * A hazard page's list, with the headings that make it more than its marks.
 *
 * Famine leads with countries by people: the marks are areas at Emergency or
 * worse, ninety-odd names in four countries, and no row among them said that
 * the same analysis counts 19 million people in Crisis across Sudan, or 1.2
 * million in Gaza, where no area is a mark at all.
 *
 * Conflict is the source's whole week under each country's toll, deadliest
 * country first. The globe draws the last day alone, and that day was all the
 * list held: four fifths of the file went unread.
 */
function hazardItems(layer: HazardKey, hazards: MenuHazards): HazardItem[] {
  if (layer === 'famine') {
    const areas = hazardRows(layer, hazards);
    const countries = hungerRows(hazards.famineTotals).map(
      (row): MarkRowData => ({
        key: row.key,
        result: countryTap(row.country),
        primary: row.name,
        secondary: row.detail,
        kind: 'famine',
        blocks: famineBlocks(row.phase),
      }),
    );
    if (countries.length === 0) return areas;
    return [
      { key: 'label-countries', label: 'people in crisis or worse' },
      ...countries,
      ...(areas.length > 0
        ? [{ key: 'label-areas', label: 'areas in emergency or worse' }, ...areas]
        : []),
    ];
  }
  if (layer === 'conflict' && hazards.conflictWeek) {
    const items: HazardItem[] = [];
    for (const country of conflictWeekByCountry(hazards.conflictWeek.events)) {
      items.push({
        key: `label-${country.country}`,
        label: `${country.name} · ${countryWeekLine(country)}`,
      });
      for (const e of country.events) {
        const row = conflictMarkRow(e, markTap({ conflictEventId: e.id }));
        // The heading names the country; the row says the day and the place.
        const where = [observationDate(e.eventDate), e.location || e.admin1]
          .filter(Boolean)
          .join(' · ');
        items.push({ ...row, secondary: where || row.secondary });
      }
    }
    return items;
  }
  const marks = hazardRows(layer, hazards);
  return layer === 'disasters' ? withAlertHeadings(marks) : marks;
}

/** The page a hazard row opens: the mark its tap names, found in the layers
 *  the list was built from. */
function markDetail(result: TapResult, hazards: MenuHazards): MenuDetail | null {
  if (result.gdacsEventId) {
    const alert = hazards.disasters.find((a) => a.eventid === result.gdacsEventId);
    return alert ? { kind: 'alert', alert } : null;
  }
  if (result.conflictEventId) {
    // The week's, where the list is the week: most of its rows are events the
    // globe does not draw.
    const events = hazards.conflictWeek?.events ?? hazards.conflict;
    const event = events.find((e) => e.id === result.conflictEventId);
    return event ? { kind: 'conflict', event } : null;
  }
  if (result.famineAreaId) {
    const area = hazards.famine.find((a) => a.id === result.famineAreaId);
    return area ? { kind: 'overlay', overlay: { kind: 'famine', area } } : null;
  }
  if (result.genocideId) {
    const situation = hazards.genocide.find((g) => g.id === result.genocideId);
    return situation ? { kind: 'overlay', overlay: { kind: 'genocide', situation } } : null;
  }
  if (result.thermalEventId) {
    const event = hazards.fires.find((e) => e.id === result.thermalEventId);
    return event ? { kind: 'overlay', overlay: { kind: 'thermal', event } } : null;
  }
  // A row that is a country and no mark: the famine list's caseloads.
  if (result.countryName) return { kind: 'country', name: result.countryName };
  return null;
}

const METRIC_KEYS = Object.keys(METRICS) as MetricKey[];

/** The mark's box against the wordmark's size: the drawn Z fills 72% of its
 *  box, so at 1.5× it stands a little taller than the name's capitals, as a
 *  mark beside a name does. It scales with the reader's text size. */
const MARK_TO_WORDMARK = 1.5;

/** A list page's rows are the only thing that scrolls, and each hazard row
 *  is a canvas: build a screenful, not a hundred. */
const LIST_WINDOW = { initialNumToRender: 12, windowSize: 5, maxToRenderPerBatch: 12 } as const;

/**
 * Erase control for the privacy page. Two taps, not a native Alert: the app
 * has no other modal chrome and a system dialog would be the one piece of
 * borrowed UI in it. The armed state disarms itself after a few seconds so an
 * abandoned first tap can't be completed by a stray second one later.
 */
function EraseControl({ onDone }: { onDone: (message: string) => void }) {
  const { colors } = useTheme();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);

  const handlePress = useCallback(() => {
    if (busy) return;
    if (!armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    setArmed(false);
    eraseLocalData()
      .then(() => {
        hapticNotification();
        onDone('Erased');
      })
      .catch(() => {
        hapticError();
        onDone('Could not erase');
      })
      .finally(() => setBusy(false));
  }, [armed, busy, onDone]);

  return (
    <>
      <Text variant="labelSm" accessibilityRole="header" style={styles.eraseHeading}>
        erase local data
      </Text>
      <Text selectable variant="body">
        Removes your saved stories, which stories you have opened and read, your place in a
        briefing, the tips you have seen, and the cached stories and map data. Display settings and
        your notification choice stay.
      </Text>
      <Pressable
        onPress={handlePress}
        hitSlop={HIT_SLOP}
        style={[styles.erasePill, { borderColor: colors.accent }]}
        accessibilityRole="button"
        accessibilityLabel={armed ? 'Confirm erase local data' : 'Erase local data'}
        accessibilityHint={armed ? undefined : 'Asks for confirmation before erasing'}
      >
        <Text variant="bodyEmphasis" tone={armed ? 'unfavorable' : 'default'}>
          {busy ? 'erasing…' : armed ? 'tap again to erase' : 'erase'}
        </Text>
      </Pressable>
    </>
  );
}

interface MenuSheetProps extends BaseSheetProps {
  grouped: GroupedArticles;
  onSelectArticle: (slug: string, category: Category) => void;
  /** Every instrument, in its group (`buildInstrumentCatalog`). */
  catalog: CatalogGroup[];
  /** The hazard marks, exactly as the globe draws them: these lists are the
   *  accessible path to every mark, because the globe is hidden from screen
   *  readers. */
  hazards: MenuHazards;
  /** GDACS population estimates, for a disaster's page. */
  gdacsDetails: Record<string, GdacsDetail>;
  /** The river, for the stories a thermal anomaly was joined to. */
  articles: RiverArticle[];
  /** A row whose card is opening as a page: fly the globe to it and ring its
   *  place, behind the menu, so closing the menu leaves the reader there. */
  onFocusRow: (row: CatalogRow) => void;
  /** A strait with nothing to chart has no page: close the menu and find it
   *  on the globe. */
  onSelectRow: (row: CatalogRow) => void;
  /** A hazard mark opening as a page: fly the globe to it, behind the menu. */
  onFocusMark: (result: TapResult) => void;
  /** A story a card cites: close the menu and open it. */
  onStoryPress: (slug: string) => void;
  /**
   * Bumped to open the menu at its root. It keeps its pages when it closes
   * (2026-09-26): a reader who closed it from Bitcoin to look at the map came
   * back to the main page and had to find their way again. The screen bumps
   * this when the menu has been closed a while, or when `all →` opens it.
   */
  rootKey: number;
  onToast?: (message: string) => void;
}

export const MenuSheet = memo(function MenuSheet({
  sheetRef,
  bottomInset,
  onDismiss,
  grouped,
  onSelectArticle,
  catalog,
  hazards,
  gdacsDetails,
  articles,
  onFocusRow,
  onSelectRow,
  onFocusMark,
  onStoryPress,
  rootKey,
  onToast,
}: MenuSheetProps) {
  const { colors, font, typography } = useTheme();
  const prefsApi = usePreferences();
  const { preferences } = prefsApi;
  const nav = useSheetNavigation<PageKey>();
  // Called as functions, not as `nav.push()`: a method call reads as a change
  // to `nav`, and the compiler could not keep the callbacks below memoized on
  // `nav.push` alone.
  const { push, pop, reset } = nav;
  const [canRate, setCanRate] = useState(false);
  const [notificationPermissionDenied, setNotificationPermissionDenied] = useState(false);

  // The pages a row opened, by key. Kept until the menu closes: a key popped
  // off the stack is never pushed again, so a stale entry is only memory.
  const [details, setDetails] = useState<Readonly<Record<string, MenuDetail>>>({});
  const detailSeq = useRef(0);
  const titleOf = useCallback(
    (key: PageKey) => {
      const detail = isDetailKey(key) ? details[key] : undefined;
      return detail ? menuDetailLabel(detail) : pageTitle(key);
    },
    [details],
  );

  const navPush = useCallback(
    (page: PageKey) => {
      push(page);
      AccessibilityInfo.announceForAccessibility(pageTitle(page));
    },
    [push],
  );
  // What the reader searched for, held here so it outlives the page: the menu
  // closes when a result opens its story, and it reopens on this page
  // (`MENU_RESUME_MS`). The page kept the words itself, so it reopened empty,
  // and the second result of a search cost the search again. Leaving the page
  // by its back, or the menu going back to its root, clears it.
  const [searchQuery, setSearchQuery] = useState('');
  const navPop = useCallback(() => {
    if (nav.current === 'search') setSearchQuery('');
    pop();
    const next = nav.stack[nav.stack.length - 2];
    AccessibilityInfo.announceForAccessibility(next ? titleOf(next) : 'menu');
  }, [pop, nav.current, nav.stack, titleOf]);
  /** Push whatever a row opened, as a page: back is the list it came from. */
  const openDetail = useCallback(
    (detail: MenuDetail) => {
      detailSeq.current += 1;
      const key: PageKey = `detail:${detailSeq.current}`;
      setDetails((all) => ({ ...all, [key]: detail }));
      push(key);
      AccessibilityInfo.announceForAccessibility(menuDetailLabel(detail));
    },
    [push],
  );
  const currentDetail =
    nav.current && isDetailKey(nav.current) ? (details[nav.current] ?? null) : null;

  // Back to the root when the screen asks: a state update during render, the
  // pattern for resetting on a prop change, so the menu never paints the old
  // page first.
  const [seenRootKey, setSeenRootKey] = useState(rootKey);
  if (rootKey !== seenRootKey) {
    setSeenRootKey(rootKey);
    reset();
    setDetails({});
    setSearchQuery('');
  }

  const handleRow = useCallback(
    (row: CatalogRow) => {
      if (!row.card) {
        onSelectRow(row);
        return;
      }
      onFocusRow(row);
      openDetail({ kind: 'card', card: row.card });
    },
    [onFocusRow, onSelectRow, openDetail],
  );
  const handleMark = useCallback(
    (result: TapResult) => {
      const detail = markDetail(result, hazards);
      if (!detail) return;
      onFocusMark(result);
      openDetail(detail);
    },
    [hazards, onFocusMark, openDetail],
  );

  useEffect(() => {
    StoreReview.hasAction()
      .then(setCanRate)
      .catch(() => {});
  }, []);

  // The root's title is the wordmark, in the handle where every page's title
  // sits. It used to open the page body, 14pt over rows set larger than it,
  // and the root was the one page whose handle was empty. The mark leads it
  // (2026-09-26, the user's request): the menu is the one place in the app
  // that says whose it is — the top bar names nothing, and the `Z` that sat
  // top left went on 2026-09-13 — and in the handle it costs no row.
  const markSize = Math.round(typography.sizeWordmark * MARK_TO_WORDMARK);
  const handle = (
    <SheetHandle
      title={
        currentDetail ? (
          menuDetailHandleTitle(currentDetail)
        ) : nav.current ? (
          pageTitle(nav.current)
        ) : (
          <View style={styles.lockup}>
            {/* In the ink of `zuhd`, so the mark and the name are one unit. */}
            <ZuhdMark size={markSize} color={colors.textSecondary} />
            <Text variant="wordmark" accessibilityRole="header" accessibilityLabel="zuhd.news">
              <RNText style={{ ...font.bold, color: colors.textSecondary }}>zuhd</RNText>
              <RNText style={{ ...font.regular, color: colors.accent }}>.news</RNText>
            </Text>
          </View>
        )
      }
      onBack={nav.depth > 0 ? navPop : undefined}
    />
  );

  // The pages stay when the menu closes; `rootKey` decides where it opens.
  const handleDismiss = onDismiss;

  const swipeBack = useSheetBackNavigation({ canGoBack: nav.depth > 0, onBack: navPop });

  // The size picker sets each size in itself — the size the whole app will
  // take, whatever size it is at now.
  const sizeLabelScale = useCallback(
    (v: FontSize) => baseFontSize(v) / typography.sizeBase,
    [typography.sizeBase],
  );

  // A group key with no group is a list an arrival emptied while it was open:
  // it says so rather than falling through to a blank page.
  const groupKey = nav.current && isGroupKey(nav.current) ? nav.current : null;
  const activeGroup = groupKey ? (catalog.find((g) => g.key === groupKey) ?? null) : null;
  const activeHazard = nav.current && isHazardKey(nav.current) ? nav.current : null;
  // A detail covers its originating list without unmounting it. Keeping the
  // native viewport and virtualized window also preserves filters and exact
  // scroll position; rebuilding a deep list clamps to its first batch.
  const parentListKey = [...nav.stack].reverse().find((key) => isGroupKey(key) || isHazardKey(key));
  const keptGroup =
    parentListKey && isGroupKey(parentListKey)
      ? catalog.find((group) => group.key === parentListKey)
      : undefined;
  const keptHazard = parentListKey && isHazardKey(parentListKey) ? parentListKey : null;

  // Declared before the return, where React Compiler can read it: hoisted from
  // after it, the whole menu silently skipped the compiler.
  function renderPage() {
    const current = nav.current;
    if (current === null) {
      return (
        <>
          {/* The data first (2026-09-26, the user's request): the menu was
              four reading rows over five rows about the app, and opening it
              found nothing to read. Each group's row prints the summary of
              its whole list as one number (`GroupRow`), so the column reads
              down the page as how the world moved this week. */}
          {catalog.map((group, i) => (
            <GroupRow
              key={group.key}
              group={group}
              first={i === 0}
              onPress={() => navPush(group.key)}
            />
          ))}
          <HazardsRow hazards={hazards} first={catalog.length === 0} onPress={navPush} />
          <MenuRow
            title="country rankings"
            description={`Every country by ${METRICS.population.label}, ${METRICS.gdp.label.toUpperCase()} and ${METRIC_KEYS.length - 2} more measures`}
            trailing="push"
            onPress={() => navPush('country rankings')}
          />

          <SectionLabel label="reading" />
          <MenuRow
            first
            title="search"
            description="Recent stories, by title, topic or place"
            trailing="push"
            onPress={() => navPush('search')}
          />
          <SavedRow onPress={() => navPush('saved')} />
          <MenuRow
            title="map key"
            description="What each mark on the globe means"
            trailing="push"
            onPress={() => navPush('map key')}
          />

          {/* The app's own pages, one row: they are opened rarely, and five
              rows of them were most of what the menu used to show. */}
          <SectionLabel label="the app" />
          <MenuRow
            first
            title="settings & about"
            description="Text size, appearance, notifications, privacy, contact"
            trailing="push"
            onPress={() => navPush('settings & about')}
          />
        </>
      );
    }

    if (current === 'settings & about') {
      const settingsLine = settingsSummary({
        fontSize: preferences.fontSize,
        appearance: preferences.appearance,
        notifications: preferences.notifications && !notificationPermissionDenied,
      });
      return (
        <>
          {/* What the settings are, not what the page holds: the headings
              are the screen reader's hint. */}
          <MenuRow
            first
            title="settings"
            description="Text size, appearance, haptics, notifications"
            detail={
              <Text variant="caption" style={styles.teaser}>
                {settingsLine}
              </Text>
            }
            detailLabel={settingsLine}
            trailing="push"
            onPress={() => navPush('settings')}
          />
          {/* The rows below settings name themselves, so they carry no
              description. They were the root's until 2026-09-26, where with
              one each the root outgrew the sheet at the large text size. */}
          <MenuRow title="about" trailing="push" onPress={() => navPush('about')} />
          <MenuRow title="privacy" trailing="push" onPress={() => navPush('privacy')} />
          {/* Straight to mail. It was a page holding one sentence and this
              address, and the sheet shrank to a quarter of the screen to show
              it. The address is the description, so a reader without a mail
              app still has it. */}
          <MenuRow
            title="contact"
            description={CONTACT_EMAIL}
            trailing="leave"
            onPress={() => {
              Linking.openURL(`mailto:${CONTACT_EMAIL}`).catch(() =>
                onToast?.(`Write to ${CONTACT_EMAIL}`),
              );
            }}
          />
          {canRate && (
            <MenuRow
              title="rate"
              // Not "in the App Store" — this row also ships on Google Play.
              accessibilityLabel="Rate zuhd.news"
              trailing="leave"
              onPress={() => {
                StoreReview.requestReview().catch(() => {});
              }}
            />
          )}
        </>
      );
    }

    if (current === 'world hazards') {
      return <HazardLayers hazards={hazards} onPress={navPush} />;
    }

    if (current === 'country rankings') {
      // Grouped (`lib/metric-groups.ts`): twenty-seven measures in one column
      // read as a table of contents with no chapters.
      return (
        <>
          {metricGroups().map((group, g) => (
            <Fragment key={group.label}>
              <SectionLabel label={group.label} first={g === 0} />
              {group.metrics.map((key, i) => {
                // The row says who leads, as a data group's row prints its
                // first reading. It printed the measure's definition, which
                // the ranking's own page opens with; that sentence is still
                // the screen reader's hint.
                const leaders = rankingLeaders(key);
                return (
                  <MenuRow
                    key={key}
                    first={i === 0}
                    title={METRICS[key].label}
                    description={METRICS[key].description}
                    detail={
                      leaders.length > 0 ? (
                        <Text variant="caption" style={styles.teaser}>
                          {leaders.join(LEADERS_SEPARATOR)}
                        </Text>
                      ) : undefined
                    }
                    detailLabel={leaders.length > 0 ? `led by ${leaders.join(', ')}` : undefined}
                    trailing="push"
                    onPress={() => openDetail({ kind: 'ranking', metric: key, country: null })}
                  />
                );
              })}
            </Fragment>
          ))}
        </>
      );
    }

    if (current === 'settings') {
      const enter = makeStaggerEnter();
      return (
        <>
          <Animated.View entering={enter()}>
            <SectionLabel first label="display" />
            <MenuControlRow first title="text size">
              <SegmentedControl
                accessibilityLabel="text size"
                options={FONT_SIZE_OPTIONS}
                selected={preferences.fontSize}
                onSelect={prefsApi.setFontSize}
                labelScale={sizeLabelScale}
              />
            </MenuControlRow>
            <MenuControlRow title="font">
              <SegmentedControl
                accessibilityLabel="font"
                options={FONT_FAMILY_OPTIONS}
                selected={preferences.fontFamily}
                onSelect={prefsApi.setFontFamily}
                labelStyle={fontFamilyLabel}
              />
            </MenuControlRow>
            <MenuControlRow title="appearance">
              <SegmentedControl
                accessibilityLabel="appearance"
                options={APPEARANCE_OPTIONS}
                selected={preferences.appearance}
                onSelect={prefsApi.setAppearance}
              />
            </MenuControlRow>
          </Animated.View>

          <Animated.View entering={enter()}>
            <SectionLabel label="touch and alerts" />
            {/* The whole row is the target: a toggle-sized target alone is a
                reach on a full-width row, and a screen reader gets one element
                carrying the whole switch. */}
            <MenuRow
              first
              title="haptics"
              description="A light tap as you swipe and scrub"
              trailing={<Toggle value={preferences.haptics} />}
              accessibilityRole="switch"
              accessibilityState={{ checked: preferences.haptics }}
              onPress={() => {
                // After the change: turning haptics on is felt, turning them
                // off is not (it ticked the other way round).
                const next = !preferences.haptics;
                prefsApi.setHaptics(next);
                if (next) hapticTick();
              }}
            />
            <MenuRow
              title="notifications"
              description={
                notificationPermissionDenied
                  ? 'Notification permission is off. You can enable it in device settings.'
                  : 'The daily briefing and breaking news'
              }
              trailing={<Toggle value={preferences.notifications} />}
              accessibilityRole="switch"
              accessibilityState={{ checked: preferences.notifications }}
              onPress={() => {
                hapticTick();
                if (preferences.notifications) {
                  prefsApi.setNotifications(false);
                  return;
                }
                prefsApi.setNotifications(true).then((granted) => {
                  setNotificationPermissionDenied(!granted);
                });
              }}
            />
            {notificationPermissionDenied ? (
              <MenuRow
                title="open device settings"
                trailing="leave"
                onPress={() => Linking.openSettings().catch(() => {})}
              />
            ) : null}
          </Animated.View>

          <Animated.View entering={enter()}>
            <SectionLabel label="data" />
            <DataUsedRow />
            <MenuRow
              title="show tips again"
              // "tips" — the reader's word, and this row's. The code calls
              // them hints (HintId, HINT_COPY); no screen does.
              description="The swipe and globe tips return as you read"
              onPress={() => {
                resetOnboarding();
                onToast?.('Tips will reappear as you read');
                sheetRef.current?.dismiss();
              }}
            />
          </Animated.View>
        </>
      );
    }

    if (current === 'map key') {
      return <SheetMapKeyPage />;
    }

    if (current === 'saved') {
      return <SheetBookmarksPage onSelectArticle={onSelectArticle} />;
    }

    if (current === 'about') {
      return <SheetAboutPage articles={Object.values(grouped).flat()} version={APP_VERSION} />;
    }

    if (isInfoKey(current)) {
      return (
        <SheetInfoPage
          sections={INFO_PAGES[current].sections}
          footer={current === 'privacy' ? <EraseControl onDone={(m) => onToast?.(m)} /> : undefined}
        />
      );
    }

    return null;
  }

  return (
    <SheetLayout
      sheetRef={sheetRef}
      handle={handle}
      onDismiss={handleDismiss}
      // Android's back pops a page before it closes the menu, as the
      // country sheet's ranking does. It closed the whole menu from any page.
      onBackPress={nav.depth > 0 ? navPop : undefined}
      // The search page's field brings the keyboard up.
      avoidKeyboard
    >
      {nav.current === 'search' ? (
        <SheetSearchPage
          grouped={grouped}
          bottomInset={bottomInset}
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onSelectArticle={onSelectArticle}
        />
      ) : groupKey || activeHazard || currentDetail ? (
        // A list page is a sibling of the scroll view, never inside it: a
        // virtualised list nested in a scroll view renders every row. A
        // detail page brings its own scroll view, as its sheet does.
        <GestureDetector gesture={swipeBack}>
          <View style={styles.listPage}>
            {keptGroup ? (
              <RetainedListPage hidden={!activeGroup}>
                <GroupPage
                  key={keptGroup.key}
                  group={keptGroup}
                  bottomInset={bottomInset}
                  onSelect={handleRow}
                />
              </RetainedListPage>
            ) : keptHazard ? (
              <RetainedListPage hidden={!activeHazard}>
                <HazardPage
                  key={keptHazard}
                  layer={keptHazard}
                  hazards={hazards}
                  bottomInset={bottomInset}
                  onSelect={handleMark}
                />
              </RetainedListPage>
            ) : groupKey ? (
              <EmptyState message="Nothing to list right now" />
            ) : null}
            {currentDetail ? (
              <MenuDetailPage
                detail={currentDetail}
                bottomInset={bottomInset}
                hazards={hazards}
                gdacsDetails={gdacsDetails}
                articles={articles}
                onOpen={openDetail}
                onStoryPress={onStoryPress}
                onArticlePress={onSelectArticle}
                onRequestClose={() => sheetRef.current?.dismiss()}
              />
            ) : null}
          </View>
        </GestureDetector>
      ) : (
        <GestureDetector gesture={swipeBack}>
          {/* Each page owns its scroll origin; reusing the native scroll view
              carried the menu's offset into rankings, settings and prose. */}
          <SheetScrollView key={nav.current ?? 'root'} bottomInset={bottomInset}>
            {renderPage()}
          </SheetScrollView>
        </GestureDetector>
      )}
    </SheetLayout>
  );
});

/**
 * The saved row, subscribed to the bookmarks itself: saving a story re-renders
 * this row, not the menu. The house rule — what changes re-renders only what
 * shows it.
 */
const SavedRow = memo(function SavedRow({ onPress }: { onPress: () => void }) {
  const bookmarks = useSyncExternalStore(subscribeBookmarks, getBookmarks);
  const count = bookmarks.length;
  // Newest first, so this is the story saved last. One line: a second would
  // grow the root, which already fills the sheet at the large text size.
  const latest = bookmarks[0]?.article.title;
  return (
    <MenuRow
      title="saved"
      description="Stories you have kept"
      detail={
        latest ? (
          <Text variant="caption" numberOfLines={1} style={styles.teaser}>
            {latest}
          </Text>
        ) : undefined
      }
      detailLabel={latest ? `last saved, ${latest}` : undefined}
      value={count > 0 ? String(count) : undefined}
      trailing="push"
      onPress={onPress}
    />
  );
});

/**
 * The data meter's row, subscribed itself. The meter moves on every download,
 * and subscribed in the menu it re-rendered the whole menu — closed or not,
 * since iOS keeps a sheet's content mounted — once for each file an arrival
 * fetched.
 */
const DataUsedRow = memo(function DataUsedRow() {
  // A number the reader can watch, rather than a claim they have to accept.
  // This is the app's central promise made checkable — see lib/data-usage.ts
  // for what it counts and why it counts high.
  const used = useSyncExternalStore(subscribeDataUsage, getDataUsage);
  return (
    <MenuRow
      first
      title="data used"
      description="Fetched since you opened the app"
      value={formatBytes(used)}
    />
  );
});

/**
 * A group's row on the root: its name, and its whole list as one number at
 * the row's trailing edge (`groupFigure`, `lib/world-summary.ts`) — the
 * exchanges' weeks averaged, the straits' ships added up, the middle
 * currency's week. Green up, red down, as everywhere.
 *
 * The user's design (2026-10-04), in three steps the same day: "the number of
 * items in each category is not interesting, better put the red/green number
 * there"; "for each category I want the summary of all values, not the top
 * one"; "this also makes the list cleaner since we won't need the subtitle".
 * Until then the row printed a count and, under its name, its largest mover,
 * which the top strip already shows.
 *
 * - **No subtitle.** A row is its name and its number. Do not put the lead
 *   mover back under it.
 * - **No count.**
 * - A list with no week prints its first row's level in plain ink (the best
 *   AI score, the nearest date); a list whose members are not one quantity
 *   prints nothing.
 */
const GroupRow = memo(function GroupRow({
  group,
  first,
  onPress,
}: {
  group: CatalogGroup;
  first: boolean;
  onPress: () => void;
}) {
  const { move, level, detail } = groupFigure(group);
  // Built with statements: a ternary holding `??` beside `||` is a shape the
  // compiler skips the whole component for (`react-compiler.test.ts`).
  const said: string[] = [];
  if (move) said.push(spokenDelta(move));
  else if (level) said.push(level);
  if (detail) said.push(detail);
  return (
    <MenuRow
      first={first}
      title={group.title}
      detailLabel={said.length > 0 ? said.join(', ') : undefined}
      figure={
        move ? (
          <DeltaChip delta={move} window={false} />
        ) : level ? (
          <Text variant="body" tone="secondary" style={styles.level}>
            {level}
          </Text>
        ) : undefined
      }
      trailing="push"
      onPress={onPress}
    />
  );
});

/** Each layer's count and what it is, in the globe's order of gravity. */
function hazardLayers(hazards: MenuHazards): { key: HazardKey; count: number; note: string }[] {
  const conflictDay = observationDate(hazards.conflict[0]?.eventDate);
  const week = hazards.conflictWeek;
  return [
    { key: 'genocide' as const, count: hazards.genocide.length, note: 'As determined by the UN' },
    {
      key: 'conflict' as const,
      count: week ? week.events.length : hazards.conflict.length,
      // UCDP publishes weeks behind events, so its dates are said, never
      // "today" (the reason `NOW` holds no conflict). With the week, the line
      // is its toll: the one place the whole week is added up.
      note: week
        ? `${weekWindow(week)}, the latest week from UCDP: ${weekLine(week)}. The globe shows its last day.`
        : conflictDay
          ? `Events recorded on ${conflictDay}, from UCDP`
          : 'From UCDP',
    },
    {
      key: 'famine' as const,
      count: hazards.famine.length,
      note:
        hazards.famineTotals.length > 0
          ? 'People in crisis or worse in each country analysed, and the areas in emergency or worse, from the IPC. A share is of the people analysed, not of the country.'
          : 'Areas in crisis or worse, from the IPC',
    },
    {
      key: 'disasters' as const,
      count: hazards.disasters.length,
      note: 'Earthquakes, storms, floods, volcanoes, droughts and wildfires, from GDACS',
    },
    {
      key: 'fires' as const,
      count: hazards.fires.length,
      note: 'Heat seen from space where the news is, from NASA FIRMS',
    },
  ].filter((layer) => layer.count > 0);
}

/** `world hazards` on the root. Its line is people where the app can count
 *  them: the conflict week's dead with its dates, the people in hunger
 *  (`hazardParts`). The layers counted in marks are its hint, and its line
 *  while nothing has loaded to count. */
const HazardsRow = memo(function HazardsRow({
  hazards,
  first,
  onPress,
}: {
  hazards: MenuHazards;
  first: boolean;
  onPress: (page: PageKey) => void;
}) {
  const layers = hazardLayers(hazards);
  if (layers.length === 0) return null;
  const counted = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  // The count of the list the row leads to: the week's, where it is held.
  const conflictCount = hazards.conflictWeek?.events.length ?? hazards.conflict.length;
  const marks = [
    conflictCount > 0 ? counted(conflictCount, 'conflict event', 'conflict events') : null,
    hazards.famine.length > 0
      ? counted(hazards.famine.length, 'famine area', 'famine areas')
      : null,
    hazards.disasters.length > 0
      ? counted(hazards.disasters.length, 'disaster', 'disasters')
      : null,
  ]
    .filter((p): p is string => p !== null)
    .slice(0, 2)
    .join(LEADERS_SEPARATOR);
  const people = hazardParts(hazards).join(LEADERS_SEPARATOR);
  return (
    <MenuRow
      first={first}
      title="world hazards"
      description={marks}
      detail={
        people ? (
          <Text variant="caption" style={styles.teaser}>
            {people}
          </Text>
        ) : undefined
      }
      detailLabel={people || undefined}
      trailing="push"
      onPress={() => onPress('world hazards')}
    />
  );
});

function HazardLayers({
  hazards,
  onPress,
}: {
  hazards: MenuHazards;
  onPress: (page: PageKey) => void;
}) {
  return (
    <>
      {hazardLayers(hazards).map((layer, i) => {
        // What leads the layer's list today (`lib/hazard-leaders.ts`). The
        // standing sentence — what the layer is and whose it is — stays the
        // screen reader's hint, and the line where a layer has nothing to
        // name; every page behind these rows names its source.
        const lead = hazardLead(layer.key, hazards);
        return (
          <MenuRow
            key={layer.key}
            first={i === 0}
            title={HAZARD_TITLES[layer.key]}
            description={layer.note}
            detail={
              lead ? (
                <Text variant="caption" style={styles.teaser}>
                  {lead}
                </Text>
              ) : undefined
            }
            detailLabel={lead || undefined}
            value={String(layer.count)}
            trailing="push"
            onPress={() => onPress(layer.key)}
          />
        );
      })}
    </>
  );
}

type StockFilter = 'all' | 'rising' | 'falling';
const STOCK_FILTERS: SegmentOption<StockFilter>[] = [
  { value: 'all', label: 'all' },
  { value: 'rising', label: 'rising' },
  { value: 'falling', label: 'falling' },
];

function RetainedListPage({ hidden, children }: { hidden: boolean; children: React.ReactNode }) {
  const [height, setHeight] = useState(0);
  return (
    <View
      onLayout={(event) => {
        if (!hidden) setHeight(event.nativeEvent.layout.height);
      }}
      style={hidden ? { position: 'absolute', width: '100%', height, opacity: 0 } : styles.listPage}
      pointerEvents={hidden ? 'none' : 'auto'}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
    >
      {children}
    </View>
  );
}

/**
 * One group's list. `stock markets` keeps the browser's filter and its tally;
 * every list opens with the line that says what its numbers are.
 */
function GroupPage({
  group,
  bottomInset,
  onSelect,
}: {
  group: CatalogGroup;
  bottomInset: number;
  onSelect: (row: CatalogRow) => void;
}) {
  const { colors } = useTheme();
  const [filter, setFilter] = useState<StockFilter>('all');
  const stocks = group.key === 'stocks';
  const rows = useMemo(
    () =>
      !stocks || filter === 'all'
        ? group.rows
        : group.rows.filter((r) => r.move?.direction === (filter === 'rising' ? 'up' : 'down')),
    [group.rows, stocks, filter],
  );
  // The tally counts exchanges: the fear index and the NASDAQ-100 share the
  // list, but a rising fear index is not a market rising, and neither has a
  // place on the globe.
  // Counted where the menu's overview counts, so the two lines are one number.
  const tally = stocks ? exchangeTally(group.rows) : null;
  const renderItem = useCallback(
    ({ item }: { item: CatalogRow }) => <InstrumentRow row={item} onPress={onSelect} />,
    [onSelect],
  );
  return (
    <>
      <View
        style={[styles.intro, stocks && { ...styles.introRuled, borderBottomColor: colors.rule }]}
      >
        {/* ▲▼, the rows' own marks. */}
        {tally ? (
          <Text variant="captionEmphasis">
            {tally.total} exchanges · ▲ {tally.rose} rising · ▼ {tally.fell} falling
          </Text>
        ) : null}
        <Text variant="caption">{GROUP_NOTES[group.key]}</Text>
        {stocks ? (
          <View style={styles.filters}>
            <SegmentedControl
              role="tab"
              size="compact"
              accessibilityLabel="Filter markets"
              options={STOCK_FILTERS}
              selected={filter}
              onSelect={setFilter}
            />
          </View>
        ) : null}
      </View>
      <SheetFlatList
        key={filter}
        data={rows}
        keyExtractor={rowKey}
        renderItem={renderItem}
        bottomInset={bottomInset}
        ListEmptyComponent={<EmptyState message="No matching markets" />}
      />
    </>
  );
}

const rowKey = (row: CatalogRow) => row.id;
const markKey = (row: HazardItem) => row.key;

/** A heading between a list's rows. */
type ListLabel = { key: string; label: string };
type HazardItem = MarkRowData | ListLabel;
const isListLabel = (item: HazardItem): item is ListLabel => 'label' in item;

/**
 * Disasters split by GDACS's own level. A feed of a hundred alerts is mostly
 * Green — small quakes, local floods — and the few Orange and Red ones were
 * rows among them, told apart only by a ring on their glyph.
 */
function withAlertHeadings(rows: MarkRowData[]): HazardItem[] {
  const serious = rows.filter((r) => r.alertlevel && r.alertlevel !== 'Green');
  const minor = rows.filter((r) => !r.alertlevel || r.alertlevel === 'Green');
  const items: HazardItem[] = [];
  if (serious.length > 0) {
    items.push({ key: 'label-serious', label: 'red and orange alerts' }, ...serious);
  }
  if (minor.length > 0) items.push({ key: 'label-minor', label: 'minor alerts' }, ...minor);
  return items;
}

function HazardPage({
  layer,
  hazards,
  bottomInset,
  onSelect,
}: {
  layer: HazardKey;
  hazards: MenuHazards;
  bottomInset: number;
  onSelect: (result: TapResult) => void;
}) {
  const rows = useMemo<HazardItem[]>(() => hazardItems(layer, hazards), [layer, hazards]);
  const note = hazardLayers(hazards).find((l) => l.key === layer)?.note;
  const renderItem = useCallback(
    ({ item, index }: { item: HazardItem; index: number }) =>
      isListLabel(item) ? (
        <SectionLabel label={item.label} first={index === 0} />
      ) : (
        <MarkRow row={item} onPress={onSelect} />
      ),
    [onSelect],
  );
  return (
    <SheetFlatList
      data={rows}
      keyExtractor={markKey}
      renderItem={renderItem}
      {...LIST_WINDOW}
      bottomInset={bottomInset}
      contentContainerStyle={styles.markList}
      ListHeaderComponent={
        note ? (
          <Text variant="caption" style={styles.markNote}>
            {note}
          </Text>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  // `flexShrink`, never `flex`: the sheet is content-sized, and `flex: 1`
  // measures to nothing in an auto-height column (see `SheetSearchPage`).
  listPage: { flexShrink: 1 },
  lockup: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  intro: {
    paddingHorizontal: SPACING.screenPadding,
    gap: SPACING.xs,
    paddingBottom: SPACING.md,
  },
  introRuled: { borderBottomWidth: StyleSheet.hairlineWidth },
  filters: { paddingTop: SPACING.sm },
  teaser: { flexShrink: 1 },
  // A level at the row's edge, digit for digit under the chips above it.
  level: { fontVariant: ['tabular-nums'] },
  markList: { paddingHorizontal: SPACING.screenPadding },
  markNote: { paddingBottom: SPACING.sm },
  eraseHeading: {
    marginBottom: SPACING.xs,
  },
  erasePill: {
    marginTop: SPACING.md,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: LAYOUT.controlHeight,
    paddingHorizontal: SPACING.lg,
    borderRadius: LAYOUT.controlHeight / 2,
    // Outlined, not filled: a destructive control should read as deliberate
    // rather than inviting.
    borderWidth: StyleSheet.hairlineWidth,
  },
});
