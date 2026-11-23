import { useState } from 'react';
import { storyArrivals } from '../lib/story-arrivals';

const EMPTY: readonly string[] = [];

/** Keep the notice with the mounted dock, across foreground returns. */
export function useStoryArrivals(
  slugs: readonly string[] = EMPTY,
  index: number,
  anchorSlug?: string,
) {
  // A feed renders before the deck remaps its index. Compare against the
  // held slug so a batch inserted at index zero is not mistaken for a visit.
  const anchorIndex = anchorSlug && slugs[index] !== anchorSlug ? slugs.indexOf(anchorSlug) : -1;
  if (anchorIndex >= 0) index = anchorIndex;
  const [state, setState] = useState(() => ({
    slugs,
    arrivals: storyArrivals({ known: new Set(), pending: new Set() }, slugs, index),
  }));
  let arrivals = state.arrivals;
  // On the same feed, visiting a pending story or the front is the only
  // movement that can change an arrival notice.
  const current = slugs[index];
  const acknowledges =
    arrivals.pending.size > 0 && (index === 0 || (current && arrivals.pending.has(current)));
  if (state.slugs !== slugs || acknowledges) {
    arrivals = storyArrivals(arrivals, slugs, index);
    setState({ slugs, arrivals });
  }
  const first = arrivals.pending.size ? slugs.findIndex((slug) => arrivals.pending.has(slug)) : -1;
  return { count: arrivals.pending.size, first };
}
