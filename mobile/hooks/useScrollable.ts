import { useCallback, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

/**
 * Whether a scroll view's content is taller than the view.
 *
 * `CardFrame` arms its prose scroll only when this is true, so a card that fits
 * is not a scroll region at all. One point of slack absorbs sub-pixel layout.
 */
export function useScrollable() {
  const contentHeight = useRef(0);
  const viewportHeight = useRef(0);
  const [scrollable, setScrollable] = useState(false);

  const update = useCallback(() => {
    const next = contentHeight.current - viewportHeight.current > 1;
    setScrollable((current) => (current === next ? current : next));
  }, []);

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      viewportHeight.current = e.nativeEvent.layout.height;
      update();
    },
    [update],
  );

  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      contentHeight.current = height;
      update();
    },
    [update],
  );

  return { onLayout, onContentSizeChange, scrollable };
}
