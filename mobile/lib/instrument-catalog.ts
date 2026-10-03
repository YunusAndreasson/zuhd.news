import type { Article, Chokepoint, Indicator, TrendsSnapshot } from '@shared/types';
import {
  type AnalysisById,
  calendarCards,
  coinKicker,
  currencyCard,
  indicatorCard,
  straitCardFor,
} from './cards/markets';
import type { SwipeCard } from './cards/rank';
import { admitted } from './cards/sections';
import type { Card, CardDelta } from './cards/types';
import { gaugeMove } from './cards/week-move';
import { type Company, companyCard, companyCardId, sharePrice } from './companies';
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
  | 'companies'
  | 'straits'
  | 'currencies'
  | 'commodities'
  | 'rates'
  | 'crypto'
  | 'predictions'
  | 'calendar';

/** Each group's name, as its menu row and its page's handle print it. */
export const GROUP_TITLES: Readonly<Record<GroupKey, string>> = {
  stocks: 'stock markets',
  companies: 'largest companies',
  straits: 'straits',
  currencies: 'currencies',
  commodities: 'energy, food & metals',
  // Two lists since 2026-10-03, on the user's word: they were one, `rates &
  // crypto`, and a central bank's rate has nothing to do with a coin's price.
  // The first is named for all three things in it, the way the list above is.
  rates: 'rates, inflation & jobs',
  crypto: 'crypto',
  predictions: 'predictions',
  calendar: 'coming up',
};

const GROUP_ORDER: readonly GroupKey[] = [
  'stocks',
  // Beside the markets they trade on.
  'companies',
  'straits',
  'currencies',
  'commodities',
  'rates',
  'crypto',
  'predictions',
  'calendar',
];

/** The groups whose rows are sorted by the week's move, largest first. A
 *  contract moves in points and a date does not move, so those two keep
 *  their own order. */
