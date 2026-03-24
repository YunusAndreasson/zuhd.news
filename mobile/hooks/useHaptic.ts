import * as Haptics from 'expo-haptics';
import { useCallback } from 'react';
import { Platform } from 'react-native';

export function useHaptic() {
  // Softest — high-frequency: article swipe, category swipe
  const tick = useCallback(() => {
    if (Platform.OS === 'android') {
      Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Frequent_Tick).catch(() => {});
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
    }
  }, []);

  // Medium — deliberate taps: buttons, sheet openers, globe taps
  const impact = useCallback(() => {
    if (Platform.OS === 'android') {
      Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Clock_Tick).catch(() => {});
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
  }, []);

  // Firmest — milestones: caught up, end of list, refresh
  const notification = useCallback((type = Haptics.NotificationFeedbackType.Success) => {
    if (Platform.OS === 'android') {
      Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm).catch(() => {});
    } else {
      Haptics.notificationAsync(type).catch(() => {});
    }
  }, []);

  return { tick, impact, notification };
}
