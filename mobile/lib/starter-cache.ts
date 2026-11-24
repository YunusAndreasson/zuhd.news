import type { FeedResponse } from '@shared/types';
import { createJsonCache } from './json-cache';
import {
  archiveWithdrawn,
  openingStory,
  type StarterFallback,
  selectStarter,
} from './opening-story';
import { isFeedResponse } from './validate';

type Stored = FeedResponse & { archiveWithdrawn?: boolean };
const cache = createJsonCache<Stored>('zuhd-opener.json', isFeedResponse);

export function readStarter(): StarterFallback {
  const stored = cache.readSync();
  return {
    previous: stored ? openingStory(stored.categories, null) : null,
    archiveWithdrawn: stored?.archiveWithdrawn === true,
  };
}

export function rememberStarter(feed: FeedResponse): void {
  const previous = readStarter();
  const next = selectStarter(feed.categories, previous);
  void cache.write({
    generated: feed.generated,
    briefing: null,
    categories: next ? { [next.category]: [next] } : {},
    archiveWithdrawn: archiveWithdrawn(feed.categories, previous.archiveWithdrawn),
  });
}
