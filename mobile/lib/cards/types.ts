import type { CompareRow, RelatedArticleRef, TrendHighlight, TrendSeries } from '@shared/types';
import type { Direction, Valence } from '../valence';

/**
 * The card model.
 *
 * A card earns a screen if a reader who gives it four seconds can tell someone
 * else something true they did not know. Everything that fails that test
 * becomes a row on a comparison card, or it is not in the app — which is why
 * fifteen currencies are one card and thirty exchanges are none.
 *
 * The shape below is that rule written as a type. Five named parts, in the
 * order a reader meets them:
 *
 *   reading    the number, at arm's length
 *   whatItIs   one sentence for someone who has never heard of it
 *   changed    the move, and the window it moved over
 *   why        why it reaches an ordinary life — the teaching part
 *   related    which of today's stories it touches
 *
 * `why` is not written here. It is `standing`, which the pipeline has been
 * writing for every indicator, chokepoint and calendar event since long before
 * anything rendered it. A card builder's job is to find the right one, not to
 * compose a new one — the app does not editorialise over the desk.
 */

export type CardKind = 'reading' | 'comparison' | 'belief' | 'condition';

/**
 * The move, at a glance — and the one place the app spends colour on a number.
 *
 * Until this existed the direction of every reading lived inside a sentence
 * ("−5.2% since 22 Jul."), which is a thing you read rather than a thing you
 * see. A card is meant to survive four seconds; a sentence does not.
 *
 * Two channels, and keeping them separate is the whole design:
 *
 *   the arrow   says which way the number went.
 *   the colour  says what that direction means for the person holding it.
 *
 * Both are always shown. The colour used to be absent wherever the app had no
 * consequence to claim, which sounds like restraint and read as noise: two
 * thirds of the app's readings sat in near-white, so a reader had to work out
 * whether a chip was coloured before working out which way it pointed, and the
 * same indicator came up in a third hue again inside a sheet. `neutral` says
 * *no claim* in the same channel instead of by omission. The rule itself lives
 * in `lib/valence.ts`; see `valenceOf` for why this is not up-is-green.
 */
export interface CardDelta {
  direction: Direction;
  /** Pre-formatted magnitude, unsigned — "5.2%", "60 points". The arrow is
   *  the sign; printing both is the same fact twice. */
  magnitude: string;
  /** The window it moved over, in the card's own words: "since 22 Jul",
   *  "on the month", "vs its 90-day normal". A change without its window is
   *  the mistake `windowChange` exists to prevent. */
  window?: string;
  /** What this direction means for an ordinary life, or `neutral` where the
   *  app would be inventing a position by claiming one. Required, so that a
   *  new chip cannot reach the screen without someone answering the question:
   *  what does *this* direction do to the person reading it? */
  valence: Valence;
}

interface CardBase {
  /** Stable across rebuilds — it is the pager's key and the scroll anchor. */
  id: string;
  kind: CardKind;
  /**
   * This card is on screen because its data is new, not because its subject is
   * important — and the reader is told so.
   *
   * Set only by a builder that gated the card on its own freshness: a strait
   * that has actually gone quiet, a famine analysis published this quarter, a
   * determination handed down this season. Everything else on a column is
   * standing reference that happens to have moved a little, and the two used
   * to arrive in identical typographic weight, so a disrupted Strait of Hormuz
   * and the gold-to-silver ratio read as the same kind of claim.
   *
   * `CardFrame` renders it as an ink step on the kicker line — never a colour.
   * The app's chromatic budget is already spent, on `CardDelta` and on
   * `colors.determination`, and a third accent would cost both of them their
   * meaning.
   */
  lead?: boolean;
  /** Small-caps kicker above the title: "commodity", "currency", "famine". */
  kicker: string;
  title: string;
  /** Part 1. Pre-formatted, because only the builder knows the unit grammar. */
  reading: string;
  /** Part 1b, under the number: "$/bbl", "per day", "of the world's oil". */
  readingNote?: string;
  /** Part 1c, beside the note: which way it moved and what that means. */
  delta?: CardDelta;
  /** Part 2 — what this is, standing knowledge. Numbered second and *rendered*
   *  after part three, below the block: it is the one part that reads the same
   *  tomorrow, and it was leading every card in an app opened daily. See
   *  `CardFrame`. Absent whenever the pipeline wrote a `why`, so no card ever
   *  carries two definitions of itself (`definitionUnlessStanding`). */
  whatItIs?: string;
  /** Part 3 — what it did, and the first prose under the block. */
  changed?: string;
  /** Part 4 — `standing`, verbatim. */
  why?: string;
  /**
   * Whose `standing` part four is, on a card that holds more than one thing.
   *
   * A single-instrument card needs nothing here: the paragraph is about the
   * title. A card built from several is a different case, and it was silently
   * getting it wrong on four screens — wheat's paragraph under "Wheat and
   * rice", Syria's under "What the world looked up", US GDP's under a list of
   * four releases. Each read as the card explaining itself and was in fact one
   * constituent explaining itself, which a reader has no way to detect.
   *
   * `currenciesCard` had already solved this by dropping the borrowed
   * paragraph outright; that works there because part two carries the
   * mechanism. Where it does not, naming the owner in three words keeps the
   * desk's sentence and costs nothing — the app still does not rewrite it.
   *
   * The other resolution is to ship no `why` at all, and `metalsPairCard` uses
   * it: a paragraph about a gold-backed *token* is not a mislabelled
   * explanation of gold, it is the wrong subject.
   */
  whyLabel?: string;
  /** Part 5. */
  related?: RelatedArticleRef[];
  /** Attribution, rendered through `SourceCaption`. */
  sourceLabel?: string;
  /** Somewhere to verify the claim: a Polymarket event, an OHCHR page. */
  link?: string;
}

