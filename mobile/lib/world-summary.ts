import { AI_CHANGE_WINDOW, aiScoreChange } from './ai-models';
import { deltaOf, formatNumber } from './cards/format';
import { type MovePath, middle, movePath, type PathSeries } from './cards/path';
import type { CardDelta, CardSeries, WindowMove } from './cards/types';
import {
  ANCHOR_SLACK_DAYS,
  DAY_WINDOW,
  dayMove,
  MONTH_DAYS,
  MONTH_WINDOW,
  spanMove,
  WINDOW_NAMES,
} from './cards/week';
import {
  gaugeLevels,
  gaugeSpan,
  periodDays,
  WEEK_DAYS,
  WEEK_WINDOW,
  yearOf,
} from './cards/week-move';
import { MONTH_ABBR } from './date-format';
import {
  type CatalogGroup,
  type CatalogRow,
  COMPOSITES,
  type GroupKey,
} from './instrument-catalog';
import { dollarMoves, type Exchange, ownMoves, sessionLevels } from './markets';
import { DAY_MS } from './time';
import { straitSqueezed } from './valence';

/**
 * Each list on the menu's first page as one number: the summary of everything
 * in it, not its largest mover.
 *
 * The user asked for compound figures worth reading daily, "maybe even our
 * own index" (2026-10-04). Figures use seven-day changes where available,
 * with monthly changes and current levels explicitly labelled:
 *
 * - **stock markets** — `world stocks`: each exchange's week in US dollars,
 *   weighed by its country's GDP (`stocksSummary`). It was the exchanges'
 *   weeks averaged in their own currencies, each counted once, where Dubai
 *   counted as much as New York and a lira index rose with the lira's
 *   inflation; that is still what a build with no weights or rates prints,
 *   and still the web rail's `meanIndex` (`public/islands/_map/markets.ts`).
 *   By the economy and not by the market's value: no payload carries a
 *   market's value, and by value the number is Wall Street's week. The two
 *   can point opposite ways, and did over the thirty days to 2026-10-09: New
 *   York rose 2.3% and the other twenty-nine fell 3.9% in dollars between
 *   them, so this read −2% while an index weighed by value was a little up.
 * - **largest companies**, **crypto** — the members' weekly returns averaged.
 * - **energy**, **food**, **metals** — returns over matching dates, averaged.
 *   The prices quoted daily are the basket where there are any: a weekly or
 *   monthly one is left out of it. Groups with only monthly data use matching
 *   months. Derived cards (`COMPOSITES`) are excluded to
 *   avoid counting their underlying prices twice.
 * - **currencies** — the middle currency's week against the dollar. The
 *   median, not the mean: the list holds the euro and the Lebanese pound, and
 *   one collapsing currency would be the whole average.
 * - **straits** — ships through every strait, added day by day. Ships are one
 *   unit, so the sum is a count and not an index.
 * - **AI models** — average 90-day point gain for labs with 90 days of
 *   history in the same published index; current mean if history is insufficient.
 * - **coming up** — the nearest date, in plain ink. Neither has a week.
 * - **central bank rates**, **inflation** — median policy rate and mean
 *   annual inflation, each at the latest month all its members share.
 * - **US unemployment** — the single published labour reading and monthly change.
 * - **borrowing costs** — an equal-weight basket of US yields and mortgage
 *   rates on shared dates, with its weekly change in percentage points.
 * - **other indicators**, **predictions** — no aggregate of mixed measures
 *   or contracts on unrelated questions.
 *
 * Each figure but the stocks' is unweighted and uses eligible readings in
 * its list; the price pages name their coverage and matching observation
 * dates. Where a list is quoted daily the menu prints it over three windows,
 * a day, seven days and thirty, as a row of a table (`groupLadder`): the
 * figure above is the middle one.
 * The list prints the same figure over its members (`GroupFigure.measure`).
 *
 * **How it got here, the same day.** First a block of four menu rows over the
 * lists, named almost as the lists under them: "it feels like much
 * duplication… now it feels like you just created new duplicated
 * categories". Then, half built, a band of four numbers over the lists. The
 * user's own design replaced both: "for each category I want the summary of
 * all values, not the top one… that replaces the idea of the overview… this
 * also makes the list cleaner since we won't need the subtitle". The rows
 * printed their largest mover until then, which the top strip already shows.
 *
 * **One score across every list was considered and rejected.** It needs
 * weights nobody publishes, and a colour that calls the result good or bad.
 *
 * **The menu opens on one of these figures, as its first row** (the user's
 * request, 2026-10-10: "one clear indicator at the top… a value for today or
 * at least this week's trend"), over a day, seven days and thirty. It is
 * `world stocks`, the stock list's own figure and that list's row, not a
 * score across the lists: shares are the one thing here quoted every day in
 * every large economy, and a rise in them is a rise, which no colour has to
 * interpret. It is not "the economy": nothing in the feed measures output
 * more often than monthly.
 *
 * Every figure is read off the catalog's own rows, so a row's number cannot
 * disagree with the list it opens.
 */

const groupOf = (catalog: readonly CatalogGroup[], key: GroupKey): CatalogGroup | undefined =>
  catalog.find((group) => group.key === key);

