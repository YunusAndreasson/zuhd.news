// Conflict-event display helpers. Mirrors lib/gdacs.ts in shape: eyebrow
// labels, sub-event names, focal-hero reduction, age-based opacity. Lives
// here (not in the hook) so MiniGlobe can import age math without pulling
// the full data layer.

import type { ConflictEvent, ConflictEventFamily, ConflictSubEvent } from '@shared/types';
import { ageDaysFromIso } from './time';

/** All-caps event-family label that anchors the sheet before the focal
 *  number — matches the EVENT_TYPE_EYEBROW pattern in lib/gdacs.ts so
 *  ConflictSheet and DisasterSheet read with the same typographic shape. */
export const FAMILY_EYEBROW: Record<ConflictEventFamily, string> = {
  kinetic: 'KINETIC EVENT',
  unrest: 'CIVIL UNREST',
};

/** Sentence-case sub-event labels used in the sheet's secondary line and
 *  in DisambiguationSheet rows. ACLED's machine codes (snake_case) are
 *  unreadable in UI; this is the human form. */
export const SUB_EVENT_LABEL: Record<ConflictSubEvent, string> = {
  armed_clash: 'Armed clash',
  air_drone_strike: 'Air or drone strike',
  shelling_artillery: 'Shelling or artillery',
  remote_explosive_ied: 'Explosive or IED',
  attack_on_civilians: 'Attack on civilians',
  abduction_disappearance: 'Abduction or disappearance',
  sexual_violence: 'Sexual violence',
  peaceful_protest: 'Peaceful protest',
  protest_intervention: 'Protest intervention',
  violent_demonstration: 'Violent demonstration',
  mob_violence: 'Mob violence',
};

/** Focal hero pair — the same shape DisasterSheet uses. When fatalities
 *  are reported, that's the focal (numbers earn the visual weight); the
 *  sub-event becomes the supporting clause. When fatalities are zero
 *  (typical for peaceful_protest, sometimes for unrest interventions),
 *  the sub-event takes the focal slot and there's no secondary. */
export interface ConflictHero {
  focal: string;
  secondary: string;
}

export function parseConflictHero(event: ConflictEvent): ConflictHero {
  if (event.fatalities > 0) {
    return {
      focal: `${event.fatalities.toLocaleString('en-US')} killed`,
      secondary: SUB_EVENT_LABEL[event.subEvent],
    };
  }
  return { focal: SUB_EVENT_LABEL[event.subEvent], secondary: '' };
}

/** Days since `eventDate`. Drives age fading on the globe, parallel to
 *  alertAgeDays for GDACS. The fixture window is 14 days so the marker
 *  layer naturally tapers; the recencyAlpha clamp in MiniGlobe still
 *  applies a floor so the oldest events stay visible. */
export function eventAgeDays(event: ConflictEvent, now: number = Date.now()): number {
  return ageDaysFromIso(event.eventDate, now);
}

/** Source display — UCDP rows carry the originating wire/outlet in
 *  `source` (e.g. "Reuters", "AFP", or a Telegram handle). When the
 *  field is empty we attribute the dataset itself: UCDP. */
export function displayConflictSource(source: string): string {
  return source.length > 0 ? source : 'UCDP';
}
