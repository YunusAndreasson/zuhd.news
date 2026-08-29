import type { RelatedArticleRef, TrendHighlight, TrendSeries } from '@shared/types';
import type { Direction, Valence } from '../valence';

/**
 * The card model.
 *
 * A card earns a screen if a reader who gives it four seconds can tell someone
 * else something true they did not know. Everything that fails that test is
 * not in the app.
 *
 * The shape below is that rule written as a type. The changing observation and
 * live analysis form the visible surface:
 *
 *   reading    the number, at arm's length
 *   changed    the move, and the window it moved over
 *   why        why it reaches an ordinary life — the teaching part
 *   related    which stories should affect its rank
 *
 * `why` is not written here. The desk writes two paragraphs for every
 * instrument and they answer different questions: `standing`, what the thing
 * is, written once and timeless; and `recent`, what has happened to it and
 * why, rewritten each day against the fortnight's coverage. A reader looking
 * at a chart that just moved asked the second, so `why` is `recent` where
 * there is one and `standing` where there is not. A card builder's job is to
 * find the right one, not to compose a new one — the app does not editorialise
 * over the desk.
 */

type CardKind = 'reading' | 'belief' | 'scheduled';

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
   * that has actually gone quiet. Everything else on a column is standing
   * reference that happens to have moved a little, and the two used
   * to arrive in identical typographic weight, so a disrupted Strait of Hormuz
   * and the gold-to-silver ratio read as the same kind of claim.
   *
   * `CardFrame` renders it as `current ·` on the kicker line — never a colour.
   * The app's chromatic budget is already spent on `CardDelta`.
   */
  lead?: boolean;
  /** Small-caps subject above the title. Omit when the section already says it. */
  kicker?: string;
  title: string;
  /** Part 1. Pre-formatted, because only the builder knows the unit grammar. */
  reading: string;
  /** Part 1b, under the number: "$/bbl", "per day", "of the world's oil". */
  readingNote?: string;
  /** Part 1c, beside the note: which way it moved and what that means. */
  delta?: CardDelta;
  /** What changed in the current data window. */
  changed?: string;
  /** Live pipeline analysis, shown on the recurring card surface: the day's
   *  account of why this moved, or the standing definition where the desk
   *  wrote no account today. `lib/cards/markets.ts`'s `whyFor` picks. */
  why?: string;
  /** News ties used to rank the card; not repeated on its visible surface. */
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
}

/** One number and its history. Brent, wheat, the strait that moved, nisab. */
export interface ReadingCard extends CardBase {
  kind: 'reading';
  series?: CardSeries;
  /** Secondary figures beside the reading — nisab's two metals, wheat's pair. */
  figures?: CardFigure[];
}

/** A price on an outcome. Distinct from a reading because the number is a
 *  belief rather than a measurement, and the card has to say so. */
export interface BeliefCard extends CardBase {
  kind: 'belief';
  series: CardSeries;
}

export interface CardFigure {
  label: string;
  value: string;
  note?: string;
  /** Optional raw magnitude for proportional rendering; never display-formatted. */
  weight?: number;
}

/**
 * A date the world is waiting on — an FOMC decision, an OPEC+ meeting, a
 * national election.
 *
 * The third kind, and the only one with no series, which is why it needed to
 * be a kind rather than a `ReadingCard` with the chart left off. The desk has
 * written `standing` and `recent` for these since the events dispatch existed
 * and the rail on the website has shown them all along; the app had no way to
 * carry one, because the deck gate asks for a graph and a scheduled date does
 * not have a history — it has a distance.
 *
 * `outlook` is where they belong: a prediction market prices what happens, and
 * a calendar says when it gets decided. Those are two halves of the same
 * question and they were in different buildings.
 */
export interface ScheduledCard extends CardBase {
  kind: 'scheduled';
  /** ISO date it lands on. The reading is how far away that is. */
  date: string;
}

export type Card = ReadingCard | BeliefCard | ScheduledCard;

/** A card with a real time series. */
export type GraphCard = (ReadingCard & { series: CardSeries }) | BeliefCard;

/** What a swipe deck may render: a graph, or a date with the desk's account of
 *  what it will settle. Nothing without one of those two. */
export type DeckCard = GraphCard | ScheduledCard;
