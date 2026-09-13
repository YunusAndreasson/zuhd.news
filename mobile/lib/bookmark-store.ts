import type { Article, Category } from '@shared/types';
import { File, Paths } from 'expo-file-system';
import Storage from 'expo-sqlite/kv-store';
import { createDebouncedWrite, createListeners } from './store-plumbing';
import { isBookmarkArray } from './validate';

// ---------------------------------------------------------------------------
// Persisted bookmark with category (articles rotate out of the feed)
// ---------------------------------------------------------------------------

export interface Bookmark {
  article: Article;
  category: Category;
  savedAt: number;
}

// ---------------------------------------------------------------------------
// File-backed store with useSyncExternalStore support
// ---------------------------------------------------------------------------

const BOOKMARKS_FILE = new File(Paths.document, 'zuhd-bookmarks.json');
const BOOKMARKS_KEY = 'zuhd_bookmarks';

let bookmarks: Bookmark[] = [];
const listeners = createListeners();

// Load synchronously on import so UI has instant state. A schema-drift
// bookmark (e.g. missing `sentences`) would crash on first render — validate
// and drop the whole file if any entry is malformed.
try {
  const stored = Storage.getItemSync(BOOKMARKS_KEY);
  const text = stored ?? (BOOKMARKS_FILE.exists ? BOOKMARKS_FILE.textSync() : null);
  if (text) {
    const parsed: unknown = JSON.parse(text);
    if (isBookmarkArray(parsed)) {
      bookmarks = parsed;
      if (stored === null) Storage.setItemSync(BOOKMARKS_KEY, text);
    } else {
      bookmarks = [];
    }
  }
} catch {
  bookmarks = [];
}

const persist = createDebouncedWrite(() => {
  Storage.setItemSync(BOOKMARKS_KEY, JSON.stringify(bookmarks));
}, 100);

/** Flush any pending write — call from app-background transitions. */
export const flushBookmarks = persist.flush;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function toggle(article: Article, category: Category): boolean {
  const idx = bookmarks.findIndex((b) => b.article.slug === article.slug);
  if (idx >= 0) {
    bookmarks = bookmarks.filter((_, i) => i !== idx);
    listeners.emit();
    persist.later();
    return false; // removed
  }
  bookmarks = [{ article, category, savedAt: Date.now() }, ...bookmarks];
  listeners.emit();
  persist.later();
  return true; // added
}

/** Erase every saved bookmark. Persists immediately rather than on the debounce
 *  — this is called from the privacy page's erase control, and a promise to
 *  delete should not be sitting in a timer if the app is killed a moment later. */
export function clearBookmarks(): void {
  bookmarks = [];
  listeners.emit();
  persist.now();
}

// ---------------------------------------------------------------------------
// useSyncExternalStore interface
// ---------------------------------------------------------------------------

export const subscribe = listeners.subscribe;

export function getSnapshot(): Bookmark[] {
  return bookmarks;
}
