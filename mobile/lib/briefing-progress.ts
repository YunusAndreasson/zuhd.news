import Storage from 'expo-sqlite/kv-store';
import { readMigrated } from './legacy-store';
import { createListeners } from './store-plumbing';

const POSITION_KEY = 'zuhd_briefing_pos';
const DATE_KEY = 'zuhd_briefing_date';
const resets = createListeners();
let work: Promise<unknown> = Promise.resolve();

// Order reads (including migration), writes and erasure. An earlier async
// write must finish before erasure resolves, rather than restoring old progress.
function ordered<T>(operation: () => Promise<T>): Promise<T> {
  const result = work.then(operation);
  work = result.catch(() => {});
  return result;
}

export const subscribeToBriefingReset = resets.subscribe;

export function readSavedPlace(): Promise<[string | null, string | null]> {
  return ordered(() =>
    Promise.all([
      readMigrated(POSITION_KEY, { secureKey: POSITION_KEY }),
      readMigrated(DATE_KEY, { secureKey: DATE_KEY }),
    ]),
  );
}

export function saveSavedPlace(position: number, recording: string): Promise<void> {
  return ordered(async () => {
    await Promise.all([
      Storage.setItem(POSITION_KEY, String(Math.floor(position))),
      Storage.setItem(DATE_KEY, recording),
    ]);
  });
}

export function clearBriefingProgress(): Promise<void> {
  resets.emit();
  return ordered(async () => {
    await Promise.all([Storage.removeItem(POSITION_KEY), Storage.removeItem(DATE_KEY)]);
  });
}
