import {
  getMetricValue,
  getRanking,
  METRICS,
  type MetricKey,
} from '@shared/countries/country-ranking';
import type { GdacsAlert } from '@shared/types';
import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { LayoutAnimationConfig } from 'react-native-reanimated';
import { MAX_FONT_SCALE, OPACITY, SPACING } from '../constants/theme';
import { useSheetBackNavigation } from '../hooks/useSheetBackNavigation';
import { useSheetNavigation } from '../hooks/useSheetNavigation';
import { useTheme } from '../hooks/useTheme';
import { announce } from '../lib/announce';
import type { CountryFact } from '../lib/country-hazards';
import { EVENT_TYPE_LABEL, parseSeverityHero } from '../lib/gdacs';
import { displayCountryName, displayLocation } from '../lib/place-names';
import { staggerEnter } from '../lib/stagger';
import type { TapResult } from '../lib/tap-result';
import { CountryRankingView } from './CountryRankingView';
import { CountryCardsCarousel } from './country-cards/CountryCardsCarousel';
import { FlagGlyph } from './FlagChip';
import { ListRow, RowReading } from './ListRow';
import { MarkIcon } from './MarkGlyph';
import { MenuRow, SectionLabel } from './MenuRow';
import { Icon, Text } from './primitives';
import { SheetScrollView } from './SheetContent';
import { SheetHandle } from './SheetHandle';
import { type BaseSheetProps, SheetLayout } from './SheetLayout';
import { SheetPager } from './SheetPager';

/** Every ranked measure, named as the rankings list names it (`METRICS`): one
 *  list, so a measure reads the same on a country as on its ranking. */
const COUNTRY_METRICS = Object.keys(METRICS) as MetricKey[];

// Where the rank stands among every country ranked: a dot on a quiet rule,
// first at the right. A place, never a medal: rank one is the largest value,
// which is the most refugees produced and the most carbon as surely as the
// longest lives, so the dot is not gold at the top and the rule is not filled
// up to it like a bar of progress.
const STRIP_WIDTH = 44;
const STRIP_DOT_SIZE = 4;
const STRIP_HEIGHT = 10;
const STRIP_RULE_HEIGHT = 2;
/** The rank's column, `#193` at its widest, digit under digit. */
const RANK_COLUMN = 34;
/** A metric row's mark: the rank, then where that rank stands. */
const METRIC_LEADING = RANK_COLUMN + SPACING.sm + STRIP_WIDTH;

function PercentileStrip({ rank, total }: { rank: number | null; total: number }) {
  const { colors } = useTheme();
  if (rank == null || total < 2) return <View style={styles.strip} />;
  const percentile = Math.max(0, Math.min(1, (total - rank) / (total - 1)));
  const dotLeft = percentile * STRIP_WIDTH - STRIP_DOT_SIZE / 2;
  // The rule in `textSecondary` at a muted step: `colors.rule` was too faint
  // here (tuned for row dividers, not a scale).
  return (
    <View style={styles.strip}>
      <View style={[styles.stripRule, { backgroundColor: colors.textSecondary }]} />
      <View style={[styles.stripDot, { left: dotLeft, backgroundColor: colors.textEmphasis }]} />
    </View>
  );
}

/**
 * One of the country's ranked metrics: the list's own row (`ListRow`), with
 * the rank and its strip as the mark and the reading as the ranking page that
 * it opens prints it. It was a row of its own, ruled under instead of over.
 */
function MoreRow({
  label,
  value,
  rank,
  total,
  first,
  onPress,
}: {
  label: string;
  value: string;
  rank: number | null;
  total: number;
  first: boolean;
  onPress: () => void;
}) {
  const hasRank = typeof rank === 'number' && rank > 0;
  return (
    <ListRow
      title={label}
      titleLines={1}
      first={first}
      onPress={onPress}
      accessibilityLabel={`${label}: ${value}${rank ? `, ranked ${rank} of ${total}` : ''}`}
      leadingWidth={METRIC_LEADING}
      leading={
        <View style={styles.metricMark}>
          {/* A column of figures, so it holds its width at any text size. */}
          <Text
            variant="labelXs"
            tone="secondary"
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_FONT_SCALE.tabular}
            style={styles.rankCol}
          >
            {hasRank ? `#${rank}` : ''}
          </Text>
          <PercentileStrip rank={rank} total={total} />
        </View>
      }
      trailing={
        <View style={styles.moreRight}>
          <RowReading>{value}</RowReading>
          <Icon name="chevron-forward" size="sm" tone="secondary" />
        </View>
      }
    />
  );
}

