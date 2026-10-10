import type { Article, Chokepoint, Indicator, TrendsSnapshot } from '@shared/types';
import { AI_CHANGE_WINDOW, type AiModelsSnapshot, aiLabCard, aiLabCardId } from './ai-models';
import { ccToFlag } from './article-utils';
import { movesInPoints } from './cards/format';
import {
  type AnalysisById,
  calendarCards,
  coinKicker,
  currencyCard,
  indicatorCard,
  straitCardFor,
} from './cards/markets';
import { type MovePath, movePath } from './cards/path';
import type { Range } from './cards/range';
import type { SwipeCard } from './cards/rank';
import { admitted } from './cards/sections';
import type { Card, CardDelta } from './cards/types';
import { gaugeLevels, gaugeMove } from './cards/week-move';
import {
  type Company,
  companyCard,
  companyCardId,
  companyValue,
  MARKET_VALUE,
  sharePrice,
} from './companies';
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
  | 'energy'
  | 'food'
  | 'metals'
  | 'rates'
  | 'inflation'
  | 'jobs'
  | 'borrowing'
  | 'other'
  | 'crypto'
  | 'ai'
  | 'predictions'
  | 'calendar';

/** Each group's name, as its menu row and its page's handle print it. */
export const GROUP_TITLES: Readonly<Record<GroupKey, string>> = {
  stocks: 'stock markets',
  companies: 'largest companies',
  straits: 'straits',
  currencies: 'currencies',
  energy: 'energy',
  food: 'food',
  metals: 'metals',
  rates: 'central bank rates',
  inflation: 'inflation',
  jobs: 'unemployment (US)',
  borrowing: 'borrowing costs',
  other: 'other indicators',
  crypto: 'crypto',
  ai: 'ai models',
  // What the list holds, as its first line says: a market's prices, not
  // forecasts. `predictions` called them the second.
  predictions: 'prediction markets',
  calendar: 'coming up',
};

const GROUP_ORDER: readonly GroupKey[] = [
  // Financial markets: exchanges, their companies, money and digital assets.
  'stocks',
  'companies',
  'currencies',
  'crypto',
  // Physical goods quoted daily, and the routes that carry them.
  'energy',
  'metals',
  'straits',
  // Policy and borrowing together, followed by prices and employment. Food is
  // here and not among the goods: its prices are a month's average, published
  // weeks on, as inflation's are, and it has no day or week to stand in the
  // menu's table of them.
  'rates',
  'borrowing',
  'inflation',
  'food',
  'jobs',
  // Capability scores are levels, separate from financial/economic changes.
  'ai',
  // Lists without a summary follow those with one. Keep this order stable
  // while data loads, so rows never jump under a reader's hand.
  'other',
  'predictions',
  'calendar',
];

/** The groups whose rows run from the largest rise to the largest fall
 *  (`byMove`). A date does not move, a score has its own order and the short
 *  monthly lists keep theirs. */
const SORTED_BY_MOVE: ReadonlySet<GroupKey> = new Set([
  'stocks',
  'companies',
  'straits',
  'currencies',
  'energy',
  'food',
  'metals',
  'rates',
  'crypto',
  'predictions',
]);

export interface CatalogRow {
  id: string;
  /** An AI lab's unrounded capability score, for the list's average. */
  score?: number;
  /** Null only for a strait with no traffic history to chart: it is drawn on
   *  the globe, so it still has a row, which flies there. */
  card: SwipeCard | null;
  /** The move the row prints: the week where the reading has one — the
   *  strip's number (`gaugeMove`) — and otherwise the card's own. */
  move?: CardDelta;
  /** Whether `move` is the week, rather than the card's own window. */
  weekly: boolean;
  /** Signed week before chip rounding, so tiny declines retain their sign. */
  weeklyPct?: number;
  /** The subject in the strip's words (`stripLabel`): `Turkey stocks`,
   *  `Hormuz`, `Oil`. The menu root's teaser. */
  short: string;
  /** The line under the row's reading, where the list's own heading has
   *  already said part of the card's (`sharePrice`): empty for none. Absent,
   *  the row prints the card's `readingNote`. */
  note?: string;
  /** The row's reading where it is not the card's: a company's market value
   *  (`companyValue`), which is what its list is of and a figure on its card,
   *  where the card's own reading is a share price. With what a listener is
   *  told it is. */
  reading?: string;
  readingSaid?: string;
  /** The flag at the row's start, in the two lists where a row is a
   *  country's market or money. Empty holds the slot for a row with no
   *  country to show (a series no exchange quotes), so the names in a list
   *  start on one line; absent, the list has no flags. */
  flag?: string;
  /** The window the list's own note already states, so the row does not
   *  repeat it under every number: an AI lab's `over 90 days`. A row
   *  whose move covers another window still prints its own. */
  saidWindow?: string;
  /** An exchange's row carries it for its city and its "older quote". */
  exchange?: Exchange;
  chokepoint?: Chokepoint;
  /** The row's own thirty days as a line (`movePath`), where its week is a
   *  percentage: what the first page draws for the whole list, for one row.
   *  Absent for a row with no week, and for a series in per cent, whose move
   *  is a difference and not a share of itself. */
  path?: MovePath;
  /** An AI lab's score and the range it probably lies in, for the mark its
   *  row draws on the list's one scale (`rangeScale`). */
  range?: Range;
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
  /** The AI labs (`useAiModels`). Never in `ranked`: a score has no week. */
  aiModels?: AiModelsSnapshot | null;
  now?: Date;
}

