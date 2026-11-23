import { useMemo } from 'react';
import { buildStoryRows, cameraTrackOf, locateStories } from '../lib/map-feed';
import type { RiverArticle } from '../lib/news-order';
import { buildStoryPlaces } from '../lib/story-places';

interface MapStoriesInput {
  river: RiverArticle[];
  /** Slugs new to the reader (`fresh-store`). */
  fresh: ReadonlySet<string>;
  /** slug → bare percentage, from `lib/predictions.ts`. */
  odds?: ReadonlyMap<string, string>;
}

/** Card annotations can arrive after the river. Only a change to the river
 *  moves a place or replaces the camera track. */
export function useMapStories({ river, fresh, odds }: MapStoriesInput) {
  const stories = useMemo(() => locateStories(river), [river]);
  const storyRows = useMemo(() => buildStoryRows(stories, fresh, odds), [stories, fresh, odds]);
  const places = useMemo(() => buildStoryPlaces(stories), [stories]);
  const cameraTrack = useMemo(() => cameraTrackOf(stories), [stories]);
  return { storyRows, places, cameraTrack };
}
