import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { deleteItemAsync, getItemAsync, setItemAsync } from 'expo-secure-store';
import { Platform, type TurboModule, TurboModuleRegistry } from 'react-native';
import { IS_ANDROID } from '../constants/platform';
import { API_BASE } from '../constants/theme';
import { fetchWithTimeout } from './fetch';
import { markOsPromptSpent, osPromptSpent } from './notification-prompt';

interface AndroidPermissions extends TurboModule {
  shouldShowRequestPermissionRationale(permission: string): Promise<boolean>;
}

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

/** What asking for notification permission came to: whether it was granted,
 *  and whether the system's dialog could appear at all, read before the ask.
 *  Once refused for good, the system answers without showing it. */
export interface NotificationAnswer {
  granted: boolean;
  osPrompt: boolean;
}

/** Request permission and setup channels. */
export async function enableNotifications(): Promise<NotificationAnswer> {
  let osPrompt = false;
  try {
    await setupNotificationChannels();
    const before = await Notifications.getPermissionsAsync();
    osPrompt = !before.granted && before.canAskAgain;
    if (osPrompt && IS_ANDROID && Number(Platform.Version) >= 33) await markOsPromptSpent();
    const { granted } = await Notifications.requestPermissionsAsync();
    if (!granted) return { granted: false, osPrompt };
    return { granted: true, osPrompt };
  } catch {
    return { granted: false, osPrompt };
  }
}

/** Whether the OS lets the app notify, without asking. */
export async function notificationsGranted(): Promise<boolean> {
  try {
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Whether the OS has never been asked on this install: its dialog is still to come. */
export async function notificationPermissionUndetermined(): Promise<boolean> {
  try {
    const { status, granted, canAskAgain } = await Notifications.getPermissionsAsync();
    const undetermined = status === Notifications.PermissionStatus.UNDETERMINED;
    if (!IS_ANDROID) return undetermined;
    if (Number(Platform.Version) < 33 || granted || !canAskAgain || (await osPromptSpent())) {
      return false;
    }
    if (undetermined) return true;
    if (status !== Notifications.PermissionStatus.DENIED) return false;

    // Expo also reports denied before the first ask. On installs that predate
    // the Settings marker, Android remembers a refusal that still permits a
    // second ask: it tells the app to show a rationale for that second dialog.
    const permissions = TurboModuleRegistry.getEnforcing<AndroidPermissions>('PermissionsAndroid');
    return !(await permissions.shouldShowRequestPermissionRationale(
      'android.permission.POST_NOTIFICATIONS',
    ));
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
      const projectId: unknown =
        Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
      if (typeof projectId !== 'string' || !projectId) return;
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
