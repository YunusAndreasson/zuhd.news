import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { deleteItemAsync, getItemAsync, setItemAsync } from 'expo-secure-store';
import { IS_ANDROID } from '../constants/platform';
import { API_BASE } from '../constants/theme';
import { fetchWithTimeout } from './fetch';

const CHANNEL_ID = 'briefing';

// ---------------------------------------------------------------------------
// Android channels (idempotent, no-op on iOS)
// ---------------------------------------------------------------------------

// Channels must exist before any push arrives so the OS can route it with the
// right importance/sound. Call at app startup (independent of permission flow):
// if a user later grants permission in OS settings, the channels are already
// configured.
export async function setupNotificationChannels(): Promise<void> {
  if (!IS_ANDROID) return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Daily Briefing',
    importance: Notifications.AndroidImportance.DEFAULT,
    // Once a day, on the 05:00 UTC cycle: morning in the Gulf and South
    // Asia, night in the Americas, so the channel does not name the hour.
    description: 'The daily audio briefing',
  });
  await Notifications.setNotificationChannelAsync('breaking', {
    name: 'Breaking News',
    importance: Notifications.AndroidImportance.HIGH,
    description: 'Breaking news alerts',
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Request permission and setup channels. Returns true if granted. */
export async function enableNotifications(): Promise<boolean> {
  try {
    const { granted } = await Notifications.requestPermissionsAsync();
    if (!granted) return false;
    await setupNotificationChannels();
    return true;
  } catch {
    return false;
  }
}

/** Cancel any lingering local notifications from the old scheduling system. */
export async function disableNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
}

// Pre-2026-04-15 builds scheduled a recurring DAILY local notification with a
// hardcoded "Your morning news briefing is ready." body. Devices that enabled
// notifications under that build still have the trigger registered with the OS
// and fire it every morning regardless of whether the server pushed anything.
// Call once on app startup to wipe leftovers; safe because the new system
// never schedules local notifications.
export async function clearLegacyScheduledNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
}

// ---------------------------------------------------------------------------
// Push token registration
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'zuhd_pushToken';
let tokenWork: Promise<void> = Promise.resolve();
let registrationVersion = 0;

/** How long a registration may wait for its Expo token. It is a plain fetch
 *  with no timeout, and an opt-out queues behind it. */
export const TOKEN_FETCH_TIMEOUT_MS = 15_000;

function within<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// A DELETE waits for any POST already sent. Cancelling the listener alone
// cannot stop that POST from registering the device after opt-out.
function queueTokenWork(work: () => Promise<void>): Promise<void> {
  const next = tokenWork.then(work);
  tokenWork = next.catch(() => {});
  return next;
}

/** Register Expo push token with the backend. Idempotent. */
export function registerPushToken(devicePushToken?: Notifications.DevicePushToken): Promise<void> {
  const version = registrationVersion;
  return queueTokenWork(async () => {
    try {
      if (version !== registrationVersion) return;
      const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
      if (!projectId) return;
      // Bounded, so a stalled network cannot hold an opt-out's DELETE behind
      // it. Nothing has been sent yet, so giving up here registers nothing.
      const { data: token } = await within(
        Notifications.getExpoPushTokenAsync({ projectId, devicePushToken }),
        TOKEN_FETCH_TIMEOUT_MS,
      );
      if (version !== registrationVersion) return;
      // Keep a deletion target even if the POST reaches the server but its
      // response is lost. The next opt-out/reconnect can still remove it.
      await setItemAsync(TOKEN_KEY, token);
      const response = await fetchWithTimeout(`${API_BASE}/api/tokens`, 10_000, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) throw new Error(`Push token registration failed: HTTP ${response.status}`);
    } catch (e) {
      console.warn('Push token registration failed:', e);
    }
  });
}

/** Keep the backend registration current when APNs/FCM rotates a native token
 * while the app is alive. */
export function addPushTokenListener(): Notifications.EventSubscription {
  let active = true;
  const subscription = Notifications.addPushTokenListener((devicePushToken) => {
    if (active) void registerPushToken(devicePushToken);
  });
  return {
    remove: () => {
      active = false;
      subscription.remove();
    },
  };
}

/** Unregister push token from the backend. */
export function unregisterPushToken(): Promise<void> {
  registrationVersion++;
  return queueTokenWork(async () => {
    try {
      const token = await getItemAsync(TOKEN_KEY);
      if (!token) return;
      const response = await fetchWithTimeout(`${API_BASE}/api/tokens`, 10_000, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) return;
      await deleteItemAsync(TOKEN_KEY);
    } catch {}
  });
}
