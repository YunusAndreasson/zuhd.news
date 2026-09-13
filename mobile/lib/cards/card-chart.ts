import type { RelatedArticleRef, TrendAnnotation } from '@shared/types';
import type { CardDelta, CardSeries } from './types';

/**
 * What a card's chart draws besides its line: where the chip's move started,
 * and when the stories the desk cited were published.
 *
 * Pure and tested, because both answers are a lookup from a label to an index
 * into the series. A miss has to draw nothing, never the wrong day.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
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

/** A story's publication day in the two label forms the series use:
 *  `Sep 12` for a daily series and `Sep 2026` for a monthly one. */
function labelsFor(date: string | undefined): [day: string, month: string] | null {
  if (!date) return null;
  const t = Date.parse(date);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const month = MONTHS[d.getUTCMonth()] as string;
  return [`${month} ${d.getUTCDate()}`, `${month} ${d.getUTCFullYear()}`];
}

/**
 * The cited stories that fall on the chart, as numbered marks. The number is
 * the story's place in the card's "in the news" list, so a dot on the line and
 * a row under the analysis say which is which without a legend. Stories are
 * taken in the order the desk ranked them, the first `MAX_CITED` only, and a
 * story whose day is outside the series is listed but not marked.
 */
export function citedAnnotations(
  series: CardSeries,
  cited: readonly RelatedArticleRef[] | undefined,
): TrendAnnotation[] | undefined {
  if (!cited || cited.length === 0 || series.multi) return undefined;
  const out: TrendAnnotation[] = [];
  const taken = new Set<number>();
  for (let n = 0; n < Math.min(MAX_CITED, cited.length); n++) {
    const labels = labelsFor(cited[n]?.date);
    if (!labels) continue;
    let i = series.periods.lastIndexOf(labels[0]);
    if (i < 0) i = series.periods.lastIndexOf(labels[1]);
    if (i < 0 || i >= series.values.length || taken.has(i)) continue;
    taken.add(i);
    out.push({ atIndex: i, label: String(n + 1) });
  }
  return out.length > 0 ? out : undefined;
}
