import { flushBookmarks } from './bookmark-store';
import { flushFound } from './found-store';
import { flushKnown } from './fresh-store';
import { flushOnboarding } from './onboarding-store';
import { flushRead } from './read-store';

/**
 * Write every store's debounced change now. The app does it as it goes to the
 * background; a reload must do it first, because a reload sends no background
 * event and the pending writes would go with the JavaScript.
 */
export function flushStores(): void {
  flushBookmarks();
  flushFound();
  flushKnown();
  flushRead();
  flushOnboarding();
}
