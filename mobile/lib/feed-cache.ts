import { File, Paths } from 'expo-file-system';
import type { FeedResponse } from '../types';

const FEED_FILE = new File(Paths.cache, 'zuhd-feed.json');
const META_FILE = new File(Paths.cache, 'zuhd-feed-meta.json');

interface CacheMeta {
  cachedAt: number;
  generated: string;
  total: number;
  readMins: number;
}

export interface FeedInfo {
  total: number;
  readMins: number;
}

export async function writeFeedCache(feed: FeedResponse): Promise<void> {
  const articles = Object.values(feed.categories).flat();
  const total = articles.length;
  const words = articles.reduce((sum, a) => sum + a.sentences.join(' ').split(/\s+/).length, 0);
  const readMins = Math.max(1, Math.ceil(words / 238));
  FEED_FILE.write(JSON.stringify(feed));
  META_FILE.write(JSON.stringify({ cachedAt: Date.now(), generated: feed.generated, total, readMins }));
}

function computeReadMins(feed: FeedResponse): number {
  const words = Object.values(feed.categories).flat()
    .reduce((sum, a) => sum + a.sentences.join(' ').split(/\s+/).length, 0);
  return Math.max(1, Math.ceil(words / 238));
}

export async function readFeedCache(): Promise<{ feed: FeedResponse; info: FeedInfo } | null> {
  try {
    if (!FEED_FILE.exists || !META_FILE.exists) return null;
    const [feedText, metaText] = await Promise.all([FEED_FILE.text(), META_FILE.text()]);
    const feed: FeedResponse = JSON.parse(feedText);
    const meta: CacheMeta = JSON.parse(metaText);
    return { feed, info: { total: meta.total, readMins: meta.readMins || computeReadMins(feed) } };
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

export function readFeedInfoSync(): FeedInfo | null {
  try {
    if (!META_FILE.exists) return null;
    const meta: CacheMeta = JSON.parse(META_FILE.textSync());
    if (!meta.readMins) return null; // stale cache, let fetchFeed recompute
    return { total: meta.total, readMins: meta.readMins };
  } catch {
    return null;
  }
}
