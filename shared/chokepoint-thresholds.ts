/**
 * When a strait's traffic has left its normal far enough to call it disrupted.
 *
 * The quantity is the seven-day average of the strait's primary vessel class
 * against its own 90-day average, as a signed fraction (`delta7vs90`).
 *
 * This lived in two places, with different numbers. The web map flagged a
 * strait at 15% either side of its normal. The app flagged it at 10% below.
 * So a strait 12% down was drawn as a pinch on the phone and as a quiet mark
 * on the web map beside it, and neither file mentioned the other. One number
 * now, the web's, because that is the one the map has been judged against.
 *
 * The two surfaces still ask slightly different questions of it, and that is
 * deliberate:
 *
 * - **The web map** asks "is this strait disrupted?", in either direction. A
 *   surge is traffic rerouted to here, which is still a disruption.
 * - **The app's glyph** asks "is this strait squeezed?". It pinches only on
 *   the fall, because the surge is the same disruption seen from the other
 *   end, and bows open past the same bar the other way (`straitSqueezed`,
 *   `mobile/lib/valence.ts`; `straitStateFor`, `mobile/lib/strait-map.ts`).
 *
 * A strait card's `current` flag is a separate bar, not this one: it asks
 * whether a fall is material enough to be news (`STRAIT_CURRENT_FALL` in
 * `mobile/lib/cards/markets.ts`).
 */
export const CHOKEPOINT_DISRUPTED = 0.15
