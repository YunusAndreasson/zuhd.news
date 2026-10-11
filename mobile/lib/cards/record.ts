import {
  PRICE_RECORD,
  type RecordWords,
  seriesRecord,
  recordLine as spanRecordLine,
} from '@shared/chart/record';
import { periodDates } from '../date-format';
import { DAY_MS } from '../time';

// Whether the newest reading is a record in its own series, and since when:
// the site's arithmetic and its sentence (`@shared/chart/record`), with what
// only the app has. Its series name currencies, and its chart's span is read
// off the labels by its own date parser.

export { RECORD_MIN_RUN, seriesRecord, TRAFFIC_RECORD } from '@shared/chart/record';

/** For a series of the currency itself: dollars to the euro. */
export const CURRENCY_RECORD: RecordWords = { high: 'Strongest', low: 'Weakest' };
/** For a series of so many to the dollar, where a high is the currency's low. */
export const RATE_RECORD: RecordWords = { high: 'Weakest', low: 'Strongest' };

/** The days a chart's labels span, or undefined where they are not dates. */
function spanDays(periods: readonly string[], now: number): number | undefined {
  const dates = periodDates(periods, now);
  const first = dates?.[0];
  const last = dates?.at(-1);
  return first && last ? (last.getTime() - first.getTime()) / DAY_MS : undefined;
}

/**
 * The record as the card's one caption sentence: `Highest since Aug 12.`, or
 * `Lowest in three months.` where nothing on the chart is lower. Undefined
 * where there is no record, it has stood for less than `min` observations, or
 * the chart's own span cannot be read off its labels.
 */
export function recordLine(
  values: readonly number[],
  periods: readonly string[],
  words: RecordWords = PRICE_RECORD,
  { min, now = Date.now() }: { min?: number; now?: number } = {},
): string | undefined {
  // Only a record nothing on the chart beats is said over the chart's span,
  // and the labels are parsed for no other.
  const record = seriesRecord(values, periods);
  return spanRecordLine(values, periods, words, {
    ...(min === undefined ? {} : { min }),
    spanDays: record && !record.since ? spanDays(periods, now) : undefined,
  });
}
