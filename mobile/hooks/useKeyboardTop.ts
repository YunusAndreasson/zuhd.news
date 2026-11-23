import { useSyncExternalStore } from 'react';
import { Keyboard } from 'react-native';
import { IS_ANDROID } from '../constants/platform';

const noKeyboard = () => null;
const skipSubscription = () => () => {};

function keyboardTop() {
  return Keyboard.metrics()?.screenY ?? null;
}

function subscribe(notify: () => void) {
  const shown = Keyboard.addListener('keyboardDidShow', notify);
  const hidden = Keyboard.addListener('keyboardDidHide', notify);
  return () => {
    shown.remove();
    hidden.remove();
  };
}

/**
 * Where the keyboard's top edge is on the screen, in points, or `null` while
 * it is down. Android only: there a platform sheet is pushed up whole by the
 * keyboard, so a sheet has to know how much room is left above it. On iOS the
 * sheet stays where it is and this is always `null`.
 */
export function useKeyboardTop(enabled: boolean): number | null {
  const listen = enabled && IS_ANDROID;
  return useSyncExternalStore(
    listen ? subscribe : skipSubscription,
    listen ? keyboardTop : noKeyboard,
    noKeyboard,
  );
}
