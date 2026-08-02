import { useMemo } from 'react';

type SnapConfig = {
  snapPoints?: string[];
  enableDynamicSizing: boolean;
};

/**
 * Resolve bottom-sheet snap configuration.
 * - `tall=false`: dynamic sizing — the sheet hugs its content. Short pages
 *   (settings, info) leave no dead space below the last row.
 * - `tall=true`: a fixed 85% snap, for keyboard screens and long lists that
 *   need a stable height reference for internal FlatList offsets.
 *
 * Spread the result into a `<SheetLayout>`.
 *
 * There is no `maxDynamicContentSize` any more. It capped the content detent at
 * `LAYOUT.sheetMaxFraction` of the screen, which a JS-drawn sheet needed because
 * nothing else stopped it growing to fill the window. These are platform sheets
 * now: iOS resolves a content-sized detent through SwiftUI's `fitToContents`,
 * already bounded by the safe area, and Android's Material3 partial state is a
 * fixed ~50%. A cap the native side cannot read would be config that looks
 * load-bearing and is not.
 */
export function useSheetSnaps(tall: boolean): SnapConfig {
  return useMemo<SnapConfig>(
    () =>
      tall ? { snapPoints: ['85%'], enableDynamicSizing: false } : { enableDynamicSizing: true },
    [tall],
  );
}
