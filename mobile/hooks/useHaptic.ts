import * as Haptics from 'expo-haptics';
import { useCallback } from 'react';

export function useHaptic() {
  const impact = useCallback((style = Haptics.ImpactFeedbackStyle.Light) => {
    Haptics.impactAsync(style).catch(() => {});
  }, []);

  const notification = useCallback((type = Haptics.NotificationFeedbackType.Success) => {
    Haptics.notificationAsync(type).catch(() => {});
  }, []);

  return { impact, notification };
}
