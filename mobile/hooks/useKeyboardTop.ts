import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';
import { IS_ANDROID } from '../constants/platform';

/**
 * Where the keyboard's top edge is on the screen, in points, or `null` while
 * it is down. Android only: there a platform sheet is pushed up whole by the
 * keyboard, so a sheet has to know how much room is left above it. On iOS the
 * sheet stays where it is and this is always `null`.
 */
export function useKeyboardTop(enabled: boolean): number | null {
  const listen = enabled && IS_ANDROID;
  const [top, setTop] = useState<number | null>(null);
  useEffect(() => {
    if (!listen) return;
    const shown = Keyboard.addListener('keyboardDidShow', (e) => {
      setTop(e.endCoordinates.screenY);
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => setTop(null));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [listen]);
  return listen ? top : null;
}
