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

const DAY_MS = 86_400_000;

/**
 * Days since an ISO date, against an injected clock.
 *
 * Returns Infinity for anything unparseable, so a malformed date fails a
 * freshness gate rather than passing it.
 *
 * It lives here rather than in `conditions.ts`, which wrote it, because
 * `markets.ts` needs the same arithmetic for the same reason and a second copy
 * is how two gates end up disagreeing about what "new" means.
 */
/**
 * An ISO date-*time* carrying no offset, which `Date.parse` reads as local.
 *
 * The spec splits on this and the two halves disagree: a date-only form
 * (`2026-08-23`) is UTC, a date-time form with no designator
 * (`2026-08-23T04:15:01`) is *local time*. So one payload's fields can be read
 * in two different zones depending only on whether they carry a clock.
 *
 * GDACS is the live case. `/api/gdacs.json` emits
 * `"modifiedDate":"2026-08-23T04:15:01"` with no `Z`, and every other dated
 * field the cards gate on is date-only. West of UTC that string parses ahead
 * of the real instant — five hours ahead in New York — so the freshest alerts
 * in the file are the ones that look like they are from the future.
 *
 * That is invisible until something checks the lower bound, and `isFresh`
 * exists to check exactly that: it rejects anything dated ahead of the clock,
 * which is right, and it was rejecting the newest hazard alerts, which is the
 * one thing `disasterCard` looks for. The card leading `commodities` would
 * have disappeared for every reader west of the meridian on any morning when
 * the escalated alerts were revised inside their own UTC offset.
 */
const NO_OFFSET = /^\d{4}-\d{2}-\d{2}T[\d:.]+$/;

export function daysSince(iso: string | undefined, now: Date): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  // Normalised here rather than at the one call site that needs it, because
  // the trap is in `Date.parse` and every future caller walks into it the same
  // way. A field that means an instant is read as one instant everywhere.
  const t = Date.parse(NO_OFFSET.test(iso) ? `${iso}Z` : iso);
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - t) / DAY_MS;
}

/**
 * Whether a dated payload is new enough to lead a column under the `today ·`
 * mark, bounded at **both** ends.
 *
 * Every gate in `markets.ts` and `conditions.ts` was written as
 * `daysSince(iso, now) <= limit`, and `daysSince` returns a *negative* number
 * for anything dated ahead of the clock — so a future `asOf` satisfied every
 * one of them. Device clock skew, a payload assembled in another timezone and
 * a typo in a year all arrive as the same shape, and the card they let
 * through is the one that tells the reader its data moved this morning.
 *
 * Unparseable stays stale: `daysSince` gives Infinity, which fails.
 */
export function isFresh(iso: string | undefined, now: Date, maxDays: number): boolean {
  const age = daysSince(iso, now);
  return Number.isFinite(age) && age >= 0 && age <= maxDays;
}

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
/**
 * The two ends of the window and their labels — everything both change
 * functions need, and none of the arithmetic either of them does.
 *
 * Split out because the two do not share a precondition. Dividing by the
 * earlier value requires it to be non-zero; subtracting it does not, and
 * `windowPointChange` was inheriting the divisor's guard by delegating. A
 * belief contract priced 0% a week ago and 45% today is the largest move a
 * contract can make, and it was returning null: no chip on the card, and a
 * ranking key of 0 that sorted it last in the column the sort exists to order.
 */
function windowEnds(
  indicator: Pick<Indicator, 'values' | 'periods'>,
  points: number,
): { latest: number; earlier: number; from: string; to: string; span: number } | null {
  const { values, periods } = indicator;
  const n = values.length;
  if (n < 2) return null;
  const span = Math.max(1, Math.min(points, n - 1));
  const latest = values[n - 1];
  const earlier = values[n - 1 - span];
  if (typeof latest !== 'number' || typeof earlier !== 'number') return null;
  if (!Number.isFinite(latest) || !Number.isFinite(earlier)) return null;
  return { latest, earlier, from: periods[n - 1 - span] ?? '', to: periods[n - 1] ?? '', span };
}

