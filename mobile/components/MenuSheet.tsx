import { METRICS, type MetricKey } from '@shared/countries/country-ranking';
import type { Category, GdacsDetail, GroupedArticles } from '@shared/types';
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
import { AccessibilityInfo, Linking, StyleSheet, type TextStyle, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { LayoutAnimationConfig } from 'react-native-reanimated';
import {
  type AppearanceMode,
  baseFontSize,
  FONT_SOURCE,
  FONT_SYSTEM,
  type FontFamily,
  type FontSize,
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
import {
  formatBytes,
  getSnapshot as getDataUsage,
  subscribe as subscribeDataUsage,
} from '../lib/data-usage';
import { hapticTick } from '../lib/haptics';
import { hazardLead } from '../lib/hazard-leaders';
import {
  type CatalogGroup,
  type CatalogRow,
  GROUP_TITLES,
  type GroupKey,
} from '../lib/instrument-catalog';
import { listContext, menuCard } from '../lib/instrument-presentation';
import {
  HAZARD_TITLES,
  type HazardItem,
  type HazardKey,
  type HazardLayer,
  hazardItems,
  hazardLayers,
  isListLabel,
  type MenuHazards,
  markDetail,
} from '../lib/menu-hazards';
import { metricGroups, rankingLeaders } from '../lib/metric-groups';
import type { RiverArticle } from '../lib/news-order';
import { resetOnboarding } from '../lib/onboarding-store';
import { MARKET_CAVEAT } from '../lib/predictions';
import { LEADERS_SEPARATOR } from '../lib/row-leaders';
import type { TapResult } from '../lib/tap-result';
import { groupFigure, hazardParts } from '../lib/world-summary';
import { DeltaChip } from './DeltaChip';
import { EmptyState } from './EmptyState';
import { InstrumentRow } from './InstrumentRow';
import { ListIntro, listStyles } from './ListRow';
import { MarkRow } from './MarkRow';
import {
  type MenuDetail,
  MenuDetailPage,
  menuDetailHandleTitle,
  menuDetailLabel,
} from './MenuDetail';
import { MenuControlRow, MenuRow, SectionLabel } from './MenuRow';
import { Text } from './primitives';
import { SegmentedControl, type SegmentOption } from './SegmentedControl';
import { SheetAboutPage } from './SheetAboutPage';
import { SheetBookmarksPage } from './SheetBookmarksPage';
import { SheetFlatList, SheetScrollView } from './SheetContent';
import { SheetHandle } from './SheetHandle';
import { type BaseSheetProps, SheetLayout } from './SheetLayout';
import { SheetMapKeyPage } from './SheetMapKeyPage';
import { SheetPager } from './SheetPager';
import { SheetPrivacyPage } from './SheetPrivacyPage';
import { SheetSearchPage } from './SheetSearchPage';
import { Toggle } from './Toggle';

const APP_VERSION = Constants.expoConfig?.version ?? '';
const CONTACT_EMAIL = 'contact@zuhd.news';

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

type PageKey =
  | 'privacy'
  | 'about'
  | 'settings'
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
 * The line over each group's list: what every row shares, said once — the
 * unit, and the window the moves cover. A row hides the week, as the strip
 * does, and prints only a window that is not the list's. What the list's own
 * figure is stands beside it, as a word (`GroupFigure.measure`).
 */
const GROUP_NOTES: Readonly<Record<GroupKey, string>> = {
  stocks: 'Index points',
  companies: 'Share prices',
  straits: 'Ships a day',
  // The reading is the rate and the move is the currency's own, so the two
  // can point opposite ways.
  currencies: 'Units per US dollar · up means stronger',
  energy: 'Prices',
  food: 'Prices',
  metals: 'Prices',
  rates: 'Policy rates',
  inflation: 'Annual consumer-price inflation',
  jobs: 'US unemployment rate',
  borrowing: 'Bond yields and mortgage rates',
  other: 'Each reading names its unit and window',
  crypto: 'Prices',
  // The margin is said here, over the rows: a list has an order, and without
  // it the order reads as a ranking the measure cannot support.
  ai: 'Each lab’s best Epoch AI score. A few points apart is within the margin.',
  predictions: `Prices from ${MARKET_CAVEAT}`,
  calendar: '',
};

const METRIC_KEYS = Object.keys(METRICS) as MetricKey[];

/** A list page's rows are the only thing that scrolls, and each hazard row
 *  is a canvas: build a screenful, not a hundred. */
const LIST_WINDOW = { initialNumToRender: 12, windowSize: 5, maxToRenderPerBatch: 12 } as const;

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
  const { typography } = useTheme();
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
      const card = menuCard(row);
      if (!card) {
        onSelectRow(row);
        return;
      }
      onFocusRow(row);
      openDetail({ kind: 'card', card });
    },
    [onFocusRow, onSelectRow, openDetail],
  );
  const handleMark = useCallback(
    (result: TapResult) => {
      const detail = markDetail(result, hazards);
      if (!detail) return;
      onFocusMark(result);
      openDetail(
        detail.kind === 'country' && nav.current === 'famine'
          ? { ...detail, leadingFact: 'hunger' }
          : detail,
      );
    },
    [hazards, onFocusMark, openDetail, nav.current],
  );
  const handleGroup = useCallback(
    (group: CatalogGroup) => {
      const only = group.rows.length === 1 ? group.rows[0] : undefined;
      if (only?.card) handleRow(only);
      else navPush(group.key);
    },
    [handleRow, navPush],
  );

  useEffect(() => {
    StoreReview.hasAction()
      .then(setCanRate)
      .catch(() => {});
  }, []);

  const handle = (
    <SheetHandle
      title={
        currentDetail
          ? menuDetailHandleTitle(currentDetail)
          : nav.current
            ? pageTitle(nav.current)
            : undefined
      }
      onBack={nav.depth > 0 ? navPop : undefined}
      pageKey={nav.current ?? 'root'}
      move={nav.move}
    />
  );

  // The pages stay when the menu closes; `rootKey` decides where it opens.
  const handleDismiss = onDismiss;

  const { gesture: swipeBack, drag: backDrag } = useSheetBackNavigation({
    canGoBack: nav.depth > 0,
    onBack: navPop,
  });

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

  // Each layer's count and line, once for the root's row, the index of layers
  // and the open layer's page.
  const layers = hazardLayers(hazards);

  // Declared before the return, where React Compiler can read it: hoisted from
  // after it, the whole menu silently skipped the compiler.
  function renderPage() {
    const current = nav.current;
    if (current === 'world hazards') {
      return <HazardLayers layers={layers} hazards={hazards} onPress={navPush} />;
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
                // The row says who leads; the measure's definition opens
                // its own page, and is the screen reader's hint here.
                const leaders = rankingLeaders(key);
                return (
                  <MenuRow
                    key={key}
                    first={i === 0}
                    title={METRICS[key].label}
                    hint={METRICS[key].description}
                    teaser={leaders.join(LEADERS_SEPARATOR)}
                    teaserLabel={leaders.length > 0 ? `led by ${leaders.join(', ')}` : undefined}
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
      return (
        <>
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

          <SectionLabel label="data" />
          <DataUsedRow />
          <SectionLabel label="help & about" />
          <MenuRow
            first
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
              title="rate the app"
              // Not "in the App Store" — this row also ships on Google Play.
              accessibilityLabel="Rate zuhd.news"
              onPress={() => {
                StoreReview.requestReview().catch(() => {});
              }}
            />
          )}
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

    if (current === 'privacy') {
      return <SheetPrivacyPage onToast={onToast} />;
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
      // One height for every page, so only the page moves between them.
      fill
    >
      <SheetPager pageKey={nav.current ?? 'root'} move={nav.move} drag={backDrag}>
        {/* Back reveals the same menu, including its scroll position. Rebuilding
            these rows also rebuilt every press animation on each return. */}
        <RetainedListPage hidden={nav.current !== null}>
          <LayoutAnimationConfig skipEntering>
            <SheetScrollView bottomInset={bottomInset} style={styles.listPage}>
              <MenuRootPage
                catalog={catalog}
                hazards={hazards}
                hasLayers={layers.length > 0}
                navPush={navPush}
                onGroup={handleGroup}
              />
            </SheetScrollView>
          </LayoutAnimationConfig>
        </RetainedListPage>
        {nav.current === null ? null : nav.current === 'search' ? (
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
                    note={layers.find((l) => l.key === keptHazard)?.note}
                    hazards={hazards}
                    bottomInset={bottomInset}
                    onSelect={handleMark}
                  />
                </RetainedListPage>
              ) : groupKey ? (
                <EmptyState message="Nothing to list right now" />
              ) : null}
              {currentDetail ? (
                // The page arrives as one (`SheetPager`): a body's own
                // staggered entrance is its sheet's, not a page's.
                <LayoutAnimationConfig skipEntering key={nav.current}>
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
                </LayoutAnimationConfig>
              ) : null}
            </View>
          </GestureDetector>
        ) : (
          <GestureDetector gesture={swipeBack}>
            {/* Each page owns its scroll origin; reusing the native scroll view
                carried the menu's offset into rankings, settings and prose.
                What mounts with the page skips its entrance; what mounts
                later (a story restored to saved) keeps it. */}
            <LayoutAnimationConfig skipEntering key={nav.current ?? 'root'}>
              <SheetScrollView bottomInset={bottomInset} style={styles.listPage}>
                {renderPage()}
              </SheetScrollView>
            </LayoutAnimationConfig>
          </GestureDetector>
        )}
      </SheetPager>
    </SheetLayout>
  );
});

