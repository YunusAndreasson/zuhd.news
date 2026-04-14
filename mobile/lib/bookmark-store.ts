import { File, Paths } from 'expo-file-system';
import type { Article, Category } from '../types';

// ---------------------------------------------------------------------------
// Persisted bookmark with category (articles rotate out of the feed)
// ---------------------------------------------------------------------------

interface Bookmark {
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

// Load synchronously on import so UI has instant state
try {
  if (BOOKMARKS_FILE.exists) {
    bookmarks = JSON.parse(BOOKMARKS_FILE.textSync());
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
  persistNow(); // write immediately so a crash can't lose the save
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