const SORTED_BY_WEEK: ReadonlySet<GroupKey> = new Set([
  'stocks',
  'companies',
  'straits',
  'currencies',
  'commodities',
  'rates',
  'crypto',
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
   *  `Hormuz`, `Oil`. The menu root's teaser. */
  short: string;
  /** The line under the row's reading, where the list's own heading has
   *  already said part of the card's (`sharePrice`): empty for none. Absent,
   *  the row prints the card's `readingNote`. */
  note?: string;
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
  /** The company list (`useCompanies`). The ones with a fresh quote are in
   *  `ranked` too, as the strip's slots; the list holds all of them. */
  companies?: Company[] | null;
  now?: Date;
}

type SeriesGroup = Extract<GroupKey, 'stocks' | 'commodities' | 'rates' | 'crypto'>;

/**
 * The series the pool leaves out, by group, and the kicker each card carries
 * — the builders' own words where the pool already has the card (`energy`,
 * `money`, `volatility`). Order is the group's order for rows with no week to
 * sort on.
 *
 * A policy rate's kicker is the bank that sets it. The series is named for
 * its country (`Turkey interest rate`), which a reader needs no finance to
 * read; the line under it is for the reader who knows the bank. The Fed's and
 * the ECB's rows are named for the bank, as everyone names them, so theirs
 * says whose bank it is.
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
  // What a central bank sets, largest economies first.
  { id: 'fed-funds', group: 'rates', kicker: 'US central bank' },
  { id: 'ecb-rate', group: 'rates', kicker: 'eurozone central bank' },
  { id: 'pboc-rate', group: 'rates', kicker: 'People’s Bank of China' },
  { id: 'boj-rate', group: 'rates', kicker: 'Bank of Japan' },
  { id: 'boe-rate', group: 'rates', kicker: 'Bank of England' },
  { id: 'bcb-rate', group: 'rates', kicker: 'Central Bank of Brazil' },
  { id: 'cbr-rate', group: 'rates', kicker: 'Bank of Russia' },
  { id: 'bi-rate', group: 'rates', kicker: 'Bank Indonesia' },
  { id: 'tcmb-rate', group: 'rates', kicker: 'Central Bank of Turkey' },
  // What a market or a lender charges.
  { id: 'us-10y', group: 'rates', kicker: 'money' },
  { id: 'us-2y', group: 'rates', kicker: 'money' },
  { id: 'us-mortgage', group: 'rates', kicker: 'home loans' },
  { id: 'us-cpi', group: 'rates', kicker: 'prices' },
  { id: 'ez-cpi', group: 'rates', kicker: 'prices' },
  { id: 'us-unemployment', group: 'rates', kicker: 'jobs' },
  // By market value, largest first (2026-10-03).
  // What each is, not `crypto` eleven times (`coinKicker`).
  ...['btc', 'eth', 'bnb', 'xrp', 'sol', 'trx', 'zec', 'hype', 'doge', 'link', 'xmr'].map((id) => ({
    id,
    group: 'crypto' as const,
    kicker: coinKicker(id),
  })),
];

const SERIES_BY_ID = new Map(SERIES.map((s) => [s.id, s]));
const SERIES_ORDER = new Map(SERIES.map((s, i) => [s.id, i]));

/**
 * Sources never listed, each for a reason:
 * - `wikipedia` — pageviews measure readers, not the world; the web keeps
 *   them in their own `attention` block, and the app has no such group.
 * - `portwatch` — a strait's vessel classes, already figures on its card.
 * - `stocks` — a company a story named, published without a paragraph. The
 *   twenty largest have a list of their own, from their own payload
 *   (`lib/companies.ts`), each with the catalog's standing sentence.
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
 * with the currencies, a coin with the coins, anything else with the rates.
 * The two metals priced through a coin (`paxg`, `xag`) are named above.
 */
function seriesGroup(indicator: Indicator): SeriesGroup | 'currencies' | null {
  if (NOT_LISTED.has(indicator.source)) return null;
  const known = SERIES_BY_ID.get(indicator.id);
  if (known) return known.group;
  if (indicator.source === 'oer') return 'currencies';
  return indicator.source === 'crypto' ? 'crypto' : 'rates';
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
          SERIES_BY_ID.get(indicator.id)?.kicker ??
            (group === 'crypto' ? coinKicker(indicator.id) : 'markets'),
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
 * exchange; `co:<id>` a company in the menu's list; `poly-…` a contract,
 * which only the pool builds; anything else a published series. Null for an
 * id nothing publishes, a series the menu does not list (a company a story
 * named, pageviews), and a card that fails the deck's gate — a chart without
 * a paragraph under it is not drawn anywhere.
 */
export function instrumentCardFor(id: string, inputs: CatalogInputs): SwipeCard | null {
  const {
    ranked,
    trends,
    chokepoints,
    analysis,
    articles,
    exchanges,
    companies,
    now = new Date(),
  } = inputs;
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
  if (id.startsWith('co:')) {
    const company = companies?.find((c) => companyCardId(c.id) === id);
    return gate(take(id) ?? (company ? companyCard(company) : null));
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
  companies,
  now = new Date(),
}: CatalogInputs): CatalogGroup[] {
  const at = now.getTime();
  const pool = new Map(ranked.map((c) => [c.id, c]));
  const listed = new Set<string>();
  const rows: Record<GroupKey, CatalogRow[]> = {
    stocks: [],
    companies: [],
    straits: [],
    currencies: [],
    commodities: [],
    rates: [],
    crypto: [],
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

  // Every company in the list, held to the deck's gate like any other card:
  // the pool's own card where it has one, so a row and its strip slot open
  // one object.
  for (const company of companies ?? []) {
    const card = take(companyCardId(company.id)) ?? companyCard(company);
    if (!admitted(card)) continue;
    const { unit } = sharePrice(company.level, company.currency, company.currencyName);
    rows.companies.push({ ...rowFor(card, at), note: unit });
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
      : (COMPOSITES.get(card.id) ?? 'rates');
    rows[group].push(rowFor(card, at));
  }

  return GROUP_ORDER.map((key) => ({
    key,
    title: GROUP_TITLES[key],
    rows: SORTED_BY_WEEK.has(key) ? byWeek(rows[key]) : rows[key],
  })).filter((group) => group.rows.length > 0);
}