/** A series a card draws, in the shape `TrendBlock` already accepts. */
export interface CardSeries {
  values: number[];
  periods: string[];
  label: string;
  unit?: string;
  highlight?: TrendHighlight;
  /** Two or three lines on one axis, when the comparison *is* the fact —
   *  wheat against rice. Takes precedence over `values`, which is what
   *  `TrendBlock` already does with the same pair of props. Only use it when
   *  the lines share a unit; two units on one axis is a chart that lies. */
  multi?: TrendSeries[];
  /**
   * The level this card's stated change opens at, drawn as a dashed reference
   * across the chart.
   *
   * It is the "previous close" line every stock app draws, and it does the one
   * job the line alone cannot: it turns "up 33%" from a sentence into a
   * distance. Without it a reader has to find the left-hand end of the line,
   * hold its height in their head, and compare — which is exactly the work a
   * chart exists to save them.
   *
   * Two things set it. Where the chip measures a window of this same series it
   * is that window's first value, and `plotWindow` returns the two together so
   * they cannot be derived apart. Where the chip compares against a *level*
   * rather than a window — the strait, whose chip reads "vs its 90-day normal"
   * — it is that level, which is the thing the sentence above the chart is
   * actually pointing at.
   *
   * Single-series only. On two lines a single reference belongs to neither.
   */
  baseline?: number;
  /**
   * This series runs the opposite way to the quantity the card's chip quotes.
   *
   * True on exactly one family of cards: the FX movers, where the chip reports
   * the *currency* (`currencyMove`) and the series is the published *rate*, so
   * a ruble 5.3% weaker is a down caret above a line climbing 78 → 83. On the
   * card that is handled in six words of caption — "higher is weaker" — and
   * `fxMoverCards` calls it "the one chart in the app that has to name its own
   * direction".
   *
   * A sparkline has no caption and no room for one, so the column index needs
   * to know rather than to explain: `indexRow` plots the reciprocal, and the
   * line then points the way the chip and its colour already do. The reason
   * the card cannot do the same — "an unreadable 0.0121 on the axis" — does
   * not transfer, because a sparkline has no axis. Nothing else reads this.
   */
  inverted?: boolean;
}

/** One number and its history. Brent, wheat, the strait that moved, nisab. */
export interface ReadingCard extends CardBase {
  kind: 'reading';
  series?: CardSeries;
  /** Secondary figures beside the reading — nisab's two metals, wheat's pair. */
  figures?: CardFigure[];
}

/** Many rows that only mean something against each other. Fifteen currencies
 *  are not fifteen facts; the fact is that twelve of them gained. */
export interface ComparisonCard extends CardBase {
  kind: 'comparison';
  rows: CompareRow[];
  rowsLabel?: string;
}

/** A price on an outcome. Distinct from a reading because the number is a
 *  belief rather than a measurement, and the card has to say so. */
export interface BeliefCard extends CardBase {
  kind: 'belief';
  series: CardSeries;
  /** The range the belief has travelled inside the window we hold. */
  range?: { min: number; max: number; minAt: string; maxAt: string };
}

/** A standing state of the world rather than a moving number: how many people
 *  are hungry, how many events a monitor is tracking, what a body determined. */
export interface ConditionCard extends CardBase {
  kind: 'condition';
  figures?: CardFigure[];
  rows?: CompareRow[];
  rowsLabel?: string;
  /** The single chromatic break in the app, and the only card allowed it. */
  emphasis?: 'determination';
  /** Named body + document, for a card whose whole claim is the citation. */
  attribution?: { body: string; document: string; date: string };
}

export interface CardFigure {
  label: string;
  value: string;
  note?: string;
}

export type Card = ReadingCard | ComparisonCard | BeliefCard | ConditionCard;
