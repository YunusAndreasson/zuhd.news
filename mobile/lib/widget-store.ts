import type { FeedResponse } from '@shared/types';
import type * as Expo from 'expo';
import type KvStore from 'expo-sqlite/kv-store';
import { Platform } from 'react-native';
import { ANALYTICS_EVENTS } from '../constants/analytics';
import { API_BASE } from '../constants/theme';
import { analytics } from './analytics';
import { type Edition, widgetEdition, widgetFace } from './daily-widget';
import { createListeners } from './store-plumbing';

type Observation = { home: boolean; accessory: boolean; observed?: number; sequence?: number };
type Presence = Observation & { history?: Observation[] };
interface Bridge {
  briefingPresence: () => Presence | Promise<Presence>;
  canPinBriefing?: () => boolean;
  pinBriefing?: () => boolean;
}
const bridge = () =>
  (require('expo') as typeof Expo).requireOptionalNativeModule<Bridge>('ExpoWidgets');
export function widgetSupported() {
  try {
    return !!bridge()?.briefingPresence;
  } catch {
    return false;
  }
}
export function canPinWidget() {
  try {
    return !!bridge()?.canPinBriefing?.();
  } catch {
    return false;
  }
}
export function pinWidget() {
  try {
    return !!bridge()?.pinBriefing?.();
  } catch {
    return false;
  }
}
const storage = () => (require('expo-sqlite/kv-store') as { default: typeof KvStore }).default;
const STORE = 'daily-briefing-widget-v1',
  PLACEMENT = 'daily-briefing-placement-v1';
interface State {
  stamp: number;
  verified: number;
  offline: boolean;
  editions: Edition[];
  current?: string;
  complete?: string;
  wallpaper?: boolean;
}
function read(): State {
  try {
    const r = JSON.parse(storage().getItemSync(STORE) ?? 'null');
    if (
      r &&
      Number.isFinite(r.stamp) &&
      Number.isFinite(r.verified) &&
      Array.isArray(r.editions) &&
      r.editions.every(
        (e: Edition | null) => e && typeof e.edition === 'string' && typeof e.revision === 'string',
      )
    )
      return r;
  } catch {}
  return { stamp: 0, verified: 0, offline: false, editions: [] };
}
export function widgetAudioUrl(date: string, generated?: string) {
  return `${API_BASE}/audio/briefing-${date}.mp3${generated ? `?v=${encodeURIComponent(generated)}` : ''}`;
}
export function savedWidgetAudio(e: Edition) {
  if (!e.audio) return false;
  const { briefingAudioFile } = require('./briefing-audio') as typeof import('./briefing-audio');
  try {
    const file = briefingAudioFile(widgetAudioUrl(e.edition, e.audio.generated));
    return file.exists && file.size > 0;
  } catch {
    // Protected or evicted files cannot be promised to an offline reader.
    return false;
  }
}
export function widgetDetail(date: string, revision: string) {
  return read().editions.find(
    (e) =>
      e.edition === date && e.revision === revision && Date.now() - Date.parse(date) < 8 * 86400000,
  );
}
export function currentWidgetEdition() {
  const s = read();
  return s.editions.find((e) => e.revision === s.current);
}
export function widgetPreview() {
  const s = read(),
    e = s.editions.find((x) => x.revision === s.current);
  return widgetFace(
    e,
    Date.now(),
    s.verified,
    s.offline,
    !!e && savedWidgetAudio(e),
    s.complete ?? null,
  );
}
let queue = Promise.resolve(),
  generation = 0,
  lastWrite = '';
