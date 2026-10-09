import { useCallback, useEffect, useRef, useState } from 'react';
import { linksFirst } from '../lib/contextual-strip';
import { STRIP_SLOTS, type StripItem } from '../lib/now';

/** Hold the complete snapshot through touch, momentum, and an open card. */
export function useStableStrip(
  incoming: StripItem[],
  locked: boolean,
  pinned?: StripItem,
  priority?: ReadonlySet<string>,
) {
  const [items, setItems] = useState(incoming);
  const [interacting, setInteracting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hold = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setInteracting(true);
  }, []);
  const release = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    // Native momentum start and a slot's press can follow touch end.
    timer.current = setTimeout(() => setInteracting(false), 150);
  }, []);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    if (interacting) return;
    if (locked) {
      if (pinned)
        setItems((previous) =>
          previous.some((item) => item.id === pinned.id)
            ? previous
            : [pinned, ...previous].slice(0, STRIP_SLOTS),
        );
      return;
    }
    setItems((previous) => {
      const next = linksFirst(incoming, priority);
      return next.length === previous.length &&
        next.every((item, index) => item === previous[index])
        ? previous
        : next;
    });
  }, [incoming, locked, interacting, pinned, priority]);
  return { items, hold, release };
}
