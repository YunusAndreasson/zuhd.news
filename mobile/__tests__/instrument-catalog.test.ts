import type { Chokepoint, Indicator, TrendEvent, TrendsSnapshot } from '@shared/types';
import type { SwipeCard } from '../lib/cards/rank';
import type { ReadingCard } from '../lib/cards/types';
import {
  buildInstrumentCatalog,
  type CatalogGroup,
  type CatalogInputs,
  type GroupKey,
  instrumentCardFor,
} from '../lib/instrument-catalog';
import type { Company } from '../lib/companies';
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
    expect(kerch?.short).toBe('Kerch');
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

describe('largest companies', () => {
  /** Two closes a week apart, so each has the week the list sorts on. */
  function company(id: string, values: number[], over: Partial<Company> = {}): Company {
    return {
      id,
      name: id,
      about: 'chips',
      symbol: id.toUpperCase(),
      iso2: 'US',
      currency: 'USD',
      currencyName: 'US dollars',
      level: values.at(-1) ?? 0,
      asOf: '2026-09-08',
      sourceLabel: 'Provider',
      blurb: `${id} makes things.`,
      series: { values, periods: ['Sep 1', 'Sep 8'] },
      ...over,
    };
  }

  const inputs = (over: Partial<CatalogInputs> = {}): CatalogInputs => ({
    ranked: [],
    trends: null,
    chokepoints: [],
    analysis: new Map(),
    articles: [],
    exchanges: [exchange('bist', 'TR', [100, 97])],
    now: NOW,
    ...over,
  });

  it('is a group of its own beside the markets, largest week first', () => {
    const groups = buildInstrumentCatalog(
      inputs({ companies: [company('quiet', [100, 101]), company('loud', [100, 120])] }),
    );
    expect(groups.map((g) => g.key)).toEqual(['stocks', 'companies']);
    const list = groups[1];
    expect(list?.title).toBe('largest companies');
    expect(list?.rows.map((r) => r.short)).toEqual(['loud', 'quiet']);
    expect(list?.rows.every((r) => r.weekly)).toBe(true);
    expect(list?.rows[0]?.id).toBe('co:loud');
    expect(list?.wait).toBeUndefined();
  });

  it('is absent where the list was never fetched', () => {
    for (const companies of [undefined, null, []]) {
      expect(buildInstrumentCatalog(inputs({ companies })).map((g) => g.key)).toEqual(['stocks']);
    }
  });

  it('keeps its row while there are no prices yet, whether they are coming or not', () => {
    // A row that gave its place up when the fetch failed moved every row
    // under it, five seconds after the menu opened.
    for (const wait of ['waiting', 'failed'] as const) {
      const groups = buildInstrumentCatalog(inputs({ companies: null, companiesWait: wait }));
      expect(groups.map((g) => g.key)).toEqual(['stocks', 'companies']);
      expect(groups[1]).toMatchObject({ rows: [], wait });
    }
    // Once the prices are there the group is an ordinary one.
    const filled = buildInstrumentCatalog(
      inputs({ companies: [company('a', [100, 110])], companiesWait: 'waiting' }),
    );
    expect(filled[1]?.wait).toBeUndefined();
    expect(filled[1]?.rows).toHaveLength(1);
  });

  it('drops a company with nothing under its chart', () => {
    const groups = buildInstrumentCatalog(
      inputs({ companies: [company('bare', [100, 110], { blurb: '' }), company('a', [100, 110])] }),
    );
    expect(groups[1]?.rows.map((r) => r.short)).toEqual(['a']);
  });

  it('leaves `a share` to the line over the list, and keeps a currency no mark says', () => {
    const groups = buildInstrumentCatalog(
      inputs({
        companies: [
          company('dollars', [100, 120]),
          company('won', [100, 110], { currency: 'KRW', currencyName: 'Korean won' }),
        ],
      }),
    );
    const [dollars, won] = groups[1]?.rows ?? [];
    expect(dollars?.note).toBe('');
    expect(won?.note).toBe('Korean won');
    // The card a row opens still says it in full.
    expect(dollars?.card?.readingNote).toBe('a share');
    expect(won?.card?.readingNote).toBe('Korean won a share');
    // No other list's rows carry a line of their own.
    expect(groups[0]?.rows.every((r) => r.note === undefined)).toBe(true);
  });

  it('never enters the stock markets list or its tally of exchanges', () => {
    const groups = buildInstrumentCatalog(inputs({ companies: [company('a', [100, 110])] }));
    expect(groups[0]?.rows.map((r) => r.id)).toEqual(['mkt:bist']);
    expect(groups[1]?.rows[0]?.exchange).toBeUndefined();
  });

  it('answers for a company by its card id', () => {
    const all = inputs({ companies: [company('a', [100, 110])] });
    expect(instrumentCardFor('co:a', all)?.title).toBe('a');
    expect(instrumentCardFor('co:missing', all)).toBeNull();
    expect(instrumentCardFor('co:a', inputs())).toBeNull();
  });
});
