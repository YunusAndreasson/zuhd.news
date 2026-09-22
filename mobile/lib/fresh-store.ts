import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';
import { createDebouncedWrite, createListeners } from './store-plumbing';
import { DAY_MS } from './time';

/**
 * Which stories are new to this reader, and which of those they have had in
 * front of them.
 *
 * **New is decided by slug, never by `addedAt`.** `addedAt` is the markdown
 * file's mtime: one value per cycle, reset whenever a file is rewritten. The
 * live feed of 2026-09-21 carried a story filed the day before reading as
 * published that minute, and a clock comparison would have called it new. A
 * story is new when it was not in a feed the reader already had.
 *
 * Three sets:
 *
 *   - `known` — slugs the reader has had: in a feed before anything was new
 *     to them, or new and then landed on. Persisted with when each became
 *     known, and pruned as `found-store` prunes: only once a slug has left the
 *     feed *and* is two weeks old, so one short payload cannot relight a day.
 *   - `fresh` — the feed's slugs that are not known, taken each time a new
 *     feed arrives (`noteFeed`). A snapshot on purpose: a card's `new` does not
 *     vanish the moment the reader lands on it, which would take the word off
 *     the one card it is about. It clears at the next arrival.
 *   - `landed` — fresh stories the reader has had in front of them. They
 *     become known at the next arrival, and on disk when the app backgrounds.
 *     (The dock's jump counts fresh stories not yet *read* — `read-store` —
 *     so it agrees with the track.)
 *
 * A fresh story the reader skips stays fresh for as long as it is in the
 * feed: it is new to them, and the day's window ages it out of the river.
 *
 * The first feed an install notes is known whole — a first launch has nothing
 * to call new. An install that recorded `lastSeenAt` before this store existed
 * gets one session of the old clock comparison instead, so an update does not
 * cost the reader the stories that arrived while they were away.
 */

const KNOWN_KEY = 'zuhd_known_v1';
/** A cycle is ~13 stories and there are five a day: two weeks, with room. */
const MAX_KNOWN = 2000;
const PRUNE_AFTER_MS = 14 * DAY_MS;

type KnownMap = Record<string, number>;

export interface FeedStory {
  slug: string;
  addedAt: number;
}

export interface FreshState {
  fresh: ReadonlySet<string>;
  landed: ReadonlySet<string>;
}

function isKnownMap(value: unknown): value is KnownMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  for (const v of Object.values(value)) if (typeof v !== 'number') return false;
  return true;
}

/** Null until a feed has ever been noted on this install. */
let known: KnownMap | null = null;
/** The `generated` stamp last noted; a feed is noted once. */
let notedFeed: string | null = null;
let state: FreshState = { fresh: new Set(), landed: new Set() };
const listeners = createListeners();

try {
  const stored = Storage.getItemSync(KNOWN_KEY);
  if (stored) {
    const parsed: unknown = JSON.parse(stored);
    if (isKnownMap(parsed)) known = parsed;
  }
} catch {
  known = null;
}

/** What is on disk: the known set and everything landed since it was taken. */
const persist = createDebouncedWrite(() => {
  if (known === null) {
    Storage.removeItemSync(KNOWN_KEY);
    return;
  }
  const now = Date.now();
  const out: KnownMap = { ...known };
  for (const slug of state.landed) out[slug] ??= now;
  Storage.setItemSync(KNOWN_KEY, JSON.stringify(out));
}, 250);

/** Flush any pending write — call from app-background transitions. */
export const flushKnown = persist.flush;

/**
 * A feed has arrived: landed stories become known, and whatever in it is not
 * known is the new `fresh`. Once per `generated`, so an injected bookmark or a
 * re-render that hands the same feed back changes nothing.
 */
export function noteFeed(
  generated: string,
  stories: readonly FeedStory[],
  lastSeenAt = 0,
  now = Date.now(),
): void {
  if (generated === notedFeed) return;
  notedFeed = generated;

  const next: KnownMap = { ...(known ?? {}) };
  if (known === null) {
    for (const story of stories) {
      if (lastSeenAt <= 0 || story.addedAt <= lastSeenAt) next[story.slug] = now;
    }
  }
  for (const slug of state.landed) next[slug] ??= now;

  const live = new Set(stories.map((story) => story.slug));
  for (const [slug, at] of Object.entries(next)) {
    if (!live.has(slug) && now - at > PRUNE_AFTER_MS) delete next[slug];
  }
  const slugs = Object.keys(next);
  if (slugs.length > MAX_KNOWN) {
    // Oldest out first, never one still in the feed: dropping a live slug
    // would call it new again.
    slugs.sort((a, b) => (next[a] ?? 0) - (next[b] ?? 0));
    let over = slugs.length - MAX_KNOWN;
    for (const slug of slugs) {
      if (over <= 0) break;
      if (live.has(slug)) continue;
      delete next[slug];
      over--;
    }
  }
  known = next;

  const fresh = new Set<string>();
  for (const story of stories) if (next[story.slug] == null) fresh.add(story.slug);
  state = { fresh, landed: new Set() };
  listeners.emit();
  persist.later();
}

/** The reader has had this story in front of them. */
export function markLanded(slug: string): void {
  if (!state.fresh.has(slug) || state.landed.has(slug)) return;
  state = { fresh: state.fresh, landed: new Set(state.landed).add(slug) };
  listeners.emit();
  persist.later();
}

/** Forget everything: the next feed is a first launch's. Immediate. */
export function clearKnown(): void {
  known = null;
  notedFeed = null;
  state = { fresh: new Set(), landed: new Set() };
  listeners.emit();
  persist.now();
}

const subscribe = listeners.subscribe;

export function getFreshState(): FreshState {
  return state;
}

const getFresh = (): ReadonlySet<string> => state.fresh;

/**
 * The fresh set alone. `markLanded` keeps this set and replaces `landed`, so
 * a reader of `fresh` is not re-rendered by a landing — which, subscribed to
 * the whole state, re-rendered the map screen a second time after every swipe
 * onto a new story (profiled 2026-09-22).
 */
export function useFreshSlugs(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getFresh, getFresh);
}