type CountrySheetProps = BaseSheetProps & Omit<CountryBodyProps, 'onRankingPress'>;

export interface CountryHazard {
  key: string;
  title: string;
  detail: string;
  onPress: () => void;
}

/** One alert touching the country: the hazard's own glyph, as its mark and
 *  its row in `disasters` draw it, and the alert's measure. */
function AlertRow({
  alert,
  first,
  onPress,
}: {
  alert: GdacsAlert;
  first: boolean;
  onPress: (alert: GdacsAlert) => void;
}) {
  const handlePress = useCallback(() => onPress(alert), [alert, onPress]);
  const measure = alert.eventtype === 'FL' ? parseSeverityHero(alert).focal : alert.severityText;
  return (
    <ListRow
      title={EVENT_TYPE_LABEL[alert.eventtype]}
      titleLines={1}
      first={first}
      onPress={handlePress}
      accessibilityLabel={`${alert.alertlevel} alert: ${EVENT_TYPE_LABEL[alert.eventtype]}`}
      leading={
        <MarkIcon
          mark={{ kind: 'gdacs', eventtype: alert.eventtype, red: alert.alertlevel === 'Red' }}
        />
      }
      trailing={<Icon name="chevron-forward" size="sm" tone="secondary" />}
    >
      {measure ? (
        <Text variant="caption" numberOfLines={1}>
          {measure}
        </Text>
      ) : null}
    </ListRow>
  );
}

/** The capital and the local time, when known: printed "Cairo · 14:32". */
function countryDatelineParts(country: TapResult | null): string[] {
  if (!country?.data) return [];
  const parts: string[] = [];
  const capital = displayLocation(country.data.capital);
  if (capital) parts.push(capital);
  if (country.localTime) parts.push(country.localTime);
  return parts;
}

/**
 * The country as a handle's title: its flag and name, and the capital with
 * the local time. Shared by this sheet and the menu, where a country opened
 * from a ranking is a page of its own.
 */
export function CountryTitle({
  country,
  hasBack,
}: {
  country: TapResult | null;
  hasBack: boolean;
}) {
  const flag = country?.data?.flag;
  const name = displayCountryName(country?.countryName ?? null);
  const parts = countryDatelineParts(country);
  const dateline = parts.join(' · ');
  if (!flag && !name) return null;
  return (
    // One heading, as a string title is: the rotor's way to the sheet's top,
    // read "Egypt, Cairo, 14:32".
    <View
      style={[styles.handleRow, hasBack && styles.handleRowWithBack]}
      accessible
      accessibilityRole="header"
      accessibilityLabel={[name, ...parts].filter(Boolean).join(', ')}
    >
      <View style={styles.handleIdent}>
        {flag && <FlagGlyph flag={flag} size="inline" />}
        {/* 21pt semibold so the country name reads as the canonical
         *  identifier above every card headline (also 21pt) and metric
         *  row label (13pt small-caps). `flexShrink` lets a long name
         *  (e.g. Bosnia and Herzegovina) ellipsize before pushing the
         *  meta off the right edge. */}
        {name && (
          <Text variant="title" tone="emphasis" numberOfLines={1} style={styles.handleName}>
            {name}
          </Text>
        )}
      </View>
      {dateline ? (
        <Text variant="labelXs" tone="secondary" numberOfLines={1} style={styles.handleMeta}>
          {dateline}
        </Text>
      ) : null}
    </View>
  );
}

interface CountryBodyProps {
  country: TapResult | null;
  /** GDACS alerts whose primary or affected-country list includes this
   *  country. Empty when there are no active disaster alerts touching it. */
  activeAlerts?: GdacsAlert[];
  /** Called when the user taps an alert chip — opens the disaster. */
  onAlertPress?: (alert: GdacsAlert) => void;
  /**
   * The hazard marks the globe draws in this country — famine classifications
   * and genocide determinations. The globe's gesture layer is hidden from
   * screen readers, so these rows are the accessible path to those marks.
   */
  hazards?: CountryHazard[];
  /**
   * What the hazard sources count in the country as a whole — its people in
   * crisis, its week of conflict (`countryFacts`). Statements with their
   * source and dates, not rows: they open nothing.
   */
  facts?: CountryFact[];
  /** Preserve the subject followed from a hazard list. */
  leadingFact?: string;
  /** A metric row opens that metric's ranking, with this country marked. */
  onRankingPress: (metric: MetricKey) => void;
}

