/**
 * Which of the deck's three slots each story in its window is drawn in.
 *
 * The deck keeps three cards mounted — the story in front and its neighbours
 * — and it used to key them by slug, so every landing unmounted the story
 * that left the window and mounted the one that entered: a scroll view, a
 * native gesture, an animated style and a scroll handler set up and torn down
 * on the JS thread, and a card's worth of views created on the UI thread,
 * all while the landing spring settled. A jump did it three times over.
 *
 * Keyed by slot instead, a story keeps its slot for as long as it stays in
 * the window — so the card being read keeps its scroll, even when an arrival
 * moves its index — and a story entering the window is drawn in the slot a
 * story leaving gave up. Pure, so the deck can derive it during render.
 */
export function assignSlots(
  keys: readonly string[],
  previous: ReadonlyMap<string, number>,
): Map<string, number> {
  const next = new Map<string, number>();
  const taken = new Set<number>();
  for (const key of keys) {
    const slot = previous.get(key);
    if (slot !== undefined && !taken.has(slot)) {
      next.set(key, slot);
      taken.add(slot);
    }
  }
  let free = 0;
  for (const key of keys) {
    if (next.has(key)) continue;
    while (taken.has(free)) free++;
    next.set(key, free);
    taken.add(free);
  }
  return next;
}

/** The same window, in the same order. */
export function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key, i) => key === b[i]);
}
