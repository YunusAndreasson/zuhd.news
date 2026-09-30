import type { Article, Chokepoint, Indicator, TrendsSnapshot } from '@shared/types';
import type { SwipeCard } from '../lib/cards/rank';
import type { CatalogInputs } from '../lib/instrument-catalog';
import { instrumentCardFor } from '../lib/instrument-catalog';
import { storyCharts } from '../lib/story-chart';
import { articleFromStory } from '../lib/story-payload';

const NOW = new Date('2026-09-08T12:00:00Z');

function indicator(over: Partial<Indicator> & Pick<Indicator, 'id'>): Indicator {
  return {
    label: over.id,
    source: 'fred',
    sourceLabel: 'FRED',
    standing: `${over.id} is a thing.`,
    cadence: 'daily',
    values: [100, 110],
    periods: ['Sep 1', 'Sep 8'],
    ...over,
  } as Indicator;
}

const snapshot = (indicators: Indicator[]): TrendsSnapshot => ({
  fetchedAt: '2026-09-08',
  asOf: '2026-09-08',
  indicators,
  events: [],
});

const hormuz = {
  id: 'hormuz',
  name: 'Strait of Hormuz',
  blurb: 'Hormuz blurb',
  lat: 0,
  lng: 0,
  topicTags: [],
  primaryField: 'n_total',
  last7Avg: { n_total: 1 },
  baseline90Avg: { n_total: 4 },
  delta7vs90: { n_total: -0.75 },
  series: { periods: ['Aug 1', 'Aug 2', 'Aug 3'], total: [4, 2, 1] },
  asOf: '2026-09-02',
} as Chokepoint;

const contract = {
  id: 'poly-hormuz-normal',
  kind: 'belief',
  title: 'Hormuz traffic normal by December?',
  reading: '23%',
  why: 'priced',
  series: { values: [40, 23], periods: ['Sep 1', 'Sep 8'], label: 'odds' },
} as SwipeCard;

const inputs = (over: Partial<CatalogInputs> = {}): CatalogInputs => ({
  ranked: [],
  trends: snapshot([
    indicator({ id: 'brent' }),
    indicator({ id: 'wiki-iran', source: 'wikipedia' }),
  ]),
  chokepoints: [hormuz],
  analysis: new Map(),
  articles: [],
  exchanges: [],
  now: NOW,
  ...over,
});

const story = (slug: string, chart?: string) => ({ slug, chart }) as Article;

describe('instrumentCardFor', () => {
  it('reads a strait’s article id as its card, with the 90-day normal to draw', () => {
    const card = instrumentCardFor('cp:hormuz', inputs());
    expect(card?.id).toBe('strait-hormuz');
    expect(card?.kind === 'reading' && card.series?.reference).toBeTruthy();
  });

  it('gives a published series the card the menu would open', () => {
    expect(instrumentCardFor('brent', inputs())?.id).toBe('brent');
  });

  it('takes a contract only from the pool, where its card is built', () => {
    expect(instrumentCardFor('poly-hormuz-normal', inputs())).toBeNull();
    expect(instrumentCardFor('poly-hormuz-normal', inputs({ ranked: [contract] }))).toBe(contract);
  });

  it('draws nothing for what the menu does not list, or the desk has not written about', () => {
    expect(instrumentCardFor('wiki-iran', inputs())).toBeNull();
    expect(instrumentCardFor('no-such-series', inputs())).toBeNull();
    expect(instrumentCardFor('cp:atlantis', inputs())).toBeNull();
    const silent = inputs({ trends: snapshot([indicator({ id: 'brent', standing: undefined })]) });
    expect(instrumentCardFor('brent', silent)).toBeNull();
  });
});

describe('storyCharts', () => {
  it('maps each story naming a series to its card, and skips the rest', () => {
    const charts = storyCharts(
      [story('a', 'cp:hormuz'), story('b'), story('c', 'nope'), story('d', 'poly-hormuz-normal')],
      inputs({ ranked: [contract] }),
    );
    expect([...charts.keys()]).toEqual(['a', 'd']);
    expect(charts.get('d')?.kind).toBe('belief');
  });

  it('builds each id once, so two stories on one series hold one card', () => {
    const charts = storyCharts([story('a', 'brent'), story('b', 'brent')], inputs());
    expect(charts.get('a')).toBe(charts.get('b'));
  });
});

describe('a story fetched by slug', () => {
  it('keeps the chart its build published', () => {
    const resolved = articleFromStory({
      slug: 's',
      title: 'T',
      date: '2026-09-08T00:00:00Z',
      category: 'economy',
      location: null,
      bodyHtml: '<p>One.</p>',
      chart: 'cp:hormuz',
    });
    expect(resolved?.article.chart).toBe('cp:hormuz');
  });
});
