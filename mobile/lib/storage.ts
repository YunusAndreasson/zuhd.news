import * as SecureStore from 'expo-secure-store';

const LAST_SEEN_KEY = 'zuhd_lastSeenAt';
const POSITIONS_KEY = 'zuhd_positions';

export async function getLastSeenAt(): Promise<number> {
  const v = await SecureStore.getItemAsync(LAST_SEEN_KEY);
  return v ? parseInt(v, 10) : 0;
}

export async function saveLastSeenAt(ts: number): Promise<void> {
  await SecureStore.setItemAsync(LAST_SEEN_KEY, String(ts));
}

export async function getReadingPositions(): Promise<Record<string, number>> {
  const v = await SecureStore.getItemAsync(POSITIONS_KEY);
  return v ? JSON.parse(v) : {};
}

export async function saveReadingPosition(cat: string, index: number): Promise<void> {
  const pos = await getReadingPositions();
  pos[cat] = index;
  await SecureStore.setItemAsync(POSITIONS_KEY, JSON.stringify(pos));
}
