import { useCallback, useEffect, useRef } from 'react';

/** One redraw per committed input snapshot. The renderer reads its latest
 * refs, so ordinary effect dependency inference cannot see these inputs.
 * Enumerating the supplied snapshot here also makes a newly added layer an
 * invalidation input without maintaining a second dependency list. */
export function useGlobeRedraw(inputs: Readonly<Record<string, unknown>>, redraw: () => void) {
  const previous = useRef<Readonly<Record<string, unknown>> | null>(null);
  useEffect(() => {
    const last = previous.current;
    previous.current = inputs;
    if (
      last &&
      Object.keys(last).length === Object.keys(inputs).length &&
      Object.keys(inputs).every((key) => Object.is(inputs[key], last[key]))
    )
      return;
    redraw();
  }, [inputs, redraw]);
}

/** Sheets finish baking independently. Replay their latest textures together
 *  on the next frame, including a sheet that finishes after that frame. */
export function useSpriteRedraw(redraw: () => void) {
  const frame = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    },
    [],
  );
  return useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      redraw();
    });
  }, [redraw]);
}
