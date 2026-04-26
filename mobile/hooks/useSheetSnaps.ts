import { useMemo } from 'react';
import { LAYOUT } from '../constants/theme';

type SnapConfig = { snapPoints: string[]; enableDynamicSizing: false };

const MAX_SNAP = `${Math.round(LAYOUT.sheetMaxFraction * 100)}%`;

/**
 * Resolve bottom-sheet snap configuration.
 * - `tall=false`: open at the max sheet height (LAYOUT.sheetMaxFraction).
 * - `tall=true`: fixed 85% snap (for keyboard screens or long lists that
 *   need a stable reference for internal FlatList offsets).
 *
 * Both modes use a fixed snap so sheets open fully on first present —
 * dynamic content sizing forced a small scroll when content slightly
 * exceeded the measured height.
 *
 * Spread the result into a `<SheetLayout>`.
 */
export function useSheetSnaps(tall: boolean): SnapConfig {
  return useMemo<SnapConfig>(
    () => ({
      snapPoints: tall ? ['85%'] : [MAX_SNAP],
      enableDynamicSizing: false,
    }),
    [tall],
  );
}