export interface Tally {
  total: number;
  rose: number;
  fell: number;
}

function tallyOf(rows: readonly CatalogRow[]): Tally {
  let rose = 0;
  let fell = 0;
  for (const row of rows) {
    if (row.move?.direction === 'up') rose += 1;
    else if (row.move?.direction === 'down') fell += 1;
  }
  return { total: rows.length, rose, fell };
}

/**
 * How many exchanges rose and fell, by the move each row prints. Exchanges
 * only: the fear index and the NASDAQ-100 share the list, but a rising fear
 * index is not a market rising. The `stock markets` page and the overview
 * both count here, so the two lines are one number.
 */
export function exchangeTally(rows: readonly CatalogRow[]): Tally {
  return tallyOf(rows.filter((row) => row.exchange));
}

/**
 * A tally in words, the larger side first: `18 of 26 rose`. A tie prints both
 * sides, since neither leads. `tail` says against what (`against the dollar`).
 */
export function tallyCaption({ total, rose, fell }: Tally, tail = ''): string {
  const end = tail ? ` ${tail}` : '';
  if (rose === 0 && fell === 0) return `none of ${total} moved${end}`;
  if (rose === fell) return `${rose} rose, ${fell} fell${end}`;
  return rose > fell ? `${rose} of ${total} rose${end}` : `${fell} of ${total} fell${end}`;
}

/** A row's week as a signed percentage, or null where it has none. */
function weekPct(row: CatalogRow): number | null {
  if (!row.weekly) return null;
  if (typeof row.weeklyPct === 'number' && Number.isFinite(row.weeklyPct)) return row.weeklyPct;
  const move = row.move;
  if (!row.weekly || !move || typeof move.size !== 'number') return null;
  if (move.direction === 'flat') return 0;
  return move.direction === 'up' ? move.size : -move.size;
}

/**
 * A list's move as one chip. The week unless told another window (the
 * ladder's day and thirty days). An exact zero prints `0.0%`. A small net
 * move can hide substantial offsetting moves: it keeps its sign and two
 * decimals, and zero is kept for an actual zero, not a rounding result.
 */
function summaryDelta(pct: number, window: string = WEEK_WINDOW): CardDelta | undefined {
  if (!Number.isFinite(pct)) return undefined;
  if (pct === 0 || Math.abs(pct) >= 0.1) return deltaOf(pct, { window, flat: '0.0%' });
  return {
    direction: pct > 0 ? 'up' : 'down',
    magnitude: Math.abs(pct) < 0.005 ? '<0.01%' : `${Math.abs(pct).toFixed(2)}%`,
    size: Math.abs(pct),
    window,
  };
}

/** A list over a ladder's three windows. */
interface Spans {
  day?: CardDelta;
  week?: CardDelta;
  month?: CardDelta;
}

/** The three windows every list is read over, shortest first. */
function threeRungs({ day, week, month }: Spans): WindowMove[] {
  return [day, week, month].map((delta, i) => ({ label: WINDOW_NAMES[i] as string, delta }));
}

const mean = (ns: readonly number[]): number => ns.reduce((total, n) => total + n, 0) / ns.length;

