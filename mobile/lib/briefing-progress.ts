import Storage from 'expo-sqlite/kv-store';
import { readMigrated } from './legacy-store';
import { createListeners, orderStorageWork } from './store-plumbing';

const POSITION_KEY = 'zuhd_briefing_pos';
const DATE_KEY = 'zuhd_briefing_date';
const resets = createListeners();

export const subscribeToBriefingReset = resets.subscribe;

export function readSavedPlace(): Promise<[string | null, string | null]> {
  return orderStorageWork(async () => [
    await readMigrated(POSITION_KEY, { secureKey: POSITION_KEY }),
    await readMigrated(DATE_KEY, { secureKey: DATE_KEY }),
  ]);
}

export function saveSavedPlace(position: number, recording: string): Promise<void> {
  return orderStorageWork(() =>
    Storage.multiSet([
      [POSITION_KEY, String(Math.floor(position))],
      [DATE_KEY, recording],
    ]),
  );
}

export function clearBriefingProgress(): Promise<void> {
  resets.emit();
  return orderStorageWork(() => Storage.multiRemove([POSITION_KEY, DATE_KEY]));
}
