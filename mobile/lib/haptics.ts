import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { IS_ANDROID } from '../constants/platform';

// Three tiers, chosen by what the event *means*, never by how loud it should
// feel — used consistently, the tier itself tells the hand what happened.
//
//   swipe        → impactAsync(Soft) / Segment_Frequent_Tick
//                  A sideways swipe landing: a story in the deck, the gauge
//                  row on a slot, a page of country cards. The softest there
//                  is (2026-09-26, the user asked for a softer swipe): iOS's
//                  selection tick is a crisp click, and the soft impact is a
//                  muted, rounder one. It was `tick` until then.
//
//   tick         → selectionAsync / Segment_Frequent_Tick
//                  Movement within a surface: a sheet settling on a stop, a
//                  chart's scrub step, a toggle or option picked, going back
//                  a page.
//
//   impact       → impactAsync(Light) / Clock_Tick
//                  A press that opens something: a sheet, a story, a card, a
//                  link, the share sheet, play. The `Pressable` primitive's
//                  default. Scrub detents take it too: iOS silences selection
//                  feedback while audio plays, and the briefing can be playing
//                  while the story track is scrubbed.
//
//   notification → notificationAsync / Confirm (Reject for an error)
//                  State committed: saved, removed, undone, erased, the last
//                  story on the globe found. `hapticError` when it could not be
//                  done.
//
// A press whose handler gives its own haptic passes `haptic="none"` to the
// primitive, so one touch is never two knocks.

let enabled = true;

export function setHapticsEnabled(v: boolean): void {
  enabled = v;
}

// `performAndroidHapticsAsync` resolves its constant by reflection on
// `HapticFeedbackConstants`, and a constant the OS does not have throws — which
// `fire` swallows. `SEGMENT_FREQUENT_TICK` arrived in API 34 and
// `CONFIRM`/`REJECT` in API 30, so below those every tick and every
// notification was silent. Older Androids take the vibrator-backed calls
// instead, the same ones iOS uses.
const ANDROID_API = IS_ANDROID ? Number(Platform.Version) : 0;
const HAS_FREQUENT_TICK = ANDROID_API >= 34;
const HAS_CONFIRM = ANDROID_API >= 30;

function fire(android: Haptics.AndroidHaptics | null, fallback: () => Promise<void>) {
  if (!enabled) return;
  (IS_ANDROID && android ? Haptics.performAndroidHapticsAsync(android) : fallback()).catch(
    () => {},
  );
}

export function hapticTick(): void {
  fire(HAS_FREQUENT_TICK ? Haptics.AndroidHaptics.Segment_Frequent_Tick : null, () =>
    Haptics.selectionAsync(),
  );
}

/** A sideways swipe landing — see the tiers above. Android's frequent tick is
 *  already its softest constant, and a device that cannot make it that soft
 *  makes none; below API 34 the soft impact stands in, as on iOS. Softer
 *  still needs an intensity, which `expo-haptics` does not expose. */
export function hapticSwipe(): void {
  fire(HAS_FREQUENT_TICK ? Haptics.AndroidHaptics.Segment_Frequent_Tick : null, () =>
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft),
  );
}

export function hapticImpact(): void {
  // `CLOCK_TICK` exists on every Android the app supports.
  fire(Haptics.AndroidHaptics.Clock_Tick, () =>
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  );
}

export function hapticNotification(
  type: Haptics.NotificationFeedbackType = Haptics.NotificationFeedbackType.Success,
): void {
  const android = !HAS_CONFIRM
    ? null
    : type === Haptics.NotificationFeedbackType.Error
      ? Haptics.AndroidHaptics.Reject
      : Haptics.AndroidHaptics.Confirm;
  fire(android, () => Haptics.notificationAsync(type));
}

/** Something the reader asked for could not be done — a briefing that will not
 *  play, an erase that failed. The notification tier's error pattern. */
export function hapticError(): void {
  hapticNotification(Haptics.NotificationFeedbackType.Error);
}

/** Tier name the `Pressable` primitive takes to pick a dispatch at press time. */
export type HapticTier = 'impact' | 'tick' | 'none';

export function fireHaptic(tier: HapticTier): void {
  if (tier === 'impact') hapticImpact();
  else if (tier === 'tick') hapticTick();
}
