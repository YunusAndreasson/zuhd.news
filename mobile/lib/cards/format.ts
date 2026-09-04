import type { Article, Indicator, RelatedArticleRef } from '@shared/types';
import { type RiseMeans, valenceOf } from '../valence';
import type { CardDelta } from './types';

/**
 * Number grammar and window arithmetic shared by every card builder.
 *
 * The one rule enforced here: a change is always reported against a window the
 * card can name. An indicator's `values` array is a fixed number of
 * *observations*, not a fixed number of days — Brent's 60 points span 11 May to
 * 3 Aug — so "month on month" is a lie on a daily series and "since 11 May" is
 * not. `windowChange` returns the period labels with the percentage so the
 * caller cannot forget to say which window it measured.
 */

/** Troy ounce in grams. The nisab is defined in grams; metals are priced by
 *  the ounce; the conversion has to happen somewhere and it happens once. */
export const GRAMS_PER_TROY_OUNCE = 31.1034768;

export interface WindowChange {
  /** Percentage change across the window, signed. */
  pct: number;
  /** The period label the window opens on, e.g. "11 May" or "Jun 2025". */
  from: string;
  /** The period label the window closes on. */
  to: string;
  /** How many observations the window spans. */
  points: number;
}

/** Last value in a series, or null if the series is unusable. */
export function latestOf(indicator: Pick<Indicator, 'values'>): number | null {
  const v = indicator.values;
  const last = v[v.length - 1];
  return typeof last === 'number' && Number.isFinite(last) ? last : null;
}

/**
 * Change across the last `points` observations. Clamped to the series length,
 * so asking for 30 points of a 24-point series measures the whole series and
 * says so in `from`/`to` rather than silently returning NaN.
 */
export function windowChange(
  indicator: Pick<Indicator, 'values' | 'periods'>,
  points: number,
): WindowChange | null {
  const { values, periods } = indicator;
  const n = values.length;
  if (n < 2) return null;
  const span = Math.max(1, Math.min(points, n - 1));
  const latest = values[n - 1];
  const earlier = values[n - 1 - span];
  if (typeof latest !== 'number' || typeof earlier !== 'number' || earlier === 0) return null;
  if (!Number.isFinite(latest) || !Number.isFinite(earlier)) return null;
  return {
    pct: ((latest - earlier) / Math.abs(earlier)) * 100,
    from: periods[n - 1 - span] ?? '',
    to: periods[n - 1] ?? '',
    points: span,
  };
}

/**
 * Difference across the window in the series' own units.
 *
 * Mandatory for anything already measured in percent. A prediction contract
 * that went from 26% to 86% moved **60 points**; calling that "+231%" is
 * arithmetically defensible and editorially false, and it is the mistake every
 * dashboard that treats a percentage as a price makes.
 */
export function windowPointChange(
  indicator: Pick<Indicator, 'values' | 'periods'>,
  points: number,
): WindowChange | null {
  const relative = windowChange(indicator, points);
  if (!relative) return null;
  const { values } = indicator;
  const latest = values[values.length - 1] as number;
  const earlier = values[values.length - 1 - relative.points] as number;
  return { ...relative, pct: latest - earlier };
}

/** Highest and lowest observation in the series, with their period labels. */
export function seriesExtremes(
  indicator: Pick<Indicator, 'values' | 'periods'>,
): { min: number; minAt: string; max: number; maxAt: string } | null {
  const { values, periods } = indicator;
  if (values.length === 0) return null;
  let minI = 0;
  let maxI = 0;
  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    if (v === undefined) continue;
    if (v < (values[minI] ?? Number.POSITIVE_INFINITY)) minI = i;
    if (v > (values[maxI] ?? Number.NEGATIVE_INFINITY)) maxI = i;
  }
  return {
    min: values[minI] as number,
    minAt: periods[minI] ?? '',
    max: values[maxI] as number,
    maxAt: periods[maxI] ?? '',
  };
}

