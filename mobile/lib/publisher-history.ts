import Storage from 'expo-sqlite/kv-store';
import type { OfferHistory } from './publisher-offer';
import { createListeners } from './store-plumbing';
import { readStoredJson } from './stored-json';

export const historyChanges = createListeners();
const KEY = 'zuhd_publisher_offers_v1';
let history =
  readStoredJson(KEY, (value): value is OfferHistory => !!value && typeof value === 'object') ?? {};
export function offerHistory() {
  return history;
}
export function saveOffer(change: Partial<OfferHistory>) {
  history = { ...history, ...change };
  historyChanges.emit();
  try {
    Storage.setItemSync(KEY, JSON.stringify(history));
  } catch {
    /* Keep this visit's choice. */
  }
}
// The intent belongs to this trip. A process restart or a superseding
// publisher action ends it, even if OS delivery is enabled much later.
let settingsTrip: { generation: number; away: boolean } | undefined;
export function beginPublisherSettings(origin?: OfferHistory['origin']) {
  const generation = (history.generation ?? 0) + 1;
  settingsTrip = { generation, away: false };
  saveOffer({ origin, generation, promptChoice: false });
  return generation;
}
export function cancelPublisherSettings(trip: number | undefined) {
  if (settingsTrip?.generation === trip) settingsTrip = undefined;
}
export function publisherSettingsTransition(active: boolean) {
  if (!settingsTrip) return;
  if (!active) {
    settingsTrip.away = true;
    return;
  }
  if (!settingsTrip.away) return;
  const { generation } = settingsTrip;
  settingsTrip = undefined;
  return generation === history.generation ? generation : undefined;
}
let visit = Date.now();
export function publisherVisit() {
  return visit;
}
export function startPublisherVisit() {
  visit = Date.now();
}
export function localDay(now = new Date()) {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}
