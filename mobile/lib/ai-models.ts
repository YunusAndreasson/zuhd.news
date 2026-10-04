import { deltaOf, formatNumber } from './cards/format';
import type { SwipeCard } from './cards/rank';
import type { CardDelta, CardFigure } from './cards/types';
import { isIsoDate, observationDate } from './data-freshness';
import { MONTH_ABBR } from './date-format';
import { stockMarketPlace } from './markets';

/**
 * The menu's `AI models` list: the published `/api/ai-models.json` contract,
 * and the card each lab opens.
 *
 * Ten AI labs, each with the best score any of its models has on Epoch AI's
 * capability index, a composite of dozens of benchmarks (2026-10-04, the
 * user's request: "tracking how different models develop"). The pipeline
 * reads Epoch's open files once a day (`scripts/lib/ai-models.js`).
 *
 * **A lab, not a model.** The file scores 270 models, and a list of them is a
 * leaderboard. What a reader asked is how far each lab has come, so a row is
 * a lab, its number is its best model's, and its line is that best at each
 * release that raised it.
 *
 * **It is not a ranking, and the screen must not make it one.** The top two
 * labs' ranges overlapped on the day this was written (164–172 and 163–171).
 * The list is ordered by score because a list has an order; its note says
 * scores a few points apart are within the measure's margin, and every card
 * prints the range. The score is one organisation's composite and is rescaled
 * when a benchmark joins it, so nothing here compares a score with one the
 * app saw earlier: the line is read from the file each time.
 *
 * **The move is a year, in points.** A lab's best changes a few times a year
 * and never in a week, so there is no week to print: the cards stay out of
 * the strip and the ranked pool, and the list's note says the year once.
 *
 * Not on the globe: a lab has an office, not a place its score is about.
 */
export interface AiLabMoney {
  usd: number;
  /** The day the report is of. */
  asOf: string;
  /** Epoch's own grade of the report: `Confident`, `Likely`. */
  confidence?: string;
}

export interface AiLab {
  id: string;
  name: string;
  iso2: string;
  /** What the lab is: the catalog's standing sentence, and the card's prose. */
  blurb: string;
  /** The model that holds the lab's best score. */
  model: string;
  score: number;
  /** The score's likely range, where the index gives one. */
  low?: number;
  high?: number;
  /** The day that model was released. */
  asOf: string;
  /** The lab's best at each release that raised it; `models[i]` set `values[i]`. */
  series: { periods: string[]; values: number[]; models: string[] };
  /** Revenue at a yearly rate, from the newest report under a year old. */
  revenue?: AiLabMoney;
  valuation?: AiLabMoney;
}

export interface AiModelsSnapshot {
  generated: string;
  /** The best score of any model in the file, and whose it is. */
  frontier: { score: number; model: string; lab: string };
  labs: AiLab[];
}

const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const isMoney = (v: unknown): boolean =>
  v === undefined ||
  (object(v) &&
    finite(v.usd) &&
    v.usd > 0 &&
    isIsoDate(v.asOf) &&
    (v.confidence === undefined || typeof v.confidence === 'string'));

const STRINGS = ['id', 'name', 'iso2', 'blurb', 'model'] as const;

export function isAiModelsSnapshot(v: unknown): v is AiModelsSnapshot {
  if (
    !object(v) ||
    typeof v.generated !== 'string' ||
    !Number.isFinite(Date.parse(v.generated)) ||
    !object(v.frontier) ||
    !finite(v.frontier.score) ||
    typeof v.frontier.model !== 'string' ||
    typeof v.frontier.lab !== 'string' ||
    !Array.isArray(v.labs)
  )
    return false;
  const ids = new Set<string>();
  return v.labs.every((lab) => {
    if (!object(lab) || !STRINGS.every((k) => typeof lab[k] === 'string') || !lab.id || !lab.name)
      return false;
    if (ids.has(String(lab.id))) return false;
    ids.add(String(lab.id));
    if (!finite(lab.score) || lab.score <= 0 || !isIsoDate(lab.asOf)) return false;
    if (
      (lab.low !== undefined && !finite(lab.low)) ||
      (lab.high !== undefined && !finite(lab.high))
    )
      return false;
    const series = lab.series;
    if (
      !object(series) ||
      !Array.isArray(series.values) ||
      !Array.isArray(series.periods) ||
      !Array.isArray(series.models) ||
      series.values.length !== series.periods.length ||
      series.models.length !== series.periods.length ||
      !series.values.every(finite) ||
      !series.periods.every(isIsoDate) ||
      !series.models.every((m) => typeof m === 'string')
    )
      return false;
    return isMoney(lab.revenue) && isMoney(lab.valuation);
  });
}

/** The card id of a lab: its own namespace, beside `co:` and `mkt:`. */
export const aiLabCardId = (id: string): string => `ai:${id}`;

/** The window every lab with 90 days behind it moves over. The list's note
 *  says it once, so a row prints its window only when it is not this one. */
export const AI_CHANGE_WINDOW = 'over 90 days';

export const AI_CHANGE_DAYS = 90;

/** A score as it is printed: one decimal, always, so a column of them lines
 *  up and `130` is not read as rounder than `130.4`. */
const formatScore = (score: number): string => formatNumber(score, 1, 1);

