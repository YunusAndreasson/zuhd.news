import { getItemAsync, setItemAsync } from 'expo-secure-store';

// The cold prompt in older builds used the same key. Keep its answer across upgrades.
const ASKED_KEY = 'zuhd_notif_asked';

export async function osPromptSpent(): Promise<boolean> {
  return Boolean(await getItemAsync(ASKED_KEY));
}

export async function markOsPromptSpent(): Promise<void> {
  await setItemAsync(ASKED_KEY, '1').catch(() => {});
}