const MENU_SECTIONS = ['markets & trade', 'economy', 'explore'] as const;
const MENU_SECTION: Record<GroupKey, (typeof MENU_SECTIONS)[number]> = {
  stocks: 'markets & trade',
  companies: 'markets & trade',
  currencies: 'markets & trade',
  crypto: 'markets & trade',
  energy: 'markets & trade',
  food: 'markets & trade',
  metals: 'markets & trade',
  straits: 'markets & trade',
  rates: 'economy',
  borrowing: 'economy',
  inflation: 'economy',
  jobs: 'economy',
  other: 'economy',
  ai: 'explore',
  predictions: 'explore',
  calendar: 'explore',
};

/** The root does not depend on the current page. Keeping its callbacks here
 * lets React Compiler reuse the rows while navigation hides or reveals them. */
function MenuRootPage({
  catalog,
  hazards,
  hasLayers,
  navPush,
  onGroup,
}: {
  catalog: CatalogGroup[];
  hazards: MenuHazards;
  hasLayers: boolean;
  navPush: (page: PageKey) => void;
  onGroup: (group: CatalogGroup) => void;
}) {
  return (
    <>
      {MENU_SECTIONS.map((section, sectionIndex) => {
        const groups = catalog.filter((group) => MENU_SECTION[group.key] === section);
        if (groups.length === 0 && section !== 'explore') return null;
        return (
          <Fragment key={section}>
            <SectionLabel label={section} first={sectionIndex === 0} />
            {sectionIndex === 0 ? (
              <Text variant="caption" tone="secondary">
                7-day changes unless noted
              </Text>
            ) : section === 'economy' ? (
              <Text variant="caption" tone="secondary">
                Monthly changes unless noted
              </Text>
            ) : null}
            {groups.map((group, i) => (
              <GroupRow
                key={group.key}
                group={group}
                first={i === 0}
                onPress={() => onGroup(group)}
              />
            ))}
          </Fragment>
        );
      })}
      <HazardsRow
        hazards={hazards}
        listed={hasLayers}
        first={!catalog.some((group) => MENU_SECTION[group.key] === 'explore')}
        onPress={navPush}
      />
      {/* A root row is its name: what it opens is a screen reader's hint. */}
      <MenuRow
        title="country rankings"
        hint={`Every country by ${METRICS.population.label}, ${METRICS.gdp.label.toUpperCase()} and ${METRIC_KEYS.length - 2} more measures`}
        trailing="push"
        onPress={() => navPush('country rankings')}
      />

      <SectionLabel label="tools" />
      <MenuRow
        first
        title="search"
        hint="Recent stories, by title, topic or place"
        trailing="push"
        onPress={() => navPush('search')}
      />
      <SavedRow onPress={() => navPush('saved')} />
      <MenuRow
        title="map key"
        hint="What each mark on the globe means"
        trailing="push"
        onPress={() => navPush('map key')}
      />

      <MenuRow
        title="settings"
        hint="Text size, appearance, notifications, privacy, contact"
        trailing="push"
        onPress={() => navPush('settings')}
      />
    </>
  );
}