type SeriesGroup = Exclude<
  GroupKey,
  'companies' | 'straits' | 'currencies' | 'ai' | 'predictions' | 'calendar'
>;

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
  { id: 'brent', group: 'energy', kicker: 'energy' },
  { id: 'wti', group: 'energy', kicker: 'energy' },
  { id: 'natgas-hh', group: 'energy', kicker: 'energy' },
  { id: 'natgas-ttf', group: 'energy', kicker: 'energy' },
  { id: 'us-gas-retail', group: 'energy', kicker: 'energy' },
  { id: 'wheat', group: 'food', kicker: 'food' },
  { id: 'rice', group: 'food', kicker: 'food' },
  { id: 'paxg', group: 'metals', kicker: 'metal' },
  { id: 'xag', group: 'metals', kicker: 'metal' },
  { id: 'copper', group: 'metals', kicker: 'metal' },
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
  { id: 'us-10y', group: 'borrowing', kicker: 'money' },
  { id: 'us-2y', group: 'borrowing', kicker: 'money' },
  { id: 'us-mortgage', group: 'borrowing', kicker: 'home loans' },
  { id: 'us-cpi', group: 'inflation', kicker: 'prices' },
  { id: 'ez-cpi', group: 'inflation', kicker: 'prices' },
  { id: 'us-unemployment', group: 'jobs', kicker: 'jobs' },
  // By market value, largest first (2026-10-03).
  // What each is, not `crypto` eleven times (`coinKicker`).
  ...['btc', 'eth', 'bnb', 'xrp', 'sol', 'trx', 'zec', 'hype', 'doge', 'link', 'xmr'].map((id) => ({
    id,
    group: 'crypto' as const,
    kicker: coinKicker(id),
  })),
];

const SERIES_BY_ID = new Map(SERIES.map((s) => [s.id, s]));

/** The series a list names, for what must agree with it elsewhere: the rates
 *  drawn as steps are the `rates` list's (`isPolicyRate`). */
export const listedSeries = (group: SeriesGroup): string[] =>
  SERIES.filter((s) => s.group === group).map((s) => s.id);
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
export const COMPOSITES: ReadonlyMap<string, SeriesGroup> = new Map([
  ['nisab', 'metals'],
  ['metals', 'metals'],
  ['staples', 'food'],
]);

/**
 * A series the table does not name goes by its source, so one the pipeline
 * adds later is listed rather than silently absent: a currency from `oer`
 * with the currencies, a coin with the coins, anything unknown kept separately.
 * The two metals priced through a coin (`paxg`, `xag`) are named above.
 */
