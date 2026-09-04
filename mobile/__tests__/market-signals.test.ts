import { isMarketSignalsSnapshot, type MarketSignalsSnapshot } from '@shared/market-signals';
import { cardVersion } from '../lib/card-history';
import { marketSignalCards } from '../lib/cards/market-signals';

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: { getItemSync: jest.fn(), setItemSync: jest.fn() },
}));
const now = Date.parse('2026-09-04T20:00:00Z');
const snapshot: MarketSignalsSnapshot = {
  version: 1,
  generatedAt: '2026-09-04T19:00:00Z',
  signals: [
    {
      id: 'nasdaq100',
      eventId: 'nasdaq100:2026-09-04:1',
      revision: 'event:1',
      title: 'NASDAQ-100',
      sourceLabel: 'FRED · NASDAQ',
      asOf: '2026-09-04',
      pattern: {
        kind: 'streak',
        sessions: 4,
        changePct: 3.2,
        direction: 1,
        score: 1.6,
        startDate: '2026-08-31',
        endDate: '2026-09-04',
      },
      series: {
        values: [100, 101, 102, 102.5, 103.2],
        dates: ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'],
      },
      facts: 'NASDAQ-100 rose 3.2% over four sessions.',
      commentary: '',
      citations: [],
    },
  ],
};
const signal = snapshot.signals[0];
if (!signal) throw new Error('Missing fixture');
const fixtureSignal = signal;
function firstCard(data = snapshot) {
  const card = marketSignalCards(data, now)[0];
  if (!card) throw new Error('Expected a card');
  return card;
}
test('contract accepts the additive payload and rejects malformed data', () => {
  expect(isMarketSignalsSnapshot(snapshot)).toBe(true);
  expect(isMarketSignalsSnapshot({ ...snapshot, version: 2 })).toBe(false);
  expect(isMarketSignalsSnapshot({ ...snapshot, signals: [fixtureSignal, fixtureSignal] })).toBe(
    false,
  );
  expect(
    isMarketSignalsSnapshot({
      ...snapshot,
      signals: [{ ...fixtureSignal, series: { values: [1, NaN], dates: ['a', 'b'] } }],
    }),
  ).toBe(false);
  expect(
    isMarketSignalsSnapshot({
      ...snapshot,
      signals: [
        {
          ...fixtureSignal,
          citations: [{ slug: 'x', title: 'x', date: '2026-09-04', url: 'javascript:alert(1)' }],
        },
      ],
    }),
  ).toBe(false);
});
test('cards retain neutral semantic color, an exact window, and factual fallback', () => {
  const card = firstCard();
  expect(card.kicker).toBe('Rising streak');
  expect(card.delta).toMatchObject({ direction: 'up', valence: 'neutral', window: '4 sessions' });
  expect(card.why).toBe(fixtureSignal.facts);
});
test('source links and commentary remain attached to the selected signal', () => {
  const card = firstCard({
    ...snapshot,
    signals: [
      {
        ...fixtureSignal,
        commentary: 'Supported context.',
        citations: [
          {
            slug: 'report',
            title: 'Report',
            date: '2026-09-04',
            url: 'https://zuhd.news/a/report',
          },
        ],
      },
    ],
  });
  expect(card.why).toContain('Supported context.');
  expect(card.sources).toEqual([{ label: 'Report', url: 'https://zuhd.news/a/report' }]);
});
test('ordinary chart updates retain viewed revision; editorial updates do not', () => {
  const card = firstCard();
  expect(cardVersion({ ...card, reading: '104', asOf: '2026-09-05' })).toBe(cardVersion(card));
  expect(cardVersion({ ...card, editorialRevision: 'event:2' })).not.toBe(cardVersion(card));
});
test('missing and expired payloads contribute no cards', () => {
  expect(marketSignalCards(null, now)).toEqual([]);
  expect(marketSignalCards(snapshot, now + 8 * 86400000)).toEqual([]);
});
