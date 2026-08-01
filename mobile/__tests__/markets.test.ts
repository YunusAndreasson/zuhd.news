import type { MarketExchange } from '@shared/types';
import {
  formatChangePct,
  formatLevel,
  MARKET_FLAT_BAND_PCT,
  marketDirection,
  sessionState,
} from '../lib/markets';
import { isMarketsSnapshot } from '../lib/validate';

// Riyadh: Sunday–Thursday, 10:00–15:00 Arabia Standard Time (UTC+3, no DST).
// The Gulf pair is the whole reason `days` is per-exchange, so both halves of
// it are pinned here — a regression that applied one rule to both would look
// completely reasonable in the diff.
const tadawul: Pick<MarketExchange, 'tz' | 'sessionStart' | 'sessionEnd' | 'days'> = {
  tz: 'Asia/Riyadh',
  sessionStart: '10:00',
  sessionEnd: '15:00',
  days: [0, 1, 2, 3, 4],
};

// Dubai moved to Monday–Friday in 2022.
const dfm: Pick<MarketExchange, 'tz' | 'sessionStart' | 'sessionEnd' | 'days'> = {
  tz: 'Asia/Dubai',
  sessionStart: '10:00',
  sessionEnd: '15:00',
  days: [1, 2, 3, 4, 5],
};

describe('marketDirection', () => {
  it('buckets a clear rise and a clear fall', () => {
    expect(marketDirection(1.243)).toBe('up');
    expect(marketDirection(-1.696)).toBe('down');
  });

  it('treats a move inside the flat band as flat', () => {
    expect(marketDirection(0)).toBe('flat');
    expect(marketDirection(MARKET_FLAT_BAND_PCT)).toBe('flat');
    expect(marketDirection(-MARKET_FLAT_BAND_PCT)).toBe('flat');
    expect(marketDirection(0.04)).toBe('flat');
  });

  it('is strictly outside the band, not at it', () => {
    expect(marketDirection(MARKET_FLAT_BAND_PCT + 0.001)).toBe('up');
    expect(marketDirection(-MARKET_FLAT_BAND_PCT - 0.001)).toBe('down');
  });

  it('degrades a non-finite change to flat rather than throwing', () => {
    expect(marketDirection(Number.NaN)).toBe('flat');
    expect(marketDirection(Number.POSITIVE_INFINITY)).toBe('flat');
  });
});

describe('sessionState', () => {
  // A Sunday. Riyadh trades, Dubai does not — the exact case a Gulf-wide rule
  // gets wrong.
  it('splits Riyadh and Dubai on a Sunday', () => {
    const sundayNoonRiyadh = new Date('2026-08-02T09:00:00Z'); // 12:00 in Riyadh
    expect(sessionState(tadawul, sundayNoonRiyadh)).toBe('open');
    expect(sessionState(dfm, sundayNoonRiyadh)).toBe('closed');
  });

  it('splits them again on a Friday', () => {
    const fridayNoon = new Date('2026-07-31T08:00:00Z'); // 11:00 in Riyadh/Dubai
    expect(sessionState(tadawul, fridayNoon)).toBe('closed');
    expect(sessionState(dfm, fridayNoon)).toBe('open');
  });

  it('closes outside session hours on a trading day', () => {
    // 08:00 in Riyadh, a Sunday — trading day, before the open.
    expect(sessionState(tadawul, new Date('2026-08-02T05:00:00Z'))).toBe('closed');
    // 16:00 in Riyadh, same day — after the close.
    expect(sessionState(tadawul, new Date('2026-08-02T13:00:00Z'))).toBe('closed');
  });

  it('treats the closing minute as closed and the opening minute as open', () => {
    expect(sessionState(tadawul, new Date('2026-08-02T07:00:00Z'))).toBe('open'); // 10:00
    expect(sessionState(tadawul, new Date('2026-08-02T12:00:00Z'))).toBe('closed'); // 15:00
  });

  it('reads the exchange timezone, not the device one', () => {
    // 23:00 UTC Saturday is 02:00 Sunday in Riyadh — a trading day, but hours
    // before the open. A UTC-based implementation would call this Saturday.
    expect(sessionState(tadawul, new Date('2026-08-01T23:00:00Z'))).toBe('closed');
    // 07:30 UTC Sunday is 10:30 in Riyadh — open. Same instant is 07:30 in
    // London, well before any European open.
    expect(sessionState(tadawul, new Date('2026-08-02T07:30:00Z'))).toBe('open');
  });

  it('says unknown rather than guessing on a malformed session or zone', () => {
    expect(sessionState({ ...tadawul, sessionStart: '' }, new Date())).toBe('unknown');
    expect(sessionState({ ...tadawul, sessionEnd: '25:00' }, new Date())).toBe('unknown');
    expect(sessionState({ ...tadawul, tz: 'Not/AZone' }, new Date())).toBe('unknown');
  });
});

