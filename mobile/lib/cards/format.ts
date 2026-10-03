import type { Article, Indicator, RelatedArticleRef } from '@shared/types';
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
  // Not built on `windowChange`: its zero guard is a relative change's, and a
  // difference is defined from zero — a rate cut to 0% and raised to 0.25%
  // moved a quarter of a point, and a contract from 0% to 5% moved five.
  const { values, periods } = indicator;
  const n = values.length;
  if (n < 2) return null;
  const span = Math.max(1, Math.min(points, n - 1));
  const latest = values[n - 1];
  const earlier = values[n - 1 - span];
  if (typeof latest !== 'number' || typeof earlier !== 'number') return null;
  if (!Number.isFinite(latest) || !Number.isFinite(earlier)) return null;
  return {
    pct: latest - earlier,
    from: periods[n - 1 - span] ?? '',
    to: periods[n - 1] ?? '',
    points: span,
  };
}

/**
 * A published rate: a monthly series in percent — the Fed's target, the ECB's
 * deposit rate, inflation, unemployment. It moves in percentage points
 * (`windowPointChange`, `deltaFrom` `unit: 'rate'`) on every surface that
 * prints it, the card and the sheet a story's mention opens alike; a rate that
 * went from 4.00% to 3.75% fell a quarter of a point, and "−6.3%" is the
 * mistake `windowPointChange` exists to prevent.
 *
 * Monthly only, for now. The ten-year is a daily `%` series whose relative
 * move the strip sorts on beside prices; moving it to points takes it out of
 * that sort, which is a change to the strip and its own decision.
 */
export function isMonthlyRate(indicator: Pick<Indicator, 'cadence' | 'unit'>): boolean {
  return indicator.cadence === 'monthly' && indicator.unit === '%';
}

const numberFormats = new Map<string, Intl.NumberFormat>();

/**
 * A number grouped as the app prints every number — `1,234.5`, in en-US
 * whatever the phone's language, as the rest of the copy is English — to at
 * most `maxDecimals` places (`toLocaleString`'s own three by default) and at
 * least `minDecimals`.
 *
 * One formatter per precision, kept for the session: `toLocaleString` builds a
 * new one on every call, which on Android is a trip through ICU (~9 ms for a
 * date, `formatLocalTime`), and a chart's scrub formats a number per step.
 */
export function formatNumber(n: number, maxDecimals = 3, minDecimals = 0): string {
  const key = `${minDecimals}:${maxDecimals}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: minDecimals,
      maximumFractionDigits: maxDecimals,
    });
    numberFormats.set(key, format);
  }
  return format.format(n);
}

/**
 * The reading itself — one number at arm's length.
 *
 * Percentages and sub-10 values keep two decimals (4.69% is a different rate
 * from 4.7%); everything larger rounds and groups, because the fourth
 * significant digit of a wheat price is noise the reader will never repeat.
 *
 * A price under a dollar keeps four: at two, a coin at $0.0931 reads `$0.09`,
 * and a tenth of its value can come and go without the reading changing.
 */
export function formatReading(value: number, unit?: string): string {
  if (!Number.isFinite(value)) return '—';
  if (unit?.startsWith('$') && Math.abs(value) < 1) return value.toFixed(4);
  if (unit === '%' || Math.abs(value) < 10) return value.toFixed(2);
  return formatCount(value);
}

/** A percentage at the precision the app prints one: whole from ten up,
 *  one decimal below. Shared, so a chip and a sentence can never disagree
 *  about whether something moved. */
function roundPct(pct: number): number {
  return Math.abs(pct) >= 10 ? Math.round(pct) : Number(pct.toFixed(1));
}

/** A signed percentage, one decimal, with a true minus sign rather than a
 *  hyphen — the column is typographic, not code. */
export function formatSignedPct(pct: number): string {
  if (!Number.isFinite(pct)) return '—';
  const rounded = roundPct(pct);
  if (rounded === 0) return 'unchanged';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)}%`;
}

