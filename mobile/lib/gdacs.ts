// GDACS display helpers.
//
// The parser + detail fetcher moved to `scripts/lib/gdacs.js` (server-side,
// runs once per cycle); mobile reads the pre-parsed snapshot from
// /api/gdacs.json. The render-time reductions — eyebrow labels, source-code
// display names, severityText → focal-number — moved again, to `shared/gdacs.ts`,
// once the web map started opening the same alerts from the same endpoint. They
// are re-exported here so this module stays the app's single import site for
// anything GDACS-shaped.
//
// What remains local is `alertAgeDays`, which depends on `./time` and on the
// app's opacity conventions — the web map ages markers on its own decay curve.

import { parseSeverityHero as parseSharedSeverityHero } from '@shared/gdacs';
import type { GdacsAlert, GdacsDetail } from '@shared/types';
import { ageDaysFromIso } from './time';

export {
  displaySourceName,
  EVENT_TYPE_EYEBROW,
} from '@shared/gdacs';

/** Flood magnitude zero is a provider placeholder, not a measured severity. */
export function parseSeverityHero(alert: GdacsAlert) {
  if (alert.eventtype === 'FL' && /^\s*Magnitude\s+0(?:\.0+)?\s*$/i.test(alert.severityText)) {
    return { focal: `${alert.alertlevel} alert`, secondary: 'Flood severity unavailable' };
  }
  return parseSharedSeverityHero(alert);
}

/** Days since `modifiedDate` — used to fade older markers via the same
 *  recency family hotspots use. Returns 0 for unparsable timestamps so
 *  borderline data still renders at full opacity. */
export function alertAgeDays(alert: GdacsAlert, now: number = Date.now()): number {
  return ageDaysFromIso(alert.modifiedDate, now);
}

/** Detail is pre-fetched only for event types with population estimates. */
export function gdacsDetailFor(
  alert: GdacsAlert | null,
  details: Record<string, GdacsDetail>,
): GdacsDetail | null {
  if (!alert || (alert.eventtype !== 'EQ' && alert.eventtype !== 'TC')) return null;
  return details[`${alert.eventtype}:${alert.eventid}`] ?? null;
}

/**
 * A hazard pictogram's size on the globe, as a fraction of its 22 pt glyph
 * box, by alert level. Every level drew at the full box until 2026-09-25, so
 * a faded Green earthquake — the low-severity bulk of the feed — was as large
 * as a Red one and larger than every story beacon it sat among. The web sizes
 * its hazards by severity and adds a fixed bump per level on top (Orange 3 px,
 * Red 6 px); the app has the level only, so the level carries it. Green stays
 * large enough for a pictogram's inner detail — an earthquake's three rings —
 * to stay apart.
 */
export function gdacsGlyphScale(level: GdacsAlert['alertlevel']): number {
  return level === 'Red' ? 1 : level === 'Orange' ? 0.9 : 0.8;
}

/**
 * The alerts the globe draws, in the order it paints them: Greens
 * round-robined across event types and capped at `GREEN_CAP`, then every
 * Orange, then every Red, so consequential marks paint over ambient ones.
 *
 * Round-robin surfaces visual diversity — floods, droughts, fires, quakes —
 * instead of letting the most frequent type monopolise (EQ and WF typically
 * own ~80% of the raw count). The cap is generous, since perf is not the
 * constraint: a feed of ~100 Greens fits; it only binds on a pathological
 * feed. Shared with the menu's `world hazards` list, which has to hold exactly
 * the marks the globe draws — it is their accessible path.
 */
const GREEN_CAP = 100;
const GDACS_TYPES: GdacsAlert['eventtype'][] = ['EQ', 'TC', 'FL', 'VO', 'DR', 'WF'];

export function globeGdacsAlerts(alerts: readonly GdacsAlert[]): GdacsAlert[] {
  const byType: Record<string, GdacsAlert[]> = {};
  for (const t of GDACS_TYPES) byType[t] = [];
  for (const a of alerts) {
    if (a.alertlevel === 'Green') byType[a.eventtype]?.push(a);
  }
  for (const t of GDACS_TYPES) {
    byType[t]?.sort((a, b) => Date.parse(b.modifiedDate) - Date.parse(a.modifiedDate));
  }
  // Take the most recent of each type, then the second of each, and so on,
  // until the cap or every list is exhausted.
  const greens: GdacsAlert[] = [];
  let round = 0;
  let progressed = true;
  while (greens.length < GREEN_CAP && progressed) {
    progressed = false;
    for (const t of GDACS_TYPES) {
      const list = byType[t];
      if (!list || round >= list.length) continue;
      const item = list[round];
      if (!item) continue;
      greens.push(item);
      progressed = true;
      if (greens.length >= GREEN_CAP) break;
    }
    round++;
  }
  const oranges = alerts.filter((a) => a.alertlevel === 'Orange');
  const reds = alerts.filter((a) => a.alertlevel === 'Red');
  return [...greens, ...oranges, ...reds];
}
