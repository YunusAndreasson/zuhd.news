import { useCallback } from 'react';
import { Linking } from 'react-native';

/**
 * Open all links in the OS default browser. An earlier version routed http(s)
 * through expo-web-browser's in-app SFSafariViewController / Chrome Custom
 * Tabs, but on iOS that dismisses the active @gorhom/bottom-sheet (it
 * presents via RN Modal, which unwinds when another controller presents on
 * top). External browser preserves sheet state across the round trip.
 */
export function useOpenLink(): (url: string) => void {
  return useCallback((url: string) => {
    Linking.openURL(url).catch(() => {});
  }, []);
}
