import type { ReactElement } from 'react';
import { type ComposedGesture, GestureDetector } from 'react-native-gesture-handler';

/** Attach the iOS same-axis edge recognizer without duplicating the scroll
 * view tree. Keeping the child identical matters: adding/removing a wrapper by
 * branching around two copies remounts the native scroll view and loses the
 * reader's offset. */
export function InnerEdgeGesture({
  enabled,
  gesture,
  children,
}: {
  enabled: boolean;
  gesture: ComposedGesture;
  children: ReactElement;
}) {
  return enabled ? <GestureDetector gesture={gesture}>{children}</GestureDetector> : children;
}
