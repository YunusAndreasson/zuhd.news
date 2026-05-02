import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { LAYOUT } from '../constants/theme';

type SnapConfig = {
  snapPoints?: string[];
  enableDynamicSizing: boolean;
  maxDynamicContentSize?: number;
};

/**
 * Resolve bottom-sheet snap configuration.
 * - `tall=false`: dynamic sizing — sheet hugs its content, capped at
 *   `LAYOUT.sheetMaxFraction` of the screen. Short pages (settings, info)
 *   no longer leave dead space below the last row.
 * - `tall=true`: fixed 85% snap (for keyboard screens and long lists that
 *   need a stable height reference for internal FlatList offsets).
 *
 * Spread the result into a `<SheetLayout>`.
 */
export function useSheetSnaps(tall: boolean): SnapConfig {
  const { height } = useWindowDimensions();
  const maxDynamicContentSize = Math.round(height * LAYOUT.sheetMaxFraction);
  return useMemo<SnapConfig>(
    () =>
      tall
        ? { snapPoints: ['85%'], enableDynamicSizing: false }
        : { enableDynamicSizing: true, maxDynamicContentSize },
    [tall, maxDynamicContentSize],
  );
}
