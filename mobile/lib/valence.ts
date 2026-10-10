import { CHOKEPOINT_DISRUPTED } from '@shared/chokepoint-thresholds';
import type { TextTone } from '../constants/theme';

/**
 * Which way a number moved, and the colour it is printed in.
 *
 * **Green up, red down, slate where it did not move** (`moveTone`; 2026-09-25,
 * the user's request). The test is that the screen explains itself: "we
 * shouldn't try to be smart in a way no one understands".
 *
 * Until then the colour said what a move *meant* for an ordinary life: a
 * table (`RISE_MEANS`) declared what a rise in each published series did to a
 * reader — oil up was red, an exchange rate up red, bitcoin slate because the
 * app would not say — and `valenceOf` applied it to the direction, so a fall
 * in oil was green. It was careful and it was invisible: one ▲ came in three
 * colours for a reason only a sentence at the top of the markets list gave,
 * beside globe arrows that were green up and red down all along. The table,
 * `valenceOf`, `riseMeansFor` and the `valence` every chip carried were
 * removed the same day; they are in the history before that if they are ever
 * wanted. What a move means is the card's prose to say.
 *
 * One module still owns the answer, for the reason it was made one: four
 * surfaces used to colour a move separately and three of them disagreed — a
 * card chip, an entity sheet tinting on magnitude in the globe's gold, and a
 * chokepoint sheet whose disruption bar was five points off the card's.
 */

export type Direction = 'up' | 'down' | 'flat';

/**
 * The colour a move is printed in: green up, red down, slate where it did not
 * move. The one exception is a prediction contract's points, which stay slate
 * whichever way they go: green on a likelier war would be the app taking a
 * side, which is why odds were never tinted.
 */
export function moveTone(delta: {
  direction: Direction;
  unit?: 'points' | 'rate';
}): Extract<TextTone, 'rise' | 'fall' | 'neutral'> {
  if (delta.unit === 'points' || delta.direction === 'flat') return 'neutral';
  return delta.direction === 'up' ? 'rise' : 'fall';
}

/** A chokepoint this far below its own 90-day average is disrupted rather than
 *  quiet. Shared with the web map, which drew a 12% fall as quiet while the app
 *  drew it as a pinch. */
export { CHOKEPOINT_DISRUPTED } from '@shared/chokepoint-thresholds';

/**
 * Whether a strait is squeezed: running far enough below its own 90-day
 * normal to be the disruption — a blockade, a war-risk premium, a closed canal.
 * Its glyph pinches (`straitStateFor`). One-sided: above normal is usually
 * traffic rerouted *to* here, the same disruption seen from the other end, and
 * the glyph bows open instead.
 */
export function straitSqueezed(deltaVs90: number): boolean {
  return deltaVs90 <= -CHOKEPOINT_DISRUPTED;
}