/**
 * The reading itself — one number at arm's length.
 *
 * Percentages and sub-10 values keep two decimals (4.69% is a different rate
 * from 4.7%); everything larger rounds and groups, because the fourth
 * significant digit of a wheat price is noise the reader will never repeat.
 */
export function formatReading(value: number, unit?: string): string {
  if (!Number.isFinite(value)) return '—';
  if (unit === '%' || Math.abs(value) < 10) return value.toFixed(2);
  return Math.round(value).toLocaleString('en-US');
}

/** A signed percentage, one decimal, with a true minus sign rather than a
 *  hyphen — the column is typographic, not code. */
export function formatSignedPct(pct: number): string {
  if (!Number.isFinite(pct)) return '—';
  const rounded = Math.abs(pct) >= 10 ? Math.round(pct) : Number(pct.toFixed(1));
  if (rounded === 0) return 'unchanged';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)}%`;
}

/**
 * A `WindowChange` as a signal — the arrow, the magnitude and the window.
 *
 * `riseMeans` is the only editorial input, and it is required rather than
 * optional-by-default so that every call site has to answer the question out
 * loud: what does *up* do to the person holding this? Pass `null` when the
 * honest answer is "nothing the app can claim" — bitcoin, the gold-silver
 * ratio, how many people looked something up. A null is a decision, and it
 * now has a colour of its own rather than the absence of one.
 *
 * Most call sites should not be answering it by hand: `riseMeansFor` holds
 * the answer per published series, so a card and the sheet it opens cannot
 * disagree. Pass a literal only where the card quotes something other than the
 * published series — `currencyMove` inverts a rate, and inverts this with it.
 *
 * See `valenceOf` for why the valence applies to the direction rather than to
 * the number.
 */
export function deltaFrom(
  change: WindowChange | null,
  riseMeans: RiseMeans,
  options: { window?: string; unit?: 'percent' | 'points' } = {},
): CardDelta | undefined {
  if (!change || !Number.isFinite(change.pct)) return undefined;
  const { window = `since ${change.from}`, unit = 'percent' } = options;
  const magnitude =
    unit === 'points' ? formatMagnitudePoints(change.pct) : formatMagnitudePct(change.pct);
  // "unchanged" is what the formatters return once the move rounds to nothing.
  // A flat chip carries no arrow — there is no direction to point — but it is
  // still coloured, because a monochrome chip in a column of slate ones reads
  // as a fourth state rather than as the quietest one.
  if (magnitude === null)
    return { direction: 'flat', magnitude: 'unchanged', window, valence: 'neutral' };
  const direction = change.pct > 0 ? 'up' : 'down';
  return { direction, magnitude, window, valence: valenceOf(direction, riseMeans) };
}

/** The magnitude alone, unsigned, or null when it rounds to nothing. Rounding
 *  matches `formatSignedPct` so a chip and a sentence can never disagree about
 *  whether something moved. */
export function formatMagnitudePct(pct: number): string | null {
  if (!Number.isFinite(pct)) return null;
  const rounded = Math.abs(pct) >= 10 ? Math.round(pct) : Number(pct.toFixed(1));
  if (rounded === 0) return null;
  return `${Math.abs(rounded)}%`;
}

/** The same, in percentage points. The word is spelled out so a points move
 *  cannot be mistaken for a relative percentage. */
export function formatMagnitudePoints(points: number): string | null {
  if (!Number.isFinite(points)) return null;
  const rounded = Math.round(points);
  if (rounded === 0) return null;
  const magnitude = Math.abs(rounded);
  return `${magnitude} ${magnitude === 1 ? 'point' : 'points'}`;
}

/**
 * A count of things rather than a price: ships a day, alerts, areas. One
 * decimal below ten because a strait averaging 0.9 ships a day is a different
 * fact from one averaging 1, and no decimals above it because the second digit
 * of "128 ships" is weather.
 */
export function formatQuantity(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 10) return Math.round(n).toLocaleString('en-US');
  return Number(n.toFixed(1)).toString();
}

/** US-grouped integer with no unit. For populations and counts. */
export function formatCount(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

// ---------------------------------------------------------------------------
// Nisab
// ---------------------------------------------------------------------------

export interface Nisab {
  /** Dollar value of 85 g of gold. */
  gold: number;
  /** Dollar value of 595 g of silver. */
  silver: number;
  /** Which metal sets the threshold today — always the cheaper one. */
  binding: 'gold' | 'silver';
  /** The threshold itself: the lower of the two. */
  threshold: number;
}

/** The two classical weights. Stated here, once, because the card states them
 *  to the reader — the app takes a position rather than implying there is only
 *  one, the same way the prayer lines name Umm al-Qura. */
const NISAB_GOLD_GRAMS = 85;
const NISAB_SILVER_GRAMS = 595;

/**
 * Zakat becomes due on wealth held above the nisab for a lunar year. Two
 * classical thresholds exist — 85 g of gold and 595 g of silver — and the
 * majority position takes the **lower** of the two, so that more wealth is
 * caught rather than less. Which metal binds therefore changes with the
 * market, and so does the threshold: when silver falls, the threshold falls
 * with it and more people owe zakat than the month before.
 */
export function nisab(goldPerOunce: number, silverPerOunce: number): Nisab | null {
  if (!Number.isFinite(goldPerOunce) || !Number.isFinite(silverPerOunce)) return null;
  if (goldPerOunce <= 0 || silverPerOunce <= 0) return null;
  const gold = (goldPerOunce / GRAMS_PER_TROY_OUNCE) * NISAB_GOLD_GRAMS;
  const silver = (silverPerOunce / GRAMS_PER_TROY_OUNCE) * NISAB_SILVER_GRAMS;
  const binding = silver <= gold ? 'silver' : 'gold';
  return { gold, silver, binding, threshold: Math.min(gold, silver) };
}

// ---------------------------------------------------------------------------
// The tie to the news
// ---------------------------------------------------------------------------

/** Article concepts are proper nouns ("Strait of Hormuz"); indicator topic
 *  tags are lowercase keywords ("hormuz"). Match a tag against whole words of
 *  a concept, and against the whole concept for multi-word tags. */
function conceptMatchesTag(concept: string, tag: string): boolean {
  const c = concept.toLowerCase();
  if (c === tag) return true;
  if (tag.includes(' ')) return c.includes(tag);
  return c.split(/[^a-z0-9]+/).includes(tag);
}

/** Shortest tag worth matching. Two-letter tags are ISO codes and one-letter
 *  tags do not exist; three is where a keyword starts carrying meaning. */
const MIN_TAG_LENGTH = 3;

/**
 * Which of today's stories should affect this reading's rank. These ties are
 * deliberately conservative and stay metadata: the live analysis already
 * carries the news context, so the card does not print the headlines again.
 */
export function relatedForTags(
  articles: Article[],
  tags: readonly string[] | undefined,
  max = 3,
): RelatedArticleRef[] {
  if (!tags || tags.length === 0) return [];
  const usable = tags.map((t) => t.toLowerCase()).filter((t) => t.length >= MIN_TAG_LENGTH);
  if (usable.length === 0) return [];
  // Score, don't just filter. One concept brushing one tag is how a fertility
  // story ends up under a prediction market about an invasion, purely because
  // both mention Iran. Ranking by how many distinct tags an article touches
  // puts the story that is actually about the subject first, and the weak
  // matches fall off the end of `max`.
  const scored = articles
    .map((article, order) => {
      let score = 0;
      for (const tag of usable) {
        if (article.concepts.some((concept) => conceptMatchesTag(concept, tag))) score += 1;
      }
      return { article, score, order };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, max);

  return scored.map(({ article }) => ({
    slug: article.slug,
    title: article.title,
    date: article.date,
  }));
}
