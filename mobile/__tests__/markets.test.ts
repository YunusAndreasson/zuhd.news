import {
  dollarLine,
  dollarWeek,
  type Exchange,
  exchangeCard,
  exchangeDelta,
  exchangeIsStale,
  exchangesOf,
  isMarketsSnapshot,
  type MarketsSnapshot,
  ownMoves,
  stockMarketPlace,
} from '../lib/markets';
const e: Exchange = {
  id: 'test',
  name: 'Test Exchange',
  indexName: 'TEST 100',
  city: 'City',
  iso2: 'SE',
  lat: 59,
  lng: 18,
  level: 100,
  changePct: -1.256,
  asOf: '2026-09-18',
  sourceLabel: 'Provider',
  blurb: 'Index explanation',
  series: {
    periods: ['Sep 17', 'Sep 18', 'Sep 20'],
    values: [101, 100, 100],
    dates: ['2026-09-17', '2026-09-18', '2026-09-20'],
  },
};
const snapshot = (exchanges: unknown[]) => ({ generated: '2026-09-20T00:00:00Z', exchanges });
test('validates coordinates, unique IDs and chart alignment before mapping', () => {
  expect(isMarketsSnapshot(snapshot([e]))).toBe(true);
  for (const invalid of [
    { ...e, lat: 91 },
    { ...e, lng: NaN },
    { ...e, level: '100' },
    { ...e, series: { periods: [], values: [1] } },
    { ...e, asOf: 'bad' },
  ])
    expect(isMarketsSnapshot(snapshot([invalid]))).toBe(false);
  expect(isMarketsSnapshot(snapshot([e, e]))).toBe(false);
});
test('market direction has explicit comparison window and unsigned magnitude', () => {
  expect(exchangeDelta(e)).toMatchObject({
    direction: 'down',
    magnitude: '1.26%',
    window: 'vs prior close',
  });
  expect(exchangeDelta({ ...e, changePct: 0 }).direction).toBe('flat');
  expect(exchangeDelta({ ...e, changePct: 2 }).direction).toBe('up');
});
test('older quotes retain their real date and never invent chart observations', () => {
  const card = exchangeCard(e);
  expect(card).toMatchObject({
    id: 'mkt:test',
    asOf: '2026-09-18',
    sourceLabel: 'Provider',
    why: 'Index explanation',
    series: { values: [101, 100], periods: ['Sep 17', 'Sep 18'] },
  });
  expect(exchangeIsStale(e, Date.parse('2026-09-20'))).toBe(false);
  expect(exchangeIsStale({ ...e, stale: true }, Date.parse('2026-09-20'))).toBe(true);
  expect(exchangeIsStale(e, Date.parse('2026-09-25'))).toBe(true);
});
test('lists the stories its account was written from, and never a tag match', () => {
  const stories = [{ slug: 'a-story', title: 'A Story', date: '2026-09-18' }];
  // With an account, the build's stories are the ones it cites.
  expect(
    exchangeCard({ ...e, recent: 'Fell on a rate rise.', relatedArticles: stories }),
  ).toMatchObject({
    cited: stories,
    related: stories,
  });
  // Without one they only name the country: ranking input, as before.
  const quiet = exchangeCard({ ...e, relatedArticles: stories });
  expect(quiet.related).toEqual(stories);
  expect(quiet.cited).toBeUndefined();
  expect(exchangeCard({ ...e, recent: 'Fell.', relatedArticles: [] }).cited).toBeUndefined();
});
test("names an exchange's market by its country, short where the atlas name is long", () => {
  expect(stockMarketPlace('TR')).toBe('Turkey');
  expect(stockMarketPlace('kr')).toBe('South Korea');
  expect(stockMarketPlace('US')).toBe('US');
  expect(stockMarketPlace('GB')).toBe('UK');
  // Not countries in the atlas at all.
  expect(stockMarketPlace('HK')).toBe('Hong Kong');
  expect(stockMarketPlace('SG')).toBe('Singapore');
  // A code it cannot name keeps the index's own name.
  expect(stockMarketPlace('XQ')).toBeNull();
  expect(stockMarketPlace(undefined)).toBeNull();
});

