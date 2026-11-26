import type { Category, FeedResponse } from '@shared/types';
import type { AppearanceMode } from '../constants/theme';
import options from '../widgets/news-options.json';
import { withoutAmbiguousArticles } from './article-identity';
import { articleTime } from './article-utils';

export type NewsSection = 'latest' | Category;
export interface NewsConfiguration {
  section?: NewsSection;
  images?: boolean;
  appearance?: AppearanceMode;
}
export interface NewsStory {
  title: string;
  url: string;
  published: number;
  category: Category;
  place?: readonly [number, number];
  image?: string;
}
export interface NewsWidgetProps {
  generated?: number;
  offline?: boolean;
  error?: boolean;
  loading?: boolean;
  stories?: Partial<Record<NewsSection, NewsStory[]>>;
}

export const NEWS_SECTIONS = options.section.values.map(({ value }) => value as NewsSection);
export const NEWS_SECTION_NAMES = Object.fromEntries(
  options.section.values.map(({ value, name }) => [value, name]),
) as Record<NewsSection, string>;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
export const NEWS_STALE_AFTER = 8 * HOUR;
export const NEWS_HOME = 'zuhd-news:///';

export function selectNewsWidget(feed: FeedResponse): NewsWidgetProps | undefined {
  const generated = Date.parse(feed.generated);
  if (!Number.isFinite(generated)) return;
  const { categories } = withoutAmbiguousArticles(feed);
  const all: NewsStory[] = [];
  for (const value of NEWS_SECTIONS) {
    if (value === 'latest') continue;
    for (const article of categories[value] ?? []) {
      const published = articleTime(article);
      const title = article.title.trim();
      if (!title || !/^[a-z0-9][a-z0-9-]*$/i.test(article.slug) || !Number.isFinite(published))
        continue;
      const { lng, lat } = article;
      const place =
        typeof lng === 'number' &&
        Math.abs(lng) <= 180 &&
        typeof lat === 'number' &&
        Math.abs(lat) <= 90
          ? ([lng, lat] as const)
          : undefined;
      all.push({
        title,
        url: `zuhd-news:///a/${article.slug}`,
        published,
        category: value,
        ...(place && { place }),
      });
    }
  }
  all.sort((a, b) => b.published - a.published || (a.url < b.url ? -1 : Number(a.url > b.url)));
  const stories: NonNullable<NewsWidgetProps['stories']> = {};
  for (const section of NEWS_SECTIONS) {
    const seen = new Set<string>();
    const selected: NewsStory[] = [];
    for (const story of all) {
      if ((section !== 'latest' && story.category !== section) || seen.has(story.url)) continue;
      seen.add(story.url);
      selected.push(story);
      if (selected.length === 6) break;
    }
    stories[section] = selected;
  }
  return { generated, stories };
}

export function newsTimelineTimes(now: number, generated?: number): number[] {
  const times = [now];
  const stale = generated === undefined ? now : Math.min(generated, now) + NEWS_STALE_AFTER;
  // WidgetKit applies dates when its budget permits. Align early redraws to
  // the clock, then taper off and give staleness its own entry.
  const interval = 15 * MINUTE;
  for (
    let t = Math.ceil((now + 1) / interval) * interval;
    t < stale && t < now + HOUR;
    t += interval
  )
    times.push(t);
  for (let t = now + HOUR; t < stale; t += HOUR) times.push(t);
  if (stale > now) times.push(stale);
  for (const t of [now + 12 * HOUR, now + 24 * HOUR, now + 48 * HOUR])
    if (generated !== undefined && t > times.at(-1)!) times.push(t);
  return times;
}
