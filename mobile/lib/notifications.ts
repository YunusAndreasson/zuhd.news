import * as Notifications from 'expo-notifications';
import { getItemAsync, setItemAsync, deleteItemAsync } from 'expo-secure-store';
import { Platform } from 'react-native';
import { API_BASE } from '../constants/theme';

const IDENTIFIER = 'zuhd-daily-briefing';
const CHANNEL_ID = 'briefing';

// Briefing generates at 05:00 UTC. Notify 1.5h later (06:30 UTC) for margin.
const NOTIFY_UTC_HOUR = 6;
const NOTIFY_UTC_MINUTE = 30;

/** Convert a fixed UTC time to the device's current local hour/minute. */
function utcToLocalTime(): { hour: number; minute: number } {
  const offsetMinutes = new Date().getTimezoneOffset(); // negative = east of UTC
  const totalMinutes = NOTIFY_UTC_HOUR * 60 + NOTIFY_UTC_MINUTE - offsetMinutes;
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440; // wrap to 0-1439
  return { hour: Math.floor(wrapped / 60), minute: wrapped % 60 };
}

// ---------------------------------------------------------------------------
// Android channel (idempotent, no-op on iOS)
// ---------------------------------------------------------------------------

async function setupChannel() {
  if (Platform.OS !== 'android') return;
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
// Schedule / cancel
// ---------------------------------------------------------------------------

async function scheduleDailyBriefing() {
  await Notifications.cancelScheduledNotificationAsync(IDENTIFIER).catch(() => {});
  const { hour, minute } = utcToLocalTime();
  await Notifications.scheduleNotificationAsync({
    identifier: IDENTIFIER,
    content: {
      title: 'Daily Briefing',
      body: 'Your morning news briefing is ready.',
      data: { screen: 'briefing' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: CHANNEL_ID,
    },
  });
}

async function cancelDailyBriefing() {
  await Notifications.cancelScheduledNotificationAsync(IDENTIFIER).catch(() => {});
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Request permission, setup channel, schedule. Returns true if successful. */
export async function enableNotifications(): Promise<boolean> {
  try {
    const { granted } = await Notifications.requestPermissionsAsync();
    if (!granted) return false;
    await setupChannel();
    await scheduleDailyBriefing();
    return true;
  } catch {
    return false;
  }
}

/** Cancel scheduled notification. */
export async function disableNotifications(): Promise<void> {
  await cancelDailyBriefing();
}

/** Startup guard: re-schedule if enabled but missing (reinstall, OS cleared). */
export async function ensureScheduled(): Promise<void> {
  try {
    const { granted } = await Notifications.getPermissionsAsync();
    if (!granted) return;
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    if (scheduled.some((n) => n.identifier === IDENTIFIER)) return;
    await setupChannel();
    await scheduleDailyBriefing();
  } catch {}
}

// ---------------------------------------------------------------------------
// Push token registration (for breaking news)
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'zuhd_pushToken';
const PROJECT_ID = '14c4589a-a039-41ad-b3f6-23cff746c7a8';

/** Register Expo push token with the backend. Idempotent. */
export async function registerPushToken(): Promise<void> {
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID });
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