export function windowChange(
  indicator: Pick<Indicator, 'values' | 'periods'>,
  points: number,
): WindowChange | null {
  const ends = windowEnds(indicator, points);
  // The guard that belongs to *this* function and not to the one below it.
  if (!ends || ends.earlier === 0) return null;
  const { latest, earlier, from, to, span } = ends;
  return {
    pct: ((latest - earlier) / Math.abs(earlier)) * 100,
    from,
    to,
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
  // Off `windowEnds`, not off `windowChange`. Delegating to the relative form
  // meant inheriting its `earlier === 0` guard, which exists only because that
  // function divides — see `windowEnds`.
  const ends = windowEnds(indicator, points);
  if (!ends) return null;
  return {
    pct: ends.latest - ends.earlier,
    from: ends.from,
    to: ends.to,
    points: ends.span,
  };
}

/**
 * A window shorter than this is not a chart.
 *
 * It guards the *cut*, not the chart: a series whose window already spans it
 * is left alone whatever its length, which is why the six-point ceasefire
 * contract still gets its reference line. What this stops is a monthly
 * indicator read `MONTH` back, which would ask a twenty-four-point series to
 * throw twenty-two away and call the remaining two a trend. No card in the app
 * reaches it today; it is a floor for a cadence the pipeline is free to
 * introduce tomorrow.
 */
const MIN_PLOT_POINTS = 8;

export interface PlotWindow {
  values: number[];
  periods: string[];
  /**
   * The level the window opens at, for the chart's reference line.
   *
   * Absent when the plotted series is *wider* than the window the chip
   * measured, because a reference drawn at the wrong end of a chart is worse
   * than none: it looks like a claim.
   */
  baseline?: number;
}

/**
 * The observations the chip's change is measured across — and therefore the
 * only ones the chart is allowed to draw.
 *
 * A card states one change over one window ("up 33%, since Jul 7") and draws
 * one line. Until this existed the two were computed independently and the
 * three FRED cards had them disagree: `DAILY_WINDOW` measures thirty
 * observations, `brent` ships sixty-one, so the card said **up 33% since Jul
 * 7** above a line that ran from 26 May to 18 Aug and fell about eight per
 * cent across the width of the screen. Both numbers were right. Nothing on the
 * card said they were answering different questions, and the picture is the
 * half a reader trusts without checking.
 *
 * This is the arithmetic half of the rule `mobile/CLAUDE.md` states for the
 * currency table — *a headline count must equal what the table paints* — and
 * it is also what every finance app does: the period control moves the chart
 * and the percentage together, and no one ships a three-month line over a
 * one-month change. The window the chip chose wins, because the chip is where
 * the editorial decision was made.
 *
 * Takes the `WindowChange` the chip was built from rather than a point count,
 * so the two cannot be computed twice and drift — `windowEnds` clamps its span
 * to the series length and a second caller would have to clamp it identically.
 */
export function plotWindow(
  series: Pick<Indicator, 'values' | 'periods'>,
  change: WindowChange | null,
): PlotWindow {
  const { values, periods } = series;
  const start = change ? values.length - 1 - change.points : -1;
  if (!change || start < 0) return { values, periods };
  // The window already spans the series — every exchange rate, every contract,
  // the nisab metal. There is nothing to cut, so the only thing this adds is
  // the level it opens at, and the length guard below must not reach it: the
  // six-point ceasefire contract is both the shortest series in the app and
  // one whose chart is exactly its window, so a guard written against slicing
  // was taking the reference off the one card that had least else to go on.
  if (start === 0) return { values, periods, baseline: values[0] };
  if (change.points < MIN_PLOT_POINTS) return { values, periods };
  return {
    values: values.slice(start),
    periods: periods.slice(start),
    baseline: values[start],
  };
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

/**
 * The pipeline writes units the way a data column does — `$/bbl`, `$/mt`. A
 * reading is read aloud, so the denominator becomes English and the currency
 * mark moves to the front of the number where a reader expects it.
 */
const DENOMINATOR: Record<string, string> = {
  '/bbl': 'a barrel',
  '/mt': 'a tonne',
  '/oz': 'an ounce',
  '/gal': 'a gallon',
  '/MMBtu': 'per million BTU',
};

/** The denominator of a `$/x` unit in English, or undefined for a bare `$`
 *  and for anything that is not a currency-per-something. Exported so the
 *  chart caption and the reading's note cannot name the same unit two ways. */
export function unitDenominator(unit: string | undefined): string | undefined {
  if (!unit?.startsWith('$')) return undefined;
  const per = unit.slice(1);
  return per ? (DENOMINATOR[per] ?? per.slice(1)) : undefined;
}

export interface ReadingParts {
  /** The number with its currency mark, if it takes one. */
  reading: string;
  /** What the number counts, in English — or absent when the unit cannot say. */
  note?: string;
}

/**
 * A reading and what it counts, in the app's one grammar.
 *
 * This lived in `markets.ts` as `money()` and the sheet that a card opens had
 * its own arrangement: `formatReading(v, unit)` with `indicator.unit` appended
 * raw. The two disagreed on every indicator that carries a unit — the
 * ten-year printed `4.69%` on the card and `4.69 %` in the sheet, brent `$95`
 * / `a barrel` against `95 $/bbl` — which is the rule in `CLAUDE.md` about a
 * card and its sheet, broken by the two of them never having met.
 *
 * `index` returns no note on purpose. Every other note tells the reader what
 * the number counts ("a barrel", "an ounce"); "index" is a kind, not a
 * denominator, and printed as one it produced "16 · index" under a reading of
 * 16. A note that cannot do the job is better absent.
 */
export function readingParts(value: number, unit?: string): ReadingParts {
  const formatted = formatReading(value, unit);
  if (!unit) return { reading: formatted };
  if (unit === '%') return { reading: `${formatted}%` };
  if (unit.startsWith('$')) return { reading: `$${formatted}`, note: unitDenominator(unit) };
  if (unit === 'index') return { reading: formatted };
  return { reading: formatted, note: unit };
}

/**
 * The same, flattened to one string, for a call site with nowhere to put a
 * second line.
 *
 * NOTE: currently has no callers. It is left in place, delegating rather than
 * re-deriving, so it cannot become a fifth spelling of this while it waits for
 * a decision — but it is a deletion candidate, not a fixture.
 */
export function formatReadingWithUnit(value: number, unit?: string): string {
  const { reading, note } = readingParts(value, unit);
  return note ? `${reading} ${note}` : reading;
}

/**
 * Part four's owner label, and part four, decided together.
 *
 * Three cards computed `standing?.trim() ? 'on wheat' : undefined` beside an
 * unguarded `why: standing`, so a whitespace-only paragraph produced a card
 * with the horizontal rule drawn, an empty body under it and no label saying
 * whose it was — the two fields answering different questions about the same
 * string. One helper, one answer.
 */
export function labelledWhy(
  standing: string | undefined,
  owner: string,
): { why?: string; whyLabel?: string } {
  const why = standing?.trim() ? standing : undefined;
  return why ? { why, whyLabel: owner } : {};
}

/**
 * The one rounding rule every move in this app is reported under: whole
 * numbers at ten and above, one decimal below.
 *
 * It was written four times. `formatSignedPct`, `formatMagnitudePct` and
 * `formatMagnitudePoints` each carried the same
 * `Math.abs(v) >= 10 ? Math.round(v) : Number(v.toFixed(1))` line, and
 * `formatSignedPoints` rounded to an integer always — so a twenty-basis-point
 * move was "0.2 points" through one of them and **unchanged** through the
 * other, which is the exact bug `formatMagnitudePoints` was written to fix,
 * still live one function down. Copies of a rounding rule are only free while
 * they agree, and these had already stopped.
 *
 * Returns null when the move rounds to nothing — every caller's cue to say
 * "unchanged" rather than print a zero — and null for a non-finite input,
 * which callers that print a dash separate out first.
 */
function roundedMove(
  value: number,
  fixedDecimals?: 0 | 1,
): {
  value: number;
  decimals: 0 | 1;
} | null {
  if (!Number.isFinite(value)) return null;
  const decimals = fixedDecimals ?? (Math.abs(value) >= 10 ? 0 : 1);
  const rounded = Number(value.toFixed(decimals));
  return rounded === 0 ? null : { value: rounded, decimals };
}

/**
 * The magnitude of a rounded move as text, unsigned.
 *
 * `tabular` is the whole difference between a sentence and a column. `Number`
 * drops a trailing zero, which is right in prose — "gold +1%" — and wrong in
 * the fifteen-row currency table, where it printed "+1%" beside "+0.8%" and
 * "+3%" beside "+3.5%": two decimal positions and two pill widths in one rail,
 * for a distinction the reader cannot see and the data does not make.
 */
function magnitudeText(move: { value: number; decimals: 0 | 1 }, tabular: boolean): string {
  const magnitude = Math.abs(move.value);
  return tabular ? magnitude.toFixed(move.decimals) : String(magnitude);
}

/**
 * A signed percentage, with a true minus sign rather than a hyphen — the
 * column is typographic, not code.
 *
 * `tabular` is for output that lands in a column of other percentages rather
 * than in a sentence, and it suspends the "whole numbers at ten and above"
 * rule on purpose. That rule is about how a move reads *aloud* — "the lira
 * lost sixteen per cent" — and a table is not read aloud, it is scanned down.
 * One decimal for every row is what makes the rail one pill width and the
 * decimal points one column; letting the rule through gave "+16%" beside
 * "+0.8%", which is the widest disagreement in the table sitting on the row a
 * reader's eye goes to first.
 *
 * The noise floor is unaffected: a move that rounds to nothing at one decimal
 * is still the word "unchanged", in both registers.
 */
export function formatSignedPct(pct: number, options: { tabular?: boolean } = {}): string {
  if (!Number.isFinite(pct)) return '—';
  const tabular = options.tabular ?? false;
  const move = roundedMove(pct, tabular ? 1 : undefined);
  if (!move) return 'unchanged';
  return `${move.value > 0 ? '+' : '−'}${magnitudeText(move, tabular)}%`;
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
  const move = roundedMove(pct);
  return move ? `${magnitudeText(move, false)}%` : null;
}

/**
 * The same, in percentage points. See `formatSignedPoints` for why the word
 * is spelled out.
 *
 * Rounding is `roundedMove`, shared with every other formatter here — whole
 * numbers at ten and above, one decimal below — rather than an integer
 * always, which is what this used to do. A prediction
 * contract moves in whole points and reads the same either way; a yield does
 * not. The ten-year went 4.54 → 4.69 over the window this app holds, and an
 * integer round called that **unchanged**, which is how it ended up reported
 * as "+3.3%" instead: the honest unit was unprintable, so the misleading one
 * stayed.
 */
export function formatMagnitudePoints(points: number): string | null {
  const move = roundedMove(points);
  if (!move) return null;
  const magnitude = Math.abs(move.value);
  return `${magnitude} ${magnitude === 1 ? 'point' : 'points'}`;
}

/** A signed difference in percentage points. Says "points" out loud, because
 *  the whole reason this function exists is that "%" would be read as a
 *  relative change.
 *
 *  On `roundedMove` like its siblings. It was the last holdout on a plain
 *  `Math.round`, so it called a fifteen-basis-point move **unchanged** while
 *  the chip beside it, built from the same number, said "0.2 points". */
export function formatSignedPoints(points: number): string {
  if (!Number.isFinite(points)) return '—';
  const move = roundedMove(points);
  if (!move) return 'unchanged';
  const magnitude = Math.abs(move.value);
  return `${move.value > 0 ? '+' : '−'}${magnitude} ${magnitude === 1 ? 'point' : 'points'}`;
}

/**
 * A count of things rather than a price: ships a day, alerts, areas. One
 * decimal below ten because a strait averaging 0.9 ships a day is a different
 * fact from one averaging 1, and no decimals above it because the second digit
 * of "128 ships" is weather.
 *
 * The same shape as `roundedMove` and deliberately not built on it: this
 * formats a *level*, so zero is a printable answer ("0 ships a day") where a
 * move that rounds to zero is the word "unchanged", and a level is grouped
 * where a move never reaches four figures. Sharing the helper would mean
 * teaching it both jobs.
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
export const NISAB_GOLD_GRAMS = 85;
export const NISAB_SILVER_GRAMS = 595;

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
 * Part five of the card: which of today's stories this reading actually
 * touches. Matching is deliberately conservative — a wrong tie is worse than
 * no tie, because the whole point of the line is that the app is one thing
 * rather than a dashboard bolted to a reader.
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
