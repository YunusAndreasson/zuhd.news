import type { Indicator } from '@shared/types';
import { periodDays } from '../date-format';
import { type Exchange, exchangeCard, exchangeDelta } from '../markets';
import {
  deltaFrom,
  deltaOf,
  movesInPoints,
  rateDecimals,
  windowChange,
  windowPointChange,
} from './format';
import { currencyMove, quotedInDollars } from './markets';
import type { SwipeCard } from './rank';
import type { CardDelta, WindowMove } from './types';
import {
  DAY_WINDOW,
  dayStep,
  MONTH_DAYS,
  MONTH_WINDOW,
  spanMove,
  WEEK_DAYS,
  WEEK_WINDOW,
  type WeekMove,
  WINDOW_NAMES,
  weekMove,
  yearOf,
} from './week';

/**
 * The gauges' one window: how far a reading moved over the past seven days.
 *
 * Each card measures its own move over the window that suits it: a strait
 * against its 90-day average, a daily price over thirty observations, a
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

export { WEEK_DAYS, WEEK_WINDOW, type WeekMove, weekMove, yearOf } from './week';

// Where it was written and where its callers still find it.
export { periodDays };

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
 * on the strip, in the menu, on its card and in a story's sheet. And a day or
 * thirty the same way, under their own window (`cardWindows`).
 */
function weekDelta(
  week: WeekMove,
  unit: string | undefined,
  pct = week.pct,
  window: string = WEEK_WINDOW,
): CardDelta | undefined {
  if (!movesInPoints(unit)) return deltaOf(pct, { window });
  const first = week.points[0];
  const last = week.points.at(-1);
  if (first === undefined || last === undefined) return undefined;
  return deltaOf(last - first, { unit: 'rate', window });
}

/**
 * A card's seven-day move as the strip prints it, or null when it has none.
 *
 * The quantity is the card's own. A currency card quotes the currency, not the
 * published rate, so the rate's move is inverted with `currencyMove`; a card
 * quoted in dollars (`quotedInDollars`, the euro) already charts the currency
 * and is read as it is. A strait
 * card charts a trailing seven-day average, so its week is that average against
 * the one a week earlier. The chip is coloured by its direction (`moveTone`).
 */
export function gaugeMove(card: SwipeCard, now = Date.now()): GaugeMove | null {
  const span = cardSpan(card, WEEK_DAYS, now);
  if (!span) return null;
  const delta = weekDelta(span.move, card.series?.unit, span.pct);
  return delta ? { delta, pct: span.pct } : null;
}

/** Whether a card quotes a rate that rises as its currency falls, so that a
 *  move read from its series is turned over (`currencyMove`). */
const quotesRate = (card: Pick<SwipeCard, 'id'>): boolean =>
  card.id.startsWith('fx-') && !quotedInDollars(card.id);

/** A card's own quantity over the past `span` days: the series' move, and the
 *  signed percentage of what the card quotes (`gaugeMove`, its inversions).
 *  One day is the series' last step (`dayStep`), so a series published weekly
 *  has none. */
function cardSpan(
  card: SwipeCard,
  span: number,
  now: number,
): { move: WeekMove; pct: number } | null {
  if (card.kind !== 'reading' || !card.series || card.series.multi) return null;
  // An AI lab's line is its releases, in index points: two of them a week
  // apart are not a week's move, and never a percentage (`aiLabCard`).
  if (card.id.startsWith('ai:')) return null;
  const year = yearOf(card.asOf, new Date(now).getUTCFullYear());
  const { values, periods } = card.series;
  const move = span > 1 ? spanMove(values, periods, year, span) : dayStep(values, periods, year);
  if (!move) return null;
  return { move, pct: quotesRate(card) ? currencyMove(move.pct) : move.pct };
}

/**
 * A card's move over the past `span` days as a signed percentage, or null
 * when its series does not reach: the week's rule over another window, for a
 * ladder's day and thirty days (`groupLadder`, `lib/world-summary.ts`). One
 * day is the series' last step (`dayMove`), so a series published weekly has
 * none.
 */
