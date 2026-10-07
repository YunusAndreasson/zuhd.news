import type { Indicator } from '@shared/types';
import { MONTH_ABBR } from '../date-format';
import { type Exchange, exchangeCard, exchangeDelta } from '../markets';
import { DAY_MS } from '../time';
import { deltaFrom, deltaOf, movesInPoints, windowChange, windowPointChange } from './format';
import { currencyMove } from './markets';
import type { SwipeCard } from './rank';
import type { CardDelta } from './types';

/**
 * The gauges' one window: how far a reading moved over the past seven days.
 *
 * Each card measures its own move over the window that suits it: a strait
 * against its 90-day normal, a daily price over thirty observations, a
 * currency since the start of its series, an exchange over a streak of
 * sessions. That is right on the card, which prints the window beside the
 * chip. It was wrong in the strip, which printed no window and sorted those
 * moves against each other: "−57%" beside "4.8%" was a quarter's gap from
 * normal beside four sessions, and "largest move first" ranked a strait's
 * condition against an index's week. One calendar window makes the row a
 * comparison, which is what a row of gauges is for. The web's money rail
 * already works this way.
 *
 * **Calendar days, not observations.** Seven observations of a series that
 * skips weekends span nine days; seven of a series with gaps span more. The
 * anchor is the last observation on or before seven days before the newest one.
 *
 * **Periods are labels, not dates.** A card carries "Sep 7" or "May 2026",
 * because that is what the chart's axis prints. A day label is read as a day
 * of the year, and the year is counted back from the card's `asOf` each time
 * the months wrap. A month label means a monthly series, which has no seven-day
 * move. It returns null, and the reading stays in the menu's lists.
 */

export const WEEK_DAYS = 7;
/** A seven-day move's window, as a chip carries it. A row that prints a move
 *  without its window checks for this one: every other window is printed. */
export const WEEK_WINDOW = `over ${WEEK_DAYS} days`;
/**
 * How late the anchor may be. A market closed on the weekend or a holiday has
 * no close exactly seven days back, and the one before it is still that week's
 * open. Past three days the "week" would really be ten, so the reading gets no
 * seven-day move rather than an elastic one.
 */
const ANCHOR_SLACK_DAYS = 3;

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_LABEL = /^([A-Z][a-z]{2}) (\d{1,2})$/;

/**
 * Each period as a day number (days since the epoch), or null where the label
 * is not a day. The last label is placed in `year`, and the year steps back
 * whenever the month increases going backwards (a series running Dec → Jan).
 */
export function periodDays(periods: readonly string[], year: number): (number | null)[] {
  const out: (number | null)[] = new Array(periods.length).fill(null);
  let y = year;
  let laterMonth: number | null = null;
  for (let i = periods.length - 1; i >= 0; i--) {
    const label = periods[i] ?? '';
    const iso = ISO_DAY.exec(label);
    if (iso) {
      out[i] = Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])) / DAY_MS;
      y = Number(iso[1]);
      laterMonth = Number(iso[2]) - 1;
      continue;
    }
    const day = DAY_LABEL.exec(label);
    if (!day) return out;
    const month = MONTH_ABBR.indexOf(day[1] as string);
    if (month < 0) return out;
    if (laterMonth !== null && month > laterMonth) y -= 1;
    laterMonth = month;
    out[i] = Date.UTC(y, month, Number(day[2])) / DAY_MS;
  }
  return out;
}

export interface WeekMove {
  /** Signed percentage change from the anchor to the newest observation. */
  pct: number;
  /** The observations from the anchor to the newest. */
  points: number[];
  /** The anchor's own label. */
  from: string;
}

/** The seven-day move of a series, or null when it has none. */
export function weekMove(
  values: readonly number[],
  periods: readonly string[],
  year: number,
): WeekMove | null {
  const n = values.length;
  if (n < 2 || periods.length !== n) return null;
  const days = periodDays(periods, year);
  const lastDay = days[n - 1];
  const last = values[n - 1];
  if (lastDay == null || typeof last !== 'number' || !Number.isFinite(last)) return null;
  const target = lastDay - WEEK_DAYS;
  for (let i = n - 2; i >= 0; i--) {
    const d = days[i];
    if (d == null) return null;
    if (d > target) continue;
    if (lastDay - d > WEEK_DAYS + ANCHOR_SLACK_DAYS) return null;
    const from = values[i];
    if (typeof from !== 'number' || !Number.isFinite(from) || from === 0) return null;
    return {
      pct: ((last - from) / Math.abs(from)) * 100,
      points: values.slice(i),
      from: periods[i] ?? '',
    };
  }
  return null;
}

/** The year a series' last label falls in: its card's `asOf`, or `fallback`. */
export function yearOf(asOf: string | undefined, fallback: number): number {
  const m = asOf ? /^(\d{4})/.exec(asOf) : null;
  return m ? Number(m[1]) : fallback;
}

export interface GaugeMove {
  delta: CardDelta;
  /** Signed, unrounded percentage for ordering and aggregation, before display
   *  rounding. Relative even where the chip is in points: it is what places a
   *  yield among the strip's percentages. */
  pct: number;
}

/**
 * A week as a chip: a percentage, or percentage points for a series already
 * in per cent (`movesInPoints`). One function, so a yield's week is one number
 * on the strip, in the menu, on its card and in a story's sheet.
 */
function weekDelta(
  week: WeekMove,
  unit: string | undefined,
  pct = week.pct,
): CardDelta | undefined {
  if (!movesInPoints(unit)) return deltaOf(pct, { window: WEEK_WINDOW });
  const first = week.points[0];
  const last = week.points.at(-1);
  if (first === undefined || last === undefined) return undefined;
  return deltaOf(last - first, { unit: 'rate', window: WEEK_WINDOW });
}

