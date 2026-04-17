import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { DEFAULT_PREFS, type Preferences } from '../constants/theme';
import { isPreferences } from './validate';

// UX state — not secrets. Lives in the document directory; SecureStore is
// reserved for auth tokens.
const LAST_SEEN_FILE = new File(Paths.document, 'zuhd-last-seen');
const PREFS_FILE = new File(Paths.document, 'zuhd-preferences.json');

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
    if (LAST_SEEN_FILE.exists) {
      const v = await LAST_SEEN_FILE.text();
      return parseInt(v, 10) || 0;
    }
    const migrated = await migrateFromSecureStore(LEGACY_LAST_SEEN_KEY, LAST_SEEN_FILE);
    return migrated ? parseInt(migrated, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

export async function saveLastSeenAt(ts: number): Promise<void> {
  try {
    LAST_SEEN_FILE.write(String(ts));
  } catch {}
}

export async function getPreferences(): Promise<Preferences> {
  try {
    const text = PREFS_FILE.exists
      ? await PREFS_FILE.text()
      : await migrateFromSecureStore(LEGACY_PREFS_KEY, PREFS_FILE);
    if (!text) return DEFAULT_PREFS;
    const merged = { ...DEFAULT_PREFS, ...JSON.parse(text) };
    return isPreferences(merged) ? merged : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function savePreferences(prefs: Preferences): Promise<void> {
  try {
    PREFS_FILE.write(JSON.stringify(prefs));
  } catch {}
}
