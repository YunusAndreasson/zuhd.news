import type { Article, FeedResponse } from '@shared/types';
import { articleTime, formatTimeAgo } from '../lib/article-utils';
import { NEWS_STALE_AFTER, newsTimelineTimes, selectNewsWidget } from '../lib/news-widget';
import { newsLayoutModel, newsWidgetDesign } from '../lib/news-widget-layout';
import options from '../widgets/news-options.json';

const renderNewsModel =
  typeof newsLayoutModel === 'function'
    ? newsLayoutModel
    : (new Function(`return (${newsLayoutModel})`)() as typeof newsLayoutModel);

const generated = '2026-11-25T10:00:00Z';
const now = Date.parse(generated);
const article = (slug: string, publishedAt: number, addedAt = now): Article => ({
  slug,
  title: slug,
  date: '2026-11-25',
  publishedAt,
  addedAt,
  sources: [],
  source: null,
  sourceUrl: null,
  concepts: [],
  eventCoverage: null,
  location: null,
  lat: null,
  lng: null,
  sentences: [],
});
const feed = (categories: FeedResponse['categories']): FeedResponse => ({
  generated,
  briefing: null,
  categories,
});
it('selects newest by publication, removes duplicate links and caps each section separately', () => {
  const first = { ...article('first', now - 100), lng: 0, lat: 6.5 };
  const result = selectNewsWidget(
    feed({
      science: [article('older', now - 2_000), first],
      economy: [
        first,
        ...Array.from({ length: 8 }, (_, i) => article(`market-${i}`, now - 200 - i)),
      ],
      tech: [article('empty', Number.NaN), { ...first, slug: '../bad' }],
    }),
  );
  expect(result?.stories?.latest?.map((row) => row.title)).toEqual([
    'first',
    'market-0',
    'market-1',
    'market-2',
    'market-3',
    'market-4',
  ]);
  expect(result?.stories?.science?.[0]).toMatchObject({
    place: [0, 6.5],
    url: 'zuhd-news:///a/first',
  });
  expect(result?.stories?.tech).toEqual([]);
});

it('supports every platform configuration choice, including sections with an empty feed', () => {
  const result = selectNewsWidget(feed({}));
  for (const { value } of options.section.values) expect(result?.stories).toHaveProperty(value, []);
  expect(options.images.default).toBe(true);
  expect(options.appearance.values.map(({ value }) => value)).toEqual(['system', 'light', 'dark']);
});

it('schedules the stale boundary once and skips times that already passed', () => {
  const fresh = newsTimelineTimes(now + 5 * 60_000, now);
  expect(fresh[0]).toBe(now + 5 * 60_000);
  expect(fresh[1]).toBe(now + 15 * 60_000);
  expect(fresh.filter((time) => time === now + NEWS_STALE_AFTER)).toHaveLength(1);
  expect(fresh.slice().sort((a, b) => a - b)).toEqual(fresh);
  expect(newsTimelineTimes(now + NEWS_STALE_AFTER, now)[0]).toBe(now + NEWS_STALE_AFTER);
  expect(newsTimelineTimes(now)).toEqual([now]);
});

it('uses each instance’s settings and stays readable as space and text size change', () => {
  const data = selectNewsWidget(
    feed({
      politics: Array.from({ length: 6 }, (_, i) =>
        article(`politics-${i}`, now - 12 * 60_000 - i),
      ),
      science: [article('science-0', now - 12 * 60_000)],
    }),
  );
  if (!data) throw new Error('Expected a headline snapshot');
  const layout = (widthDp: number, heightDp: number, fontScale: number) =>
    renderNewsModel(
      data,
      { configuration: {}, widthDp, heightDp, fontScale, timestamp: now },
      newsWidgetDesign,
    );
  const medium = layout(360, 228, 1);
  expect(layout(170, 228, 1).android.count).toBe(1);
  expect(medium.android.count).toBe(3);
  expect(layout(360, 480, 1).android.count).toBe(6);
  expect(layout(360, 228, 2).android.count).toBeLessThan(medium.android.count);
  expect(medium.stories[0]?.metadata).toBe('Politics · 12 min');
  expect(layout(170, 228, 2).android.splitMetadata).toBe(true);
  expect(layout(170, 228, 2).stories[0]?.ageLabel).toBe('12 min');

  const configuration = { section: 'science', images: false, appearance: 'dark' } as const;
  const other = renderNewsModel(
    data,
    { configuration, colorScheme: 'light', timestamp: now },
    newsWidgetDesign,
  );
  expect(other.stories.map((story) => story.title)).toEqual(['science-0']);
  expect(other.colors).toBe(newsWidgetDesign.ink.dark);
  expect(other.maps).toBe(false);
  expect(medium.stories[0]?.title).toBe('politics-0');
});

it('uses the story list’s publication clock for both a batch and a separate story', () => {
  jest.spyOn(Date, 'now').mockReturnValue(now);
  try {
    const stories = [
      article('lead', now - 35 * 60_000 - 2_000),
      article('same-edition', now - 35 * 60_000 - 12_000),
      article('earlier', now - 52 * 60_000),
    ];
    const data = selectNewsWidget(feed({ politics: stories }));
    if (!data) throw new Error('Expected a headline snapshot');
    const layout = renderNewsModel(data, { configuration: {}, timestamp: now }, newsWidgetDesign);
    expect(layout.stories.map((row) => row.published)).toEqual(stories.map(articleTime));
    expect(layout.stories.map((row) => row.ageLabel)).toEqual(['35 min', '35 min', '52 min']);
    expect(stories.map((row) => formatTimeAgo(articleTime(row)))).toEqual([
      '35m ago',
      '35m ago',
      '52m ago',
    ]);
  } finally {
    jest.restoreAllMocks();
  }
});
