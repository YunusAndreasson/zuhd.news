import * as WebBrowser from 'expo-web-browser';
import { useCallback } from 'react';
import { Linking } from 'react-native';
import { useTheme } from '../hooks/useTheme';

/**
 * Route http(s) links to the themed in-app browser; everything else (mailto:,
 * tel:, app schemes) falls back to the OS handler. Baked theme colors keep
 * the in-app toolbar visually consistent with the app.
 */
export function useOpenLink(): (url: string) => void {
  const { colors } = useTheme();
  return useCallback(
    (url: string) => {
      if (/^https?:/i.test(url)) {
        WebBrowser.openBrowserAsync(url, {
          toolbarColor: colors.bg,
          controlsColor: colors.accent,
          dismissButtonStyle: 'close',
        }).catch(() => {});
      } else {
        Linking.openURL(url).catch(() => {});
      }
    },
    [colors.bg, colors.accent],
  );
}
