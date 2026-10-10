/**
 * A list's past thirty days as one line: its members' prices, each set to
 * where it stood on the first day, combined day by day.
 *
 * A number says where a month ended and nothing of how it went: a slide and a
 * plunge that half recovered are both `−2.6%`. The menu's table prints a day
 * and a week as numbers, which is all either is, and draws the month
 * (`Spark`).
 *
 * - **Every member starts at the same day**, the latest of thirty days back
 *   and the first day they all have, so the line is of one set of things from
 *   end to end. A member that joins late shortens it; one far too short to
 *   draw is left out.
 * - **A day a member has no price for takes its last one.** Markets do not
 *   share a calendar, and a line that dropped a member on its holiday would
 *   move for that reason alone.
 * - **A member whose last price is old is left out**: it would hold the line
 *   level at the end while the others moved.
 */

/** One member's observations, oldest first, by day number. */
export interface PathSeries {
  days: readonly (number | null)[];
  values: readonly number[];
  /** What it weighs in the line. One where absent. */
  weight?: number;
}

export interface MovePath {
  /** The days drawn, as day numbers, oldest first. */
  days: number[];
  /** The line on each, in per cent from the first day: it starts at zero. */
  values: number[];
}

/** How far back a path reaches. */
export const PATH_DAYS = 30;
/** Less than this is not a month's line, and is not drawn. */
export const PATH_MIN_DAYS = 14;
/** How old a price may be and still stand for a day: a weekend and a holiday. */
const CARRY_DAYS = 4;

type Combine = (ratios: readonly number[], weights: readonly number[]) => number;

/** The members' levels as one, each by its weight. */
export const weightedMean: Combine = (ratios, weights) => {
  let total = 0;
  let weight = 0;
  ratios.forEach((ratio, i) => {
    total += ratio * (weights[i] ?? 1);
    weight += weights[i] ?? 1;
  });
  return total / weight;
};

/** The middle member's level, whatever each weighs. */
export const middle: Combine = (ratios) => {
  const sorted = [...ratios].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? 1)
    : ((sorted[mid - 1] ?? 1) + (sorted[mid] ?? 1)) / 2;
};

interface Member {
  days: number[];
  values: number[];
  weight: number;
}

/** A member's usable observations: a day and a price above nothing. Two on
 *  one day are the later one, as a price quoted now follows its day's close. */
function clean({ days, values, weight = 1 }: PathSeries): Member {
  const out: Member = { days: [], values: [], weight };
  days.forEach((day, i) => {
    const value = values[i];
    if (day == null || typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return;
    if (out.days.at(-1) === day) out.values[out.values.length - 1] = value;
    else if ((out.days.at(-1) ?? Number.NEGATIVE_INFINITY) < day) {
      out.days.push(day);
      out.values.push(value);
    }
  });
  return out;
}

export function movePath(
  series: readonly PathSeries[],
  combine: Combine = weightedMean,
): MovePath | null {
  const all = series.map(clean).filter((member) => member.days.length >= 2);
  if (all.length === 0) return null;
  const end = Math.max(...all.map((member) => member.days.at(-1) as number));
  const members = all.filter(
    (member) =>
      end - (member.days.at(-1) as number) <= CARRY_DAYS &&
      end - (member.days[0] as number) >= PATH_MIN_DAYS,
  );
  if (members.length === 0) return null;
  const start = Math.max(end - PATH_DAYS, ...members.map((member) => member.days[0] as number));
  if (end - start < PATH_MIN_DAYS) return null;

  const drawn = new Set<number>([start]);
  for (const member of members)
    for (const day of member.days) if (day > start && day <= end) drawn.add(day);
  const days = [...drawn].sort((a, b) => a - b);

  const weights = members.map((member) => member.weight);
  /** Where each member's reading stands as the days are walked. */
  const at = members.map(() => 0);
  const level = (i: number, day: number): number => {
    const member = members[i] as Member;
    let cursor = at[i] ?? 0;
    while (cursor + 1 < member.days.length && (member.days[cursor + 1] as number) <= day)
      cursor += 1;
    at[i] = cursor;
    return member.values[cursor] as number;
  };
  const base = members.map((_, i) => level(i, start));
  const values = days.map((day) => {
    const ratios = members.map((_, i) => level(i, day) / (base[i] as number));
    return (combine(ratios, weights) - 1) * 100;
  });
  return { days, values };
}
