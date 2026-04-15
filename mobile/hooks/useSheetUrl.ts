import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useRef } from 'react';

/**
 * Defers URL opening until after a bottom sheet dismisses, avoiding the
 * in-app browser rendering behind the sheet backdrop.
 */
export function useSheetUrl(
  sheetRef: React.RefObject<BottomSheetModal | null>,
  onDismiss: () => void,
) {
  const pendingUrl = useRef<string | null>(null);

  const openUrl = useCallback(
    (url: string) => {
      pendingUrl.current = url;
      sheetRef.current?.dismiss();
    },
    [sheetRef],
  );

  const handleDismiss = useCallback(() => {
    const url = pendingUrl.current;
    pendingUrl.current = null;
    if (url) WebBrowser.openBrowserAsync(url);
    onDismiss();
  }, [onDismiss]);

  return { openUrl, handleDismiss };
}
