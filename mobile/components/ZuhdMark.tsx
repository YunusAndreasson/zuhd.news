import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { memo } from 'react';
import { ZUHD_MARK_BOX, ZUHD_MARK_PATHS } from '../lib/zuhd-mark';

/** The three shapes as one path, parsed once. */
const MARK = Skia.Path.MakeFromSVGString(ZUHD_MARK_PATHS.join(' '));

/**
 * The zuhd mark, drawn rather than shown as the icon's picture: in the ink it
 * is given, so it reads on the dark sheet and the cream one alike, where the
 * icon is white on black. Decorative — the wordmark beside it carries the
 * name for a screen reader.
 */
export const ZuhdMark = memo(function ZuhdMark({ size, color }: { size: number; color: string }) {
  if (!MARK) return null;
  return (
    <Canvas
      style={{ width: size, height: size }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Path path={MARK} color={color} transform={[{ scale: size / ZUHD_MARK_BOX }]} />
    </Canvas>
  );
});
