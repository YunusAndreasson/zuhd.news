import type { FeedResponse } from '../types';
import { createJsonCache } from './json-cache';

const feedCache = createJsonCache<FeedResponse>('zuhd-feed.json');

export const readFeedCache = feedCache.read;
export const writeFeedCache = feedCache.write;