export function gaugeSpan(card: SwipeCard, span: number, now = Date.now()): number | null {
  return cardSpan(card, span, now)?.pct ?? null;
}

/**
 * A card's own quantity on each of its days, for a line of several cards
 * (`movePath`): the series as the card charts it, and a currency's the other
 * way up where the card quotes the rate, as its moves are read (`gaugeMove`).
 */
export function gaugeLevels(
  card: SwipeCard,
  now = Date.now(),
): { days: (number | null)[]; values: number[] } | null {
  if (card.kind !== 'reading' || !card.series || card.series.multi) return null;
  if (card.id.startsWith('ai:')) return null;
  const year = yearOf(card.asOf, new Date(now).getUTCFullYear());
  return {
    days: periodDays(card.series.periods, year),
    values: quotesRate(card) ? card.series.values.map((rate) => 1 / rate) : card.series.values,
  };
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

/** A card's moves over the three windows the menu's table prints. */
export interface CardWindows {
  /** `1 day`, `7 days`, `30 days`, each with its move where the series
   *  reaches: a window it does not reach keeps its place. */
  rungs: WindowMove[];
  /** What the moves are of, where the reading does not say: `the lira`,
   *  under a rate quoted per dollar. */
  subject?: string;
  /** The card's own move, kept where it measures against something else: a
   *  strait against its 90-day average (`CardDelta.versus`). */
  own?: CardDelta;
  /** The day the thirty days began on, as the series labels it, for the
   *  chart's rule (`spanReference`). */
  from?: string;
}

/**
 * The moves a card prints under its reading: the menu's three windows, where
 * its series has a week. Null where it has none (a monthly series, a
 * contract, a lab, a date): that card prints its own move alone.
 *
 * The week is the number the reader followed here. The strip, a globe mark, a
 * menu row and a story's chart all print it, and the card once printed only
 * its own: `Oil ▼0.8%`, in red, opened one that said `▲23% since Aug 17`, in
 * green (2026-10-06). The card then led with the week and kept its own beside
 * it, which for most cards was thirty observations: a second window like the
 * week, counted another way. The menu's table reads a day, seven and thirty
 * (`groupLadder`), so the card reads the same three, by the same functions,
 * and the exact thirty-day figure the table draws as a line is printed here.
 *
 * A card's own move is dropped where it was another stretch of the same
 * series, and kept where it is something else (`versus`). A rate quoted per
 * dollar names what moved: a caret beside it does not say which of the two
 * fell.
 */
export function cardWindows(card: SwipeCard, now = Date.now()): CardWindows | null {
  if (!cardSpan(card, WEEK_DAYS, now)) return null;
  const unit = card.series?.unit;
  const over = (span: number, window: string) => {
    const found = cardSpan(card, span, now);
    return found ? { ...found, delta: weekDelta(found.move, unit, found.pct, window) } : null;
  };
  const spans = [over(1, DAY_WINDOW), over(WEEK_DAYS, WEEK_WINDOW), over(MONTH_DAYS, MONTH_WINDOW)];
  return {
    rungs: WINDOW_NAMES.map((label, i) => ({ label, delta: spans[i]?.delta })),
    ...(quotesRate(card) ? { subject: `the ${lastWord(card.title)}` } : {}),
    ...(card.delta?.versus ? { own: card.delta } : {}),
    ...(spans[2] ? { from: spans[2].move.from } : {}),
  };
}

/** `lira`, of `Turkish lira`: a currency is known by its last word. */
const lastWord = (name: string): string => (name.trim().split(/\s+/).at(-1) ?? name).toLowerCase();

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
 * and down in the sheet. The quantity is the one the sheet prints
 * (`indicatorReading`): the rate, so so many lira to the dollar are not
 * inverted, and the euro, which is printed in dollars, is.
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
  if (week) {
    const pct = quotedInDollars(indicator.id) ? currencyMove(week.pct) : week.pct;
    return weekDelta(week, indicator.unit, pct);
  }
  return movesInPoints(indicator.unit)
    ? deltaFrom(windowPointChange(indicator, 1), {
        unit: 'rate',
        decimals: rateDecimals(indicator),
      })
    : deltaFrom(windowChange(indicator, 1));
}