function median(ns: readonly number[]): number {
  const sorted = [...ns].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/** Fewer members than this is one market's week under another name. */
const MIN_MEMBERS = 2;

export interface StocksSummary {
  /** How many exchanges rose and fell, by the move each row prints. */
  tally: Tally;
  /** `world stocks`: the markets' weeks as one move. Absent with too few. */
  move?: CardDelta;
  /** The same markets over their last session and over thirty days, weighed
   *  the same way. Each market's own last session: they do not share a date.
   *  Absent where too few of them have one (`MIN_SHARE`). */
  day?: CardDelta;
  month?: CardDelta;
  /** How many markets the moves are of: those with a week, and in dollars
   *  those with rates too. */
  members: number;
  /** Whether each market's move is in US dollars. */
  dollars: boolean;
  /** Whether each weighs by its economy. Counted once each where not. */
  weighted: boolean;
  /** The same markets, weighed the same way, as one line over thirty days. */
  path: MovePath | null;
}

/**
 * How much of the list, by weight, must be behind a number before it is
 * printed. In dollars: under it the figure would be the rated markets' week
 * under the world's name, so every market is read in its own currency. Over
 * a day or thirty: under it the rung prints nothing.
 */
const MIN_SHARE = 0.8;

interface StockMember {
  exchange: Exchange;
  day: number | null;
  week: number;
  month: number | null;
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const sum = (ns: readonly number[]): number => ns.reduce((total, n) => total + n, 0);

/**
 * What each market weighs: its country's GDP, or one each where any member
 * has none. A country counts once: two exchanges in one share its weight.
 */
function stockWeights(members: readonly StockMember[]): { weights: number[]; weighted: boolean } {
  const weighted = members.every(({ exchange }) => finite(exchange.gdp) && exchange.gdp > 0);
  if (!weighted) return { weights: members.map(() => 1), weighted };
  const listed = new Map<string, number>();
  for (const { exchange } of members)
    listed.set(exchange.iso2, (listed.get(exchange.iso2) ?? 0) + 1);
  return {
    weights: members.map(
      ({ exchange }) => (exchange.gdp as number) / (listed.get(exchange.iso2) ?? 1),
    ),
    weighted,
  };
}

/** A member with its moves in US dollars, or null where its week cannot be. */
function inDollars(member: StockMember): StockMember | null {
  const { exchange } = member;
  if (exchange.currency === 'USD') return member;
  const moves = dollarMoves(exchange);
  if (!moves || moves.week === null) return null;
  return { exchange, day: moves.day, week: moves.week, month: moves.month };
}

/**
 * `world stocks`: the list's exchanges as one move, over three windows.
 *
 * Each market's week is its row's (`weekPct`), so a market with no week is
 * left out as it always was; its day is its published change and its thirty
 * days are read off its sessions by the week's rule (`ownMoves`). Where the
 * payload carries the rates, all three are the index's in US dollars instead
 * (`dollarMoves`): a Borsa Istanbul up 3% in a week the lira lost 2% is up 1%
 * to anyone holding anything else. Where it carries the weights, each market
 * weighs by its country's GDP. A build with neither prints what the row
 * printed before either existed.
 *
 * One set of markets and one set of weights for the three windows, so the
 * rungs of the ladder can be read against each other.
 */
export function stocksSummary(catalog: readonly CatalogGroup[]): StocksSummary | null {
  const exchanges = groupOf(catalog, 'stocks')?.rows.filter((row) => row.exchange) ?? [];
  if (exchanges.length === 0) return null;
  const local: StockMember[] = [];
  for (const row of exchanges) {
    const week = weekPct(row);
    const exchange = row.exchange;
    if (week === null || !exchange) continue;
    local.push({
      exchange,
      day: finite(exchange.changePct) ? exchange.changePct : null,
      week,
      month: ownMoves(exchange).month,
    });
  }
  const own = stockWeights(local);
  const rated: StockMember[] = [];
  let ratedWeight = 0;
  local.forEach((member, i) => {
    const converted = inDollars(member);
    if (!converted) return;
    rated.push(converted);
    ratedWeight += own.weights[i] ?? 0;
  });
  const dollars = rated.length >= MIN_MEMBERS && ratedWeight >= MIN_SHARE * sum(own.weights);
  const members = dollars ? rated : local;
  const { weights, weighted } = stockWeights(members);
  const weight = sum(weights);
  const enough = members.length >= MIN_MEMBERS && weight > 0;
  /** The members' moves over one window as one, or null where too few have it. */
  const weighed = (of: (member: StockMember) => number | null): number | null => {
    let total = 0;
    let behind = 0;
    members.forEach((member, i) => {
      const pct = of(member);
      if (pct === null) return;
      total += pct * (weights[i] ?? 0);
      behind += weights[i] ?? 0;
    });
    return enough && behind >= MIN_SHARE * weight ? total / behind : null;
  };
  const delta = (pct: number | null, window: string): CardDelta | undefined =>
    pct === null ? undefined : summaryDelta(pct, window);
  return {
    tally: tallyOf(exchanges),
    move: delta(
      weighed((member) => member.week),
      WEEK_WINDOW,
    ),
    day: delta(
      weighed((member) => member.day),
      DAY_WINDOW,
    ),
    month: delta(
      weighed((member) => member.month),
      MONTH_WINDOW,
    ),
    members: members.length,
    dollars,
    weighted,
    path: enough
      ? movePath(
          members.flatMap(({ exchange }, i): PathSeries[] => {
            const levels = sessionLevels(exchange, dollars);
            return levels ? [{ ...levels, weight: weights[i] }] : [];
          }),
        )
      : null,
  };
}

/** The headline's name: the stock list's figure, on the menu's first line. */
export const WORLD_STOCKS = 'world stocks';

/**
 * What `world stocks` is of, for its list's page and a listener: `30 markets
 * in US dollars, weighted by each economy’s size`.
 */
export function stocksCoverage({ members, tally, dollars, weighted }: StocksSummary): string {
  const of = members < tally.total ? `${members} of ${tally.total} markets` : `${members} markets`;
  const money = dollars ? 'in US dollars' : 'in their own currencies';
  return `${of} ${money}, ${weighted ? 'weighted by each economy’s size' : 'each counted once'}`;
}

/**
 * The headline's ladder: the markets over a day, seven days and thirty,
 * shortest first. The middle rung is the list's own figure.
 */
export function stocksLadder({ day, move, month }: StocksSummary): WindowMove[] {
  return threeRungs({ day, week: move, month });
}

/**
 * The figure again over its list, named and said what it is of: `World stocks
 * +0.5% over 7 days: 30 markets in US dollars, weighted by each economy’s
 * size`. The number is the chip's own magnitude, so the two cannot differ.
 */
export function stocksLine(summary: StocksSummary): string | undefined {
  const { move } = summary;
  if (!move) return undefined;
  const sign = move.direction === 'up' ? '+' : move.direction === 'down' ? '−' : '';
  return `World stocks ${sign}${move.magnitude} ${WEEK_WINDOW}: ${stocksCoverage(summary)}`;
}

/** The mean of the rows' weeks, each counted once, and how many it is of. */
function meanWeek(rows: readonly CatalogRow[]): { move?: CardDelta; members: number } {
  let sum = 0;
  let members = 0;
  for (const row of rows) {
    const pct = weekPct(row);
    if (pct === null) continue;
    sum += pct;
    members += 1;
  }
  return {
    move: members >= MIN_MEMBERS ? summaryDelta(sum / members) : undefined,
    members,
  };
}

/**
 * A list's rows over a day and over thirty, as its week is made: the rows
 * that have a week, each by its own card's move over the window
 * (`gaugeSpan`), combined the way the week is. Absent where too few of those
 * rows have the window (`MIN_SHARE`), so the three rungs are of one list.
 */
function rowSpans(
  rows: readonly CatalogRow[],
  now: number,
  combine: (pcts: readonly number[]) => number,
): Pick<Spans, 'day' | 'month'> {
  const members = rows.filter((row) => weekPct(row) !== null);
  const over = (span: number, window: string): CardDelta | undefined => {
    const pcts: number[] = [];
    for (const row of members) {
      const pct = row.card ? gaugeSpan(row.card, span, now) : null;
      if (pct !== null) pcts.push(pct);
    }
    if (pcts.length < MIN_MEMBERS || pcts.length < MIN_SHARE * members.length) return undefined;
    return summaryDelta(combine(pcts), window);
  };
  return { day: over(1, DAY_WINDOW), month: over(MONTH_DAYS, MONTH_WINDOW) };
}

/** A list's rows as one line over thirty days: the rows that have a week,
 *  each by its own card's quantity (`gaugeLevels`), combined as its week is. */
function rowPath(
  rows: readonly CatalogRow[],
  now: number,
  combine?: Parameters<typeof movePath>[1],
): MovePath | null {
  const series = rows.flatMap((row): PathSeries[] => {
    if (weekPct(row) === null || !row.card) return [];
    const levels = gaugeLevels(row.card, now);
    return levels ? [levels] : [];
  });
  return series.length >= MIN_MEMBERS ? movePath(series, combine) : null;
}

export interface CompaniesSummary {
  /** The largest companies' weeks averaged, each counted once. */
  move?: CardDelta;
  members: number;
  total: number;
}

/** The largest companies as one number. A company with an old quote has no
 *  week and is left out of the average, as an exchange is. */
export function companiesSummary(catalog: readonly CatalogGroup[]): CompaniesSummary | null {
  const rows = groupOf(catalog, 'companies')?.rows ?? [];
  if (rows.length === 0) return null;
  return { ...meanWeek(rows), total: rows.length };
}

type Series = Pick<CardSeries, 'values' | 'periods'>;

/** A strait row's charted series — the trailing seven-day average its card
 *  and its strip slot print — where the row has a week. */
function straitSeries(row: CatalogRow): { series: Series; asOf: string | undefined } | null {
  const card = row.card;
  if (!row.weekly || !card || card.kind !== 'reading' || !card.series || card.series.multi) {
    return null;
  }
  if (card.series.values.length !== card.series.periods.length) return null;
  return { series: card.series, asOf: card.asOf };
}

/**
 * Several series as one, added day by day. Only the members that end on the
 * day most of them end on are added, and only the days every one of them has:
 * a sum whose membership changes from one day to the next moves for that
 * reason alone, which is how one gappy exchange once drew the web's thirty
 * indices as a straight line.
 */
function sumByDay(all: readonly Series[]): { sum: Series; members: number } | null {
  const ends = new Map<string, number>();
  for (const s of all) {
    const end = s.periods.at(-1) ?? '';
    ends.set(end, (ends.get(end) ?? 0) + 1);
  }
  let lastDay = '';
  let most = 0;
  for (const [end, count] of ends) {
    if (count > most) {
      lastDay = end;
      most = count;
    }
  }
  const members = all.filter((s) => s.periods.at(-1) === lastDay);
  const first = members[0];
  if (!first) return null;
  const byDay = members.map((s) => new Map(s.periods.map((period, i) => [period, s.values[i]])));
  const periods: string[] = [];
  const values: number[] = [];
  for (const period of first.periods) {
    let total = 0;
    let complete = true;
    for (const days of byDay) {
      const value = days.get(period);
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        complete = false;
        break;
      }
      total += value;
    }
    if (!complete) continue;
    periods.push(period);
    values.push(total);
  }
  return { sum: { values, periods }, members: members.length };
}

export interface ShippingSummary {
  /** Every strait the list holds. */
  total: number;
  /** Those running far enough under their 90-day average to be the disruption
   *  (`straitSqueezed`): the straits the globe draws pinched. */
  disrupted: number;
  /** The week's move in ships through the straits, summed. */
  move?: CardDelta;
  /** The same sum over a day and over thirty. */
  day?: CardDelta;
  month?: CardDelta;
  /** How many straits the sum is of. */
  members: number;
  /** The sum as a line over thirty days. */
  path: MovePath | null;
}

export function shippingSummary(
  catalog: readonly CatalogGroup[],
  now = Date.now(),
): ShippingSummary | null {
  const straits = groupOf(catalog, 'straits')?.rows.filter((row) => row.chokepoint) ?? [];
  if (straits.length === 0) return null;
  let disrupted = 0;
  for (const row of straits) {
    const delta = row.chokepoint?.delta7vs90.n_total;
    if (typeof delta === 'number' && straitSqueezed(delta)) disrupted += 1;
  }
  const charted = straits.flatMap((row) => straitSeries(row) ?? []);
  const summed = sumByDay(charted.map((c) => c.series));
  const year = yearOf(charted[0]?.asOf, new Date(now).getUTCFullYear());
  const over = (span: number, window: string): CardDelta | undefined => {
    if (!summed || summed.members < MIN_MEMBERS) return undefined;
    const { values, periods } = summed.sum;
    const pct =
      span > 1
        ? (spanMove(values, periods, year, span)?.pct ?? null)
        : dayMove(values, periods, year);
    return pct === null ? undefined : summaryDelta(pct, window);
  };
  return {
    total: straits.length,
    disrupted,
    move: over(WEEK_DAYS, WEEK_WINDOW),
    day: over(1, DAY_WINDOW),
    month: over(MONTH_DAYS, MONTH_WINDOW),
    members: summed?.members ?? 0,
    path:
      summed && summed.members >= MIN_MEMBERS
        ? movePath([{ days: periodDays(summed.sum.periods, year), values: summed.sum.values }])
        : null,
  };
}

/** `2 of 11 straits disrupted`. Never `all near normal`: a strait far above
 *  its normal is not disrupted, and is not near normal either. */
export function shippingCaption({ total, disrupted }: ShippingSummary): string {
  return `${disrupted === 0 ? 'none' : disrupted} of ${total} straits disrupted`;
}

/** A currency's row, by its id, which a market signal prefixes and a mover
 *  suffixes (as `rowFlag` reads it). */
const isCurrency = (row: CatalogRow): boolean =>
  /^fx-[a-z]{3}$/.test(row.id.replace(/^market-signal:/, '').replace(/-mover$/, ''));

export const CURRENCY_TAIL = 'against the dollar';

export interface CurrenciesSummary {
  /** The middle currency's week against the dollar. */
  move?: CardDelta;
  /** How many currencies rose and fell against it. */
  tally: Tally;
}

/**
 * The currencies as one number: the median currency's week against the
 * dollar, in the list's own sense (down is weaker).
 *
 * The median, because a mean of fifteen currencies is whichever one fell
 * furthest: a pound that loses a fifth of its value in a week would move the
 * average more than the euro, the yen and the yuan together.
 */
export function currenciesSummary(catalog: readonly CatalogGroup[]): CurrenciesSummary | null {
  const rows =
    groupOf(catalog, 'currencies')?.rows.filter((row) => isCurrency(row) && row.weekly) ?? [];
  if (rows.length === 0) return null;
  const weeks = rows.map(weekPct).filter((pct): pct is number => pct !== null);
  return {
    tally: tallyOf(rows),
    move: weeks.length >= MIN_MEMBERS ? summaryDelta(median(weeks)) : undefined,
  };
}

export interface GroupFigure {
  /** The group's change, with its period and unit carried by the delta. */
  move?: CardDelta;
  /** What `move` is of its list's rows, as the list's own page names it. */
  measure?: 'average' | 'median' | 'total' | 'rate';
  /** For a list with no week: its aggregate level or nearest date, in plain ink. */
  level?: string;
  /** What stands behind the number, for a screen reader: `21 of 26 fell`. */
  detail?: string;
  /** Visible coverage note on the list, also spoken with its menu figure. */
  coverage?: string;
}

interface PriceHistory {
  row: CatalogRow;
  monthly: boolean;
  /** The price on each day, or in each month, by its number. */
  values: Map<number, number>;
}

interface PriceBasket {
  /** Every price in the list: a card built from two others is not one. */
  rows: CatalogRow[];
  members: PriceHistory[];
  monthly: boolean;
  /** The days, or months, every member has a price for, oldest first. */
  shared: number[];
}

/** Observations mostly this near each other are a daily series: a weekend's
 *  three days, never a weekly price's seven. */
const DAILY_GAP_DAYS = 3;

function isDaily({ values }: PriceHistory): boolean {
  const days = [...values.keys()].sort((a, b) => a - b);
  const gaps = days.slice(1).map((day, i) => day - (days[i] ?? day));
  return gaps.length > 0 && median(gaps) <= DAILY_GAP_DAYS;
}

/**
 * A price list's basket. Price returns, never an average of prices in unlike
 * units, and every member over the same two dates. The finest cadence the
 * list publishes decides who is in: the prices quoted daily where there are
 * any, so a weekly one does not cut theirs to its dates; every dated price
 * where none is daily; the monthly ones when that is all there is.
 */
function priceBasket(group: CatalogGroup, now: number): PriceBasket {
  const rows = group.rows.filter((row) => !COMPOSITES.has(row.id));
  const histories = rows.flatMap((row): PriceHistory[] => {
    const card = row.card;
    const series = card?.kind === 'reading' ? card.series : undefined;
    if (!series || series.multi) return [];
    const monthly = series.periods.every((period) => /^[A-Z][a-z]{2} \d{4}$/.test(period));
    const periods = monthly
      ? series.periods.map((period) => {
          const [name, year] = period.split(' ');
          const month = MONTH_ABBR.indexOf(name as string);
          return month < 0 ? null : Number(year) * 12 + month;
        })
      : periodDays(series.periods, yearOf(card?.asOf, new Date(now).getUTCFullYear()));
    const values = new Map<number, number>();
    periods.forEach((period, i) => {
      const value = series.values[i];
      if (period != null && typeof value === 'number' && Number.isFinite(value))
        values.set(period, value);
    });
    return values.size >= 2 ? [{ row, monthly, values }] : [];
  });
  const monthly = !histories.some((history) => !history.monthly);
  const dated = histories.filter((history) => history.monthly === monthly);
  const daily = monthly ? [] : dated.filter(isDaily);
  const members = daily.length > 0 ? daily : dated;
  const shared = [...(members[0]?.values.keys() ?? [])]
    .filter((period) => members.every(({ values }) => values.has(period)))
    .sort((a, b) => a - b);
  return { rows, members, monthly, shared };
}

/**
 * The basket's mean return over `step` days, or months: from the last date
 * every member has, back to the last one at least `step` before it. A day's
 * anchor may be late by a weekend or a holiday, as every week's may
 * (`ANCHOR_SLACK_DAYS`); a month's may not, and a gap is never bridged.
 */
function basketMove(
  { members, monthly, shared }: PriceBasket,
  step: number,
): { pct: number; start: number; end: number } | null {
  const end = shared.at(-1);
  if (end === undefined) return null;
  let start: number | undefined;
  for (let i = shared.length - 2; i >= 0; i -= 1) {
    const period = shared[i] as number;
    if (period > end - step) continue;
    if (end - period <= step + (monthly ? 0 : ANCHOR_SLACK_DAYS)) start = period;
    break;
  }
  if (start === undefined) return null;
  const from = start;
  if (!members.every(({ values }) => values.get(from) !== 0)) return null;
  const pct = mean(
    members.map(({ values }) => {
      const previous = values.get(from) as number;
      return (((values.get(end) as number) - previous) / Math.abs(previous)) * 100;
    }),
  );
  return { pct, start: from, end };
}

function priceFigure(group: CatalogGroup, now: number): GroupFigure {
  const basket = priceBasket(group, now);
  const { rows, members, monthly } = basket;
  const change = basketMove(basket, monthly ? 1 : WEEK_DAYS);
  if (!change) return { coverage: 'No comparable change available for matching dates' };
  const label = (period: number) => {
    if (monthly) return `${MONTH_ABBR[period % 12]} ${Math.floor(period / 12)}`;
    return new Date(period * DAY_MS).toISOString().slice(0, 10);
  };
  return {
    move: summaryDelta(change.pct, monthly ? 'on the month' : WEEK_WINDOW),
    measure: members.length > 1 ? 'average' : undefined,
    coverage: `${label(change.start)}–${label(change.end)} · ${members.length > 1 ? 'equal-weight average' : members[0]?.row.short} · ${members.length} of ${rows.length} prices${members.length < rows.length ? ' · other readings excluded' : ''}`,
  };
}

/** A price list over the ladder's three windows, by the basket's one rule.
 *  Null where the list is monthly: it has no day and no week. */
function priceSpans(group: CatalogGroup, now: number): Spans | null {
  const basket = priceBasket(group, now);
  if (basket.monthly) return null;
  const over = (step: number, window: string): CardDelta | undefined => {
    const change = basketMove(basket, step);
    return change ? summaryDelta(change.pct, window) : undefined;
  };
  return {
    day: over(1, DAY_WINDOW),
    week: over(WEEK_DAYS, WEEK_WINDOW),
    month: over(MONTH_DAYS, MONTH_WINDOW),
  };
}

/**
 * A list's three windows for the menu's first page: its rows as one move
 * over a day, seven days and thirty, shortest first. Null for a list with no
 * week to stand in the middle, which keeps its one number: food is monthly,
 * and the lists under `economy` move by the month or in points.
 *
 * The middle one is the list's own figure (`groupFigure`), and the other two
 * are made the way it is: `world stocks` (`stocksSummary`); companies and
 * crypto averaged, each counted once; the middle currency; the basket of
 * prices quoted daily, over matching dates; the straits' ships added up.
 */
export function groupLadder(group: CatalogGroup, now = Date.now()): WindowMove[] | null {
  const catalog = [group];
  let spans: Spans | null;
  switch (group.key) {
    case 'stocks': {
      const stocks = stocksSummary(catalog);
      return stocks?.move ? stocksLadder(stocks) : null;
    }
    case 'companies':
      spans = { week: companiesSummary(catalog)?.move, ...rowSpans(group.rows, now, mean) };
      break;
    case 'crypto': {
      const rows = group.rows.filter((row) => !COMPOSITES.has(row.id));
      spans = { week: meanWeek(rows).move, ...rowSpans(rows, now, mean) };
      break;
    }
    case 'currencies': {
      const rows = group.rows.filter((row) => isCurrency(row) && row.weekly);
      spans = { week: currenciesSummary(catalog)?.move, ...rowSpans(rows, now, median) };
      break;
    }
    case 'energy':
    case 'metals':
      spans = priceSpans(group, now);
      break;
    case 'straits': {
      const shipping = shippingSummary(catalog, now);
      spans = shipping ? { day: shipping.day, week: shipping.move, month: shipping.month } : null;
      break;
    }
    default:
      return null;
  }
  return spans?.week ? threeRungs(spans) : null;
}

/**
 * A list's thirty days as one line for the menu's first page (`movePath`),
 * made of the rows its three windows are made of and combined the same way.
 * Null where the list prints no windows (`groupLadder`), or has too little
 * history to draw.
 */
export function groupPath(group: CatalogGroup, now = Date.now()): MovePath | null {
  const catalog = [group];
  switch (group.key) {
    case 'stocks':
      return stocksSummary(catalog)?.path ?? null;
    case 'companies':
      return rowPath(group.rows, now);
    case 'crypto':
      return rowPath(
        group.rows.filter((row) => !COMPOSITES.has(row.id)),
        now,
      );
    case 'currencies':
      return rowPath(
        group.rows.filter((row) => isCurrency(row) && row.weekly),
        now,
        middle,
      );
    case 'energy':
    case 'metals': {
      const { members, monthly } = priceBasket(group, now);
      if (monthly) return null;
      return movePath(
        members.map(({ values }) => {
          const days = [...values.keys()].sort((a, b) => a - b);
          return { days, values: days.map((day) => values.get(day) as number) };
        }),
      );
    }
    case 'straits':
      return shippingSummary(catalog, now)?.path ?? null;
    default:
      return null;
  }
}

/** A month for a basket read in days: four weeks, the month a member
 *  published weekly has (the mortgage rate, each Thursday). */
const FOUR_WEEKS = 28;

/**
 * The day a basket read in days is compared with for its month: the latest
 * day every member has that is four weeks back, or up to a few days more
 * where that day was a holiday (`ANCHOR_SLACK_DAYS`). None, and the basket
 * has no month: a gap is never bridged.
 */
function fourWeeksBack(days: readonly number[], from: number): number | undefined {
  let found: number | undefined;
  for (const day of days) {
    const back = from - day;
    if (back < FOUR_WEEKS || back > FOUR_WEEKS + ANCHOR_SLACK_DAYS) continue;
    if (found === undefined || day > found) found = day;
  }
  return found;
}

/**
 * Combine rates at a shared observation period: months for policy, prices
 * and labour; days for the borrowing basket. Changes use the same members
 * at both ends and never parse formatted display values.
 *
 * Every one moves by the month, the borrowing basket too (`fourWeeksBack`).
 * Its yields are quoted daily and it read over seven days, the one row under
 * `economy` that did: it carried `7 days` beside its number, and the section
 * a line saying its changes were monthly "unless noted". A yield's month is
 * also the larger fact: a week of one is a few hundredths of a point.
 */
function rateFigure(group: CatalogGroup, now: number): GroupFigure {
  const isBorrowing = group.key === 'borrowing';
  const isJobs = group.key === 'jobs';
  const rows = isJobs ? group.rows.filter((row) => row.id === 'us-unemployment') : group.rows;
  if (rows.length < (isJobs ? 1 : MIN_MEMBERS)) return {};
  const histories = rows.map((row) => {
    const series = row.card?.kind === 'reading' ? row.card.series : undefined;
    const months = new Map<number, number>();
    if (!series || series.multi || series.unit !== '%') return months;
    if (isBorrowing) {
      const days = periodDays(
        series.periods,
        yearOf(row.card?.asOf, new Date(now).getUTCFullYear()),
      );
      for (let i = 0; i < days.length; i++) {
        const day = days[i];
        const value = series.values[i];
        if (day != null && typeof value === 'number' && Number.isFinite(value))
          months.set(day, value);
      }
      return months;
    }
    for (let i = 0; i < series.periods.length; i++) {
      const match = /^([A-Z][a-z]{2}) (\d{4})$/.exec(series.periods[i] ?? '');
      const value = series.values[i];
      if (!match || typeof value !== 'number' || !Number.isFinite(value)) continue;
      const month = MONTH_ABBR.indexOf(match[1] as string);
      if (month >= 0) months.set(Number(match[2]) * 12 + month, value);
    }
    return months;
  });
  const shared = [...(histories[0]?.keys() ?? [])].filter((month) =>
    histories.every((history) => history.has(month)),
  );
  if (shared.length === 0) return {};
  const month = Math.max(...shared);
  const isPolicy = group.key === 'rates';
  const aggregate = (at: number): number | undefined => {
    if (!histories.every((history) => history.has(at))) return undefined;
    const values = histories.map((history) => history.get(at) as number).sort((a, b) => a - b);
    if (!isPolicy) return values.reduce((sum, n) => sum + n, 0) / values.length;
    const middle = Math.floor(values.length / 2);
    const upper = values[middle];
    const lower = values[middle - 1];
    if (upper === undefined || lower === undefined) return undefined;
    return values.length % 2 ? upper : (lower + upper) / 2;
  };
  const value = aggregate(month);
  if (value === undefined) return {};
  // The places the list's own rows print to: one for inflation and
  // unemployment (`rateDecimals`), two for a policy rate or a yield.
  const places = Math.min(
    ...rows.map(
      (row) => (row.card?.kind === 'reading' ? row.card.series?.decimals : undefined) ?? 2,
    ),
  );
  const rounded = (n: number) => Number(n.toFixed(places));
  // Compare the same members at the matching prior period; never bridge a gap.
  // The difference of the two printed figures, so the level and its move agree.
  const before = isBorrowing ? fourWeeksBack(shared, month) : month - 1;
  const previous = before === undefined ? undefined : aggregate(before);
  const move =
    previous === undefined
      ? undefined
      : deltaOf(rounded(value) - rounded(previous), {
          unit: 'rate',
          decimals: places,
          window: 'on the month',
          flat: `${(0).toFixed(places)} points`,
        });
  const date = new Date(month * DAY_MS);
  const period = isBorrowing
    ? `${MONTH_ABBR[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`
    : `${MONTH_ABBR[month % 12]} ${Math.floor(month / 12)}`;
  const borrowingNames: Record<string, string> = {
    'us-2y': '2-year Treasury',
    'us-10y': '10-year Treasury',
    'us-mortgage': '30-year mortgage',
  };
  const coverage = isBorrowing
    ? `${period} · equal-weight US basket: ${rows.map((row) => borrowingNames[row.id] ?? row.card?.title ?? row.id).join(', ')} · change over four weeks in percentage points`
    : isPolicy
      ? `${period} · median of ${rows.length} central banks · policy rates`
      : isJobs
        ? `${period} · US unemployment rate · monthly change in percentage points`
        : `${period} · US and eurozone · equal-weight average of annual CPI inflation`;
  return {
    level: `${formatNumber(value, places, places)}%`,
    measure: isPolicy ? 'median' : isJobs ? 'rate' : 'average',
    move,
    coverage,
  };
}

/**
 * A list's figure on the menu's first page: the summary of everything in it.
 * Empty for a list that has none to give (see the header for which, and why).
 */
export function groupFigure(group: CatalogGroup, now = Date.now()): GroupFigure {
  const catalog = [group];
  switch (group.key) {
    case 'stocks': {
      const stocks = stocksSummary(catalog);
      if (!stocks) return {};
      return {
        move: stocks.move,
        measure: 'average',
        detail: tallyCaption(stocks.tally),
        coverage: stocks.move ? stocksCoverage(stocks) : undefined,
      };
    }
    case 'companies':
      return { move: companiesSummary(catalog)?.move, measure: 'average' };
    case 'straits': {
      const shipping = shippingSummary(catalog, now);
      return shipping
        ? { move: shipping.move, measure: 'total', detail: shippingCaption(shipping) }
        : {};
    }
    case 'currencies': {
      const currencies = currenciesSummary(catalog);
      return currencies
        ? {
            move: currencies.move,
            measure: 'median',
            detail: tallyCaption(currencies.tally, CURRENCY_TAIL),
          }
        : {};
    }
    case 'energy':
    case 'food':
    case 'metals':
      return priceFigure(group, now);
    case 'crypto':
      // A card built from two others is not a price of its own.
      return {
        move: meanWeek(group.rows.filter((row) => !COMPOSITES.has(row.id))).move,
        measure: 'average',
      };
    case 'ai': {
      const scores = group.rows
        .map((row) => row.score)
        .filter((score): score is number => typeof score === 'number' && Number.isFinite(score));
      if (scores.length < MIN_MEMBERS) return {};
      const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      // Compare a fixed cohort on the current index scale. Releases are
      // steps: carry the latest score available at each boundary forward.
      // Never average formatted row deltas or mix shorter windows into the quarter.
      const gains: number[] = [];
      for (const row of group.rows) {
        const series = row.card?.series;
        if (!series || row.score === undefined || !Number.isFinite(row.score)) continue;
        const change = aiScoreChange(series, now);
        if (change?.fullWindow) gains.push(change.points);
      }
      if (gains.length >= MIN_MEMBERS) {
        return {
          level: formatNumber(mean, 1, 1),
          measure: 'average',
          move: deltaOf(gains.reduce((sum, gain) => sum + gain, 0) / gains.length, {
            unit: 'score',
            window: AI_CHANGE_WINDOW,
          }),
          detail: 'average 90-day capability-score gain',
          coverage: `${gains.length} of ${scores.length} labs with 90 days of history · Epoch AI index points`,
        };
      }
      return {
        level: formatNumber(mean, 1, 1),
        measure: 'average',
        detail: 'average capability score across labs',
      };
    }
    case 'calendar':
      return { level: group.rows[0]?.card?.reading };
    case 'rates':
    case 'inflation':
    case 'jobs':
    case 'borrowing':
      return rateFigure(group, now);
    case 'other':
    case 'predictions':
      return {};
  }
}
