import type { FeedResponse } from '../types';
import { createJsonCache } from './json-cache';
import { isFeedResponse } from './validate';

const feedCache = createJsonCache<FeedResponse>('zuhd-feed.json', isFeedResponse);

export const readFeedCache = feedCache.read;
export const writeFeedCache = feedCache.write;
