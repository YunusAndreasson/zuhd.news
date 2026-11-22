import { useEffect, useState } from 'react';
import { subscribeConnectivity } from '../lib/network';

/**
 * Whether the device says the internet is unreachable — the one thing the
 * map screen reads from the network state (its error message).
 *
 * Not `useNetworkState`: that hook stores a fresh object on every native
 * event, and Android emits one for every capability change — bandwidth
 * estimates, signal, validation — so the whole map screen re-rendered on a
 * phone that was only walking between cells. A boolean in state re-renders
 * only when it flips.
 */
export function useOffline(): boolean {
  const [offline, setOffline] = useState(false);
  useEffect(() => subscribeConnectivity((online) => setOffline(!online)), []);
  return offline;
}
