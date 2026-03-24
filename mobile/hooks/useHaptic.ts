import * as Haptics from 'expo-haptics';
import { useCallback } from 'react';
import { Platform } from 'react-native';

export function useHaptic() {
  const impact = useCallback((style = Haptics.ImpactFeedbackStyle.Light) => {
    if (Platform.OS === 'android') {
      Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Clock_Tick).catch(() => {});
    } else {
      Haptics.impactAsync(style).catch(() => {});
    }
  }, []);

  const notification = useCallback((type = Haptics.NotificationFeedbackType.Success) => {
    if (Platform.OS === 'android') {
      Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm).catch(() => {});
    } else {
      Haptics.notificationAsync(type).catch(() => {});
    }
  }, []);

  return { impact, notification };
}
