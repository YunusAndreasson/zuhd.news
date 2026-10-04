import type { SwipeCard } from './cards/rank';
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
  const date = common(group.rows.map((r) => (r.card ? cardObservation(r.card) : undefined)));
  const kicker = common(group.rows.map((r) => (r.card ? rowKicker(r.card) : undefined)));
  const windows = new Map<string, number>();
  for (const row of group.rows) {
    if (row.move?.window) windows.set(row.move.window, (windows.get(row.move.window) ?? 0) + 1);
  }
  const most = [...windows].sort((a, b) => b[1] - a[1])[0];
  const window = most && most[1] >= Math.max(1, group.rows.length / 2) ? most[0] : undefined;
  return { date, kicker, window, group: group.key };
}

/** The number a reader follows into a card keeps the same comparison. */
export function menuCard(row: CatalogRow): SwipeCard | null {
  if (!row.card || !row.move) return row.card;
  let delta = row.move;
  if (
    row.card.id.startsWith('fx-') &&
    delta.direction !== 'flat' &&
    !/^(stronger|weaker)\b/.test(delta.window ?? '')
  ) {
    delta = {
      ...delta,
      window: `${delta.direction === 'up' ? 'stronger' : 'weaker'} ${delta.window ?? ''}`.trim(),
    };
  }
  return { ...row.card, delta };
}
