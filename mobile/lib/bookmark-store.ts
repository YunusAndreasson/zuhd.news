import type { Article, Category } from '@shared/types';
import { File, Paths } from 'expo-file-system';
import Storage from 'expo-sqlite/kv-store';
import { createDebouncedWrite, createListeners, deleteLegacyFile } from './store-plumbing';
import { isBookmark } from './validate';

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

// A failed read is unknown, not an empty collection. Keep local edits in
// memory until the saved collection can be recovered before the next write.
let loaded = false;
const removedWhileLoading = new Set<string>();
function recover(): boolean {
  if (loaded) return true;
  let text: string | null;
  let stored: string | null;
  try {
    stored = Storage.getItemSync(BOOKMARKS_KEY);
    text = stored ?? (BOOKMARKS_FILE.exists ? BOOKMARKS_FILE.textSync() : null);
  } catch {
    return false;
  }
  let saved: Bookmark[] = [];
  try {
    const parsed: unknown = text ? JSON.parse(text) : [];
    // One malformed entry drops only itself. Rejecting the array left the
    // list empty, and the next write erased every saved story.
    if (Array.isArray(parsed)) saved = parsed.filter(isBookmark);
  } catch {}
  loaded = true;
  const local = new Set(bookmarks.map((b) => b.article.slug));
  bookmarks = [
    ...bookmarks,
    ...saved.filter((b) => !local.has(b.article.slug) && !removedWhileLoading.has(b.article.slug)),
  ].sort((a, b) => b.savedAt - a.savedAt);
  removedWhileLoading.clear();
  if (stored === null && text) {
    try {
      Storage.setItemSync(BOOKMARKS_KEY, JSON.stringify(bookmarks));
      deleteLegacyFile(BOOKMARKS_FILE);
    } catch {}
  }
  listeners.emit();
  return true;
}
recover();

const persist = createDebouncedWrite(() => {
  if (!recover()) throw new Error('Saved stories storage is temporarily unavailable');
  Storage.setItemSync(BOOKMARKS_KEY, JSON.stringify(bookmarks));
}, 100);

/** Flush any pending write — call from app-background transitions. */
export function flushBookmarks(): void {
  recover();
  persist.flush();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function toggle(article: Article, category: Category): boolean {
  recover();
  const idx = bookmarks.findIndex((b) => b.article.slug === article.slug);
  if (idx >= 0) {
    if (!loaded) removedWhileLoading.add(article.slug);
    bookmarks = bookmarks.filter((_, i) => i !== idx);
    listeners.emit();
    persist.later();
    return false; // removed
  }
  removedWhileLoading.delete(article.slug);
  bookmarks = [{ article, category, savedAt: Date.now() }, ...bookmarks];
  listeners.emit();
  persist.later();
  return true; // added
}

/** Undo a removal without changing its original position or removing a story
 * that was saved again while the undo action was still available. */
export function restore(bookmark: Bookmark): boolean {
  recover();
  if (bookmarks.some((b) => b.article.slug === bookmark.article.slug)) return false;
  removedWhileLoading.delete(bookmark.article.slug);
  bookmarks = [...bookmarks, bookmark].sort((a, b) => b.savedAt - a.savedAt);
  listeners.emit();
  persist.later();
  return true;
}

/** Erase every saved bookmark. Persists immediately rather than on the debounce
 *  — this is called from the privacy page's erase control, and a promise to
 *  delete should not be sitting in a timer if the app is killed a moment later. */
export function clearBookmarks(): boolean {
  loaded = true;
  removedWhileLoading.clear();
  bookmarks = [];
  listeners.emit();
  return persist.now();
}

// ---------------------------------------------------------------------------
// useSyncExternalStore interface
// ---------------------------------------------------------------------------

export function subscribe(listener: () => void): () => void {
  const unsubscribe = listeners.subscribe(listener);
  recover();
  return unsubscribe;
}

export function getSnapshot(): Bookmark[] {
  return bookmarks;
}
