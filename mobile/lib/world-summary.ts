import type { GdacsAlert } from '@shared/types';
import { deltaOf, formatCount, formatNumber } from './cards/format';
import type { CardDelta, CardSeries } from './cards/types';
import { WEEK_WINDOW, weekMove, yearOf } from './cards/week-move';
import { type ConflictWeek, weekToll, weekWindow } from './conflict-week';
import { hungerTotal } from './famine-totals';
import {
  type CatalogGroup,
  type CatalogRow,
  COMPOSITES,
  type GroupKey,
} from './instrument-catalog';
import type { FamineCountryTotal } from './overlays';
import { leadNames } from './row-leaders';
import { straitSqueezed } from './valence';

/**
 * Each list on the menu's first page as one number: the summary of everything
 * in it, not its largest mover.
 *
 * The user asked for compound figures worth reading daily, "maybe even our
 * own index" (2026-10-04). Every figure is the same quantity — a move over
 * the past seven days, in percent, green up and red down — so the column
 * reads down the page as how the world moved this week:
 *
 * - **stock markets** — the exchanges' weeks averaged, each counted once. It
 *   is the web rail's `meanIndex` (`public/islands/_map/markets.ts`) rebased
 *   at the week's start, and it is the only index the data allows: no payload
 *   carries a market's value or volume, so there is nothing to weight by.
 * - **largest companies**, **energy, food & metals**, **crypto** — the
 *   members' weeks, averaged the same way. A monthly price has no week and is
 *   left out; so is a card derived from two others (`COMPOSITES`), which
 *   would count gold twice.
 * - **currencies** — the middle currency's week against the dollar. The
 *   median, not the mean: the list holds the euro and the Lebanese pound, and
 *   one collapsing currency would be the whole average.
 * - **straits** — ships through every strait, added day by day. Ships are one
 *   unit, so the sum is a count and not an index.
 * - **AI models**, **coming up** — a level in plain ink, the list's first:
 *   the best score, the nearest date. Neither has a week.
 * - **rates, inflation & jobs**, **predictions** — no figure. A central
 *   bank's rate, a price index and a jobless rate are not one quantity, and
 *   an average of contracts on different questions is of nothing.
 *
 * Each figure is unweighted and exactly as broad as its list; the list's own
 * page prints it again over its members, named (`GroupFigure.measure`).
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
  const move = row.move;
  if (!row.weekly || !move || typeof move.size !== 'number') return null;
  if (move.direction === 'flat') return 0;
  return move.direction === 'up' ? move.size : -move.size;
}

/** Every figure here is the week. One that rounds to nothing prints `0.0%`:
 *  the chip's word, `unchanged`, is a sentence among three numbers. */
const WEEK = { window: WEEK_WINDOW, flat: '0.0%' } as const;

/** Fewer members than this is one market's week under another name. */
const MIN_MEMBERS = 2;

export interface StocksSummary {
  tally: Tally;
  /** The exchanges' weeks averaged, each counted once. Absent with too few. */
  move?: CardDelta;
  /** How many exchanges the average is of: those with a week. */
  members: number;
}

