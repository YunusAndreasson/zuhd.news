import Storage from 'expo-sqlite/kv-store';
import type { SwipeCard } from './cards/rank';

const KEY = 'zuhd_card_history_v1';
type History = Record<string, string>;
let history: History = {};
const listeners = new Set<() => void>();
try {
  const value: unknown = JSON.parse(Storage.getItemSync(KEY) ?? '{}');
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    history = Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === 'string'));
  }
} catch {}

/** Content, not fetch/observation timestamps or editorial ranking. Store the
 * exact signature: no hash collisions can silently hide an update. */
export function cardVersion(card: SwipeCard): string {
  if (card.editorialRevision) return JSON.stringify([card.id, card.editorialRevision]);
  return JSON.stringify([
    card.kind,
    card.title,
    card.kind === 'scheduled' ? card.date : card.reading,
    card.readingNote,
    card.delta,
    card.changed,
    card.why,
    card.series,
    card.kind === 'reading' ? card.figures : undefined,
  ]);
}

export type CardStatus = 'new' | 'updated' | 'viewed';
export function cardStatus(section: string, card: SwipeCard, seen = history): CardStatus {
  const previous = seen[`${section}:${card.id}`];
  return previous === undefined ? 'new' : previous === cardVersion(card) ? 'viewed' : 'updated';
}

export function getCardHistory(): History {
  return history;
}
export function subscribeCardHistory(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function save() {
  try {
    Storage.setItemSync(KEY, JSON.stringify(history));
  } catch {}
  for (const listener of listeners) listener();
}
export function markCardViewed(section: string, card: SwipeCard): void {
  if (cardStatus(section, card) === 'viewed') return;
  history = { ...history, [`${section}:${card.id}`]: cardVersion(card) };
  save();
}
export function clearCardHistory(): void {
  history = {};
  save();
}

export type DeckPage =
  | { id: string; kind: 'card'; card: SwipeCard; status: CardStatus }
  | { id: string; kind: 'boundary'; previouslyViewed: number };

/** Stable partition preserves editorial importance inside each group. */
export function buildDeckVisit(section: string, cards: SwipeCard[]): DeckPage[] {
  if (!cards.length) return [];
  const pages = cards.map((card): DeckPage & { kind: 'card' } => ({
    id: card.id,
    kind: 'card',
    card,
    status: cardStatus(section, card),
  }));
  const unseen = pages.filter((page) => page.status !== 'viewed');
  const seen = pages.filter((page) => page.status === 'viewed');
  return [
    ...unseen,
    { id: '__caught-up__', kind: 'boundary', previouslyViewed: seen.length },
    ...seen,
  ];
}
