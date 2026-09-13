/**
 * The story deck's release, as arithmetic.
 *
 * The deck used to decide a swipe with two thresholds — 28% of a card's width,
 * or a flick faster than 550 pt/s — which made a slow drag to 27% spring back
 * and a lazy flick that happened to cross 550 jump. A scroll view does not ask
 * two questions. It projects where the card would come to rest if it kept
 * decelerating, and lands on the story nearest that point, so distance and
 * speed trade against each other continuously.
 *
 * Positions and velocities are in stories — `2.4` is a finger partway from the
 * third story to the fourth — because that is the unit the globe's camera
 * reads.
 */

/**
 * How fast a released card slows, per millisecond. UIKit scroll views use 0.998
 * and paging ones 0.99; this sits between, so a flick carries about a third of
 * a second of travel. A pager at 0.998 turned a card on a fidget.
 */
const DECELERATION_RATE = 0.997;

/** UIKit's rubber-band constant: how much give there is past an end. */
const RUBBER_BAND = 0.55;

/** How far a card moving at `velocity` stories/s travels before it stops. */
export function projectedTravel(velocity: number): number {
  'worklet';
  return ((velocity / 1000) * DECELERATION_RATE) / (1 - DECELERATION_RATE);
}

function resist(overshoot: number): number {
  'worklet';
  return 1 - 1 / (overshoot * RUBBER_BAND + 1);
}

/**
 * The position drawn for a finger at `position`. Inside the deck it is the
 * finger; past either end it gives less the further it is pulled, the way a
 * scroll view does, rather than following at a fixed fraction.
 */
export function rubberBand(position: number, count: number): number {
  'worklet';
  if (position < 0) return -resist(-position);
  if (position > count) return count + resist(position - count);
  return position;
}

/**
 * Where a swipe lands: the story nearest the projected resting point, never
 * more than one story from where the swipe began, and never past either end.
 */
export function deckTarget(
  origin: number,
  position: number,
  velocity: number,
  count: number,
): number {
  'worklet';
  let target = Math.round(position + projectedTravel(velocity));
  if (target > origin + 1) target = origin + 1;
  if (target < origin - 1) target = origin - 1;
  if (target < 0) return 0;
  return target > count ? count : target;
}
