import type { GdacsAlert } from '@shared/types';
import { deltaOf, formatCount, formatNumber } from './cards/format';
import type { CardDelta, CardSeries } from './cards/types';
import { WEEK_WINDOW, weekMove, yearOf } from './cards/week-move';
import { type ConflictWeek, weekToll, weekWindow } from './conflict-week';
import { hungerTotal } from './famine-totals';
import type { CatalogGroup, CatalogRow, GroupKey } from './instrument-catalog';
import type { FamineCountryTotal } from './overlays';
import { leadNames } from './row-leaders';
import { straitSqueezed } from './valence';

/**
 * The menu's overview: how things are going, a line per area.
 *
 * The root's rows each print their list's largest mover, which says what
 * moved most and nothing about the whole. The user asked for compound figures
 * worth reading daily, "maybe even our own index" (2026-10-04). These are
 * four, each in its own unit, and none of them mixes two areas:
 *
 * - **stocks** — the exchanges' weeks, averaged, each counted once. It is the
 *   web rail's `meanIndex` (`public/islands/_map/markets.ts`) rebased at the
 *   week's start, and it is the only index the data allows: no payload
 *   carries a market's value or volume, so there is nothing to weight by. It
 *   is unweighted and its membership is editorial, and the row's hint and the
 *   list it opens both say so.
 * - **shipping** — ships through every strait, summed. Ships are one unit, so
 *   the sum is a count and not an index. The web removed a straits composite
 *   (2026-08-08) because one number hid which strait had moved; here the
 *   caption says how many are disrupted and the `straits` row under it still
 *   names the largest mover.
 * - **currencies** — a count and no average: the basket holds the euro and
 *   the Lebanese pound, and a mean of their weeks would be one member's.
 * - **hazards** — people, with the dates the source gives. No move: the
 *   conflict file is one week and the hunger analyses are months old, so
 *   there is no "before" to measure against.
 *
 * **One score across all four was considered and rejected.** It needs weights
 * nobody publishes, and a colour that calls the result good or bad, which is
 * the judgement `moveTone` exists to keep off the screen.
 *
 * Every figure is the week the strip prints, read off the catalog's own rows,
 * so a line here cannot disagree with the list it opens.
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
  let sum = 0;
  let members = 0;
  for (const row of exchanges) {
    const pct = weekPct(row);
    if (pct === null) continue;
    sum += pct;
    members += 1;
  }
  const move = members >= MIN_MEMBERS ? deltaOf(sum / members, { window: WEEK_WINDOW }) : undefined;
  return { tally: tallyOf(exchanges), move, members };
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
    if (week) move = deltaOf(week.pct, { window: WEEK_WINDOW });
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

/**
 * How many currencies rose and fell against the dollar this week. The rows
 * already quote the currency, not the published rate (`currencyMove`), so
 * `rose` is a currency that buys more dollars than it did. A currency with no
 * week is left out: it cannot be said to have done either.
 */
export function currencySummary(catalog: readonly CatalogGroup[]): Tally | null {
  const rows =
    groupOf(catalog, 'currencies')?.rows.filter((row) => isCurrency(row) && row.weekly) ?? [];
  return rows.length > 0 ? tallyOf(rows) : null;
}

export const CURRENCY_TAIL = 'against the dollar';

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
