import { type ComponentProps, useState } from 'react';
import Animated from 'react-native-reanimated';
import { gpuMissing, readSkiaGpu } from '../../lib/skia-gpu';

export function GlobeLayer({
  children,
  style,
}: Pick<ComponentProps<typeof Animated.View>, 'children' | 'style'>) {
  // Without an adapter there is nothing to draw or hit-test. A temporarily
  // lost device keeps its backend and Skia can draw on its replacement.
  const [drawable] = useState(() => !gpuMissing(readSkiaGpu()));
  if (!drawable) return null;
  return (
    <Animated.View style={style} pointerEvents="none">
      {children}
    </Animated.View>
  );
}