/**
 * A `WindowChange` as a signal — the arrow, the magnitude and the window.
 *
 * Its colour is its direction (`moveTone`); a contract's move is in points and
 * carries `unit`, so the chip leaves it slate. It took a `riseMeans` argument
 * until 2026-09-25, when the colour said what a move meant for an ordinary
 * life rather than which way it went.
 *
 * `rate` is a published rate's move — the Fed's target, inflation, the jobless
 * rate — in percentage points (the change from `windowPointChange`). It is
 * coloured like any move, because a rate is not a contract, and carries no
 * `size`, because points and percentages are not one scale to sort on.
 */
export function deltaFrom(
  change: WindowChange | null,
  options: DeltaOptions = {},
): CardDelta | undefined {
  if (!change) return undefined;
  return deltaOf(change.pct, { ...options, window: options.window ?? `since ${change.from}` });
}

export interface DeltaOptions {
  window?: string;
  unit?: 'percent' | 'points' | 'rate' | 'score';
  /** What a move that rounds to nothing prints: `unchanged`, or a strait's
   *  `at its normal`. */
  flat?: string;
}

/**
 * A move of `pct` over `window` as a chip — `deltaFrom` for a move measured
 * some other way: a week (`gaugeMove`), a strait's distance from its normal.
 * Those built the chip by hand, a copy of this body each.
 */
export function deltaOf(
  pct: number,
  { window, unit = 'percent', flat = 'unchanged' }: DeltaOptions = {},
): CardDelta | undefined {
  if (!Number.isFinite(pct)) return undefined;
  const magnitude =
    unit === 'points'
      ? formatMagnitudePoints(pct)
      : unit === 'rate'
        ? formatMagnitudeRatePoints(pct)
        : unit === 'score'
          ? formatMagnitudeScorePoints(pct)
          : formatMagnitudePct(pct);
  // `null` is what the formatters return once the move rounds to nothing. A
  // flat chip carries no arrow — there is no direction to point — and reads
  // slate, the quietest of the three.
  const size = unit === 'percent' ? Math.abs(pct) : undefined;
  const points = unit === 'points' ? ({ unit: 'points' } as const) : {};
  if (magnitude === null) return { direction: 'flat', magnitude: flat, window, size, ...points };
  return { direction: pct > 0 ? 'up' : 'down', magnitude, window, size, ...points };
}

/**
 * A move as the globe prints it beside a mark, and the chooser beside the
 * mark's row: `↑5%`, `↓0.3 points`, and `−0%` for a move that rounds to
 * nothing — the chip's word `unchanged` does not belong under a name on the
 * map. One function, so the mark and its row cannot differ.
 */
export function markMove(delta: CardDelta): string {
  if (delta.direction === 'flat') return '−0%';
  return `${delta.direction === 'up' ? '↑' : '↓'}${delta.magnitude}`;
}

/**
 * A move as a screen reader hears it: `up 5% over 7 days`, `unchanged over 7
 * days` — the direction as a word, because the arrow is not one, and a flat
 * move's magnitude already says it. `window: false` where the window is
 * spoken on its own.
 */
export function spokenDelta(delta: CardDelta, { window = true } = {}): string {
  const move =
    delta.direction === 'flat' ? delta.magnitude : `${delta.direction} ${delta.magnitude}`;
  return window && delta.window ? `${move} ${delta.window}` : move;
}

/** The magnitude alone, unsigned, or null when it rounds to nothing. Rounding
 *  matches `formatSignedPct` so a chip and a sentence can never disagree about
 *  whether something moved. */