/** `Sep 2026`: a report's or a first release's month. */
function monthYear(iso: string): string {
  return `${MONTH_ABBR[Number(iso.slice(5, 7)) - 1] ?? ''} ${iso.slice(0, 4)}`.trim();
}

/** A day beside today's: `Sep 1` this year, `Nov 2025` for an earlier one —
 *  `Nov 24` alone would be read as this November. */
function dayOrMonth(iso: string, now: number): string {
  return iso.slice(0, 4) === new Date(now).toISOString().slice(0, 4)
    ? observationDate(iso)
    : monthYear(iso);
}

/** Dollars at the size a valuation is quoted in: `$965B`, `$1.6B`, `$428M`. */
export function compactUsd(usd: number): string {
  const [divisor, mark] =
    usd >= 1e12 ? [1e12, 'T'] : usd >= 1e9 ? [1e9, 'B'] : usd >= 1e6 ? [1e6, 'M'] : [1, ''];
  const scaled = usd / divisor;
  return `$${formatNumber(scaled, scaled < 10 ? 1 : 0)}${mark}`;
}

/**
 * How far the lab's best has risen: over 90 days where its line reaches
 * back that far, and otherwise since its first scored model, which the window
 * then names. In the index's own points, never a percentage: 147 to 167 is
 * twenty points on a scale with no zero that means anything.
 */
/** Release scores carry forward until a newer release replaces them. */
export function aiScoreChange(
  series: Pick<AiLab['series'], 'values' | 'periods'>,
  now = Date.now(),
): { points: number; fullWindow: boolean; window: string } | undefined {
  const cutoff = now - AI_CHANGE_DAYS * 86400_000;
  let first: { value: number; period: string } | undefined;
  let before: number | undefined;
  let latest: number | undefined;
  let observations = 0;
  for (let i = 0; i < series.periods.length; i++) {
    const period = series.periods[i] ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(period)) continue;
    const at = Date.parse(period);
    const value = series.values[i];
    if (!Number.isFinite(at) || at > now || value === undefined || !Number.isFinite(value))
      continue;
    first ??= { value, period };
    observations++;
    if (at <= cutoff) before = value;
    latest = value;
  }
  if (!first || latest === undefined) return undefined;
  if (before === undefined && observations < 2) return undefined;
  return {
    points: latest - (before ?? first.value),
    fullWindow: before !== undefined,
    window: before === undefined ? `since ${dayOrMonth(first.period, now)}` : AI_CHANGE_WINDOW,
  };
}

export function aiLabMove(lab: Pick<AiLab, 'series'>, now = Date.now()): CardDelta | undefined {
  const change = aiScoreChange(lab.series, now);
  return change ? deltaOf(change.points, { unit: 'score', window: change.window }) : undefined;
}

const moneyFigure = (label: string, money: AiLabMoney): CardFigure => ({
  label,
  value: compactUsd(money.usd),
  // Epoch grades each report. Anything short of `Confident` is someone's
  // estimate, and a figure this size printed bare reads as an audited one.
  note:
    money.confidence && money.confidence !== 'Confident'
      ? `${monthYear(money.asOf)}, estimate`
      : monthYear(money.asOf),
});

/** The figures under a lab's score: how sure the score is, then its money. */
export function aiLabFigures(lab: AiLab): CardFigure[] {
  const figures: CardFigure[] = [];
  if (lab.low !== undefined && lab.high !== undefined) {
    figures.push({
      label: 'likely range',
      value: `${formatNumber(lab.low, 0)}–${formatNumber(lab.high, 0)}`,
    });
  }
  if (lab.revenue) figures.push(moneyFigure('yearly revenue', lab.revenue));
  if (lab.valuation) figures.push(moneyFigure('valuation', lab.valuation));
  return figures;
}

export function aiLabCard(
  lab: AiLab,
  frontier: AiModelsSnapshot['frontier'],
  now = Date.now(),
): SwipeCard {
  const { periods, values, models } = lab.series;
  const n = values.length;
  const before =
    n >= 2 ? { model: models[n - 2], score: values[n - 2], day: periods[n - 2] } : null;
  return {
    id: aiLabCardId(lab.id),
    kind: 'reading',
    title: lab.name,
    // The model the number belongs to, and where the lab is from: the line
    // under the lab's name in the list, and over the score on its card.
    kicker: [lab.model, stockMarketPlace(lab.iso2)].filter(Boolean).join(' · '),
    asOf: lab.asOf,
    reading: formatScore(lab.score),
    readingNote: 'on Epoch’s capability index',
    delta: aiLabMove(lab, now),
    figures: aiLabFigures(lab),
    why: lab.blurb,
    changed:
      before?.model && before.score !== undefined && before.day
        ? `Before it: ${before.model}, ${formatScore(before.score)}, ${dayOrMonth(before.day, now)}.`
        : undefined,
    sourceLabel: 'Epoch AI',
    series: {
      values,
      periods,
      label: 'Best score at each release',
      // The best any lab has, as a rule to measure the line against. The lab
      // that holds it gets none: its own line ends there.
      ...(frontier.score > lab.score
        ? { reference: { value: frontier.score, label: `best: ${frontier.lab}` } }
        : {}),
    },
  };
}
