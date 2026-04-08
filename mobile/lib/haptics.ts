import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

let enabled = true;

export function setHapticsEnabled(v: boolean) {
  enabled = v;
}

function fire(android: Haptics.AndroidHaptics, ios: () => Promise<void>) {
  if (!enabled) return;
  (Platform.OS === 'android'
    ? Haptics.performAndroidHapticsAsync(android)
    : ios()
  ).catch(() => {});
}

/** Softest — high-frequency: article swipe, category swipe */
export function hapticTick() {
  fire(Haptics.AndroidHaptics.Segment_Frequent_Tick, () =>
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft));
}

/** Medium — deliberate taps: buttons, sheet openers, globe taps */
export function hapticImpact() {
  fire(Haptics.AndroidHaptics.Clock_Tick, () =>
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Firmest — milestones: caught up, end of list, refresh */
export function hapticNotification(type = Haptics.NotificationFeedbackType.Success) {
  fire(Haptics.AndroidHaptics.Confirm, () => Haptics.notificationAsync(type));
}
