import {
  type Exchange,
  exchangeCard,
  exchangeDelta,
  exchangeIsStale,
  isMarketsSnapshot,
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
