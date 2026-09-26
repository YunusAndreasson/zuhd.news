import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { IS_ANDROID } from '../constants/platform';

// A haptic answers a finger, and only when it tells the hand something the
// eye might miss: a threshold crossed mid-gesture, a swipe landing, a notch
// that stands for an item, a hit on the globe (which has no press state), a
// state committed or refused. **Never an ordinary press** — no system button
// on either platform knocks, and until 2026-09-26 every `Pressable` here did,
// ~40 of them, which is how a reader learns to switch haptics off. One event
// is one haptic: where two would fire, the more meaningful one wins.
//
//   swipe        → impactAsync(Soft) / SEGMENT_FREQUENT_TICK
//                  A sideways swipe landing: a story in the deck, the gauge
//                  row on a slot, a page of country cards. The softest there
//                  is (2026-09-26, the user asked for a softer swipe).
//
//   tick         → selectionAsync / SEGMENT_TICK
//                  A threshold crossed while the finger is down (pull to
//                  refresh, swipe to remove), a sheet released onto a new
//                  detent, a chart scrub landing on a cited story, a toggle or
//                  option picked.
//
//   impact       → impactAsync(Light) / CLOCK_TICK
//                  A tap that hit something on the globe; a notch per story on
//                  the story track. Scrub notches take impact, not tick: iOS
//                  silences selection feedback while audio plays, and the
//                  briefing can be playing while the track is scrubbed.
//
//   notification → notificationAsync / CONFIRM (REJECT for an error)
//                  State committed: saved, removed, undone, erased, caught up,
//                  the last story on the globe found. `hapticError` when it
//                  could not be done.
//
// Android goes through `View.performHapticFeedback` only
// (`performAndroidHapticsAsync`): it follows the system's touch-feedback
// setting and needs no permission. `impactAsync`, `selectionAsync` and
// `notificationAsync` are raw `Vibrator` waveforms on Android — the legacy
// buzz Android's haptics guidance says to prefer silence over — and they
// ignore that setting. They are iOS-only here.

let enabled = true;

export function setHapticsEnabled(v: boolean): void {
  enabled = v;
}

// `performAndroidHapticsAsync` resolves its constant by reflection on
// `HapticFeedbackConstants`, and a constant the OS does not have throws — which
// `fire` swallows. `SEGMENT_TICK`/`SEGMENT_FREQUENT_TICK` arrived in API 34 and
// `CONFIRM`/`REJECT` in API 30; below those, an older View constant stands in.
const ANDROID_API = IS_ANDROID ? Number(Platform.Version) : 0;
const HAS_SEGMENT_TICK = ANDROID_API >= 34;
const HAS_CONFIRM = ANDROID_API >= 30;
const A = Haptics.AndroidHaptics;

function fire(android: Haptics.AndroidHaptics, ios: () => Promise<void>): void {
  if (!enabled) return;
  (IS_ANDROID ? Haptics.performAndroidHapticsAsync(android) : ios()).catch(() => {});
}

export function hapticTick(): void {
  fire(HAS_SEGMENT_TICK ? A.Segment_Tick : A.Clock_Tick, () => Haptics.selectionAsync());
}

/** A sideways swipe landing — see the tiers above. Android's frequent tick is
 *  already its softest constant, and a device that cannot make it that soft
 *  makes none. Softer still needs an intensity, which `expo-haptics` does not
 *  expose. */
export function hapticSwipe(): void {
  fire(HAS_SEGMENT_TICK ? A.Segment_Frequent_Tick : A.Clock_Tick, () =>
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft),
  );
}

export function hapticImpact(): void {
  fire(A.Clock_Tick, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

export function hapticNotification(): void {
  fire(HAS_CONFIRM ? A.Confirm : A.Context_Click, () =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  );
}

/** Something the reader asked for could not be done — a briefing that will not
 *  play, an erase that failed. The notification tier's error pattern. */
export function hapticError(): void {
  fire(HAS_CONFIRM ? A.Reject : A.Long_Press, () =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  );
}
