import { AccessibilityInfo } from 'react-native';
import { IS_ANDROID } from '../constants/platform';

/**
 * Say something to a screen reader that nothing on screen is focused on.
 *
 * `accessibilityLiveRegion` is Android-only: on iOS a toast, the dock's status
 * line and a story swapped in by an accessibility action changed in silence.
 * A view that already carries a live region passes `liveRegion`, so Android —
 * which announces the region's change itself — does not hear it twice.
 */
export function announce(message: string, { liveRegion = false } = {}): void {
  if (!message || (liveRegion && IS_ANDROID)) return;
  AccessibilityInfo.announceForAccessibility(message);
}
