import { UMM_AL_QURA } from '@shared/prayer';

/** Where the night deepens: the sun 6° (civil), 12° (nautical) and Fajr's
 *  angle below the horizon, each a cap of radius `90 − depth` around the
 *  antisolar point. The last is Fajr's angle, not astronomy's 18°: on the dawn
 *  side true night ends where the Fajr line runs, not half a degree from it. */
export const NIGHT_DEPTHS = [6, 12, UMM_AL_QURA.fajrAngle] as const;
/** One layer's share of the night veil. The terminator's cap and the deeper
 *  ones stack to the veil a single fill drew, so deep night is as dark as it
 *  was and the ramp is cut upward out of it, as the web's band is. */
export function nightStep(veil: number): number {
  return 1 - (1 - veil) ** (1 / (NIGHT_DEPTHS.length + 1));
}
