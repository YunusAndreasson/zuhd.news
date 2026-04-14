import * as Notifications from 'expo-notifications';
import { deleteItemAsync, getItemAsync, setItemAsync } from 'expo-secure-store';
import { Platform } from 'react-native';
import { API_BASE } from '../constants/theme';
import { fetchWithTimeout } from './fetch';

// ---------------------------------------------------------------------------
// Android channels (idempotent, no-op on iOS)
// ---------------------------------------------------------------------------

async function setupChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('briefing', {
    name: 'Daily Briefing',
    importance: Notifications.AndroidImportance.DEFAULT,
    description: 'Daily news briefing with topic summary',
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
    await setupChannels();
    return true;
  } catch {
    return false;
  }
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
    await fetchWithTimeout(`${API_BASE}/api/tokens`, 5000, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    await setItemAsync(TOKEN_KEY, token);
  } catch {
    // Silently fail — never log the token, it's a device identifier
  }
}

/** Unregister push token from the backend. */
export async function unregisterPushToken(): Promise<void> {
  try {
    const token = await getItemAsync(TOKEN_KEY);
    if (!token) return;
    await fetchWithTimeout(`${API_BASE}/api/tokens`, 5000, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    await deleteItemAsync(TOKEN_KEY);
  } catch {}
}
