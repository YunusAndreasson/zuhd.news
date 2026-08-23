import type { Valence } from '../valence';
import type { Card, CardDelta } from './types';

/**
 * A card, as one line on the column index.
 *
 * The index is the front door to `commodities`, `money` and `outlook`: six
 * rows a reader takes in at a glance, each opening the full card behind it.
 * This is the projection that decides what survives the compression, and it is
 * a pure function so the choice can be pinned by a test rather than eyeballed
 * in a simulator — the failure mode here is a plausible wrong row, not a
 * crash.
 *
 * ── The rule that matters most ────────────────────────────────────────────
 *
 * **Every string on a row is copied from the card, never recomputed.** No
 * `toFixed`, no rounding, no unit grammar, no second formatter. `lib/cards/
 * format.ts` already decides how each number is spelled, and a row that spelled
 * it a second way would let the index and the card it opens describe the same
 * figure differently one tap apart. That is the exact bug this repo has already
 * fixed twice, in `EntitySheet.formatLatest` and `ChokepointSheet.formatCount`.
 */
export interface IndexRow {
  /** The card's own id — the list key and the index into the column. */
  id: string;
  /** Line one. The dense title a reader scans down the column. */
  title: string;
  /**
   * Line two: the unit, falling back to the kicker.
   *
   * The unit rather than the kicker, because a number without one is not a
   * fact — `currenciesCard` reads `"3 of 15"` and means nothing until
   * `"weakened this month"` is under it. The kicker (`energy`, `zakat`) is
   * mostly restated by the title beside it and the column name above it, so it
   * only fills the line when there is no unit to put there.
   */
  note: string;
  /**
   * This card is here because its data moved, not because its subject matters.
   * Rendered as `today · ` before the note — an ink step, never a colour: the
   * chromatic budget is spent on the delta chip and on `colors.determination`.
   */
  lead: boolean;
  /** Verbatim `card.reading`. */
  reading: string;
  /** Verbatim `card.delta`. Absent on the cards whose reading *is* the move
   *  (`attention`) or which report a state rather than a change (the calendar,
   *  the condition cards) — those rows print no chip rather than inventing a
   *  direction for one. */
  delta?: CardDelta;
  /**
   * The series the sparkline draws, or `undefined` for the drawn absence.
   *
   * A multi-line series is deliberately dropped: `staples` charts wheat and
   * rice and reads as the ratio between them, so drawing the first line alone
   * would put the wrong series under the number above it, and drawing both in
   * 24pt is noise.
   */
  spark?: number[];
  /** The delta's valence, so the line and the chip cannot disagree about what
   *  a direction means. `neutral` — slate — where the card makes no claim. */
  tone: Valence;
  /** What a screen reader hears. The picture adds nothing here, so the words
   *  carry the level, the unit and the move. */
  a11yLabel: string;
}

const DIRECTION_WORD = { up: 'up', down: 'down', flat: 'unchanged' } as const;

/** The series a card is willing to have drawn at 64×24. */
function sparkValues(card: Card): number[] | undefined {
  if (card.kind !== 'reading' && card.kind !== 'belief') return undefined;
  const series = card.series;
  if (!series || series.multi) return undefined;
  return series.values;
}

function a11yLabel(card: Card, note: string): string {
  const parts: string[] = [];
  if (card.lead) parts.push('Today');
  parts.push(`${card.title}. ${card.reading} ${note}`);
  if (card.delta) {
    const word = DIRECTION_WORD[card.delta.direction];
    const move = card.delta.direction === 'flat' ? word : `${word} ${card.delta.magnitude}`;
    parts.push(card.delta.window ? `${move}, ${card.delta.window}` : move);
  }
  return `${parts.join('. ')}.`;
}

export function indexRow(card: Card): IndexRow {
  const note = card.readingNote ?? card.kicker;
  return {
    id: card.id,
    title: card.title,
    note,
    lead: card.lead === true,
    reading: card.reading,
    delta: card.delta,
    spark: sparkValues(card),
    tone: card.delta?.valence ?? 'neutral',
    a11yLabel: a11yLabel(card, note),
  };
}
