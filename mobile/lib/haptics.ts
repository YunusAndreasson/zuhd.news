import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

let enabled = true;

export function setHapticsEnabled(v: boolean) {
  enabled = v;
}

/** Softest — high-frequency: article swipe, category swipe */
export function hapticTick() {
  if (!enabled) return;
  if (Platform.OS === 'android') {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Frequent_Tick).catch(
      () => {},
    );
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
  }
}

/** Medium — deliberate taps: buttons, sheet openers, globe taps */
export function hapticImpact() {
  if (!enabled) return;
  if (Platform.OS === 'android') {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Clock_Tick).catch(() => {});
  } else {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }
}

/** Firmest — milestones: caught up, end of list, refresh */
export function hapticNotification(type = Haptics.NotificationFeedbackType.Success) {
  if (!enabled) return;
  if (Platform.OS === 'android') {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm).catch(() => {});
  } else {
    Haptics.notificationAsync(type).catch(() => {});
  }
}
