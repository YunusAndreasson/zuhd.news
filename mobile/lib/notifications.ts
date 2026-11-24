import { applicationId } from 'expo-application';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { deleteItemAsync, getItemAsync, setItemAsync } from 'expo-secure-store';
import { Linking, Platform, type TurboModule, TurboModuleRegistry } from 'react-native';
import type { PermissionOutcome, RegistrationReason } from '../constants/analytics';
import { IS_ANDROID } from '../constants/platform';
import { API_BASE } from '../constants/theme';
import { fetchWithTimeout } from './fetch';
import { markOsPromptSpent, osPromptSpent } from './notification-prompt';
import {
  noDelivery,
  type PublisherDelivery,
  REFRESH_AFTER,
  setRegistration,
} from './publisher-state';

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
  outcome: PermissionOutcome;
}

/** Android can open the app’s alert controls directly. Some devices only offer app settings. */
export async function openNotificationSettings(): Promise<void> {
  if (IS_ANDROID && Number(Platform.Version) >= 26 && applicationId) {
    try {
      await Linking.sendIntent('android.settings.APP_NOTIFICATION_SETTINGS', [
        { key: 'android.provider.extra.APP_PACKAGE', value: applicationId },
      ]);
      return;
    } catch {
      // The settings activity varies by Android vendor.
    }
  }
  await Linking.openSettings();
}

/** Request permission and setup channels. */
export async function enableNotifications(allowPrompt = true): Promise<NotificationAnswer> {
  let osPrompt = false;
  try {
    await setupNotificationChannels();
    const before = await Notifications.getPermissionsAsync();
    osPrompt =
      allowPrompt &&
      !before.granted &&
      before.canAskAgain &&
      (!IS_ANDROID || Number(Platform.Version) >= 33);
    if (osPrompt) await markOsPromptSpent();
    const result = osPrompt ? await Notifications.requestPermissionsAsync() : before;
    const outcome = result.granted
      ? 'granted'
      : osPrompt && result.status === 'undetermined' && IS_ANDROID
        ? 'dismissed'
        : result.status === 'denied' &&
            (!IS_ANDROID || !result.canAskAgain || (await androidRationale()))
          ? 'denied'
          : 'unknown';
    return { granted: result.granted, osPrompt, outcome };
  } catch {
    return { granted: false, osPrompt, outcome: 'unknown' };
  }
}

function androidRationale(): Promise<boolean> {
  const permissions = TurboModuleRegistry.getEnforcing<AndroidPermissions>('PermissionsAndroid');
  return permissions.shouldShowRequestPermissionRationale('android.permission.POST_NOTIFICATIONS');
}

