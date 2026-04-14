import type { SharedValue } from 'react-native-reanimated';
import { useEvent, useHandler } from 'react-native-reanimated';

interface PageScrollEvent {
  position: number;
  offset: number;
}

/**
 * Worklet-based onPageScroll handler for PagerView.
 * Runs on the UI thread — same principle as useAnimatedScrollHandler.
 */
export function usePagerScrollHandler(pagerOffset: SharedValue<number>) {
  const handlers = {
    onPageScroll: (e: PageScrollEvent) => {
      'worklet';
      pagerOffset.value = e.position + e.offset;
    },
  };

  const { doDependenciesDiffer } = useHandler(handlers);

  // useEvent returns a worklet handler that intercepts native events before
  // they cross the bridge. The return type doesn't match PagerView's prop
  // signature (NativeSyntheticEvent wrapper) but works at the fabric level.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return useEvent<PageScrollEvent>(
    (event) => {
      'worklet';
      if (event.eventName.endsWith('onPageScroll')) {
        handlers.onPageScroll(event as unknown as PageScrollEvent);
      }
    },
    ['onPageScroll'],
    doDependenciesDiffer,
  ) as any;
}