function enqueue(work: () => void | Promise<void>) {
  queue = queue.catch(() => {}).then(work);
  return queue;
}
async function render(s: State, token: number) {
  const widget = (require('../widgets/DailyBriefing') as typeof import('../widgets/DailyBriefing'))
    .default;
  const now = Date.now(),
    today = new Date(now).toISOString().slice(0, 10);
  const e = s.editions.find((x) => x.revision === s.current);
  const saved = !!e && savedWidgetAudio(e);
  const at = (t: number) =>
    !e && fetchCount > 0
      ? { loading: true }
      : widgetFace(e, t, s.verified, s.offline, saved, s.complete ?? null);
  const face = at(now);
  const assets =
    face.date && e
      ? await (require('./widget-images') as typeof import('./widget-images')).widgetImages(e)
      : {};
  if (token !== generation) return;
  const times = [now];
  if (e && face.date) {
    const end = Math.min(s.verified + 7 * 86400000, Date.parse(e.edition) + 8 * 86400000);
    for (const t of [
      Date.parse(today) + 5 * 3600000,
      Date.parse(today) + 86400000,
      Date.parse(today) + 86400000 + 5 * 3600000,
      end,
    ]) {
      if (t > now && t <= end && !times.includes(t)) times.push(t);
    }
  }
  const entries = times
    .sort((a, b) => a - b)
    .map((t) => {
      const f = at(t);
      return {
        date: new Date(t),
        props: f.date ? { ...f, ...assets, wallpaper: s.wallpaper === true } : f,
      };
    });
  const key = JSON.stringify(entries.map((r, i) => [i ? r.date.toISOString() : today, r.props]));
  if (key === lastWrite) return;
  if (Platform.OS === 'ios') widget.updateTimeline(entries);
  else widget.updateSnapshot(entries[0]!.props);
  lastWrite = key;
}
export const widgetEditionChanges = createListeners();
function update(change: (s: State) => void) {
  if (!widgetSupported()) return Promise.resolve();
  const token = generation;
  return enqueue(async () => {
    if (token !== generation) return;
    const s = read();
    change(s);
    storage().setItemSync(STORE, JSON.stringify(s));
    widgetEditionChanges.emit();
    await render(s, token);
  }).catch(() => {
    lastWrite = '';
  });
}
export function syncWidget(feed: FeedResponse) {
  return update((s) => {
    const stamp = Date.parse(feed.generated);
    if (!Number.isFinite(stamp) || stamp < s.stamp) return;
    const edition = feed.widgetCandidate?.edition ?? new Date(stamp).toISOString().slice(0, 10);
    s.stamp = stamp;
    const e = widgetEdition(feed.widgetCandidate, stamp);
    const previous = s.editions.find((x) => x.revision === s.current);
    if (e) {
      s.current = e.revision;
      s.verified = stamp;
    } else if (previous?.edition === edition) {
      s.current = undefined;
    }
    // An edition may roll before its first close or recording. Retain the last
    // dated snapshot and its original verification deadline in that interval.
    for (const archived of s.editions) {
      if (archived.edition === edition && archived.audio?.generated !== e?.audio?.generated)
        delete archived.audio;
    }
    s.editions = s.editions.filter(
      (x) => Date.now() - Date.parse(x.edition) < 8 * 86400000 && x.revision !== e?.revision,
    );
    if (e) s.editions.unshift(e);
    s.editions = s.editions.slice(0, 64);
  });
}
let fetchCount = 0;
export function checkingWidgetEdition(active: boolean) {
  const wasFetching = fetchCount > 0;
  fetchCount = Math.max(0, fetchCount + (active ? 1 : -1));
  const isFetching = fetchCount > 0;
  if (wasFetching === isFetching) return;
  if (!widgetSupported() || read().current) return;
  void update(() => {});
}
export const refreshWidget = (offline?: boolean) =>
  update((s) => {
    if (offline !== undefined) {
      s.offline = offline;
    }
  });
export const completedWidgetAudio = (generated: string) =>
  update((s) => {
    s.complete = generated;
  });
export function eraseWidget() {
  generation++;
  lastWrite = '';
  fetchCount = 0;
  if (!widgetSupported()) return Promise.resolve();
  return enqueue(() => {
    storage().removeItemSync(STORE);
    widgetEditionChanges.emit();
    const widget = (
      require('../widgets/DailyBriefing') as typeof import('../widgets/DailyBriefing')
    ).default;
    widget.updateSnapshot({});
    (require('./widget-images') as typeof import('./widget-images')).removeWidgetImages();
  });
}
let placing = Promise.resolve();
export function observeWidget() {
  if (!widgetSupported()) return Promise.resolve();
  placing = placing
    .catch(() => {})
    .then(async () => {
      let result: Presence | undefined;
      try {
        const observed = await bridge()?.briefingPresence();
        if (typeof observed?.home === 'boolean' && typeof observed.accessory === 'boolean')
          result = observed;
      } catch {}
      let last: {
        state: string;
        accessory: string;
        sequence: number;
        providerSequence?: number;
      } | null = null;
      try {
        last = JSON.parse(storage().getItemSync(PLACEMENT) ?? 'null');
      } catch {}

      const history = result?.history;
      const unseen = history?.filter(
        (row) => row.sequence !== undefined && row.sequence > (last?.providerSequence ?? 0),
      );
      // A failed query can recover with the same provider sequence. Its new
      // observation time is now, while a callback keeps the time the OS saw it.
      const observations = unseen?.length ? unseen : [result];
      for (const row of observations) {
        const state = row ? (row.home ? 'present' : 'absent') : 'unknown';
        const accessory = row ? (row.accessory ? 'present' : 'absent') : 'unknown';
        const providerSequence = row?.sequence ?? last?.providerSequence;
        if (
          last?.state === state &&
          last?.accessory === accessory &&
          providerSequence === last?.providerSequence
        )
          continue;
        const observation = {
          state,
          accessory,
          via: Platform.OS === 'ios' ? 'ios_configurations' : 'android_provider_ids',
          observed_at: history && !unseen?.length ? Date.now() : (row?.observed ?? Date.now()),
          sequence: (Number(last?.sequence) || 0) + 1,
        } as const;
        await analytics.track(ANALYTICS_EVENTS.WIDGET_PRESENCE_VERIFIED, observation);
        last = { ...observation, providerSequence };
        storage().setItemSync(PLACEMENT, JSON.stringify(last));
      }
    });
  return placing.catch(() => {});
}

export function widgetWallpaper() {
  return read().wallpaper === true;
}
export const setWidgetWallpaper = (value: boolean) =>
  update((s) => {
    s.wallpaper = value;
  });