export function stocksSummary(catalog: readonly CatalogGroup[]): StocksSummary | null {
  const exchanges = groupOf(catalog, 'stocks')?.rows.filter((row) => row.exchange) ?? [];
  if (exchanges.length === 0) return null;
  return { tally: tallyOf(exchanges), ...meanWeek(exchanges) };
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
    move: members >= MIN_MEMBERS ? deltaOf(sum / members, WEEK) : undefined,
    members,
  };
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
  /** Those running far enough under their 90-day normal to be the disruption
   *  (`straitSqueezed`): the straits the globe draws pinched. */
  disrupted: number;
  /** The week's move in ships through the straits, summed. */
  move?: CardDelta;
  /** How many straits the sum is of. */
  members: number;
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
  let move: CardDelta | undefined;
  if (summed && summed.members >= MIN_MEMBERS) {
    const year = yearOf(charted[0]?.asOf, new Date(now).getUTCFullYear());
    const week = weekMove(summed.sum.values, summed.sum.periods, year);
    if (week) move = deltaOf(week.pct, WEEK);
  }
  return { total: straits.length, disrupted, move, members: summed?.members ?? 0 };
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
  const weeks = rows
    .map(weekPct)
    .filter((pct): pct is number => pct !== null)
    .sort((a, b) => a - b);
  const n = weeks.length;
  const mid = Math.floor(n / 2);
  const median =
    n === 0
      ? null
      : n % 2 === 1
        ? (weeks[mid] ?? 0)
        : ((weeks[mid - 1] ?? 0) + (weeks[mid] ?? 0)) / 2;
  return {
    tally: tallyOf(rows),
    move: median !== null && n >= MIN_MEMBERS ? deltaOf(median, WEEK) : undefined,
  };
}

export interface GroupFigure {
  /** The list's week as one number. */
  move?: CardDelta;
  /** What `move` is of its list's rows, as the list's own page names it. */
  measure?: 'average' | 'median' | 'total';
  /** For a list with no week: its first row's level, in plain ink. */
  level?: string;
  /** What stands behind the number, for a screen reader: `21 of 26 fell`. */
  detail?: string;
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
      return stocks
        ? { move: stocks.move, measure: 'average', detail: tallyCaption(stocks.tally) }
        : {};
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
    case 'commodities':
    case 'crypto':
      // A card built from two others is not a price of its own.
      return {
        move: meanWeek(group.rows.filter((row) => !COMPOSITES.has(row.id))).move,
        measure: 'average',
      };
    case 'ai':
    case 'calendar':
      return { level: group.rows[0]?.card?.reading };
    case 'rates':
    case 'predictions':
      return {};
  }
}

/** People, short enough to share a line: `134,808`, `19.5M`, `128M`. */
function compactPeople(n: number): string {
  if (n < 1_000_000) return formatCount(n);
  const millions = n / 1_000_000;
  return `${formatNumber(millions, millions < 100 ? 1 : 0)}M`;
}

const counted = (n: number, one: string, many: string) =>
  `${formatCount(n)} ${n === 1 ? one : many}`;

export interface HazardInputs {
  disasters: readonly GdacsAlert[];
  conflictWeek?: ConflictWeek | null;
  famineTotals?: readonly FamineCountryTotal[];
}

/** How many parts the hazards line holds: it shares one caption line. */
const HAZARD_PARTS = 2;

/**
 * The hazards in people, in the order of how live each is: the alerts
 * standing now, the conflict week's dead, the people in hunger. At most two,
 * and only what fits one line (`leadNames`).
 *
 * The conflict toll is never printed without its dates: the source runs about
 * five weeks behind, and a bare toll reads as this week's. Hunger is a sum of
 * analyses from different months (`hungerTotal`); the list it opens says each
 * one's month.
 */
export function hazardParts(hazards: HazardInputs): string[] {
  const parts: string[] = [];
  let red = 0;
  let orange = 0;
  for (const alert of hazards.disasters) {
    if (alert.alertlevel === 'Red') red += 1;
    else if (alert.alertlevel === 'Orange') orange += 1;
  }
  if (red > 0) parts.push(counted(red, 'red alert', 'red alerts'));
  else if (orange > 0) parts.push(counted(orange, 'orange alert', 'orange alerts'));

  const week = hazards.conflictWeek;
  if (week) {
    const dates = weekWindow(week);
    const { killed } = weekToll(week);
    if (dates && killed > 0) parts.push(`${formatCount(killed)} killed, ${dates}`);
  }

  const hunger = hungerTotal(hazards.famineTotals ?? []);
  if (hunger) parts.push(`${compactPeople(hunger.people)} in hunger`);

  return leadNames(parts).slice(0, HAZARD_PARTS);
}
