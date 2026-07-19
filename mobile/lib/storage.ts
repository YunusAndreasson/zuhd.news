import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';
import { DEFAULT_PREFS, type Preferences } from '../constants/theme';
import { isPreferences } from './validate';

// UX state — not secrets. SQLite kv-store is the active backing store;
// document files and SecureStore remain migration sources only.
const LAST_SEEN_FILE = new File(Paths.document, 'zuhd-last-seen');
const PREFS_FILE = new File(Paths.document, 'zuhd-preferences.json');
const LAST_SEEN_KEY = 'zuhd_last_seen';
const PREFS_KEY = 'zuhd_preferences_v2';

// Legacy SecureStore keys — read once for migration, then cleared.
const LEGACY_LAST_SEEN_KEY = 'zuhd_lastSeenAt';
const LEGACY_PREFS_KEY = 'zuhd_preferences';

async function migrateFromSecureStore(key: string, file: File): Promise<string | null> {
  try {
    const v = await SecureStore.getItemAsync(key);
    if (v == null) return null;
    file.write(v);
    await SecureStore.deleteItemAsync(key).catch(() => {});
    return v;
  } catch {
    return null;
  }
}

export async function getLastSeenAt(): Promise<number> {
  try {
    const stored = await Storage.getItem(LAST_SEEN_KEY);
    if (stored !== null) return parseInt(stored, 10) || 0;
    if (LAST_SEEN_FILE.exists) {
      const v = await LAST_SEEN_FILE.text();
      await Storage.setItem(LAST_SEEN_KEY, v);
      return parseInt(v, 10) || 0;
    }
    const migrated = await migrateFromSecureStore(LEGACY_LAST_SEEN_KEY, LAST_SEEN_FILE);
    if (migrated) await Storage.setItem(LAST_SEEN_KEY, migrated);
    return migrated ? parseInt(migrated, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

export async function saveLastSeenAt(ts: number): Promise<void> {
  try {
    await Storage.setItem(LAST_SEEN_KEY, String(ts));
  } catch {}
}

export async function getPreferences(): Promise<Preferences> {
  try {
    let text = await Storage.getItem(PREFS_KEY);
    let shouldMigrate = false;
    if (!text && PREFS_FILE.exists) {
      text = await PREFS_FILE.text();
      shouldMigrate = true;
    }
    if (!text) {
      text = await migrateFromSecureStore(LEGACY_PREFS_KEY, PREFS_FILE);
      shouldMigrate = !!text;
    }
    if (!text) return DEFAULT_PREFS;
    const merged = { ...DEFAULT_PREFS, ...JSON.parse(text) };
    if (!isPreferences(merged)) return DEFAULT_PREFS;
    if (shouldMigrate) await Storage.setItem(PREFS_KEY, JSON.stringify(merged));
    return merged;
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function savePreferences(prefs: Preferences): Promise<void> {
  try {
    await Storage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}
