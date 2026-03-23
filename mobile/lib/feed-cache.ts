import { File, Paths } from 'expo-file-system';
import type { FeedResponse } from '../types';

const FEED_FILE = new File(Paths.cache, 'zuhd-feed.json');
const META_FILE = new File(Paths.cache, 'zuhd-feed-meta.json');

interface CacheMeta {
  cachedAt: number;
  generated: string;
}

export interface FeedInfo {
  total: number;
  readMins: number;
}

export async function writeFeedCache(feed: FeedResponse): Promise<void> {
  FEED_FILE.write(JSON.stringify(feed));
  META_FILE.write(JSON.stringify({ cachedAt: Date.now(), generated: feed.generated }));
}

export async function readFeedCache(): Promise<FeedResponse | null> {
  try {
    if (!FEED_FILE.exists) return null;
    const feedText = await FEED_FILE.text();
    return JSON.parse(feedText);
  } catch {
    return null;
  }
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
