import type { RelatedArticleRef, TrendAnnotation } from '@shared/types';
import { MONTH_ABBR } from '../date-format';
import { deltaOf, movesInPoints } from './format';
import { currencyMove } from './markets';
import type { Card, CardDelta, CardSeries } from './types';

/**
 * What a card's chart draws besides its line: where the chip's move started,
 * and when the stories the desk cited were published.
 *
 * Pure and tested, because both answers are a lookup from a label to an index
 * into the series. A miss has to draw nothing, never the wrong day.
 */

/** The chip's window names the day it opened on: "since Jul 24", "weaker since Jul 24". */
const SINCE = /(?:^|\s)since (.+)$/;

/** How many cited stories a card lists and marks. */
export const MAX_CITED = 3;

/**
 * The value the chip's move is measured from, as a dashed rule labelled with
 * its day. The chip says "▲ 4.8% since Jul 24"; without the rule the reader has
 * to find Jul 24 on an axis that prints three dates. Null when the card already
 * draws a reference (a strait's normal), when the window names no day, or when
 * that day is not in the series.
 */
export function windowReference(
  series: CardSeries,
  delta: CardDelta | undefined,
): CardSeries['reference'] {
  if (series.reference || series.multi || !delta?.window) return undefined;
  const match = SINCE.exec(delta.window);
  if (!match) return undefined;
  const label = (match[1] as string).trim();
  const i = series.periods.lastIndexOf(label);
  if (i < 0 || i >= series.values.length - 1) return undefined;
  const value = series.values[i];
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return { value, label: `since ${label}` };
}

/**
 * Where a card's longest window began, as a dashed rule: the value on the
 * day its thirty days opened, under the words the window's head uses. The
 * card's third number is the move from that rule to the line's end. Nothing
 * where the card already draws a level, or the day is not on the chart.
 */
export function spanReference(
  series: CardSeries,
  from: string | undefined,
  label: string,
): CardSeries['reference'] {
  if (series.reference || series.multi || !from) return undefined;
  const i = series.periods.lastIndexOf(from);
  if (i < 0 || i >= series.values.length - 1) return undefined;
  const value = series.values[i];
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return { value, label };
}

/** A story's publication day in the two label forms the series use:
 *  `Sep 12` for a daily series and `Sep 2026` for a monthly one. */
function labelsFor(date: string | undefined): [day: string, month: string] | null {
  if (!date) return null;
  const t = Date.parse(date);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const month = MONTH_ABBR[d.getUTCMonth()] as string;
  return [`${month} ${d.getUTCDate()}`, `${month} ${d.getUTCFullYear()}`];
}

/** Between two story numbers that share a label: `1 · 2`. */
export const CITED_JOIN = ' · ';

/**
 * The cited stories that fall on the chart, as numbered marks. The number is
 * the story's place in the card's "in the news" list, so a dot on the line and
 * a row under the analysis say which is which without a legend. Stories are
 * taken in the order the desk ranked them, the first `MAX_CITED` only, and a
 * story whose day is outside the series is listed but not marked. Two stories
 * on one day share its dot, `1 · 2`; the second used to be dropped, so a
 * listed story with a day on the chart had no mark.
 */
export function citedAnnotations(
  series: CardSeries,
  cited: readonly RelatedArticleRef[] | undefined,
): TrendAnnotation[] | undefined {
  if (!cited || cited.length === 0 || series.multi) return undefined;
  const out: TrendAnnotation[] = [];
  for (let n = 0; n < Math.min(MAX_CITED, cited.length); n++) {
    const labels = labelsFor(cited[n]?.date);
    if (!labels) continue;
    let i = series.periods.lastIndexOf(labels[0]);
    if (i < 0) i = series.periods.lastIndexOf(labels[1]);
    if (i < 0 || i >= series.values.length) continue;
    const shared = out.find((mark) => mark.atIndex === i);
    if (shared) shared.label += `${CITED_JOIN}${n + 1}`;
    else out.push({ atIndex: i, label: String(n + 1) });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * The labels over a chart's cited marks, one per crowd. Marks on neighbouring
 * days printed their numbers edge to edge — a `3` on Sep 14 beside a `1` on
 * Sep 15 read as 31 — so marks whose labels would come within `gap` of each
 * other share one, their numbers in the order the marks sit on the line and
 * centred over them. Every mark keeps its own dot and leader.
 *
 * `charWidth` is one label character's width, for sizing a label before it
 * has been laid out.
 */
export function citedLabels(
  marks: readonly { x: number; label: string }[],
  charWidth: number,
  gap: number,
): { x: number; label: string }[] {
  const sorted = [...marks].sort((a, b) => a.x - b.x);
  const crowds: { x0: number; x1: number; label: string }[] = [];
  for (const mark of sorted) {
    const last = crowds[crowds.length - 1];
    const reach = last ? ((last.label.length + mark.label.length) * charWidth) / 2 + gap : 0;
    if (last && mark.x - (last.x0 + last.x1) / 2 < reach) {
      last.label += `${CITED_JOIN}${mark.label}`;
      last.x1 = mark.x;
    } else {
      crowds.push({ x0: mark.x, x1: mark.x, label: mark.label });
    }
  }
  return crowds.map((crowd) => ({ x: (crowd.x0 + crowd.x1) / 2, label: crowd.label }));
}

/** What a move on a card's chart is counted in: a share of the reading, the
 *  percentage points of a rate, a contract's points, an index's score. */
type MoveUnit = 'percent' | 'rate' | 'points' | 'score';

/** A card's unit of move, as its chips are counted (`deltaOf`): a contract
 *  and a lab's score never move as a percentage, and neither does a series
 *  already in per cent (`movesInPoints`). */
export function moveUnitOf(card: Pick<Card, 'id' | 'kind'>, series: CardSeries): MoveUnit {
  if (card.kind === 'belief') return 'points';
  if (card.id.startsWith('ai:')) return 'score';
  return movesInPoints(series.unit) ? 'rate' : 'percent';
}

/** The window a scrub's move is said over: from the day under the finger. */
export const SINCE_WINDOW = 'since';

/**
 * The move from one observation to the newest, as the chip every surface
 * prints: what a scrub says under the day the finger is on. The readout gave
 * a value and a day, and the question a reader holding a day has is how far
 * it has come since.
 *
 * Counted as the card's own moves are (`moveUnitOf`), and a rate drawn turned
 * over is read as the currency (`currencyMove`), so the chip points the way
 * the line went. Nothing for the newest observation, or on a chart of several
 * lines.
 */
export function moveSince(
  series: CardSeries,
  index: number,
  unit: MoveUnit = 'percent',
): CardDelta | undefined {
  const last = series.values.length - 1;
  if (series.multi || index < 0 || index >= last) return undefined;
  const from = series.values[index];
  const to = series.values[last];
  if (typeof from !== 'number' || typeof to !== 'number') return undefined;
  if (!Number.isFinite(from) || !Number.isFinite(to)) return undefined;
  if (unit !== 'percent') {
    return deltaOf(to - from, { unit, window: SINCE_WINDOW, decimals: series.decimals });
  }
  if (from === 0) return undefined;
  const pct = ((to - from) / Math.abs(from)) * 100;
  return deltaOf(series.inverted ? currencyMove(pct) : pct, { window: SINCE_WINDOW });
}
