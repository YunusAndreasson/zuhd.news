import type { Article, Chokepoint, Indicator, TrendsSnapshot } from '@shared/types';
import {
  type AnalysisById,
  calendarCards,
  currencyCard,
  indicatorCard,
  straitCardFor,
} from './cards/markets';
import type { SwipeCard } from './cards/rank';
import { admitted } from './cards/sections';
import type { Card, CardDelta } from './cards/types';
import { gaugeMove } from './cards/week-move';
import { type Exchange, exchangeCard, exchangeDelta, stockMarketPlace } from './markets';
import { stripLabel } from './now';

/**
 * Every instrument the app downloads, in the groups the menu opens.
 *
 * The ranked pool (`buildRankedInstruments`) is what the strip and a story's
 * odds draw from, and it is short on purpose: a card enters it because it
 * changed. The menu is where a reader goes to look something up, and until
 * 2026-09-26 it opened one list — exchanges, with everything else unsplit
 * under `other data` — holding only that short pool: two currencies of
 * fifteen, Brent without WTI, no Fed rate. So the lists are built here, from
 * every published series, and the pool's cards are reused as they are, the
 * same objects, so a row, its strip slot and the card it opens are one thing.
 *
 * A new card still passes the deck's gate (`admitted`): a history and the
 * desk's own paragraph. No card without the desk's prose, in any list.
 */

export type GroupKey =
  | 'stocks'
  | 'straits'
  | 'currencies'
  | 'commodities'
  | 'economy'
  | 'predictions'
  | 'calendar';

/** Each group's name, as its menu row and its page's handle print it. */
export const GROUP_TITLES: Readonly<Record<GroupKey, string>> = {
  stocks: 'stock markets',
  straits: 'straits',
  currencies: 'currencies',
  commodities: 'energy, food & metals',
  economy: 'rates & crypto',
  predictions: 'predictions',
  calendar: 'coming up',
};

const GROUP_ORDER: readonly GroupKey[] = [
  'stocks',
  'straits',
  'currencies',
  'commodities',
  'economy',
  'predictions',
  'calendar',
];

/** The groups whose rows are sorted by the week's move, largest first. A
 *  contract moves in points and a date does not move, so those two keep
 *  their own order. */
const SORTED_BY_WEEK: ReadonlySet<GroupKey> = new Set([
  'stocks',
  'straits',
  'currencies',
  'commodities',
  'economy',
]);

export interface CatalogRow {
  id: string;
  /** Null only for a strait with no traffic history to chart: it is drawn on
   *  the globe, so it still has a row, which flies there. */
  card: SwipeCard | null;
  /** The move the row prints: the week where the reading has one — the
   *  strip's number (`gaugeMove`) — and otherwise the card's own. */
  move?: CardDelta;
  /** Whether `move` is the week, rather than the card's own window. */
  weekly: boolean;
  /** The subject in the strip's words (`stripLabel`): `Turkey stocks`,
   *  `Hormuz ships`, `Oil`. The menu root's teaser. */
  short: string;
  /** An exchange's row carries it for its city and its "older quote". */
  exchange?: Exchange;
  chokepoint?: Chokepoint;
}

export interface CatalogGroup {
  key: GroupKey;
  title: string;
  rows: CatalogRow[];
}

export interface CatalogInputs {
  /** `buildRankedInstruments` plus every exchange card, as `app/index.tsx`
   *  holds it. */
  ranked: SwipeCard[];
  trends: TrendsSnapshot | null;
  chokepoints: Chokepoint[];
  analysis: AnalysisById;
  articles: Article[];
  exchanges: Exchange[];
  now?: Date;
}

type SeriesGroup = Extract<GroupKey, 'stocks' | 'commodities' | 'economy'>;

/**
 * The series the pool leaves out, by group, and the kicker each card carries
 * — the builders' own words where the pool already has the card (`energy`,
 * `money`, `volatility`, `crypto`). Order is the group's order for rows with
 * no week to sort on.
 */
const SERIES: ReadonlyArray<{ id: string; group: SeriesGroup; kicker: string }> = [
  { id: 'sp500', group: 'stocks', kicker: 'US stocks' },
  { id: 'nasdaq100', group: 'stocks', kicker: 'US stocks' },
  { id: 'vix', group: 'stocks', kicker: 'volatility' },
  { id: 'brent', group: 'commodities', kicker: 'energy' },
  { id: 'wti', group: 'commodities', kicker: 'energy' },
  { id: 'natgas-hh', group: 'commodities', kicker: 'energy' },
  { id: 'natgas-ttf', group: 'commodities', kicker: 'energy' },
  { id: 'us-gas-retail', group: 'commodities', kicker: 'energy' },
  { id: 'wheat', group: 'commodities', kicker: 'food' },
  { id: 'rice', group: 'commodities', kicker: 'food' },
  { id: 'paxg', group: 'commodities', kicker: 'metal' },
  { id: 'xag', group: 'commodities', kicker: 'metal' },
  { id: 'copper', group: 'commodities', kicker: 'metal' },
  { id: 'fed-funds', group: 'economy', kicker: 'money' },
  { id: 'ecb-rate', group: 'economy', kicker: 'money' },
  { id: 'us-10y', group: 'economy', kicker: 'money' },
  { id: 'us-cpi', group: 'economy', kicker: 'prices' },
  { id: 'us-unemployment', group: 'economy', kicker: 'jobs' },
  { id: 'btc', group: 'economy', kicker: 'crypto' },
  { id: 'eth', group: 'economy', kicker: 'crypto' },
  { id: 'xmr', group: 'economy', kicker: 'crypto' },
];

