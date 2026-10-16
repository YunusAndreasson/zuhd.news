import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import { IS_ANDROID } from '../constants/platform';
import {
  LEGIBILITY_SETTINGS,
  type Legibility,
  type LegibilitySetting,
  PLAIN_LEGIBILITY,
  withSetting,
} from '../lib/legibility';

/**
 * The system's reading settings (`lib/legibility.ts`), as one store: read
 * once, followed by their change events while anything subscribes. The
 * theme subscribes, and the player for Reduce Transparency; nothing on the
 * map screen does.
 */

let state: Legibility = PLAIN_LEGIBILITY;
const listeners = new Set<() => void>();
let subscriptions: { remove: () => void }[] = [];
let ready: Promise<void> | null = null;
/** Settings an event has reported: a read that lands after the event is older. */
const reported = new Set<keyof Legibility>();

const settings = (): readonly LegibilitySetting[] =>
  LEGIBILITY_SETTINGS[IS_ANDROID ? 'android' : 'ios'];

function set(key: keyof Legibility, on: boolean): void {
  const next = withSetting(state, key, on);
  if (next === state) return;
  state = next;
  for (const listener of listeners) listener();
}

async function readSetting({ key, read }: LegibilitySetting): Promise<void> {
  let on = false;
  try {
    on = await AccessibilityInfo[read]();
  } catch {}
  if (!reported.has(key)) set(key, on);
}

const readAll = () => Promise.all(settings().map(readSetting)).then(() => {});

/** Settles once every setting has been read. The theme waits on it (`use`),
 *  so the first frame under the splash is drawn with them. One promise for
 *  the runtime: a theme remounted in it (Android recreating the activity)
 *  must not wait, and so suspend, again. */
export function legibilityReady(): Promise<void> {
  ready ??= readAll();
  return ready;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    subscriptions = settings().map((setting) =>
      AccessibilityInfo.addEventListener(setting.event, (on: boolean) => {
        reported.add(setting.key);
        set(setting.key, on);
      }),
    );
    // Unwatched, a setting can change unheard: a returning subscriber reads
    // again, behind the state it already has.
    if (ready) void readAll();
    else void legibilityReady();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    for (const subscription of subscriptions) subscription.remove();
    subscriptions = [];
    reported.clear();
  };
}

const getState = () => state;

export function useLegibility(): Legibility {
  return useSyncExternalStore(subscribe, getState, getState);
}
