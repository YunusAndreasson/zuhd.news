import type { IpcSnapshot } from '@shared/types';
import { API_BASE } from '../constants/theme';
import { isIpcSnapshot } from '../lib/validate';
import { useFetchJson } from './useFetchJson';

/** Fetches `/api/ipc.json` — IPC / Cadre Harmonisé acute food insecurity, one
 *  record per analysed area. ~36 KB decoded, cache-first like every other
 *  ambient layer; a failure leaves the famine card unbuilt rather than
 *  half-drawn. Same host as the feed, so the app's "contacts one address"
 *  claim is unaffected, and the in-app data meter counts the bytes. */
export function useIpc(): { snapshot: IpcSnapshot | null; ready: boolean } {
  const { data, ready } = useFetchJson(`${API_BASE}/api/ipc.json`, isIpcSnapshot, {
    refreshOnResume: true,
  });
  return { snapshot: data, ready };
}
