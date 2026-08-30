/**
 * How to describe the framing data the pipeline attaches to each source, in the
 * one place both surfaces read it from.
 *
 * `extract-source-angles.js` writes two things per article that nothing on the
 * web had ever shown: a per-source `sentiment`, and a per-source `angle` — one
 * sentence on what that outlet brought that the others did not. The app has
 * rendered the angle since it shipped (`SourceRow.tsx`); the article page
 * rendered a comma-separated list of outlet names. This module exists so that
 * when the web caught up, it did not do so with a second copy of the thresholds
 * and a second set of words for them — the failure the shared modules table in
 * CLAUDE.md is a list of.
 *
 * The numbers are the app's, unchanged, so no reader sees the same source
 * described one way in the app and another on the page.
 */

/** Above this, an outlet's framing reads as favorable to the story's subject. */
export const SENTIMENT_POSITIVE = 0.2;
/** Below this, it reads as critical. */
export const SENTIMENT_NEGATIVE = -0.2;

export type FramingTone = 'favorable' | 'unfavorable' | 'neutral';

/** Null when the pipeline recorded no sentiment — which is not the same as neutral. */
export function toneOf(sentiment: number | null | undefined): FramingTone | null {
  if (sentiment == null || Number.isNaN(sentiment)) return null;
  if (sentiment > SENTIMENT_POSITIVE) return 'favorable';
  if (sentiment < SENTIMENT_NEGATIVE) return 'unfavorable';
  return 'neutral';
}

/**
 * "Leans" sidesteps the "favorable to whom?" ambiguity and signals this is a
 * reading of framing, not a verdict on the outlet. Wording is the app's.
 */
export const TONE_LABELS: Record<FramingTone, string> = {
  favorable: 'leans favorable',
  unfavorable: 'leans critical',
  neutral: 'neutral',
};

export function toneLabel(sentiment: number | null | undefined): string | null {
  const tone = toneOf(sentiment);
  return tone ? TONE_LABELS[tone] : null;
}

/**
 * Divergence is only worth a sentence when it is unusual, so this returns null
 * for most stories rather than printing a number on every one — a note that
 * appears every time is a tic, not information.
 *
 * Thresholds are the corpus's own quartiles, measured over the 1,332 articles
 * carrying the field (2026-08-30): min 0, p25 0.14, median 0.24, p75 0.35,
 * p90 0.49, max 1.08. So `notable` is the top quartile and `sharp` the top
 * decile — both are claims about this story against our own record, which is
 * the only baseline we have. Re-measure before moving them.
 */
export const DIVERGENCE_NOTABLE = 0.35;
export const DIVERGENCE_SHARP = 0.49;

export function divergenceNote(divergence: number | null | undefined): string | null {
  if (divergence == null || Number.isNaN(divergence)) return null;
  if (divergence >= DIVERGENCE_SHARP) return 'these outlets frame this story very differently';
  if (divergence >= DIVERGENCE_NOTABLE) return 'these outlets frame this story differently';
  return null;
}

/**
 * `eventCoverage` is how many articles the upstream cluster held — the size of
 * the worldwide pile this story was drawn from. Rounded down to a round number
 * because the exact count is upstream's bookkeeping, not a fact about the world,
 * and printing "91" implies a precision the number does not carry.
 */
export function coverageNote(eventCoverage: number | null | undefined): string | null {
  if (!eventCoverage || eventCoverage < 10) return null;
  const rounded = eventCoverage >= 100
    ? Math.floor(eventCoverage / 50) * 50
    : Math.floor(eventCoverage / 10) * 10;
  return `drawn from ${rounded}+ reports worldwide`;
}