export function formatMagnitudePct(pct: number): string | null {
  if (!Number.isFinite(pct)) return null;
  const rounded = roundPct(pct);
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
 * A rate's move in percentage points, to two decimals.
 *
 * Whole points suit a contract, whose sixty-point swings are the story; a
 * central bank moves in quarters, so rounded to a whole point a 25-basis-point
 * cut read "unchanged". Two decimals, as the rate itself is printed
 * (`formatReading`), so the move and the level agree about precision.
 */
function formatMagnitudeRatePoints(points: number): string | null {
  if (!Number.isFinite(points)) return null;
  const magnitude = Math.abs(points).toFixed(2);
  if (Number(magnitude) === 0) return null;
  return `${magnitude} points`;
}

/**
 * A move in an index's own points, at the one decimal the index is printed
 * to: an AI lab's best score, up `20.5 points` in a year (`lib/ai-models.ts`).
 * Coloured like any move and without a `size`, as a rate's: points on an
 * index and a percentage are not one scale to sort on.
 */
function formatMagnitudeScorePoints(points: number): string | null {
  if (!Number.isFinite(points)) return null;
  const magnitude = Math.abs(points).toFixed(1);
  if (Number(magnitude) === 0) return null;
  return `${magnitude} points`;
}

/** The same move, signed, for a sentence: "+0.25 points", or "unchanged". */
export function formatSignedRatePoints(points: number): string {
  const magnitude = formatMagnitudeRatePoints(points);
  if (magnitude === null) return 'unchanged';
  return `${points > 0 ? '+' : '−'}${magnitude}`;
}

/**
 * A count of things rather than a price: ships a day, alerts, areas. One
 * decimal below ten because a strait averaging 0.9 ships a day is a different
 * fact from one averaging 1, and no decimals above it because the second digit
 * of "128 ships" is weather.
 */
export function formatQuantity(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 10) return formatCount(n);
  return Number(n.toFixed(1)).toString();
}

/** A strait's traffic against its own 90-day normal, as the card and the
 *  sheet it opens both print it. `delta` is a fraction (−0.57 is 57% below).
 *  `bare` drops the basis, for a row under a heading that already names it. */
export function formatVsNormal(delta: number, { bare = false } = {}): string {
  const signed = formatSignedPct(delta * 100);
  if (signed === 'unchanged') return 'at its normal';
  return bare ? signed : `${signed} vs its normal`;
}

/** US-grouped integer with no unit. For populations and counts. */
export function formatCount(n: number): string {
  return formatNumber(Math.round(n), 0);
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

/** A concept as a tag is matched against it: lowercased, and its words. */
interface ConceptKey {
  lower: string;
  words: ReadonlySet<string>;
}

/**
 * Each article's concepts as `ConceptKey`s, once per river. Every card asks
 * `relatedForTags` about the same articles — some thirty-five builders on each
 * river, forty more when the menu's catalog builds — and each concept was
 * lowercased and split again for every tag of every card.
 */
const conceptKeys = new WeakMap<readonly Article[], readonly (readonly ConceptKey[])[]>();

function conceptKeysOf(articles: readonly Article[]): readonly (readonly ConceptKey[])[] {
  let keys = conceptKeys.get(articles);
  if (!keys) {
    keys = articles.map((article) =>
      article.concepts.map((concept) => {
        const lower = concept.toLowerCase();
        return { lower, words: new Set(lower.split(/[^a-z0-9]+/)) };
      }),
    );
    conceptKeys.set(articles, keys);
  }
  return keys;
}

/** Article concepts are proper nouns ("Strait of Hormuz"); indicator topic
 *  tags are lowercase keywords ("hormuz"). Match a tag against whole words of
 *  a concept, and against the whole concept for multi-word tags. */
function conceptMatchesTag(concept: ConceptKey, tag: string): boolean {
  if (concept.lower === tag) return true;
  if (tag.includes(' ')) return concept.lower.includes(tag);
  return concept.words.has(tag);
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
  const keys = conceptKeysOf(articles);
  const scored = articles
    .map((article, order) => {
      const concepts = keys[order] ?? [];
      let score = 0;
      for (const tag of usable) {
        if (concepts.some((concept) => conceptMatchesTag(concept, tag))) score += 1;
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