describe('formatChangePct', () => {
  it('signs a rise with a plus and a fall with a real minus sign', () => {
    expect(formatChangePct(1.243)).toBe('+1.24%');
    // U+2212, not a hyphen.
    expect(formatChangePct(-1.696)).toBe('−1.70%');
  });

  it('prints an unsigned zero rather than a signed one', () => {
    expect(formatChangePct(0)).toBe('0.00%');
    expect(formatChangePct(0.001)).toBe('0.00%');
    expect(formatChangePct(-0.001)).toBe('0.00%');
  });

  it('degrades a non-finite change to a dash', () => {
    expect(formatChangePct(Number.NaN)).toBe('—');
  });
});

describe('formatLevel', () => {
  it('groups thousands and fixes two decimals', () => {
    expect(formatLevel(10720.28)).toBe('10,720.28');
    expect(formatLevel(7.9)).toBe('7.90');
  });
});

describe('isMarketsSnapshot', () => {
  const full: MarketExchange = {
    id: 'tadawul',
    name: 'Saudi Exchange',
    indexName: 'TASI',
    city: 'Riyadh',
    iso2: 'SA',
    lat: 24.7136,
    lng: 46.6753,
    level: 10720.28,
    changePct: 0.147,
    currency: 'SAR',
    tz: 'Asia/Riyadh',
    sessionStart: '10:00',
    sessionEnd: '15:00',
    days: [0, 1, 2, 3, 4],
    asOf: '2026-08-01T12:00:00Z',
    sourceLabel: 'Yahoo Finance · SAU',
    series: { periods: ['Jul 30', 'Jul 31'], values: [10700, 10720.28] },
    blurb: 'The Saudi Exchange.',
    relatedArticles: [],
  };

  // The whole point of one validator over two endpoints: if the lite shape
  // failed here, the fallback in `useMarkets` could not reuse it and a missing
  // lite endpoint would take the layer down instead of degrading it.
  it('accepts both the full and the lite shape', () => {
    expect(isMarketsSnapshot({ generated: 'now', exchanges: [full] })).toBe(true);
    const { series: _s, blurb: _b, relatedArticles: _r, ...lite } = full;
    expect(isMarketsSnapshot({ generated: 'now', exchanges: [lite] })).toBe(true);
  });

  it('accepts an empty exchange list', () => {
    expect(isMarketsSnapshot({ generated: 'now', exchanges: [] })).toBe(true);
  });

  it('rejects a payload missing the fields the globe needs', () => {
    const { lat: _lat, ...noLat } = full;
    expect(isMarketsSnapshot({ generated: 'now', exchanges: [noLat] })).toBe(false);
    const { days: _days, ...noDays } = full;
    expect(isMarketsSnapshot({ generated: 'now', exchanges: [noDays] })).toBe(false);
    expect(isMarketsSnapshot({ exchanges: [full] })).toBe(false);
    expect(isMarketsSnapshot(null)).toBe(false);
  });

  it('rejects a series whose periods and values disagree in type', () => {
    expect(
      isMarketsSnapshot({
        generated: 'now',
        exchanges: [{ ...full, series: { periods: ['a'], values: ['b'] } }],
      }),
    ).toBe(false);
  });
});
