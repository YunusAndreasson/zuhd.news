import { chokepointValence, type RiseMeans, valenceOf } from '../valence';
import { formatMagnitudePct } from './format';
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
 * move. It returns null, and the reading stays in the instruments list.
 */

export const WEEK_DAYS = 7;
/**
 * How late the anchor may be. A market closed on the weekend or a holiday has
 * no close exactly seven days back, and the one before it is still that week's
 * open. Past three days the "week" would really be ten, so the reading gets no
 * seven-day move rather than an elastic one.
 */
const ANCHOR_SLACK_DAYS = 3;

const MS_PER_DAY = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
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
      out[i] = Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])) / MS_PER_DAY;
      y = Number(iso[1]);
      laterMonth = Number(iso[2]) - 1;
      continue;
    }
    const day = DAY_LABEL.exec(label);
    if (!day) return out;
    const month = MONTHS.indexOf(day[1] as string);
    if (month < 0) return out;
    if (laterMonth !== null && month > laterMonth) y -= 1;
    laterMonth = month;
    out[i] = Date.UTC(y, month, Number(day[2])) / MS_PER_DAY;
  }
  return out;
}

export interface WeekMove {
  /** Signed percentage change from the anchor to the newest observation. */
  pct: number;
  /** The observations from the anchor to the newest, for the gauge's line. */
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

/** What a rise means for this card, read back off the chip it already carries,
 *  so the gauge and the card cannot colour the same direction differently. */
function riseMeansOf(delta: CardDelta | undefined): RiseMeans {
  if (!delta || delta.direction === 'flat' || delta.valence === 'neutral') return null;
  if (delta.direction === 'up') return delta.valence;
  return delta.valence === 'favorable' ? 'unfavorable' : 'favorable';
}

function yearOf(asOf: string | undefined, fallback: number): number {
  const m = asOf ? /^(\d{4})/.exec(asOf) : null;
  return m ? Number(m[1]) : fallback;
}

export interface GaugeMove {
  delta: CardDelta;
  points: number[];
}

/**
 * A card's seven-day move as the strip prints it, or null when it has none.
 *
 * The quantity is the card's own. A currency card quotes the currency, not the
 * published rate, so the rate's move is inverted with `currencyMove`. A strait
 * card charts a trailing seven-day average, so its week is that average against
 * the one a week earlier. It is coloured by the strait's own one-sided rule:
 * the fall is the disruption, and a rebound stays slate.
 */
export function gaugeMove(card: SwipeCard, now = Date.now()): GaugeMove | null {
  if (card.kind !== 'reading' || !card.series || card.series.multi) return null;
  const year = yearOf(card.asOf, new Date(now).getUTCFullYear());
  const move = weekMove(card.series.values, card.series.periods, year);
  if (!move) return null;
  const pct = card.id.startsWith('fx-') ? currencyMove(move.pct) : move.pct;
  const magnitude = formatMagnitudePct(pct);
  const window = `over ${WEEK_DAYS} days`;
  const size = Math.abs(pct);
  if (magnitude === null) {
    return {
      delta: { direction: 'flat', magnitude: 'unchanged', window, valence: 'neutral', size },
      points: move.points,
    };
  }
  const direction = pct > 0 ? 'up' : 'down';
  const valence = card.id.startsWith('strait-')
    ? chokepointValence(pct / 100)
    : valenceOf(direction, riseMeansOf(card.delta));
  return { delta: { direction, magnitude, window, valence, size }, points: move.points };
}
