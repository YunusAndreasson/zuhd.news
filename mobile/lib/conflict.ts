// Conflict-event display helpers. Mirrors lib/gdacs.ts in shape: eyebrow
// labels, sub-event names, focal-hero reduction, age-based opacity. Lives
// here (not in the hook) so MiniGlobe can import age math without pulling
// the full data layer.

import type { ConflictEvent, ConflictEventFamily, ConflictSubEvent } from '@shared/types';
import { displayCountryName } from './place-names';
import { ageDaysFromIso } from './time';

export interface ConflictVisualMark {
  x: number;
  y: number;
  recencyAlpha: number;
  scale: number;
}

export interface ConflictVisualCluster extends ConflictVisualMark {
  count: number;
}

/** Collapse only the painted conflict glow; hit testing still keeps every event. */
export function collapseConflictVisuals(
  marks: readonly ConflictVisualMark[],
  radius = 11,
): ConflictVisualCluster[] {
  const radius2 = radius * radius;
  const groups: ConflictVisualMark[][] = [];
  for (const mark of marks) {
    const touching = groups.filter((group) =>
      group.some((other) => (other.x - mark.x) ** 2 + (other.y - mark.y) ** 2 < radius2),
    );
    if (touching.length === 0) {
      groups.push([mark]);
      continue;
    }
    const first = touching[0];
    if (!first) continue;
    first.push(mark);
    for (const group of touching.slice(1)) {
      first.push(...group);
      groups.splice(groups.indexOf(group), 1);
    }
  }
  return groups.map((group) => ({
    x: group.reduce((sum, mark) => sum + mark.x, 0) / group.length,
    y: group.reduce((sum, mark) => sum + mark.y, 0) / group.length,
    recencyAlpha: Math.max(...group.map((mark) => mark.recencyAlpha)),
    scale: Math.max(...group.map((mark) => mark.scale)),
    count: group.length,
  }));
}

/** Distinguish reports in a crowded map target without exposing feed IDs. */
export function conflictChooserDetails(events: ConflictEvent[]): Map<string, string> {
  const base = (e: ConflictEvent) =>
    [e.eventDate, e.location || e.admin1, displayCountryName(e.country) ?? e.country]
      .filter(Boolean)
      .join(' · ');
  const labels = events.map(base);
  const details = events.map((e, i) => {
    if (labels.filter((label) => label === labels[i]).length < 2) return labels[i] ?? '';
    return [labels[i], [e.actor1, e.actor2].filter(Boolean).join(' / ')]
      .filter(Boolean)
      .join(' · ');
  });
  return new Map(
    events.map((e, i) => {
      const label = details[i] ?? '';
      const peers = details.flatMap((value, index) => (value === label ? [index] : []));
      return [
        e.id,
        peers.length > 1 ? `${label} · report ${peers.indexOf(i) + 1} of ${peers.length}` : label,
      ];
    }),
  );
}

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
