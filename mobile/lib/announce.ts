import { AccessibilityInfo } from 'react-native';
import { IS_ANDROID } from '../constants/platform';

/**
 * Say something to a screen reader that nothing on screen is focused on.
 *
 * `accessibilityLiveRegion` is Android-only: on iOS a toast, the dock's status
 * line and a story swapped in by an accessibility action changed in silence.
 * A view that already carries a live region passes `liveRegion`, so Android —
 * which announces the region's change itself — does not hear it twice.
 *
 * What answers the reader's own action interrupts: the story a swipe landed
 * on, the page a row opened. News they did not ask for — a toast, a hazard
 * alert, a search's count while they type — passes `queue`, and VoiceOver says
 * it after whatever it is reading instead of over it. Android has no queue and
 * says it as it comes.
 */
export function announce(message: string, { liveRegion = false, queue = false } = {}): void {
  if (!message || (liveRegion && IS_ANDROID)) return;
  if (queue) AccessibilityInfo.announceForAccessibilityWithOptions(message, { queue: true });
  else AccessibilityInfo.announceForAccessibility(message);
}
