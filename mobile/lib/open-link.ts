import { Linking } from 'react-native';

/**
 * Open all links in the OS default browser. An earlier version routed http(s)
 * through expo-web-browser's in-app SFSafariViewController / Chrome Custom
 * Tabs, but on iOS that dismisses whatever sheet the link was tapped in: the
 * sheet is a presented view controller, and presenting another one on top
 * unwinds it. That was true of the old JS sheets, which presented through an
 * RN Modal, and it is still true of the platform sheets that replaced them.
 * An external browser preserves sheet state across the round trip.
 */
/** Open a URL in the OS default browser, swallowing failures. A module
 *  function, stable by nature: there was a `useOpenLink` hook that returned
 *  this through `useCallback(…, [])`, which is this. */
export function openExternal(url: string): void {
  Linking.openURL(url).catch(() => {});
}
