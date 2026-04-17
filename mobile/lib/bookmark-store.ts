import { File, Paths } from 'expo-file-system';
import type { Article, Category } from '../types';
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

let bookmarks: Bookmark[] = [];
const listeners = new Set<() => void>();

// Load synchronously on import so UI has instant state. A schema-drift
// bookmark (e.g. missing `sentences`) would crash on first render — validate
// and drop the whole file if any entry is malformed.
try {
  if (BOOKMARKS_FILE.exists) {
    const parsed: unknown = JSON.parse(BOOKMARKS_FILE.textSync());
    bookmarks = isBookmarkArray(parsed) ? parsed : [];
  }
} catch {
  bookmarks = [];
}

function emit() {
  for (const fn of listeners) fn();
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function persistNow() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  try {
    BOOKMARKS_FILE.write(JSON.stringify(bookmarks));
  } catch {}
}

function persistDebounced() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 100);
}

/** Flush any pending write — call from app-background transitions. */
export function flushBookmarks(): void {
  if (persistTimer) persistNow();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function toggle(article: Article, category: Category): boolean {
  const idx = bookmarks.findIndex((b) => b.article.slug === article.slug);
  if (idx >= 0) {
    bookmarks = bookmarks.filter((_, i) => i !== idx);
    emit();
    persistDebounced();
    return false; // removed
  }
  bookmarks = [{ article, category, savedAt: Date.now() }, ...bookmarks];
  emit();
  persistDebounced();
  return true; // added
}

// ---------------------------------------------------------------------------
// useSyncExternalStore interface
// ---------------------------------------------------------------------------

export function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function getSnapshot(): Bookmark[] {
  return bookmarks;
}
