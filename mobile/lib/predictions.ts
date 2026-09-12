import type { Indicator, TrendsSnapshot } from '@shared/types';

/**
 * What a prediction market says about a story.
 *
 * Contracts used to live in their own deck, one swipe away from the news they
 * are about. That is two halves of one question in different buildings: a
 * market prices *what happens*, an article reports *what happened*, and the
 * reader is the only thing joining them.
 *
 * The join itself costs nothing, because the pipeline already wrote it.
 * `scripts/narrate-indicators.js` grounds every `recent` paragraph in this
 * corpus and records which articles it used as `relatedArticles`. Inverting
 * that map gives slug → contract.
 *
 * Two fences carried over from the web's instrument rail, both load-bearing:
 *
 *   **A price is not a forecast.** Every surface that prints odds prints that
 *   sentence with them, and it lives in its own field so a generated
 *   description can never quietly replace it.
 *
 *   **Odds are never tinted favorable or unfavorable.** `--map-pos`/`--map-neg`
 *   mean "a signed change" and read as good and bad; on the odds of an
 *   invasion that is a verdict. A green "US invades Iran, +35 pts" is the app
 *   calling a likelier war good news. `lib/valence.ts` deliberately has no row
 *   for a prediction contract, and `beliefCards` sets no valence — this
 *   follows both.
 */

/** The disclosure, in one place so it cannot be edited out of one surface. */
export const MARKET_CAVEAT = 'a market, not a forecast';

export interface StoryOdds {
  /** The contract's indicator id, for opening its card. */
  id: string;
  /** The question, as the desk edited it. */
  question: string;
  /** "62%" — the level, which is the whole reading for a belief. */
  level: string;
  /**
   * "▲ 14 pts this week" — movement in **points**, never a percentage.
   *
   * A contract going 26 → 86 moved 60 points; "+231%" is arithmetic
   * pretending to be journalism. Same rule as `windowPointChange`.
   */
  move: string | null;
  marketUrl?: string;
}

const WEEK = 7;

const isPrediction = (i: Indicator): boolean => i.source === 'polymarket';

const latest = (i: Indicator): number | null => {
  for (let n = i.values.length - 1; n >= 0; n -= 1) {
    const v = i.values[n];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
};

/** Points moved over the trailing week, or over the whole series if it is
 *  shorter. `null` when it rounds away to nothing — an unchanged contract
 *  should say nothing rather than "0 pts". */
function weekMove(i: Indicator): string | null {
  const values = i.values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  const last = values.at(-1);
  const first = values.at(Math.max(0, values.length - 1 - WEEK));
  if (last == null || first == null) return null;
  const points = Math.round(last - first);
  if (points === 0) return null;
  // A true minus sign, matching `formatSignedPct`.
  const arrow = points > 0 ? '▲' : '▼';
  return `${arrow} ${Math.abs(points)} pts this week`;
}

/**
 * slug → the contract the desk tied to that story.
 *
 * Where a story has more than one, the largest 24-hour move wins: if two
 * markets both cite an article about the Fed, the one that actually reacted
 * is the one worth printing.
 */
export function oddsByStory(snapshot: TrendsSnapshot | null): Map<string, StoryOdds> {
  const best = new Map<string, { odds: StoryOdds; weight: number }>();
  if (!snapshot) return new Map();

  for (const indicator of snapshot.indicators) {
    if (!isPrediction(indicator)) continue;
    const related = indicator.relatedArticles;
    if (!related || related.length === 0) continue;
    const level = latest(indicator);
    if (level == null) continue;

    const odds: StoryOdds = {
      id: indicator.id,
      question: indicator.label,
      level: `${Math.round(level)}%`,
      move: weekMove(indicator),
      marketUrl: indicator.marketUrl,
    };
    const weight = Math.abs(indicator.change24h ?? 0);

    for (const ref of related) {
      const held = best.get(ref.slug);
      if (!held || weight > held.weight) best.set(ref.slug, { odds, weight });
    }
  }

  const out = new Map<string, StoryOdds>();
  for (const [slug, { odds }] of best) out.set(slug, odds);
  return out;
}

/** The bare percentage a feed row shows — the signifier that this story has a
 *  market on it. The rest of the line is in the reader, where there is room
 *  for the caveat. */
export function oddsLabels(odds: ReadonlyMap<string, StoryOdds>): Map<string, string> {
  const labels = new Map<string, string>();
  for (const [slug, value] of odds) labels.set(slug, value.level);
  return labels;
}
