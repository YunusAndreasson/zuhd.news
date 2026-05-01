import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { deleteItemAsync, getItemAsync, setItemAsync } from 'expo-secure-store';
import { IS_ANDROID } from '../constants/platform';
import { API_BASE } from '../constants/theme';

const CHANNEL_ID = 'briefing';

// ---------------------------------------------------------------------------
// Android channel (idempotent, no-op on iOS)
// ---------------------------------------------------------------------------

async function setupChannel() {
  if (!IS_ANDROID) return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Daily Briefing',
    importance: Notifications.AndroidImportance.DEFAULT,
    description: 'Morning briefing reminder',
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
    await setupChannel();
    return true;
  } catch {
    return false;
  }
}

/** Cancel any lingering local notifications from the old scheduling system. */
export async function disableNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
}

// ---------------------------------------------------------------------------
// Push token registration
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'zuhd_pushToken';

/** Register Expo push token with the backend. Idempotent. */
export async function registerPushToken(): Promise<void> {
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await fetch(`${API_BASE}/api/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    await setItemAsync(TOKEN_KEY, token);
  } catch (e) {
    console.warn('Push token registration failed:', e);
  }
}

/** Unregister push token from the backend. */
export async function unregisterPushToken(): Promise<void> {
  try {
    const token = await getItemAsync(TOKEN_KEY);
    if (!token) return;
    await fetch(`${API_BASE}/api/tokens`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    await deleteItemAsync(TOKEN_KEY);
  } catch {}
}
