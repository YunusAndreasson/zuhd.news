import type { PermissionOutcome, PrimerSource } from '../constants/analytics';

export interface OfferHistory {
  shown?: boolean;
  consent?: boolean;
  disabled?: boolean;
  refusal?: { day: string; edition: string; visit: number };
  laterShown?: boolean;
  promptChoice?: boolean;
  generation?: number;
  origin?: PrimerSource;
  registration?: 'accepted' | 'failed' | 'pending' | 'removed';
}
export type OfferEntry =
  | { source: 'opened_report' }
  | { source: 'paused_briefing' | 'finished_briefing'; recordingDate: string };

export function offerEdition(entry: OfferEntry, liveEdition: string): string {
  return entry.source === 'opened_report' ? liveEdition : entry.recordingDate;
}

export function offerStage(
  history: OfferHistory,
  source: PrimerSource,
  edition: string,
  day: string,
  visit: number,
  consent: boolean,
): 'first' | 'later' | null {
  if (consent || history.disabled) return null;
  if (!history.shown) return 'first';
  const refused = history.refusal;
  return refused?.edition &&
    !history.laterShown &&
    source === 'finished_briefing' &&
    edition &&
    edition !== refused.edition &&
    day > refused.day &&
    visit !== refused.visit
    ? 'later'
    : null;
}

export function resultText(outcome: PermissionOutcome | undefined): string {
  if (outcome === 'denied') return 'News alerts off';
  if (outcome === 'dismissed') return 'No choice made · alerts off';
  return 'Couldn’t confirm notification permission.';
}
