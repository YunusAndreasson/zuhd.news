/**
 * Pick the most trustworthy finite duration available to the player UI.
 *
 * Native status wins once AVPlayer has read the file. Feed metadata keeps the
 * timeline usable during that initial load, and the development fallback is
 * deliberately last. Returning whole seconds keeps the tabular readout stable.
 */
export function resolveAudioDuration(
  nativeDuration: number | undefined,
  feedDuration: number | undefined,
  developmentFallback = 0,
): number {
  for (const value of [nativeDuration, feedDuration, developmentFallback]) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }
  }
  return 0;
}

/** Compact, human-scale duration for the briefing entry affordance. */
export function formatAudioDurationMinutes(duration: number | undefined): string | null {
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) return null;
  const minutes = Math.max(1, Math.round(duration / 60));
  return `${minutes} min`;
}

export function briefingActionLabel(resumable: boolean, duration: number | undefined): string {
  const action = resumable ? 'resume' : 'listen';
  const durationLabel = formatAudioDurationMinutes(duration);
  return durationLabel ? `${action} · ${durationLabel}` : action;
}
