export interface StoryArrivals {
  known: ReadonlySet<string>;
  pending: ReadonlySet<string>;
}

/** An arrival notice, not an unread counter. Browsing an unchanged feed
 * cannot create one, and reaching the new stories acknowledges the batch. */
export function storyArrivals(
  previous: StoryArrivals,
  slugs: readonly string[],
  index: number,
): StoryArrivals {
  const known = new Set(previous.known);
  const pending = new Set([...previous.pending].filter((slug) => slugs.includes(slug)));
  const current = slugs[index];
  if (known.size > 0 && current && known.has(current)) {
    for (const slug of slugs.slice(0, index)) {
      if (!known.has(slug)) pending.add(slug);
    }
  }
  if (index === 0 || (current && pending.has(current))) pending.clear();
  for (const slug of slugs) known.add(slug);
  return { known, pending };
}