const SERIES_BY_ID = new Map(SERIES.map((s) => [s.id, s]));
const SERIES_ORDER = new Map(SERIES.map((s, i) => [s.id, i]));

/**
 * Sources never listed, each for a reason:
 * - `wikipedia` — pageviews measure readers, not the world; the web keeps
 *   them in their own `attention` block, and the app has no such group.
 * - `portwatch` — a strait's vessel classes, already figures on its card.
 * - `stocks` — single companies, published without the desk's paragraph.
 * Contracts (`polymarket`) come from the pool, where `beliefCards` already
 * built every one.
 */
const NOT_LISTED = new Set(['wikipedia', 'portwatch', 'stocks', 'polymarket']);

/** The pool's two-line and derived cards, which have no series of their own
 *  to be listed by. */
const COMPOSITES: ReadonlyMap<string, SeriesGroup> = new Map([
  ['nisab', 'commodities'],
  ['metals', 'commodities'],
  ['staples', 'commodities'],
]);

/**
 * A series the table does not name goes by its source, so one the pipeline
 * adds later is listed rather than silently absent: a currency from `oer`
 * with the currencies, anything else with the rates.
 */
function seriesGroup(indicator: Indicator): SeriesGroup | 'currencies' | null {
  if (NOT_LISTED.has(indicator.source)) return null;
  const known = SERIES_BY_ID.get(indicator.id);
  if (known) return known.group;
  return indicator.source === 'oer' ? 'currencies' : 'economy';
}

/** A published series' card: the pool's where it has one — its market
 *  signal first, since that carries the desk's account of the move — and
 *  otherwise built the way the menu builds it. */
function seriesCard(
  indicator: Indicator,
  group: SeriesGroup | 'currencies',
  {
    trends,
    analysis,
    articles,
  }: { trends: TrendsSnapshot; analysis: AnalysisById; articles: Article[] },
  take: (id: string) => SwipeCard | undefined,
): Card | null {
  return (
    take(`market-signal:${indicator.id}`) ??
    take(indicator.id) ??
    take(`${indicator.id}-mover`) ??
    (group === 'currencies'
      ? currencyCard(trends, analysis, articles, indicator)
      : indicatorCard(
          trends,
          analysis,
          articles,
          indicator.id,
          SERIES_BY_ID.get(indicator.id)?.kicker ?? 'markets',
        ))
  );
}

/**
 * The card one id names, the same object the menu row for it opens — so a
 * story's chart and the card a press on it opens cannot disagree about the
 * series, the move or the 90-day normal.
 *
 * Ids are the article namespace (`Entity.indicatorId`, `Article.chart`):
 * `cp:<id>` is a strait, whose card is `strait-<id>`; `mkt:<id>` an
 * exchange; `poly-…` a contract, which only the pool builds; anything else a
 * published series. Null for an id nothing publishes, a series the menu does
 * not list (single companies, pageviews), and a card that fails the deck's
 * gate — a chart without the desk's paragraph is not drawn anywhere.
 */
export function instrumentCardFor(id: string, inputs: CatalogInputs): SwipeCard | null {
  const { ranked, trends, chokepoints, analysis, articles, exchanges, now = new Date() } = inputs;
  const pool = new Map(ranked.map((c) => [c.id, c]));
  const take = (key: string) => pool.get(key);
  const gate = (card: Card | null | undefined): SwipeCard | null =>
    card && admitted(card) ? card : null;

  if (id.startsWith('cp:')) {
    const key = id.slice(3);
    const chokepoint = chokepoints.find((c) => c.id === key);
    return gate(
      take(`strait-${key}`) ?? (chokepoint ? straitCardFor(chokepoint, trends, now) : null),
    );
  }
  if (id.startsWith('mkt:')) {
    const exchange = exchanges.find((e) => `mkt:${e.id}` === id);
    return gate(
      take(`market-signal:${id}`) ?? take(id) ?? (exchange ? exchangeCard(exchange) : null),
    );
  }
  const pooled = take(id);
  if (pooled?.kind === 'belief') return gate(pooled);
  const indicator = trends?.indicators.find((i) => i.id === id);
  const group = indicator ? seriesGroup(indicator) : null;
  if (!trends || !indicator || !group) return null;
  return gate(seriesCard(indicator, group, { trends, analysis, articles }, take));
}

