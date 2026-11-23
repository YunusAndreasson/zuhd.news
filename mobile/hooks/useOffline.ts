import { useSyncExternalStore } from 'react';
import { isOffline, subscribeConnectivity } from '../lib/network';

/**
 * Whether the device says the internet is unreachable — the one thing the
 * map screen reads from the network state (its error message).
 *
 * Not `useNetworkState`: that hook stores a fresh object on every native
 * event, and Android emits one for every capability change — bandwidth
 * estimates, signal, validation — so the whole map screen re-rendered on a
 * phone that was only walking between cells. A boolean snapshot re-renders
 * only when it flips.
 */
export function useOffline(): boolean {
  return useSyncExternalStore(subscribeConnectivity, isOffline);
}