/** Delivery is stricter than a granted permission (provisional iOS and muted Android channels). */
export async function publisherDelivery(): Promise<PublisherDelivery> {
  try {
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) return noDelivery;
    if (IS_ANDROID) {
      const enabled = async (id: string) => {
        const channel = await Notifications.getNotificationChannelAsync(id);
        return !!channel && channel.importance > Notifications.AndroidImportance.NONE;
      };
      const [briefing, breaking] = await Promise.all([enabled(CHANNEL_ID), enabled('breaking')]);
      return { briefing, breaking };
    }
    const ios = permission.ios;
    const available =
      ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED &&
      !!(ios.allowsAlert || ios.allowsDisplayOnLockScreen || ios.allowsDisplayInNotificationCenter);
    return { briefing: available, breaking: available };
  } catch {
    return noDelivery;
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
    return !(await androidRationale());
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

const RECEIPT_KEY = 'zuhd_pushReceipt';
const RETIRED_KEY = 'zuhd_retiredPushTokens';
let resolution = 0;

async function retiredTokens(): Promise<string[]> {
  const raw = await getItemAsync(RETIRED_KEY);
  if (!raw) return [];
  const tokens: unknown = JSON.parse(raw);
  return Array.isArray(tokens) ? tokens.filter((t): t is string => typeof t === 'string') : [];
}

async function removeToken(token: string): Promise<boolean> {
  const response = await fetchWithTimeout(`${API_BASE}/api/tokens`, 10_000, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  return response.ok;
}

async function drainRetired(active?: string): Promise<void> {
  const retired = await retiredTokens();
  for (const token of [...retired]) {
    if (token !== active && !(await removeToken(token))) continue;
    retired.splice(retired.indexOf(token), 1);
    await setItemAsync(RETIRED_KEY, JSON.stringify(retired));
  }
}

export function registerPushToken(
  devicePushToken?: Notifications.DevicePushToken,
  reason: RegistrationReason = devicePushToken ? 'rotation' : 'refresh',
  generation = 0,
): Promise<void> {
  const version = registrationVersion;
  const attempt = ++resolution;
  const current = () => version === registrationVersion && attempt === resolution;
  // Every reconciliation must first establish the identity of the current token.
  setRegistration('pending', reason);
  return queueTokenWork(async () => {
    if (!current()) return;
    try {
      const projectId: unknown =
        Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
      if (typeof projectId !== 'string' || !projectId) {
        setRegistration('failed', reason);
        return;
      }
      const { data: token } = await within(
        Notifications.getExpoPushTokenAsync({ projectId, devicePushToken }),
        TOKEN_FETCH_TIMEOUT_MS,
      );
      if (!current()) return;
      const previous = await getItemAsync(TOKEN_KEY);
      if (previous && previous !== token) {
        const retired = await retiredTokens();
        await setItemAsync(RETIRED_KEY, JSON.stringify([...new Set([...retired, previous])]));
      }
      const receipt = await getItemAsync(RECEIPT_KEY);
      let acceptedAt = 0;
      if (receipt && previous === token) {
        try {
          const saved = JSON.parse(receipt);
          if (
            saved?.status === 'accepted' &&
            saved.token === token &&
            saved.generation === generation &&
            Number.isFinite(saved.at)
          )
            acceptedAt = saved.at;
        } catch {
          /* Invalid receipts always require a new POST. */
        }
      }
      if (!current()) return;
      if (acceptedAt <= Date.now() - REFRESH_AFTER || acceptedAt > Date.now()) {
        await setItemAsync(RECEIPT_KEY, JSON.stringify({ status: 'pending', generation, token }));
        await setItemAsync(TOKEN_KEY, token); // Deletion target, even when the response is lost.
        if (!current()) return;
        const response = await fetchWithTimeout(`${API_BASE}/api/tokens`, 10_000, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (!current()) return;
        if (response.status !== 201) {
          await setItemAsync(RECEIPT_KEY, JSON.stringify({ status: 'failed', generation, token }));
          if (current()) setRegistration('failed', reason);
          return;
        }
        acceptedAt = Date.now();
        await setItemAsync(
          RECEIPT_KEY,
          JSON.stringify({ status: 'accepted', generation, token, at: acceptedAt }),
        );
      }
      if (current()) setRegistration('accepted', reason, acceptedAt);
      await drainRetired(token).catch(() => {});
    } catch {
      if (current()) setRegistration('pending', reason);
    }
  });
}

/** Keep the backend registration current when APNs/FCM rotates a native token
 * while the app is alive. */
export function addPushTokenListener(generation = 0): Notifications.EventSubscription {
  let active = true;
  const version = registrationVersion;
  const subscription = Notifications.addPushTokenListener((devicePushToken) => {
    if (active && registrationVersion === version)
      void registerPushToken(devicePushToken, 'rotation', generation);
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
  setRegistration('removed', 'disable');
  return queueTokenWork(async () => {
    try {
      // Invalidate acknowledgement even if DELETE is offline.
      await setItemAsync(RECEIPT_KEY, '');
      const token = await getItemAsync(TOKEN_KEY);
      if (token && (await removeToken(token))) await deleteItemAsync(TOKEN_KEY);
      await drainRetired();
    } catch {
      // TOKEN_KEY and retired tokens remain deletion targets on restart/reconnect.
    }
  });
}