test('reads an index’s day from its last two sessions, not from a close quoted twice', () => {
  // A build after the close appends the newest quote under the session's own
  // date, and it is the close again: Sydney read 0% on a day it rose 0.6%.
  const sydney: Exchange = {
    ...e,
    asOf: '2026-10-09',
    series: {
      periods: ['Oct 8', 'Oct 9', 'Oct 9'],
      values: [8660.9, 8716.6, 8716.6],
      dates: ['2026-10-08', '2026-10-09', '2026-10-09'],
    },
  };
  expect(ownMoves(sydney).day).toBeCloseTo(0.643, 2);
  // A quote that moved since the close is a reading of its own.
  const open = { ...sydney, series: { ...sydney.series, values: [8660.9, 8716.6, 8760] } };
  expect(ownMoves(open).day).toBeCloseTo(0.498, 2);
});

describe('an index in US dollars', () => {
  // Ten sessions to Friday 9 October, and a rate for every calendar day.
  const dates = [
    '2026-09-28',
    '2026-09-29',
    '2026-09-30',
    '2026-10-01',
    '2026-10-02',
    '2026-10-05',
    '2026-10-06',
    '2026-10-07',
    '2026-10-08',
    '2026-10-09',
  ];
  const periods = [
    'Sep 28',
    'Sep 29',
    'Sep 30',
    'Oct 1',
    'Oct 2',
    'Oct 5',
    'Oct 6',
    'Oct 7',
    'Oct 8',
    'Oct 9',
  ];
  const days = Array.from({ length: 13 }, (_, i) =>
    new Date(Date.UTC(2026, 8, 28 + i)).toISOString().slice(0, 10),
  );
  /** The index rose 3% over the week to the 9th, in lira. */
  const istanbul: Exchange = {
    ...e,
    id: 'bist',
    currency: 'TRY',
    asOf: '2026-10-09',
    level: 103,
    series: { periods, dates, values: [98, 99, 99, 100, 100, 101, 101, 102, 102, 103] },
  };
  /** The lira slid from 40 to the dollar on the 2nd to 40.8 on the 9th. */
  const sliding = days.map((day) => (day < '2026-10-03' ? 40 : day < '2026-10-09' ? 40.4 : 40.8));
  const fx = (perUsd: (number | null)[] = sliding) => ({ dates: days, perUsd });

  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-10T12:00:00Z'));
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it('divides each session by its own day’s rate and reads the week off both lines', () => {
    const week = dollarWeek({ ...istanbul, fx: fx() });
    expect(week?.local).toBeCloseTo(3, 5);
    // 100 lira at 40 was $2.50; 103 at 40.8 is $2.5245.
    expect(week?.usd).toBeCloseTo((103 / 40.8 / 2.5 - 1) * 100, 5);
    expect(dollarLine({ ...istanbul, fx: fx() })).toBe('In US dollars, +1% over 7 days.');
  });

  it('says nothing where the dollar week is the chip’s own, to half a point', () => {
    const steady = days.map(() => 40);
    expect(dollarWeek({ ...istanbul, fx: fx(steady) })?.usd).toBeCloseTo(3, 5);
    expect(dollarLine({ ...istanbul, fx: fx(steady) })).toBeUndefined();
    // 0.4 of a point apart.
    const near = days.map((day) => (day < '2026-10-09' ? 40 : 40.16));
    expect(dollarLine({ ...istanbul, fx: fx(near) })).toBeUndefined();
  });

  it('prints a fall as one, and a week that came to nothing as unchanged', () => {
    const crash = days.map((day) => (day < '2026-10-09' ? 40 : 44));
    expect(dollarLine({ ...istanbul, fx: fx(crash) })).toBe('In US dollars, −6.4% over 7 days.');
    const cancelled = days.map((day) => (day < '2026-10-09' ? 40 : 41.2));
    expect(dollarLine({ ...istanbul, fx: fx(cancelled) })).toBe(
      'In US dollars, unchanged over 7 days.',
    );
  });

  it('has no dollar week for an index priced in dollars, or with no rates', () => {
    expect(dollarWeek(istanbul)).toBeNull();
    expect(dollarWeek({ ...istanbul, currency: 'USD', fx: fx() })).toBeNull();
    expect(dollarWeek({ ...istanbul, currency: undefined, fx: fx() })).toBeNull();
    const undated = { ...istanbul, series: { periods, values: istanbul.series.values }, fx: fx() };
    expect(dollarWeek(undated)).toBeNull();
  });

  it('takes a weekend’s session at the last rate before it, and never bridges a gap', () => {
    // No rate on the 9th itself: the 8th's stands for it.
    const friday = sliding.map((rate, i) => (days[i] === '2026-10-09' ? null : rate));
    expect(dollarWeek({ ...istanbul, fx: fx(friday) })?.usd).toBeCloseTo(
      (103 / 40.4 / 2.5 - 1) * 100,
      5,
    );
    // Rates that begin on the 6th reach back three sessions: no week.
    const late = sliding.map((rate, i) => ((days[i] ?? '') < '2026-10-06' ? null : rate));
    expect(dollarWeek({ ...istanbul, fx: fx(late) })).toBeNull();
    // A hole of a week in the middle: the sessions before it are not used.
    const holed = sliding.map((rate, i) =>
      (days[i] ?? '') >= '2026-09-30' && (days[i] ?? '') <= '2026-10-06' ? null : rate,
    );
    expect(dollarWeek({ ...istanbul, fx: fx(holed) })).toBeNull();
  });

  it('is the card’s caption ahead of a record, and the record ahead of the plain line', () => {
    expect(exchangeCard({ ...istanbul, fx: fx() }).changed).toBe('In US dollars, +1% over 7 days.');
    // Thirty rising sessions with no rates: the record.
    const long = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 9, 9) - (29 - i) * 86_400_000);
      return {
        date: d.toISOString().slice(0, 10),
        period: `${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} ${d.getUTCDate()}`,
      };
    });
    const rising: Exchange = {
      ...istanbul,
      series: {
        dates: long.map((x) => x.date),
        periods: long.map((x) => x.period),
        values: long.map((_, i) => 100 + i),
      },
    };
    expect(exchangeCard(rising).changed).toBe('Highest in a month.');
    expect(exchangeCard(istanbul).changed).toBe('Latest quoted session');
    expect(exchangeCard({ ...istanbul, stale: true, fx: fx() }).changed).toBe(
      'Older quote · last available observation',
    );
  });

  it('puts each exchange’s own rates beside it from the snapshot’s one table', () => {
    const stockholm: Exchange = { ...e, id: 'omx', currency: 'SEK' };
    const snap = (table: unknown): MarketsSnapshot =>
      ({
        generated: '2026-10-10T00:00:00Z',
        exchanges: [istanbul, stockholm],
        fx: table,
      }) as MarketsSnapshot;
    const [first, second] = exchangesOf(snap({ dates: days, perUsd: { TRY: sliding } }));
    expect(first?.fx).toEqual({ dates: days, perUsd: sliding });
    // A currency the table does not rate.
    expect(second?.fx).toBeUndefined();
    // No table, and tables that are not one: the exchanges as they came.
    for (const table of [undefined, null, [], { dates: days }, { dates: [1, 2], perUsd: {} }]) {
      expect(exchangesOf(snap(table))).toEqual([istanbul, stockholm]);
    }
    // A row shorter than the dates, and one that is not rates.
    expect(exchangesOf(snap({ dates: days, perUsd: { TRY: [40, 41] } }))[0]?.fx).toBeUndefined();
    const bad = sliding.map((rate, i) => (i === 3 ? 0 : rate));
    expect(exchangesOf(snap({ dates: days, perUsd: { TRY: bad } }))[0]?.fx).toBeUndefined();
    expect(exchangesOf(null)).toEqual([]);
    // The snapshot is still the published shape with the table on it.
    expect(isMarketsSnapshot(snap({ dates: days, perUsd: { TRY: sliding } }))).toBe(true);
  });
});
