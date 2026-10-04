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
  const anchorIndex = anchorSlug ? slugs.indexOf(anchorSlug) : -1;
  if (anchorIndex >= 0) index = anchorIndex;
  const [state, setState] = useState(() => ({
    slugs,
    index,
    arrivals: storyArrivals({ known: new Set(), pending: new Set() }, slugs, index),
  }));
  let arrivals = state.arrivals;
  if (state.slugs !== slugs || state.index !== index) {
    arrivals = storyArrivals(arrivals, slugs, index);
    setState({ slugs, index, arrivals });
  }
  const first = slugs.findIndex((slug) => arrivals.pending.has(slug));
  return { count: arrivals.pending.size, first };
}
