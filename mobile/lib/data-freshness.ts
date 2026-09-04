import type { Indicator } from '@shared/types';
import { DAY_MS } from './time';

/** A timestamp field may be a date-only observation or a full ISO timestamp. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(parsed).toISOString().slice(0, 10) === value;
  }
  return true;
}

/**
 * `current` is a claim about the observation, not the file download. Three
 * calendar days covers weekends and publication timezone edges without
 * presenting last week's measurement as today's development.
 *
 * `maxAgeDays` is the source's publication lag, not a taste. The default fits
 * a price fetched the day it was quoted; a source that publishes a week in
 * arrears passes its own window, or nothing it says can ever be current.
 */
export function isCurrentObservation(
  asOf: string | undefined,
  now: Date = new Date(),
  maxAgeDays = 3,
): boolean {
  if (!asOf || !isIsoDate(asOf)) return false;
  const observed = Date.parse(asOf);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const age = (today - observed) / DAY_MS;
  return age >= -1 && age <= maxAgeDays;
}

/** Oldest input wins for a derived reading: it is only as current as its
 * stalest constituent (for example gold against silver). */
export function oldestObservation(...values: (string | undefined)[]): string | undefined {
  return values.filter(isIsoDate).sort((a, b) => Date.parse(a) - Date.parse(b))[0];
}

export function indicatorObservation(
  indicator: Pick<Indicator, 'asOf'>,
  snapshotAsOf: string,
): string | undefined {
  return isIsoDate(indicator.asOf)
    ? indicator.asOf
    : isIsoDate(snapshotAsOf)
      ? snapshotAsOf
      : undefined;
}

/** Quiet, explicit provenance copy used on cards and detail sheets. */
export function observationLabel(asOf: string | undefined): string {
  if (!asOf || !isIsoDate(asOf)) return '';
  const date = new Date(asOf);
  return `data through ${date.toLocaleDateString('en', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })}`;
}