function seriesGroup(indicator: Indicator): SeriesGroup | 'currencies' | null {
  if (NOT_LISTED.has(indicator.source)) return null;
  const known = SERIES_BY_ID.get(indicator.id);
  if (known) return known.group;
  if (indicator.source === 'oer') return 'currencies';
  return indicator.source === 'crypto' ? 'crypto' : 'other';
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
 * series, the move or the 90-day average.
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
    aiModels,
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
  if (id.startsWith('ai:')) {
    const lab = aiModels?.labs.find((l) => aiLabCardId(l.id) === id);
    return gate(lab && aiModels ? aiLabCard(lab, aiModels.frontier, now.getTime()) : null);
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
  // The quantity the row's moves are read in (`gaugeLevels`), so the line and
  // the number beside it go the same way.
  const levels = week && !movesInPoints(card.series?.unit) ? gaugeLevels(card, now) : null;
  const path = levels ? movePath([levels]) : null;
  return {
    id: card.id,
    card,
    move,
    weekly: week !== null,
    weeklyPct: week?.pct,
    short: stripLabel(card, place),
    ...(path ? { path } : {}),
    ...extra,
  };
}

/** The lists whose rows are each one country's: its stock market, its money. */
const FLAGGED: ReadonlySet<GroupKey> = new Set(['stocks', 'currencies']);

const flagOf = (code: string | undefined): string =>
  code && /^[A-Za-z]{2}$/.test(code) ? ccToFlag(code) : '';

/** The indexes no exchange quotes, whose country the row's caption already
 *  says (`US stocks`). The fear index is a measure, not a market: no flag. */
const INDEX_COUNTRY: Readonly<Record<string, string>> = { sp500: 'US', nasdaq100: 'US' };

/**
 * A row's flag: its exchange's country, an index's, or its currency's. A
 * currency's code opens with its country's (`TRY` is Turkey's, `EUR` the
 * EU's), which is how ISO 4217 is built; the codes that open with `X` belong
 * to no country. Read off the row's id, which a market signal prefixes and a
 * mover suffixes.
 */
export function rowFlag(row: Pick<CatalogRow, 'id' | 'exchange'>): string {
  if (row.exchange) return flagOf(row.exchange.iso2);
  const series = row.id.replace(/^market-signal:/, '').replace(/-mover$/, '');
  const currency = /^fx-([a-z]{3})$/.exec(series)?.[1];
  if (currency) return currency.startsWith('x') ? '' : flagOf(currency.slice(0, 2));
  return flagOf(INDEX_COUNTRY[series]);
}

/**
 * The move a row prints, signed, where a list is ordered by it: the week of
 * a row that has one, and a contract's points since its line began. Null for
 * a row with neither, which keeps the list's own order.
 */
function signedMove(row: CatalogRow): number | null {
  if (row.weekly) return row.weeklyPct ?? null;
  if (row.card?.kind !== 'belief') return null;
  const { values } = row.card.series;
  const first = values[0];
  const last = values.at(-1);
  return typeof first === 'number' && typeof last === 'number' ? last - first : null;
}

/**
 * A list from its largest rise to its largest fall, then the rows with no
 * such move in the list's own order.
 *
 * The order has to show without being said. By size alone, either way up, a
 * green row followed a red one down the whole list, and the contracts stood
 * in the pool's ranking, which nothing on the screen follows. Risen to
 * fallen, the carets and the colours are the order. A month's move is never
 * sorted against a week's (`week-move.ts`), and `sort` is stable, so equal
 * moves keep the list's order.
 */
function byMove(rows: CatalogRow[]): CatalogRow[] {
  const moved: { row: CatalogRow; by: number }[] = [];
  const rest: CatalogRow[] = [];
  for (const row of rows) {
    const by = signedMove(row);
    if (by === null) rest.push(row);
    else moved.push({ row, by });
  }
  return [...moved.sort((a, b) => b.by - a.by).map(({ row }) => row), ...rest];
}

export function buildInstrumentCatalog({
  ranked,
  trends,
  chokepoints,
  analysis,
  articles,
  exchanges,
  companies,
  aiModels,
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
    energy: [],
    food: [],
    metals: [],
    rates: [],
    inflation: [],
    jobs: [],
    borrowing: [],
    other: [],
    crypto: [],
    ai: [],
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
    // `index points` is every exchange's unit: the list says it once.
    rows.stocks.push({
      ...rowFor(signal ?? quote ?? exchangeCard(exchange), at, { exchange }),
      note: '',
    });
  }

  // Every company in the list, held to the deck's gate like any other card:
  // the pool's own card where it has one, so a row and its strip slot open
  // one object.
  //
  // A row's reading is the company's market value, where every company has
  // one. All or none: a list of nineteen values and one share price is two
  // lists, and its first line can only say what one of them is.
  const valued = (companies ?? []).every((company) => companyValue(company) !== undefined);
  for (const company of companies ?? []) {
    const card = take(companyCardId(company.id)) ?? companyCard(company);
    if (!admitted(card)) continue;
    const { unit } = sharePrice(company.level, company.currency, company.currencyName);
    const value = valued ? companyValue(company) : undefined;
    rows.companies.push({
      ...rowFor(card, at),
      ...(value ? { reading: value, readingSaid: MARKET_VALUE, note: '' } : { note: unit }),
    });
  }

  // Every AI lab, in the payload's order: highest score first. Built without
  // `rowFor`, which asks every card for a week: a lab's line is its releases,
  // and two of them a week apart would read as a weekly mover.
  for (const lab of aiModels?.labs ?? []) {
    const card = aiLabCard(lab, aiModels?.frontier ?? { score: 0, model: '', lab: '' }, at);
    if (!admitted(card)) continue;
    rows.ai.push({
      id: card.id,
      score: lab.score,
      card,
      move: card.delta,
      weekly: false,
      short: lab.name,
      // The list's note says what the number is, once.
      note: '',
      saidWindow: AI_CHANGE_WINDOW,
      ...(lab.low !== undefined && lab.high !== undefined
        ? { range: { low: lab.low, high: lab.high, at: lab.score } }
        : {}),
    });
  }

  // Every strait the globe draws, with or without a history to chart.
  for (const chokepoint of chokepoints) {
    const card = take(`strait-${chokepoint.id}`) ?? straitCardFor(chokepoint, trends, now);
    if (card && admitted(card)) {
      // `ships a day`, said once over the list.
      rows.straits.push({ ...rowFor(card, at, { chokepoint }), note: '' });
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
      if (built && admitted(built)) {
        rows[group].push(rowFor(built, at));
      }
    }
  }

  // The contracts: every one is already in the pool, and the list is put in
  // order with the others (`byMove`).
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
      : (COMPOSITES.get(card.id) ?? 'other');
    rows[group].push(rowFor(card, at));
  }

  return GROUP_ORDER.map((key) => {
    const sorted = SORTED_BY_MOVE.has(key) ? byMove(rows[key]) : rows[key];
    return {
      key,
      title: GROUP_TITLES[key],
      rows: FLAGGED.has(key) ? sorted.map((row) => ({ ...row, flag: rowFlag(row) })) : sorted,
    };
  }).filter((group) => group.rows.length > 0);
}
