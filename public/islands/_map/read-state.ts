// Which stories this reader has already opened.
//
// Entirely local. This is a record in the reader's own `localStorage` and it is
// never sent anywhere, never joined to anything, and never leaves the device —
// which is the only basis on which this site can hold it at all. The app-open
// beacon was removed in July for being a per-device record on our server; a
// read list is a far more revealing one, and the reason it is acceptable here
// is precisely that we cannot see it. If a future change makes this legible to
// the server in any form, it has to be deleted instead.
//
// It is also why there is no sync between devices and no attempt at one: the
// feature is worth having on the phone you actually read on, and worth much
// less than the claim it would cost to make it follow you.

const KEY = 'zuhd:read'

/**
 * How many slugs are kept.
 *
 * The map's window is 14 days and the corpus runs ~50 stories a day, so a few
 * hundred covers everything that can still appear in the rail. Past that the
 * oldest entries are dropped: a slug that has aged out of the window can never
 * be shown again, so remembering it forever buys nothing and grows a value that
 * gets parsed on every page load.
 */
const CAP = 600

const canStore = (): boolean => {
  try {
    return typeof localStorage !== 'undefined'
  } catch {
    // Storage access throws rather than returning null when the browser blocks
    // it — Safari with cookies disabled, or a locked-down embed. Reading is
    // not important enough to take the map down for.
    return false
  }
}

/** Insertion-ordered, oldest first — a Set is the LRU. */
const load = (): Set<string> => {
  if (!canStore()) return new Set()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? new Set(parsed.filter((s): s is string => typeof s === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

const persist = (set: Set<string>) => {
  if (!canStore()) return
  try {
    localStorage.setItem(KEY, JSON.stringify([...set]))
  } catch {
    // A full or blocked quota means the reader loses the greying, not the map.
  }
}

export interface ReadState {
  has(slug: string): boolean
  /** Returns true if this call is what changed the state. */
  mark(slug: string): boolean
  size(): number
  /** Forget everything. The reader's own record, so they can drop it. */
  clear(): void
}

export const createReadState = (): ReadState => {
  const set = load()
  return {
    has: (slug) => set.has(slug),
    mark(slug) {
      if (!slug || set.has(slug)) return false
      set.add(slug)
      // Trim from the front — `Set` preserves insertion order, so the oldest
      // marks go first.
      while (set.size > CAP) {
        const oldest = set.values().next().value
        if (oldest === undefined) break
        set.delete(oldest)
      }
      persist(set)
      return true
    },
    size: () => set.size,
    clear() {
      set.clear()
      persist(set)
    },
  }
}
