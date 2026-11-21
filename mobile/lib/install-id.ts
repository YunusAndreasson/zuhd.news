import type KvStore from 'expo-sqlite/kv-store';

/**
 * `install_id`: a random UUID made once per install, on the first launch of a
 * build with this code, and kept on the device. It joins an install's events in
 * Mixpanel, and marketer drops every event without it.
 *
 * THE NAME IS A CONTRACT: marketer reads `install_id`, `First Open`,
 * `Install Attribution`, `Activated` and `referrer_0`, `referrer_1`, … from
 * Mixpanel, and a rename breaks it without an error on either side.
 *
 * Only `lib/analytics.ts` reads it, as a super property. It must never reach
 * Meta (it would hand Meta the join to everything Mixpanel holds), Sentry or
 * zuhd's own server. It names no one: it is random, and nothing ties it to a
 * name or account, because there is none.
 *
 * An erase of local data replaces it (`rotateInstallId`, from `wipe.ts`): the
 * privacy page promises that an erase gives usage events a new random ID, and
 * a kept `install_id` would join the old ID to the new.
 *
 * The kv store is loaded on first use, like the SDK in `analytics.ts`: every
 * test that reaches analytics would otherwise need it mocked.
 */

const KEY = 'zuhd_install_id_v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** `undefined` until read this launch. */
let installId: string | null | undefined;

function storage(): typeof KvStore {
  return (require('expo-sqlite/kv-store') as { default: typeof KvStore }).default;
}

/** Expo's native v4 generator; a `Math.random` one where it is missing. A
 *  join key needs uniqueness, not secrecy. */
function uuidv4(): string {
  try {
    const { uuid } = require('expo') as typeof import('expo');
    const id = uuid.v4();
    if (UUID.test(id)) return id.toLowerCase();
  } catch {
    // Not linked (Jest), or no native generator.
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function save(id: string): void {
  try {
    storage().setItemSync(KEY, id);
  } catch {
    // Kept for this launch. The next makes another, which only splits this
    // install's events in two.
  }
}

/**
 * This install's `install_id`, made and kept the first time it is asked for.
 * Null when the store cannot be read: a new one then could replace the one
 * that joins everything, so this launch goes without.
 */
export function getInstallId(): string | null {
  if (installId !== undefined) return installId;
  let stored: string | null;
  try {
    stored = storage().getItemSync(KEY);
  } catch {
    return null;
  }
  if (stored && UUID.test(stored)) {
    installId = stored;
  } else {
    installId = uuidv4();
    save(installId);
  }
  return installId;
}

/** A new `install_id`, for an erase of local data. Returns it. */
export function rotateInstallId(): string {
  installId = uuidv4();
  save(installId);
  return installId;
}