/**
 * A card's seven-day move as the strip prints it, or null when it has none.
 *
 * The quantity is the card's own. A currency card quotes the currency, not the
 * published rate, so the rate's move is inverted with `currencyMove`. A strait
 * card charts a trailing seven-day average, so its week is that average against
 * the one a week earlier. The chip is coloured by its direction (`moveTone`).
 */
export function gaugeMove(card: SwipeCard, now = Date.now()): GaugeMove | null {
  if (card.kind !== 'reading' || !card.series || card.series.multi) return null;
  // An AI lab's line is its releases, in index points: two of them a week
  // apart are not a week's move, and never a percentage (`aiLabCard`).
  if (card.id.startsWith('ai:')) return null;
  const year = yearOf(card.asOf, new Date(now).getUTCFullYear());
  const move = weekMove(card.series.values, card.series.periods, year);
  if (!move) return null;
  const pct = card.id.startsWith('fx-') ? currencyMove(move.pct) : move.pct;
  const delta = weekDelta(move, card.series.unit, pct);
  return delta ? { delta, pct } : null;
}

/**
 * A currency's move with the word that says which way it is: `weaker over 7
 * days`. A caret beside a rate is only unambiguous once the line names what
 * fell. A window that already says it, and a flat move, are left alone.
 */
export function namingCurrency(card: Pick<SwipeCard, 'id'>, delta: CardDelta): CardDelta {
  if (
    !card.id.startsWith('fx-') ||
    delta.direction === 'flat' ||
    /^(stronger|weaker)\b/.test(delta.window ?? '')
  ) {
    return delta;
  }
  const word = delta.direction === 'up' ? 'stronger' : 'weaker';
  return { ...delta, window: `${word} ${delta.window ?? ''}`.trim() };
}

/**
 * The moves a card prints under its reading: the past seven days first, then
 * its own window.
 *
 * The week is the number the reader followed here. The strip, a globe mark, a
 * menu row and a story's chart all print it, with no window beside it, and the
 * card printed only its own: `Hormuz ▼10%` opened a card that said `▼43% vs
 * its 90-day normal`, and `Oil ▼0.8%`, in red, one that said `▲23% since Aug
 * 17`, in green. Against the live data every one of the strip's 61 gauges
 * opened a card with another number, and 24 with the other colour
 * (2026-10-06). Both now, each beside its window, so the first number on the
 * card is the one that was pressed and the second says what else is true.
 *
 * A card with no week (a monthly series, a contract, a date) prints its own
 * move alone. One whose own move is the week prints it once: under the week's
 * name, or as the same move to the decimal a chip prints, which is what a
 * market signal measured over five sessions is.
 */
export function cardMoves(card: SwipeCard, now = Date.now()): CardDelta[] {
  const followed = gaugeMove(card, now)?.delta;
  const own = card.delta;
  if (!followed) return own ? [own] : [];
  const week = namingCurrency(card, followed);
  return own && !isSameMove(own, week) ? [week, own] : [week];
}

/** Half the decimal a chip prints a percentage to: nearer than this, two
 *  moves are one number. */
const SAME_MOVE_PCT = 0.05;

function isSameMove(own: CardDelta, week: CardDelta): boolean {
  if (own.window?.endsWith(WEEK_WINDOW)) return true;
  if (own.direction === 'flat' || own.direction !== week.direction) return false;
  if (own.size === undefined || week.size === undefined) return false;
  return Math.abs(own.size - week.size) < SAME_MOVE_PCT;
}

/**
 * An exchange's move as the strip prints it: the past seven days.
 *
 * For the globe's mark and the markets list, which printed the latest session
 * against the prior close (2026-09-25). Tapping `BIST 100 ▼2.9%` on the strip
 * flew to Istanbul, where the mark read `↑0.09%` — one market, two numbers,
 * and nothing on screen said the windows differed. A series with no week
 * falls back to the session: the strip leaves such an exchange out, so there
 * is no week number anywhere for it to disagree with.
 */
export function exchangeMove(
  exchange: Exchange,
  card: SwipeCard = exchangeCard(exchange),
  now = Date.now(),
): CardDelta {
  return gaugeMove(card, now)?.delta ?? exchangeDelta(exchange);
}

/**
 * An indicator's move for a sheet that shows the indicator itself (an entity
 * tapped in a story), in the gauges' grammar: the seven-day move where the
 * series has a week, and the last step, with the day it started, where it
 * does not.
 *
 * `EntitySheet` printed "+0.3% vs prev" for one step while the card for the same
 * indicator printed a thirty-observation chip, so Brent could read up on the card
 * and down in the sheet. The quantity is the published series as it is: this
 * sheet prints the rate, not the currency, so there is no inversion here.
 * A prediction contract moves in points, never as a percentage of a percentage,
 * and so does a series already in per cent, as its card prints it
 * (`movesInPoints`): a monthly rate by its last step, a yield by its week.
 */
export function indicatorMove(indicator: Indicator, now = Date.now()): CardDelta | undefined {
  if (indicator.source === 'polymarket') {
    return deltaFrom(windowPointChange(indicator, 1), { unit: 'points' });
  }
  const year = yearOf(indicator.asOf, new Date(now).getUTCFullYear());
  const week = weekMove(indicator.values, indicator.periods, year);
  if (week) return weekDelta(week, indicator.unit);
  return movesInPoints(indicator.unit)
    ? deltaFrom(windowPointChange(indicator, 1), { unit: 'rate' })
    : deltaFrom(windowChange(indicator, 1));
}