/**
 * The saved row, subscribed to the bookmarks itself: saving a story re-renders
 * this row, not the menu. The house rule — what changes re-renders only what
 * shows it.
 */
const SavedRow = memo(function SavedRow({ onPress }: { onPress: () => void }) {
  const bookmarks = useSyncExternalStore(subscribeBookmarks, getBookmarks);
  const count = bookmarks.length;
  return (
    <MenuRow
      title="saved"
      hint="Stories you have kept"
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
 * - AI uses a labelled 90-day average point gain; dates show the nearest
 *   event. A list whose members are not one quantity prints nothing.
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
  const { move, level, detail, coverage } = groupFigure(group);
  // Built with statements: a ternary holding `??` beside `||` is a shape the
  // compiler skips the whole component for (`react-compiler.test.ts`).
  const said: string[] = [];
  // A level is the row's `value`, which the row speaks itself.
  if (move) said.push(spokenDelta(move));
  else if (group.key === 'ai' && level) said.push(level, 'current score');
  if (detail) said.push(detail);
  if (coverage) said.push(coverage);
  let exception =
    group.key === 'ai' && move
      ? '90-day average'
      : move && move.window !== 'over 7 days'
        ? 'monthly'
        : group.key === 'ai'
          ? 'average score'
          : undefined;
  if (MENU_SECTION[group.key] === 'economy' && move) {
    exception =
      move.window === 'on the month'
        ? undefined
        : move.window === 'over 7 days'
          ? '7 days'
          : move.window;
  }
  return (
    <MenuRow
      first={first}
      title={group.title}
      figureLabel={said.length > 0 ? said.join(', ') : undefined}
      // The size the list's own page and its rows print a move at.
      figure={
        move || exception ? (
          <View style={styles.groupFigure}>
            {move ? (
              <DeltaChip delta={move} window={false} scale={1} />
            ) : (
              <Text variant="tabularEmphasis">{level}</Text>
            )}
            {exception ? (
              <Text variant="caption" tone="secondary">
                {exception}
              </Text>
            ) : null}
          </View>
        ) : undefined
      }
      value={move || exception ? undefined : level}
      trailing="push"
      onPress={onPress}
    />
  );
});

/** `world hazards` on the root. Its line is people where the app can count
 *  them: the conflict week's dead with its dates, the people in hunger
 *  (`hazardParts`). The layers counted in marks are its hint, and its line
 *  while nothing has loaded to count. */
const HazardsRow = memo(function HazardsRow({
  hazards,
  listed,
  first,
  onPress,
}: {
  hazards: MenuHazards;
  /** Whether any layer has a mark to list. */
  listed: boolean;
  first: boolean;
  onPress: (page: PageKey) => void;
}) {
  if (!listed) return null;
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
      teaser={people}
      trailing="push"
      onPress={() => onPress('world hazards')}
    />
  );
});

