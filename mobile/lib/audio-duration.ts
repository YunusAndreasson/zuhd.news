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
