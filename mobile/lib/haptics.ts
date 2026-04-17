import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// Three-tier haptic system. Pick the tier that matches the *semantics* of
// the event, not its loudness — the palette intentionally progresses from
// softest to firmest so consistent pairing across the app reads as a signal
// (tick = incidental movement, impact = deliberate action, notification =
// state milestone).
//
//   tick         → selectionAsync / Segment_Frequent_Tick
//                  Use for: incidental or continuous movement feedback
//                  — snap between articles, category swipe, scrub-label change,
//                  mid-gesture ratcheting.
//
//   impact       → impactAsync(Light) / Clock_Tick
//                  Use for: deliberate discrete taps — buttons, sheet openers,
//                  globe taps, row presses. This is the default for `HapticPressable`.
//
//   notification → notificationAsync(Success) / Confirm
//                  Use for: state milestones — refresh complete, end-of-list
//                  reached, "caught up" line crossed, swipe-delete committed.

let enabled = true;

export function setHapticsEnabled(v: boolean): void {
  enabled = v;
}

function fire(android: Haptics.AndroidHaptics, ios: () => Promise<void>) {
  if (!enabled) return;
  (Platform.OS === 'android' ? Haptics.performAndroidHapticsAsync(android) : ios()).catch(() => {});
}

export function hapticTick(): void {
  fire(Haptics.AndroidHaptics.Segment_Frequent_Tick, () => Haptics.selectionAsync());
}

export function hapticImpact(): void {
  fire(Haptics.AndroidHaptics.Clock_Tick, () =>
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  );
}

export function hapticNotification(
  type: Haptics.NotificationFeedbackType = Haptics.NotificationFeedbackType.Success,
): void {
  fire(Haptics.AndroidHaptics.Confirm, () => Haptics.notificationAsync(type));
}

/** Tier name used by `HapticPressable` / `HapticButton` to pick a dispatch at press time. */
export type HapticTier = 'impact' | 'tick' | 'none';

export function fireHaptic(tier: HapticTier): void {
  if (tier === 'impact') hapticImpact();
  else if (tier === 'tick') hapticTick();
}
