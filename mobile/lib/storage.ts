import * as SecureStore from 'expo-secure-store';

const LAST_SEEN_KEY = 'zuhd_lastSeenAt';

export async function getLastSeenAt(): Promise<number> {
  const v = await SecureStore.getItemAsync(LAST_SEEN_KEY);
  return v ? parseInt(v, 10) : 0;
}

export async function saveLastSeenAt(ts: number): Promise<void> {
  await SecureStore.setItemAsync(LAST_SEEN_KEY, String(ts));
}
