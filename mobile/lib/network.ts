import * as Network from 'expo-network';

type Listener = (online: boolean, initial: boolean) => void;
const listeners = new Set<Listener>();
let lastKnown: boolean | undefined;
let stop: (() => void) | undefined;

/** Unknown until the first native reading. Only a known outage is shown. */
export function isOffline(): boolean {
  return lastKnown === false;
}

/** Share one native subscription and one initial probe across the query client,
 * feed, offline message and push registration. A late probe cannot undo a
 * native event, including after every subscriber has unmounted. */
export function subscribeConnectivity(listener: Listener) {
  listeners.add(listener);
  if (lastKnown !== undefined) listener(lastKnown, true);
  if (!stop) {
    let active = true;
    const publish = (state: Network.NetworkState, initial: boolean) => {
      if (!active || (initial && lastKnown !== undefined)) return;
      const online = state.isInternetReachable ?? state.isConnected;
      if (online === undefined || online === lastKnown) return;
      lastKnown = online;
      for (const notify of listeners) notify(online, initial);
    };
    const subscription = Network.addNetworkStateListener((state) => publish(state, false));
    stop = () => {
      active = false;
      subscription.remove();
      lastKnown = undefined;
    };
    void Network.getNetworkStateAsync()
      .then((state) => publish(state, true))
      .catch(() => {});
  }
  return () => {
    if (!listeners.delete(listener) || listeners.size) return;
    stop?.();
    stop = undefined;
  };
}
