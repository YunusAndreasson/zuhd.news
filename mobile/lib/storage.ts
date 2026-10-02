import { File, Paths } from 'expo-file-system';
import Storage from 'expo-sqlite/kv-store';
import { DEFAULT_PREFS, type Preferences } from '../constants/theme';
import { type LegacyCopy, readMigrated } from './legacy-store';
import { isPreferences } from './validate';

// UX state — not secrets. SQLite kv-store is the active backing store; the
// document files and SecureStore keys below are migration sources only, moved
// once and deleted as they move (`legacy-store.ts`).
const LAST_SEEN_KEY = 'zuhd_last_seen';
const PREFS_KEY = 'zuhd_preferences_v2';

const LEGACY_LAST_SEEN: LegacyCopy = {
  file: new File(Paths.document, 'zuhd-last-seen'),
  secureKey: 'zuhd_lastSeenAt',
};
const LEGACY_PREFS: LegacyCopy = {
  file: new File(Paths.document, 'zuhd-preferences.json'),
  secureKey: 'zuhd_preferences',
};

export async function getLastSeenAt(): Promise<number> {
  try {
    const stored = await readMigrated(LAST_SEEN_KEY, LEGACY_LAST_SEEN);
    return stored === null ? 0 : parseInt(stored, 10) || 0;
  } catch {
    return 0;
  }
}

export async function saveLastSeenAt(ts: number): Promise<void> {
  try {
    await Storage.setItem(LAST_SEEN_KEY, String(ts));
  } catch {}
}

/** Stored preferences over the defaults, or null when they do not parse into
 *  valid preferences. */
function parsePreferences(text: string): Preferences | null {
  try {
    const merged = { ...DEFAULT_PREFS, ...JSON.parse(text) };
    return isPreferences(merged) ? merged : null;
  } catch {
    return null;
  }
}

export async function getPreferences(): Promise<Preferences> {
  try {
    // Malformed legacy preferences are never promoted into the active store.
    const text = await readMigrated(PREFS_KEY, LEGACY_PREFS, (t) => parsePreferences(t) !== null);
    return (text !== null && parsePreferences(text)) || DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function savePreferences(prefs: Preferences): Promise<void> {
  try {
    await Storage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}
