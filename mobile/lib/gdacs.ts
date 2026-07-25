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

import type { GdacsAlert } from '@shared/types';
import { ageDaysFromIso } from './time';

export type { SeverityHero } from '@shared/gdacs';
export {
  detailKey,
  displaySourceName,
  EVENT_TYPE_EYEBROW,
  parseSeverityHero,
} from '@shared/gdacs';

/** Days since `modifiedDate` — used to fade older markers via the same
 *  recency family hotspots use. Returns 0 for unparsable timestamps so
 *  borderline data still renders at full opacity. */
export function alertAgeDays(alert: GdacsAlert, now: number = Date.now()): number {
  return ageDaysFromIso(alert.modifiedDate, now);
}
