/**
 * Which way a number moved, and what that direction does to the person
 * reading it.
 *
 * One module owns this because four surfaces used to answer it separately and
 * three of them disagreed. A card chip coloured brent rose on a rise; the same
 * indicator opened in `EntitySheet` came up dome-gold if the move was larger
 * than five per cent and grey if it was not — magnitude, not direction, in a
 * hue reserved elsewhere for the globe. `ChokepointSheet` called a strait
 * disrupted at 15% below its normal while `markets.ts` called it disrupted at
 * 10%, so the same strait could be rose on a card and grey in the sheet that
 * card opens. None of that was visible from any one file.
 *
 * Two channels, and keeping them separate is still the design:
 *
 *   the arrow   says which way the number went.
 *   the colour  says what that direction means for the person holding it.
 *
 * What changed is that the colour is now total. It used to be absent wherever
 * the app had no claim to make, which left roughly two thirds of the app's
 * readings in near-white and made "is this coloured?" a question the reader
 * had to answer before "which way did it go?". A third value — `neutral`,
 * the slate of the tone family — says *the app is not claiming this is good
 * or bad for you* out loud, in the same channel, instead of by omission.
 *
 * In this app up is not good. Brent rising reaches an ordinary life as a fuel
 * bill; an exchange rate rising means that currency weakened; bitcoin rising
 * is neither, and an app that tints it sage has quietly taken a position on
 * whether you should hold it.
 */

export type Direction = 'up' | 'down' | 'flat';

/** The colour channel. `neutral` is a decision — "it moved, and the app has
 *  no honest claim about what that does to you" — not an absence. */
export type Valence = 'favorable' | 'unfavorable' | 'neutral';

/** What a *rise* in the quoted quantity does to an ordinary life. `null` where
 *  the honest answer is "nothing the app can claim". Note "the quoted
 *  quantity", not "the indicator": an exchange rate and the currency it prices
 *  move in opposite directions, so which one a card puts on screen decides
 *  this. See `currencyMove` in `lib/cards/markets.ts`. */
export type RiseMeans = 'favorable' | 'unfavorable' | null;

/**
 * The rule, in one place.
 *
 * The valence applies to the *direction*, not to the number: for something
 * whose rise hurts, a fall is favorable. That inversion is the whole reason
 * this is not a lookup table of colours, and getting it backwards is the first
 * bug the delta chip shipped with.
 */
export function valenceOf(direction: Direction, riseMeans: RiseMeans): Valence {
  // A number that did not move has no direction, so there is no consequence to
  // colour — but it still gets a colour, because a white chip among slate ones
  // reads as a fourth state that does not exist.
  if (direction === 'flat' || riseMeans === null) return 'neutral';
  if (direction === 'up') return riseMeans;
  return riseMeans === 'favorable' ? 'unfavorable' : 'favorable';
}

/** `valenceOf` for a caller holding a signed change rather than a direction.
 *  Zero is flat, which is neutral — the same answer the formatters reach when
 *  a move rounds away to nothing. */
export function valenceOfChange(pct: number, riseMeans: RiseMeans): Valence {
  if (!Number.isFinite(pct) || pct === 0) return 'neutral';
  return valenceOf(pct > 0 ? 'up' : 'down', riseMeans);
}

/**
 * What a rise in each published series means, keyed the way the data arrives.
 *
 * This is a table rather than an argument at each call site because the answer
 * has to be the same wherever the indicator surfaces — a card, the sheet that
 * card opens, an entity mentioned mid-article. It was an argument, at five
 * call sites, and the sheets never saw any of them.
 *
 * Absence is the common case and it is deliberate: an indicator the app cannot
 * speak for reads slate, which is a statement, not a gap.
 */
const RISE_MEANS: Record<string, RiseMeans> = {
  // Oil rising reaches an ordinary life as fuel, freight and fertiliser.
  brent: 'unfavorable',
  // The yield rising is every mortgage and every sovereign repayment getting
  // more expensive, everywhere.
  'us-10y': 'unfavorable',
  // The one instrument whose own definition names the direction: it rises when
  // people are frightened, which is why it is called the fear index.
  vix: 'unfavorable',
};

/**
 * The table, plus the one rule that is about a whole source rather than an id.
 *
 * `oer` publishes rates — how much local currency one dollar buys — so a
 * rising series is a currency that weakened, and that is a real consequence
 * for anyone paying for imports, fuel or dollar debt at home. A card that
 * quotes the *currency* instead of the rate has inverted the quantity and must
 * invert this with it.
 *
 * Bitcoin, ether, the gold–silver ratio, the rice–wheat ratio, nisab, what the
 * world looked up on Wikipedia and every prediction contract are absent on
 * purpose. Two of them are ratios, where neither direction is anyone's good
 * news; the rest are things the app has no business tinting.
 */
export function riseMeansFor(indicator: { id: string; source?: string }): RiseMeans {
  if (indicator.source === 'oer') return 'unfavorable';
  return RISE_MEANS[indicator.id] ?? null;
}

/** A chokepoint this far below its own 90-day normal is disrupted rather than
 *  quiet. One threshold, because a strait was disrupted at 10% on a card and
 *  at 15% in the sheet that card opens. */
export const CHOKEPOINT_DISRUPTED = 0.1;

/**
 * A strait's distance from its own normal, which is the one asymmetric case
 * in the app and cannot be written as a `RiseMeans`.
 *
 * A strait running below its normal is freight not moving — a blockade, a
 * war-risk premium, a closed canal — and that reaches an ordinary life as the
 * price of everything that had to sail. Above normal is usually traffic
 * rerouted *to* here, which is the same disruption seen from the other end, so
 * the app names the squeeze rather than the detour and the busy side stays
 * slate.
 */
export function chokepointValence(deltaVs90: number): Valence {
  return deltaVs90 <= -CHOKEPOINT_DISRUPTED ? 'unfavorable' : 'neutral';
}
