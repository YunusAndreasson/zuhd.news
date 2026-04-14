import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

let enabled = true;

export function setHapticsEnabled(v: boolean): void {
  enabled = v;
}

function fire(android: Haptics.AndroidHaptics, ios: () => Promise<void>) {
  if (!enabled) return;
  (Platform.OS === 'android' ? Haptics.performAndroidHapticsAsync(android) : ios()).catch(() => {});
}

/** Softest — high-frequency: article swipe, category swipe */
export function hapticTick(): void {
  fire(Haptics.AndroidHaptics.Segment_Frequent_Tick, () => Haptics.selectionAsync());
}

/** Medium — deliberate taps: buttons, sheet openers, globe taps */
export function hapticImpact(): void {
  fire(Haptics.AndroidHaptics.Clock_Tick, () =>
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  );
}

/** Firmest — milestones: caught up, end of list, refresh */
export function hapticNotification(
  type: Haptics.NotificationFeedbackType = Haptics.NotificationFeedbackType.Success,
): void {
  fire(Haptics.AndroidHaptics.Confirm, () => Haptics.notificationAsync(type));
}
