import { File, Paths } from 'expo-file-system';
import type { FeedResponse } from '../types';
import { readJsonCache } from './json-cache';

const FEED_FILE = new File(Paths.cache, 'zuhd-feed.json');
const META_FILE = new File(Paths.cache, 'zuhd-feed-meta.json');

interface CacheMeta {
  cachedAt: number;
  generated: string;
}

export function writeFeedCache(feed: FeedResponse): void {
  // Defer sync write off the current frame to avoid blocking JS thread
  // during feed apply → UI update. The write is fire-and-forget.
  const json = JSON.stringify(feed);
  const meta = JSON.stringify({ cachedAt: Date.now(), generated: feed.generated });
  setTimeout(() => {
    try {
      FEED_FILE.write(json);
      META_FILE.write(meta);
    } catch {}
  }, 0);
}

export async function readFeedCache(): Promise<FeedResponse | null> {
  return readJsonCache<FeedResponse>(FEED_FILE);
}

export function readCachedGenerated(): string | null {
  try {
    if (!META_FILE.exists) return null;
    const meta: CacheMeta = JSON.parse(META_FILE.textSync());
    return meta.generated;
  } catch {
    return null;
  }
}
