import type { RelatedArticleRef, TrendHighlight, TrendSeries } from '@shared/types';
import type { Direction } from '../valence';

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
 * The arrow and the colour say the same thing — green up, red down, slate
 * unmoved (`moveTone`, `lib/valence.ts`) — so the chip reads at a glance with
 * no legend. Until 2026-09-25 the colour said what a direction meant for an
 * ordinary life instead (oil up red, bitcoin slate), and one ▲ came in three
 * colours for a reason the screen never gave.
 */
export interface CardDelta {
  direction: Direction;
  /** Pre-formatted magnitude, unsigned — "5.2%", "60 points". The arrow is
   *  the sign; printing both is the same fact twice. */
  magnitude: string;
  /** The same move as an unsigned percentage, for ordering and nothing else —
   *  the strip puts the largest first. Absent where the move is in points: a
   *  contract's sixty points and a price's six percent are not one scale. The
   *  windows still differ (a day, a month, a 90-day average); the strip accepts
   *  that, because what it answers is "what moved most", not "what moved most
   *  unusually", and `lib/cards/rank.ts` records why the second was rejected. */
  size?: number;
  /** The window it moved over, in the card's own words: "since 22 Jul",
   *  "on the month", "vs its 90-day average". A change without its window is
   *  the mistake `windowChange` exists to prevent. */
  window?: string;
  /** The move is measured against a level that is not the series' own
   *  earlier reading: a strait against its 90-day average. A card that prints
   *  the three windows keeps such a move beside them (`cardWindows`); any
   *  other of its own would be one of the three again. */
  versus?: boolean;
  /** `points` for a prediction contract's move, which is never coloured
   *  (`moveTone`); `rate` for a move in percentage points of a rate, a yield
   *  or inflation, coloured like any other. Both are spoken in full
   *  (`spokenDelta`). Absent for every percentage. */
  unit?: 'points' | 'rate';
}

/** One window of a move read over several: `7 days` and the move over it.
 *  A window with nothing to say keeps its place and carries no move. */
export interface WindowMove {
  label: string;
  delta?: CardDelta;
}

interface CardBase {
  sources?: { label: string; url: string }[];
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
  /** Observation date for the number on screen. This is deliberately not the
   * payload fetch time: a file rebuilt today can still contain older source
   * data. `CardFrame` prints it on the kicker line. */
  asOf?: string;
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
   *  wrote no account today. `lib/cards/markets.ts`'s `deskText` picks. */
  why?: string;
  /** News ties used to rank the card; not repeated on its visible surface. */
  related?: RelatedArticleRef[];
  /** The stories the desk's analysis was grounded in, most relevant first —
   *  listed under the analysis and marked on the chart by their number. Not
   *  `related`, which ranks the card by tag matches and is never shown. */
  cited?: RelatedArticleRef[];
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
  /** The places a series in per cent is printed to (`rateDecimals`), for a
   *  figure summed across cards: the menu's inflation average. */
  decimals?: number;
  highlight?: TrendHighlight;
  /** Two or three lines on one axis, when the comparison *is* the fact —
   *  wheat against rice. Takes precedence over `values`, which is what
   *  `TrendBlock` already does with the same pair of props. Only use it when
   *  the lines share a unit; two units on one axis is a chart that lies. */
  multi?: TrendSeries[];
  /** A level the series is measured against — a strait's 90-day average —
   *  drawn as a dashed hairline with a gutter label. The chip says how far
   *  the reading is from it; the line shows where it is. */
  reference?: { value: number; label: string };
  /** `steps` for a value that holds until it is changed: a policy rate, a
   *  lab's best score. Absent, the line runs straight between observations. */
  shape?: 'steps';
  /** The quantity's own scale, where it has one: a chance runs 0 to 100.
   *  Absent, the chart takes its range from the series (`chartScale`). */
  domain?: readonly [number, number];
  /** The scale is turned over: a rate quoted per dollar, which rises as the
   *  currency weakens, drawn so its line rises as the currency does. The
   *  numbers on the scale stay the quoted rate. */
  inverted?: boolean;
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
  /** How far the figure sits from its basis — a vessel class from its own
   *  normal — printed beside the label as a chip, in the move's colour. */
  delta?: CardDelta;
  /** Rows that share a basis share this, printed once above the first of
   *  them — a strait's vessel classes, each against its own normal. Printed
   *  on every row it was "vs its normal" five times in a column. */
  group?: string;
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
  /** What a market prices the decision at, where a contract is on it
   *  (`eventOdds`): its question and its price, as a strait's card carries
   *  the contract on its closure. */
  figures?: CardFigure[];
  /**
   * The history of the thing being decided, where one exists.
   *
   * A countdown says *when*; the staircase says *from where*. An FOMC card
   * drawing two years of the Fed target range is the same rule every other card
   * follows — the graph is the headline's history — because the headline is
   * "the Fed decides in 18 days" and what they have decided is the picture.
   *
   * Optional because it is honestly optional: a G20 summit has no series by
   * nature, and a release whose series the pipeline does not publish has none
   * here. Those keep the countdown. A stand-in is never drawn: until
   * 2026-10-03 the Bank of England's and the Bank of Japan's decisions had no
   * graph, because the nearest thing on offer was an overnight *market* rate
   * (SONIA is not Bank Rate), and a graph disagreeing with its headline is the
   * one thing a card here may not do. Each bank's own rate is published now
   * (`EVENT_SERIES`).
   */
  series?: CardSeries;
}

export type Card = ReadingCard | BeliefCard | ScheduledCard;

/** A card with a real time series. */
export type GraphCard = (ReadingCard & { series: CardSeries }) | BeliefCard;

/** What a swipe deck may render: a graph, or a date with the desk's account of
 *  what it will settle. Nothing without one of those two. */
export type DeckCard = GraphCard | ScheduledCard;
