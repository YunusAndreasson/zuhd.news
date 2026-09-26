import type { Chokepoint, Indicator, TrendEvent, TrendsSnapshot } from '@shared/types';
import type { SwipeCard } from '../lib/cards/rank';
import type { ReadingCard } from '../lib/cards/types';
import {
  buildInstrumentCatalog,
  type CatalogGroup,
  type CatalogInputs,
  type GroupKey,
} from '../lib/instrument-catalog';
import type { Exchange } from '../lib/markets';

const NOW = new Date('2026-09-08T12:00:00Z');

/** Two observations a week apart, so a reading has the strip's seven-day
 *  move. `standing` is set: without the desk's paragraph a card fails the
 *  gate, which one test below checks on purpose. */
function indicator(over: Partial<Indicator> & Pick<Indicator, 'id'>): Indicator {
  const values = over.values ?? [100, 110];
  return {
    label: over.id,
    source: 'fred',
    sourceLabel: 'FRED',
    standing: `${over.id} is a thing.`,
    cadence: 'daily',
    values,
    periods: over.periods ?? ['Sep 1', 'Sep 8'],
    ...over,
  } as Indicator;
}

/** A monthly series: month labels, which have no week. */
const monthly = (over: Partial<Indicator> & Pick<Indicator, 'id'>) =>
  indicator({ cadence: 'monthly', periods: ['Jul 2026', 'Aug 2026'], ...over });

function snapshot(indicators: Indicator[], events: TrendEvent[] = []): TrendsSnapshot {
  return { fetchedAt: '2026-09-08', asOf: '2026-09-08', indicators, events };
}

function strait(id: string, name: string, total: number[]): Chokepoint {
  return {
    id,
    name,
    blurb: `${name} blurb`,
    lat: 0,
    lng: 0,
    topicTags: [],
    primaryField: 'n_total',
    last7Avg: { n_total: total.at(-1) ?? null },
    baseline90Avg: { n_total: total[0] ?? null },
    delta7vs90: { n_total: -0.1 },
    series: { periods: total.map((_, i) => `Aug ${i + 1}`), total },
    asOf: '2026-09-02',
  } as Chokepoint;
}

function exchange(id: string, iso2: string, values: number[]): Exchange {
  return {
    id,
    name: `${id} exchange`,
    indexName: id.toUpperCase(),
    city: `${id} city`,
    iso2,
    lat: 1,
    lng: 2,
    level: values.at(-1) ?? 0,
    changePct: 0.1,
    asOf: '2026-09-08',
    sourceLabel: 'Provider',
    blurb: `${id} blurb`,
    series: { values, periods: ['Sep 1', 'Sep 8'] },
  };
}

function event(id: string, date: string): TrendEvent {
  return {
    id,
    title: id,
    institution: 'Federal Reserve',
    kind: 'central-bank',
    date,
    standing: `${id} decides.`,
  } as TrendEvent;
}

const build = (over: Partial<CatalogInputs>): CatalogGroup[] =>
  buildInstrumentCatalog({
    ranked: [],
    trends: null,
    chokepoints: [],
    analysis: new Map(),
    articles: [],
    exchanges: [],
    now: NOW,
    ...over,
  });

const group = (groups: CatalogGroup[], key: GroupKey) => groups.find((g) => g.key === key);
const ids = (groups: CatalogGroup[], key: GroupKey) => group(groups, key)?.rows.map((r) => r.id);

