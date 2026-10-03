import { topojsonNameFromCode } from '@shared/countries/iso';
import { formatCount, formatNumber } from './cards/format';
import type { FamineArea, FamineCountryTotal } from './overlays';
import { displayCountryName } from './place-names';

/**
 * Hunger as people, not as places.
 *
 * The famine layer is areas at Emergency or worse: ninety-four of them in four
 * countries on the day this was written, each a name like `Um Baru IDPs`. What
 * the same analysis counts — 19 million people in Crisis or worse across
 * Sudan, 134,808 of them in Catastrophe, 1.2 million in Gaza where no area
 * clears the bar — reached no screen: the country sums were never built, and
 * an area's own Emergency and Catastrophe figures were downloaded and narrowed
 * away by the type.
 *
 * Every line here says whose count it is and of when. An IPC analysis is
 * months old by design (Sudan's was January in October), and a total of the
 * people *analysed* is not a share of the country.
 */

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function isFamineCountryTotal(v: unknown): v is FamineCountryTotal {
  if (typeof v !== 'object' || v === null) return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t.iso3 === 'string' &&
    (t.iso2 === undefined || typeof t.iso2 === 'string') &&
    typeof t.vintage === 'string' &&
    isCount(t.phase) &&
    isCount(t.areas) &&
    isCount(t.analysed) &&
    isCount(t.p3plus) &&
    isCount(t.p4) &&
    isCount(t.p5) &&
    t.p3plus > 0 &&
    t.analysed >= t.p3plus
  );
}

const NO_TOTALS: FamineCountryTotal[] = [];

/**
 * The payload's country totals, largest caseload first. A row that does not
 * hold together is dropped on its own: the totals are an addition to a layer
 * that worked without them, and must never cost it its marks.
 */
export function famineTotalsOf(totals: unknown): FamineCountryTotal[] {
  if (!Array.isArray(totals)) return NO_TOTALS;
  const rows = totals.filter(isFamineCountryTotal);
  if (rows.length === 0) return NO_TOTALS;
  return rows.sort((a, b) => b.p3plus - a.p3plus);
}

/**
 * A count of people in words: exact under a million (`134,808`), and to one
 * decimal of a million above it (`19.5 million`). The IPC publishes whole
 * people; past a million the last six digits are the analysis's arithmetic,
 * not anyone's knowledge.
 */
export function formatPeople(n: number): string {
  if (n < 1_000_000) return formatCount(n);
  const millions = n / 1_000_000;
  return `${formatNumber(millions, millions < 100 ? 1 : 0)} million`;
}

/** The country a total is of, as the app keys countries; undefined for a code
 *  the app has no country for. */
function famineTotalCountry(total: Pick<FamineCountryTotal, 'iso2'>): string | undefined {
  return total.iso2 ? topojsonNameFromCode(total.iso2) : undefined;
}

/** A country's total, by the name the country sheet opens under. */
export function famineTotalFor(
  name: string | null | undefined,
  totals: readonly FamineCountryTotal[],
): FamineCountryTotal | undefined {
  if (!name) return undefined;
  return totals.find((t) => famineTotalCountry(t) === name);
}

/** The graver phases of a caseload, gravest first: `134,808 in catastrophe`,
 *  `5 million in emergency`. Empty where the analysis counts nobody there. */
function graverPhases(p4: number | null | undefined, p5: number | null | undefined): string[] {
  const parts: string[] = [];
  if (isCount(p5) && p5 > 0) parts.push(`${formatPeople(p5)} in catastrophe`);
  if (isCount(p4) && p4 > 0) parts.push(`${formatPeople(p4)} in emergency`);
  return parts;
}

/**
 * An area's people, as its page prints them: how many are in Crisis or worse
 * and of how many analysed, then how many of those are in the two graver
 * phases. Empty when the analysis published no caseload.
 */
export function areaCaseload(pop: FamineArea['pop']): string[] {
  if (!pop || !isCount(pop.p3plus) || pop.p3plus <= 0) return [];
  const lines = [
    `${formatCount(pop.p3plus)} people in crisis or worse${
      isCount(pop.total) && pop.total > 0 ? `, of ${formatCount(pop.total)} analysed` : ''
    }.`,
  ];
  const graver = graverPhases(pop.p4, pop.p5);
  if (graver.length > 0) lines.push(`Of them, ${graver.join(' and ')}.`);
  return lines;
}

export interface HungerLine {
  /** `19.5 million people in crisis or worse` */
  title: string;
  /** `41% of the 47.5 million analysed · 134,808 in catastrophe · IPC, Jan 2026` */
  detail: string;
}

/** A country's caseload in two lines, for its page and its row in the menu. */
export function hungerLine(total: FamineCountryTotal): HungerLine {
  const share = Math.round((total.p3plus / total.analysed) * 100);
  return {
    title: `${formatPeople(total.p3plus)} people in crisis or worse`,
    detail: [
      `${share}% of the ${formatPeople(total.analysed)} analysed`,
      // Catastrophe alone: it is the phase a reader means by famine, and the
      // line has room for one more figure.
      ...graverPhases(null, total.p5),
      `IPC, ${total.vintage}`,
    ].join(' · '),
  };
}

export interface HungerRow {
  key: string;
  /** The country as the app keys it, for the page the row opens. */
  country: string;
  /** The country as it is printed. */
  name: string;
  /** `19.5 million in crisis or worse · 134,808 in catastrophe · Jan 2026` */
  detail: string;
  phase: number;
}

/**
 * The countries of the famine list, largest caseload first. A total whose code
 * the app has no country for is left out: its row could open nothing.
 */
export function hungerRows(totals: readonly FamineCountryTotal[]): HungerRow[] {
  const rows: HungerRow[] = [];
  for (const total of totals) {
    const country = famineTotalCountry(total);
    if (!country) continue;
    rows.push({
      key: `hunger-${total.iso3}`,
      country,
      name: displayCountryName(country) ?? country,
      detail: [
        `${formatPeople(total.p3plus)} in crisis or worse`,
        ...graverPhases(null, total.p5),
        total.vintage,
      ].join(' · '),
      phase: total.phase,
    });
  }
  return rows;
}
