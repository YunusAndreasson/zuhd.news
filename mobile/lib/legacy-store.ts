import type { File } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';
import { deleteLegacyFile } from './store-plumbing';

/**
 * Where builds before the SQLite kv store kept a value: a document file, the
 * encrypted store, or both.
 *
 * Each value is moved into the kv store the first time it is asked for, and
 * the copy it came from is deleted as it moves. Until 2026-10-02 the copies
 * stayed: the privacy page's erase emptied the kv store, the next launch found
 * it empty, and the migration moved the erased review counters, briefing place
 * and last-seen time straight back. Four places carried that migration, two of
 * them the same block twice.
 */
export interface LegacyCopy {
  file?: File;
  secureKey?: string;
}

/**
 * The kv store's value for `key`, or the legacy copy's, moved into it. A
 * legacy value `accept` refuses is left where it is and not promoted.
 */
export async function readMigrated(
  key: string,
  legacy: LegacyCopy,
  accept: (value: string) => boolean = () => true,
): Promise<string | null> {
  const stored = await Storage.getItem(key);
  if (stored !== null) return stored;
  let value: string | null = null;
  try {
    if (legacy.file?.exists) value = await legacy.file.text();
    if (value === null && legacy.secureKey) {
      value = await SecureStore.getItemAsync(legacy.secureKey);
    }
  } catch {
    return null;
  }
  if (value === null || !accept(value)) return null;
  try {
    await Storage.setItem(key, value);
  } catch {
    // Not moved, so not deleted: the next launch tries again.
    return value;
  }
  await deleteLegacy(legacy);
  return value;
}

/** Delete a legacy copy, quietly — a copy that is already gone is the goal. */
export async function deleteLegacy({ file, secureKey }: LegacyCopy): Promise<void> {
  if (file) deleteLegacyFile(file);
  if (secureKey) {
    try {
      await SecureStore.deleteItemAsync(secureKey);
    } catch {}
  }
}