interface MetricRow {
  key: MetricKey;
  label: string;
  value: string;
  rank: number | null;
  total: number;
}

/** A country's place in one ranking: 1-based, or null where it is not ranked. */
function rankIn(metric: MetricKey, countryName: string): { rank: number | null; total: number } {
  const entries = getRanking(metric);
  const idx = entries.findIndex((e) => e.name === countryName);
  return { rank: idx >= 0 ? idx + 1 : null, total: entries.length };
}

/**
 * The country's metrics with its place in each, best placed first and the
 * unranked last. A plain function: `CountryBody` is compiled, which keeps the
 * result until the country changes — the two `useMemo`s it was built in
 * listed dependencies the compiler could not keep, so the body skipped it.
 */
function metricRows(country: TapResult | null): MetricRow[] {
  if (!country?.data) return [];
  const name = country.countryName;
  const rows: MetricRow[] = [];
  for (const key of COUNTRY_METRICS) {
    const value = getMetricValue(name ?? '', country.data, key);
    if (value == null) continue;
    const { rank, total } = name ? rankIn(key, name) : { rank: null, total: 0 };
    rows.push({ key, label: METRICS[key].label, value, rank, total });
  }
  rows.sort((a, b) => {
    if (a.rank == null && b.rank == null) return 0;
    if (a.rank == null) return 1;
    if (b.rank == null) return -1;
    return a.rank - b.rank;
  });
  return rows;
}

function CountryFactView({ fact }: { fact: CountryFact }) {
  return (
    <View>
      <SectionLabel label={fact.heading} />
      <Text variant="bodyEmphasis" tone="emphasis" selectable>
        {fact.title}
      </Text>
      <Text variant="caption" style={styles.factDetail}>
        {fact.detail}
      </Text>
    </View>
  );
}

/** The country's cards, its ranked metrics, its alerts and the marks in it —
 *  the sheet's content without the sheet, which the menu shows as a page. */
export const CountryBody = memo(function CountryBody({
  country,
  activeAlerts,
  onAlertPress,
  hazards,
  facts,
  leadingFact,
  onRankingPress,
}: CountryBodyProps) {
  const rankedRows = metricRows(country);

  return (
    <>
      {facts
        ?.filter((fact) => fact.key === leadingFact)
        .map((fact) => (
          <CountryFactView key={fact.key} fact={fact} />
        ))}
      {country?.countryName && (
        <Animated.View entering={staggerEnter(0)}>
          <CountryCardsCarousel key={country.countryName} countryName={country.countryName} />
        </Animated.View>
      )}
      {country?.data && (
        <Animated.View entering={staggerEnter(1)}>
          {rankedRows.map((r, i) => (
            <MoreRow
              key={r.key}
              first={i === 0}
              label={r.label}
              value={r.value}
              rank={r.rank}
              total={r.total}
              onPress={() => onRankingPress(r.key)}
            />
          ))}
        </Animated.View>
      )}
      {activeAlerts && activeAlerts.length > 0 && onAlertPress && (
        <Animated.View entering={staggerEnter(2)}>
          <SectionLabel
            label={
              activeAlerts.length === 1 ? 'active alert' : `${activeAlerts.length} active alerts`
            }
          />
          {activeAlerts.map((a, i) => (
            <AlertRow key={a.eventid} alert={a} first={i === 0} onPress={onAlertPress} />
          ))}
        </Animated.View>
      )}
      {facts
        ?.filter((fact) => fact.key !== leadingFact)
        .map((fact) => (
          <CountryFactView key={fact.key} fact={fact} />
        ))}
      {hazards && hazards.length > 0 && (
        <Animated.View entering={staggerEnter(3)}>
          <SectionLabel label="on the map" />
          {hazards.map((h, i) => (
            <MenuRow
              key={h.key}
              first={i === 0}
              title={h.title}
              description={h.detail}
              accessibilityLabel={`${h.title}, ${h.detail}`}
              trailing="push"
              onPress={h.onPress}
            />
          ))}
        </Animated.View>
      )}
    </>
  );
});