function rowFor(
  card: SwipeCard,
  now: number,
  extra: { exchange?: Exchange; chokepoint?: Chokepoint } = {},
): CatalogRow {
  const week = gaugeMove(card, now);
  // An exchange with no week falls back to its session, as `exchangeMove`
  // does for its mark: the strip leaves it out, so no week can disagree.
  const move = week?.delta ?? (extra.exchange ? exchangeDelta(extra.exchange) : card.delta);
  const place = extra.exchange ? stockMarketPlace(extra.exchange.iso2) : null;
  return {
    id: card.id,
    card,
    move,
    weekly: week !== null,
    short: stripLabel(card, place),
    ...extra,
  };
}

/** Week movers first, largest first; then the rest in the list's own order.
 *  A month's move is never sorted against a week's (`week-move.ts`), and
 *  `sort` is stable, so equal moves keep the list's order. */
function byWeek(rows: CatalogRow[]): CatalogRow[] {
  const weekly = rows
    .filter((r) => r.weekly)
    .sort((a, b) => (b.move?.size ?? 0) - (a.move?.size ?? 0));
  return [...weekly, ...rows.filter((r) => !r.weekly)];
}

export function buildInstrumentCatalog({
  ranked,
  trends,
  chokepoints,
  analysis,
  articles,
  exchanges,
  now = new Date(),
}: CatalogInputs): CatalogGroup[] {
  const at = now.getTime();
  const pool = new Map(ranked.map((c) => [c.id, c]));
  const listed = new Set<string>();
  const rows: Record<GroupKey, CatalogRow[]> = {
    stocks: [],
    straits: [],
    currencies: [],
    commodities: [],
    economy: [],
    predictions: [],
    calendar: [],
  };
  const take = (id: string): SwipeCard | undefined => {
    const card = pool.get(id);
    if (card) listed.add(id);
    return card;
  };

  // Every exchange. A market signal on one replaces its quote, as it does in
  // the strip: it carries the desk's analysis of the move.
  for (const exchange of exchanges) {
    const id = `mkt:${exchange.id}`;
    const signal = take(`market-signal:${id}`);
    const quote = take(id);
    rows.stocks.push(rowFor(signal ?? quote ?? exchangeCard(exchange), at, { exchange }));
  }

  // Every strait the globe draws, with or without a history to chart.
  for (const chokepoint of chokepoints) {
    const card = take(`strait-${chokepoint.id}`) ?? straitCardFor(chokepoint, trends, now);
    if (card && admitted(card)) {
      rows.straits.push(rowFor(card, at, { chokepoint }));
    } else {
      rows.straits.push({
        id: `strait-${chokepoint.id}`,
        card: null,
        weekly: false,
        short: stripLabel({ id: `strait-${chokepoint.id}`, title: chokepoint.name }),
        chokepoint,
      });
    }
  }

  // Every published series, the pool's card where it has one.
  if (trends) {
    const place = (id: string) => SERIES_ORDER.get(id) ?? SERIES.length;
    const ordered = [...trends.indicators].sort((a, b) => place(a.id) - place(b.id));
    // An index an exchange already quotes is that exchange's row: the NYSE's
    // index is the S&P 500, and listing the series as well printed one index
    // twice, a row apart, under two names.
    const quoted = new Set(exchanges.map((e) => e.indexName.toLowerCase()));
    for (const indicator of ordered) {
      const group = seriesGroup(indicator);
      if (!group) continue;
      if (group === 'stocks' && quoted.has(indicator.label.toLowerCase())) continue;
      const built = seriesCard(indicator, group, { trends, analysis, articles }, take);
      if (built && admitted(built)) rows[group].push(rowFor(built, at));
    }
  }

  // The contracts, in the pool's order: every one is already there, and
  // their points have no size to sort on.
  for (const card of ranked) {
    if (card.kind !== 'belief') continue;
    listed.add(card.id);
    rows.predictions.push(rowFor(card, at));
  }

  // Every date ahead, not just the deck's nearest few.
  const dates = trends
    ? calendarCards(trends, articles, now)
    : ranked.filter((c) => c.kind === 'scheduled');
  for (const built of dates) {
    const card = take(built.id) ?? built;
    if (admitted(card)) rows.calendar.push(rowFor(card, at));
  }

  // Anything else the pool holds — the composites, and a card a later
  // builder adds — so no card the strip can open is missing from the lists.
  for (const card of ranked) {
    if (listed.has(card.id)) continue;
    if (card.kind === 'scheduled') continue;
    const group = card.id.startsWith('market-signal:')
      ? 'stocks'
      : (COMPOSITES.get(card.id) ?? 'economy');
    rows[group].push(rowFor(card, at));
  }

  return GROUP_ORDER.map((key) => ({
    key,
    title: GROUP_TITLES[key],
    rows: SORTED_BY_WEEK.has(key) ? byWeek(rows[key]) : rows[key],
  })).filter((group) => group.rows.length > 0);
}
