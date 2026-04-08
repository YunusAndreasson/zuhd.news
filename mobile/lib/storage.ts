import * as SecureStore from 'expo-secure-store';
import { DEFAULT_PREFS, type Preferences } from '../constants/theme';

const LAST_SEEN_KEY = 'zuhd_lastSeenAt';
const PREFS_KEY = 'zuhd_preferences';

export async function getLastSeenAt(): Promise<number> {
  const v = await SecureStore.getItemAsync(LAST_SEEN_KEY);
  return v ? parseInt(v, 10) : 0;
}

export async function saveLastSeenAt(ts: number): Promise<void> {
  await SecureStore.setItemAsync(LAST_SEEN_KEY, String(ts));
}

export async function getPreferences(): Promise<Preferences> {
  try {
    const v = await SecureStore.getItemAsync(PREFS_KEY);
    if (!v) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(v) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function savePreferences(prefs: Preferences): Promise<void> {
  await SecureStore.setItemAsync(PREFS_KEY, JSON.stringify(prefs));
}
