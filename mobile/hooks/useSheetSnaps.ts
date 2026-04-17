import { useMemo } from 'react';
import { useMaxSheetHeight } from '../components/SheetPrimitives';

type SnapConfig =
  | { snapPoints: string[]; enableDynamicSizing: false }
  | { enableDynamicSizing: true; maxDynamicContentSize: number };

/**
 * Resolve bottom-sheet snap configuration.
 * - `tall=false`: dynamic content sizing up to the max sheet height.
 * - `tall=true`: fixed 85% snap (for keyboard screens or long lists that
 *   need a stable reference for internal FlatList offsets).
 *
 * Spread the result into a `<SheetLayout>`.
 */
export function useSheetSnaps(tall: boolean): SnapConfig {
  const maxHeight = useMaxSheetHeight();
  return useMemo<SnapConfig>(
    () =>
      tall
        ? { snapPoints: ['85%'], enableDynamicSizing: false }
        : { enableDynamicSizing: true, maxDynamicContentSize: maxHeight },
    [tall, maxHeight],
  );
}