describe('buildInstrumentCatalog', () => {
  it('lists every published series in a group, and leaves out only what it means to', () => {
    const trends = snapshot([
      indicator({ id: 'brent' }),
      indicator({ id: 'wti' }),
      indicator({ id: 'sp500' }),
      indicator({ id: 'btc', source: 'crypto' }),
      indicator({ id: 'fx-egp', source: 'oer', unit: 'EGP / USD' }),
      indicator({ id: 'poly-x', source: 'polymarket', unit: '%' }),
      indicator({ id: 'wiki-iran', source: 'wikipedia' }),
      indicator({ id: 'portwatch-hormuz-tanker', source: 'portwatch' }),
      indicator({ id: 'stocks:COIN', source: 'stocks' }),
    ]);
    const groups = build({ trends });
    expect(ids(groups, 'commodities')).toEqual(['brent', 'wti']);
    expect(ids(groups, 'stocks')).toEqual(['sp500']);
    expect(ids(groups, 'economy')).toEqual(['btc']);
    expect(ids(groups, 'currencies')).toEqual(['fx-egp']);
    const listed = groups.flatMap((g) => g.rows.map((r) => r.id));
    for (const left of ['wiki-iran', 'portwatch-hormuz-tanker', 'stocks:COIN']) {
      expect(listed).not.toContain(left);
    }
  });

  it('lists a series the table has never heard of by its source, so it cannot vanish', () => {
    const groups = build({
      trends: snapshot([
        indicator({ id: 'new-fred-series' }),
        indicator({ id: 'fx-kes', source: 'oer', unit: 'KES / USD' }),
      ]),
    });
    expect(ids(groups, 'economy')).toEqual(['new-fred-series']);
    expect(ids(groups, 'currencies')).toEqual(['fx-kes']);
  });

  it('reuses the pool’s card as the same object, so a row opens what its strip slot opens', () => {
    const trends = snapshot([indicator({ id: 'fx-egp', source: 'oer', unit: 'EGP / USD' })]);
    const mover = {
      id: 'fx-egp-mover',
      kind: 'reading',
      title: 'Egyptian pound',
      reading: '51.8',
      why: 'moved',
      series: { values: [100, 110], periods: ['Sep 1', 'Sep 8'] },
    } as SwipeCard;
    const rows = group(build({ trends, ranked: [mover] }), 'currencies')?.rows ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.card).toBe(mover);
  });

  it('quotes a currency the way its holder reads it: a rate up is the currency down', () => {
    const trends = snapshot([indicator({ id: 'fx-egp', source: 'oer', unit: 'EGP / USD' })]);
    const row = group(build({ trends }), 'currencies')?.rows[0];
    expect(row?.weekly).toBe(true);
    expect(row?.move?.direction).toBe('down');
  });

  it('lets a market signal stand for its exchange, keeping the exchange for its city', () => {
    const bist = exchange('bist', 'TR', [100, 95]);
    const signal = {
      id: 'market-signal:mkt:bist',
      kind: 'reading',
      title: 'BIST 100',
      reading: '9,500',
      why: 'fell',
      series: { values: [100, 95], periods: ['Sep 1', 'Sep 8'] },
    } as SwipeCard;
    const rows = group(build({ exchanges: [bist], ranked: [signal] }), 'stocks')?.rows ?? [];
    expect(rows.map((r) => r.id)).toEqual(['market-signal:mkt:bist']);
    expect(rows[0]?.exchange).toBe(bist);
    expect(rows[0]?.short).toBe('Turkey stocks');
  });

  it('lists an index once, as its exchange, when an exchange quotes it', () => {
    const nyse = { ...exchange('nyse', 'US', [100, 101]), indexName: 'S&P 500' };
    const groups = build({
      exchanges: [nyse],
      trends: snapshot([
        indicator({ id: 'sp500', label: 'S&P 500' }),
        indicator({ id: 'nasdaq100', label: 'NASDAQ-100' }),
      ]),
    });
    expect(ids(groups, 'stocks')?.sort()).toEqual(['mkt:nyse', 'nasdaq100']);
  });

  it('lists every strait the globe draws, with a row even where there is nothing to chart', () => {
    const groups = build({
      chokepoints: [strait('hormuz', 'Strait of Hormuz', [40, 30]), strait('kerch', 'Kerch', [])],
    });
    const rows = group(groups, 'straits')?.rows ?? [];
    expect(rows.map((r) => r.id).sort()).toEqual(['strait-hormuz', 'strait-kerch']);
    const kerch = rows.find((r) => r.id === 'strait-kerch');
    expect(kerch?.card).toBeNull();
    expect(kerch?.short).toBe('Kerch ships');
  });

  it('drops a series the desk has written nothing about', () => {
    const groups = build({
      trends: snapshot([
        indicator({ id: 'wti' }),
        indicator({ id: 'copper', standing: undefined }),
      ]),
    });
    expect(ids(groups, 'commodities')).toEqual(['wti']);
  });

  it('sorts by the week’s move, largest first, and puts a month after every week', () => {
    const groups = build({
      trends: snapshot([
        monthly({ id: 'wheat' }),
        indicator({ id: 'brent', values: [100, 101] }),
        indicator({ id: 'wti', values: [100, 90] }),
      ]),
    });
    expect(ids(groups, 'commodities')).toEqual(['wti', 'brent', 'wheat']);
  });

  it('moves a published rate in points, not in a percentage of itself', () => {
    const groups = build({
      trends: snapshot([monthly({ id: 'fed-funds', unit: '%', values: [4, 3.75] })]),
    });
    const card = group(groups, 'economy')?.rows[0]?.card as ReadingCard | undefined;
    expect(card?.delta).toMatchObject({ direction: 'down', magnitude: '0.25 points' });
    // Coloured like any move: `unit: 'points'` is a contract's, which stays slate.
    expect(card?.delta?.unit).toBeUndefined();
  });

  it('lists every date ahead, not only the deck’s nearest four', () => {
    const dates = [
      '2026-09-10',
      '2026-09-20',
      '2026-10-01',
      '2026-10-28',
      '2026-12-09',
      '2026-12-18',
    ];
    const groups = build({
      trends: snapshot(
        [],
        [event('past', '2026-09-01'), ...dates.map((d, i) => event(`e${i}`, d))],
      ),
    });
    expect(ids(groups, 'calendar')).toEqual(dates.map((_, i) => `event-e${i}`));
  });

  it('keeps every card the pool holds, so nothing the strip opens is missing', () => {
    const nisab = {
      id: 'nisab',
      kind: 'reading',
      title: 'Nisab',
      reading: '$6,000',
      why: 'zakat',
    } as SwipeCard;
    const belief = {
      id: 'poly-x',
      kind: 'belief',
      title: 'Something?',
      reading: '62%',
      why: 'priced',
      series: { values: [50, 62], periods: ['Sep 1', 'Sep 8'] },
    } as SwipeCard;
    const groups = build({ ranked: [nisab, belief] });
    expect(ids(groups, 'commodities')).toEqual(['nisab']);
    expect(ids(groups, 'predictions')).toEqual(['poly-x']);
  });

  it('leaves an empty group out rather than offering a row that opens nothing', () => {
    expect(build({}).map((g) => g.key)).toEqual([]);
  });
});