export const CountrySheet = memo(function CountrySheet({
  sheetRef,
  country,
  activeAlerts,
  onAlertPress,
  hazards,
  facts,
  bottomInset,
  onDismiss,
}: CountrySheetProps) {
  // Two pages: the country, and one of its rankings.
  const nav = useSheetNavigation<MetricKey>();
  const { push, pop, reset } = nav;
  const activeRanking = nav.current;

  // A page is said as it arrives, as the menu's are: the ranking a row opened,
  // and the country again on the way back, by any of the three backs.
  const countryName = displayCountryName(country?.countryName ?? null);
  const openRanking = useCallback(
    (metric: MetricKey) => {
      push(metric);
      announce(METRICS[metric]?.label ?? 'ranking');
    },
    [push],
  );
  const back = useCallback(() => {
    pop();
    if (countryName) announce(countryName);
  }, [pop, countryName]);

  const hasBack = activeRanking !== null;
  const handle = (
    <SheetHandle
      onBack={hasBack ? back : undefined}
      title={<CountryTitle country={country} hasBack={hasBack} />}
    />
  );

  const handleDismiss = useCallback(() => {
    reset();
    onDismiss();
  }, [reset, onDismiss]);

  // A left-edge swipe pops the ranking sub-page. Shared with MenuSheet so
  // every multi-page sheet goes back identically (DESIGN §Sheets).
  const { gesture: swipeBack, drag: backDrag } = useSheetBackNavigation({
    canGoBack: hasBack,
    onBack: back,
  });

  return (
    <SheetLayout
      sheetRef={sheetRef}
      handle={handle}
      onDismiss={handleDismiss}
      onBackPress={hasBack ? back : undefined}
      // One height for both pages, so only the page moves between them.
      fill
    >
      <SheetPager pageKey={activeRanking ?? 'country'} move={nav.move} drag={backDrag}>
        {activeRanking ? (
          <GestureDetector gesture={swipeBack}>
            <View style={styles.page}>
              <CountryRankingView
                metric={activeRanking}
                currentCountryName={country?.countryName ?? null}
                bottomInset={bottomInset}
                onRequestClose={() => sheetRef.current?.dismiss()}
              />
            </View>
          </GestureDetector>
        ) : (
          // The blocks rise as the sheet opens; back from a ranking, the page
          // arrives as one.
          <LayoutAnimationConfig skipEntering={nav.move.direction !== 0}>
            <SheetScrollView bottomInset={bottomInset} style={styles.page}>
              <CountryBody
                country={country}
                activeAlerts={activeAlerts}
                onAlertPress={onAlertPress}
                hazards={hazards}
                facts={facts}
                onRankingPress={openRanking}
              />
            </SheetScrollView>
          </LayoutAnimationConfig>
        )}
      </SheetPager>
    </SheetLayout>
  );
});

const styles = StyleSheet.create({
  // The sheet holds one height (`fill`), so a page fills it. The view is the
  // ref-holding child the swipe back attaches to.
  page: { flex: 1 },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: SPACING.screenPadding,
    gap: SPACING.md,
  },
  // When the back chevron is present (absolute-positioned at screenPadding),
  // shift the row content right so flag/name don't sit under the chevron.
  handleRowWithBack: {
    paddingLeft: SPACING.screenPadding + SPACING.lg,
  },
  handleIdent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flexShrink: 1,
    minWidth: 0,
  },
  handleName: {
    flexShrink: 1,
  },
  handleMeta: {
    flexShrink: 0,
    textAlign: 'right',
  },
  metricMark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  rankCol: {
    width: RANK_COLUMN,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  moreRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  strip: {
    width: STRIP_WIDTH,
    height: STRIP_HEIGHT,
    justifyContent: 'center',
  },
  stripRule: {
    height: STRIP_RULE_HEIGHT,
    opacity: OPACITY.muted,
  },
  stripDot: {
    position: 'absolute',
    top: (STRIP_HEIGHT - STRIP_DOT_SIZE) / 2,
    width: STRIP_DOT_SIZE,
    height: STRIP_DOT_SIZE,
    borderRadius: STRIP_DOT_SIZE / 2,
  },
  factDetail: {
    marginTop: SPACING.xxs,
  },
});