function HazardLayers({
  layers,
  hazards,
  onPress,
}: {
  layers: HazardLayer[];
  hazards: MenuHazards;
  onPress: (page: PageKey) => void;
}) {
  return (
    <>
      {layers.map((layer, i) => {
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
            teaser={lead}
            value={String(layer.count)}
            trailing="push"
            onPress={() => onPress(layer.key)}
          />
        );
      })}
    </>
  );
}

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
 * One group's list, under the line that says what its rows share and the
 * list's own figure: the number its row on the root prints, named.
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
  const context = useMemo(() => listContext(group), [group]);
  const time =
    context.window === 'over 7 days'
      ? '7-day changes'
      : context.window === 'on the month'
        ? 'Monthly changes'
        : context.window
          ? `Changes ${context.window}`
          : '';
  const pointChanges = ['rates', 'borrowing', 'inflation', 'jobs', 'predictions'].includes(
    group.key,
  );
  const note = [
    GROUP_NOTES[group.key],
    group.key === 'ai' ? groupFigure(group).coverage : undefined,
    context.dateLabel,
    time && `${time}${pointChanges ? ' in percentage points' : ''}`,
  ]
    .filter(Boolean)
    .join(' · ');
  const renderItem = useCallback(
    ({ item, index }: { item: CatalogRow; index: number }) => (
      <InstrumentRow row={item} first={index === 0} onPress={onSelect} context={context} />
    ),
    [onSelect, context],
  );
  return (
    <SheetFlatList
      data={group.rows}
      keyExtractor={rowKey}
      renderItem={renderItem}
      bottomInset={bottomInset}
      contentContainerStyle={listStyles.content}
      ListHeaderComponent={<ListIntro note={note} />}
      ListEmptyComponent={<EmptyState message="No readings available" />}
    />
  );
}

const rowKey = (row: CatalogRow) => row.id;
const markKey = (row: HazardItem) => row.key;

function HazardPage({
  layer,
  note,
  hazards,
  bottomInset,
  onSelect,
}: {
  layer: HazardKey;
  /** The layer's line: its source, and what its rows share. */
  note?: string;
  hazards: MenuHazards;
  bottomInset: number;
  onSelect: (result: TapResult) => void;
}) {
  const rows = useMemo<HazardItem[]>(() => hazardItems(layer, hazards), [layer, hazards]);
  const renderItem = useCallback(
    ({ item, index }: { item: HazardItem; index: number }) => {
      if (isListLabel(item)) {
        return (
          <>
            <SectionLabel label={item.label} first={index === 0} />
            {item.note ? <Text variant="caption">{item.note}</Text> : null}
          </>
        );
      }
      // The row under a heading opens its group: no rule above it.
      const before = rows[index - 1];
      return <MarkRow row={item} first={!before || isListLabel(before)} onPress={onSelect} />;
    },
    [onSelect, rows],
  );
  return (
    <SheetFlatList
      data={rows}
      keyExtractor={markKey}
      renderItem={renderItem}
      {...LIST_WINDOW}
      bottomInset={bottomInset}
      contentContainerStyle={listStyles.content}
      ListHeaderComponent={<ListIntro note={note} />}
    />
  );
}

const styles = StyleSheet.create({
  // The menu holds one height (`fill`), so a page fills it: the swipe back
  // works under a short list too.
  listPage: { flex: 1 },
  // The list's figure and its name, as one unit.
  groupFigure: { alignItems: 'flex-end', gap: SPACING.xs },
});
