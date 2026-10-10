import type { SwipeCard } from './cards/rank';
import { namingCurrency } from './cards/week-move';
import { observationDate } from './data-freshness';
import type { CatalogGroup, CatalogRow } from './instrument-catalog';
import { rowKicker } from './now';

/** A monthly observation is a month, not the first day used to store it. */
export function cardObservation(card: SwipeCard): string {
  // A scheduled card's series is background history, not the event's date.
  if (card.kind === 'scheduled') return observationDate(card.asOf);
  const period = card.series?.periods.at(-1);
  return period && /^[A-Z][a-z]{2} \d{4}$/.test(period) ? period : observationDate(card.asOf);
}

const POLICY_COUNTRIES: Readonly<Record<string, string>> = {
  'fed-funds': 'United States',
  'ecb-rate': 'Eurozone',
  'pboc-rate': 'China',
  'boj-rate': 'Japan',
  'boe-rate': 'United Kingdom',
  'bcb-rate': 'Brazil',
  'cbr-rate': 'Russia',
  'bi-rate': 'Indonesia',
  'tcmb-rate': 'Turkey',
};

export function policyCountry(row: CatalogRow): string | undefined {
  return POLICY_COUNTRIES[row.id];
}

/** Short names are safe only inside the list that supplies their subject. */
export function contextualTitle(row: CatalogRow, group?: CatalogGroup['key']): string | undefined {
  if (group === 'rates') return policyCountry(row);
  if (group === 'inflation') {
    return { 'us-cpi': 'United States', 'ez-cpi': 'Eurozone' }[row.id];
  }
  return undefined;
}

function common(values: (string | undefined)[]): string | undefined {
  const first = values[0];
  return first && values.every((v) => v === first) ? first : undefined;
}

/** Shared context is printed once. Exceptional dates/windows remain on rows. */
export function listContext(group: CatalogGroup) {
  const dates = group.rows.map((r) => (r.card ? cardObservation(r.card) : undefined));
  const counts = new Map<string, number>();
  for (const value of dates) {
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const majority = [...counts].find(([, count]) => count > dates.length / 2)?.[0];
  // Unknown dates and scheduled events cannot inherit an observation date.
  const date =
    dates.every(Boolean) && !group.rows.some((r) => r.card?.kind === 'scheduled')
      ? majority
      : undefined;
  const dateLabel = date && dates.some((value) => value !== date) ? `${date} unless noted` : date;
  const kicker = common(group.rows.map((r) => (r.card ? rowKicker(r.card) : undefined)));
  const windows = new Map<string, number>();
  for (const row of group.rows) {
    if (row.move?.window) windows.set(row.move.window, (windows.get(row.move.window) ?? 0) + 1);
  }
  const most = [...windows].sort((a, b) => b[1] - a[1])[0];
  const window = most && most[1] >= Math.max(1, group.rows.length / 2) ? most[0] : undefined;
  return { date, dateLabel, kicker, window, group: group.key };
}

/**
 * The number a reader follows into a card is on it. A row's week is one of
 * the card's three windows (`cardWindows`, from the same `gaugeMove`), so the
 * card opens as it is; a row with no week prints one move, and the card
 * prints that one.
 */
export function menuCard(row: CatalogRow): SwipeCard | null {
  if (!row.card || !row.move || row.weekly) return row.card;
  return { ...row.card, delta: namingCurrency(row.card, row.move) };
}
