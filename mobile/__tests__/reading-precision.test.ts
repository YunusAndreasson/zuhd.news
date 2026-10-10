import type { Indicator, TrendsSnapshot } from '@shared/types';
import {
  deltaOf,
  formatRate,
  formatReading,
  formatSignedRatePoints,
  isPolicyRate,
  rateDecimals,
  spokenDelta,
} from '../lib/cards/format';
import {
  currencyCard,
  indicatorCard,
  indicatorReading,
  quotedInDollars,
} from '../lib/cards/markets';
import type { SwipeCard } from '../lib/cards/rank';
import { gaugeMove, indicatorMove, WEEK_WINDOW } from '../lib/cards/week-move';
import { listedSeries } from '../lib/instrument-catalog';

// A reading is printed as its market or its agency quotes it: an exchange
// rate to the place it trades at, the euro in dollars, inflation to the one
// decimal it is published to.

/** Eight days, so the newest has an observation exactly seven days back. */
const DAYS = ['Oct 2', 'Oct 3', 'Oct 4', 'Oct 5', 'Oct 6', 'Oct 7', 'Oct 8', 'Oct 9'];
const NOW = Date.UTC(2026, 9, 10);

function indicator(over: Partial<Indicator> & Pick<Indicator, 'id' | 'values'>): Indicator {
  return {
    label: over.id,
    source: 'fred',
    sourceLabel: 'FRED',
    periods: over.values.length === DAYS.length ? DAYS : over.values.map((_, i) => `p${i}`),
    asOf: '2026-10-09',
    ...over,
  } as Indicator;
}

const fx = (id: string, label: string, code: string, values: number[]): Indicator =>
  indicator({ id, label, source: 'oer', unit: `${code} / USD`, cadence: 'daily', values });

/** The lira lost ground over the week; the euro gained it. Both as the feed
 *  publishes them: so many to one US dollar. */
const LIRA = fx(
  'fx-try',
  'Turkish lira',
  'TRY',
  [48.9, 48.95, 49.0, 49.1, 49.15, 49.2, 49.3, 49.221304],
);
const EURO = fx('fx-eur', 'Euro', 'EUR', [0.9, 0.899, 0.898, 0.897, 0.895, 0.894, 0.893, 0.892618]);

const snapshot = (indicators: Indicator[]): TrendsSnapshot => ({
  fetchedAt: '2026-10-10',
  asOf: '2026-10-10',
  indicators,
});
const card = (ind: Indicator) => currencyCard(snapshot([ind]), new Map(), [], ind);

describe('an exchange rate at the precision a market quotes it', () => {
  it('keeps four places under ten, two under a thousand and none above', () => {
    expect(formatRate(49.221304)).toBe('49.22');
    expect(formatRate(158.2861)).toBe('158.29');
    expect(formatRate(6.6927)).toBe('6.6927');
    expect(formatRate(1.1203)).toBe('1.1203');
    expect(formatRate(1329)).toBe('1,329');
    expect(formatRate(17891.4)).toBe('17,891');
    expect(formatRate(89560.55)).toBe('89,561');
    expect(formatRate(Number.NaN)).toBe('—');
  });

  it('prints a currency per dollar, in words and never as a pair of codes', () => {
    const lira = card(LIRA);
    // It read `49` / `TRY to the dollar`, on every day of a month the lira fell in.
    expect(lira).toMatchObject({
      reading: '49.22',
      readingNote: 'per dollar',
      title: 'Turkish lira',
    });
    // Drawn turned over, and saying so: the rate rises as the lira falls.
    expect(lira?.series).toMatchObject({
      label: 'per US dollar · up is stronger',
      values: LIRA.values,
      inverted: true,
    });
    expect(lira?.series?.unit).toBeUndefined();
    expect(lira?.delta).toMatchObject({ direction: 'down', window: 'weaker since Oct 2' });
  });

  it('quotes the euro in dollars, and charts it that way', () => {
    const euro = card(EURO);
    // It read `0.89` / `EUR to the dollar`.
    expect(euro).toMatchObject({ reading: '$1.1203', readingNote: 'per euro' });
    expect(euro?.series).toMatchObject({ label: 'US dollars per euro', unit: '$' });
    // The euro's series is its own value already: nothing to turn over.
    expect(euro?.series?.inverted).toBeUndefined();
    expect(euro?.series?.values[0]).toBeCloseTo(1 / 0.9, 5);
    expect(euro?.series?.values.at(-1)).toBe(1.1203);
    // The move is the euro's own whichever way it is quoted.
    expect(euro?.delta).toMatchObject({ direction: 'up', window: 'stronger since Oct 2' });
    expect(quotedInDollars('fx-eur')).toBe(true);
    expect(quotedInDollars('fx-eur-mover')).toBe(true);
    expect(quotedInDollars('fx-try')).toBe(false);
  });

  it('reads each card’s week off the series it charts, and inverts the euro’s no second time', () => {
    const lira = gaugeMove(card(LIRA) as SwipeCard, NOW);
    // 48.9 → 49.22 to the dollar is the lira down 0.7%.
    expect(lira?.delta).toMatchObject({
      direction: 'down',
      magnitude: '0.7%',
      window: WEEK_WINDOW,
    });
    const euro = gaugeMove(card(EURO) as SwipeCard, NOW);
    // 0.9 → 0.8926 to the dollar is $1.1111 → $1.1203: the euro up 0.8%.
    expect(euro?.delta).toMatchObject({ direction: 'up', magnitude: '0.8%', window: WEEK_WINDOW });
    expect(euro?.pct).toBeCloseTo((0.9 / 0.892618 - 1) * 100, 3);
    // The mover slot's card carries another id and is the same card.
    const slot = currencyCard(snapshot([EURO]), new Map(), [], EURO, 'fx-eur-mover');
    expect(gaugeMove(slot as SwipeCard, NOW)?.delta.direction).toBe('up');
  });
});

describe('the sheet a story’s mention opens', () => {
  it('prints the reading its card prints', () => {
    expect(indicatorReading(LIRA, 49.221304)).toMatchObject({
      reading: '49.22',
      note: 'per dollar',
    });
    expect(indicatorReading(EURO, 0.892618)).toMatchObject({
      reading: '$1.1203',
      note: 'per euro',
      series: { unit: '$' },
    });
    const brent = indicator({ id: 'brent', unit: '$/bbl', values: [100.2, 104.72] });
    expect(indicatorReading(brent, 104.72)).toMatchObject({ reading: '$105', note: 'a barrel' });
    const tenYear = indicator({ id: 'us-10y', unit: '%', values: [5.28, 5.22] });
    expect(indicatorReading(tenYear, 5.22)).toMatchObject({ reading: '5.22%' });
    expect(indicatorReading(tenYear, 5.22).note).toBeUndefined();
    const inflation = indicator({ id: 'us-cpi', unit: '%', decimals: 1, values: [3.3, 3.4] });
    expect(indicatorReading(inflation, 3.4)).toMatchObject({
      reading: '3.4%',
      note: 'from a year earlier',
    });
    // A contract's price is a whole per cent.
    const contract = indicator({ id: 'poly-x', source: 'polymarket', unit: '%', values: [71, 78] });
    expect(indicatorReading(contract, 78).reading).toBe('78%');
  });

  it('moves the quantity it prints: the rate, and the euro in dollars', () => {
    // The sheet prints lira to the dollar, and that number rose.
    expect(indicatorMove(LIRA, NOW)).toMatchObject({ direction: 'up', magnitude: '0.7%' });
    // It prints dollars to the euro, and that rose too.
    expect(indicatorMove(EURO, NOW)).toMatchObject({ direction: 'up', magnitude: '0.8%' });
  });
});

describe('a rate at the places it is published to', () => {
  const MONTHS = [
    'Aug 2025',
    'Sep 2025',
    'Oct 2025',
    'Nov 2025',
    'Dec 2025',
    'Jan 2026',
    'Feb 2026',
    'Mar 2026',
    'Apr 2026',
    'May 2026',
    'Jun 2026',
    'Jul 2026',
    'Aug 2026',
  ];
  const monthly = (id: string, values: number[], decimals?: number): Indicator =>
    indicator({ id, unit: '%', cadence: 'monthly', values, periods: MONTHS, decimals });

  it('is two unless the series says otherwise', () => {
    expect(rateDecimals({})).toBe(2);
    expect(rateDecimals({ decimals: 1 })).toBe(1);
    expect(rateDecimals({ decimals: 0 })).toBe(0);
    // Nothing a feed could send prints a rate to nine places.
    expect(rateDecimals({ decimals: 9 })).toBe(2);
    expect(formatReading(4.69, '%')).toBe('4.69');
    expect(formatReading(3.4, '%', 1)).toBe('3.4');
    // The places are a percentage's; a price keeps its own rule.
    expect(formatReading(4352, '$/oz', 1)).toBe('4,352');
  });

  it('moves in points to the same places, and is flat below them', () => {
    expect(deltaOf(0.1, { unit: 'rate', decimals: 1 })).toMatchObject({
      direction: 'up',
      magnitude: '0.1 points',
      unit: 'rate',
    });
    expect(deltaOf(0.04, { unit: 'rate', decimals: 1 })?.direction).toBe('flat');
    expect(deltaOf(0.04, { unit: 'rate' })).toMatchObject({ magnitude: '0.04 points' });
    expect(formatSignedRatePoints(-0.3, 1)).toBe('−0.3 points');
    expect(formatSignedRatePoints(0.25)).toBe('+0.25 points');
  });

  it('prints inflation to one decimal: the reading, the month’s move and the year’s', () => {
    const values = [3.2, 3.2, 3.3, 3.3, 3.4, 3.5, 3.6, 3.8, 3.8, 4.2, 3.5, 3.3, 3.4];
    const cpi = indicatorCard(
      snapshot([monthly('us-cpi', values, 1)]),
      new Map(),
      [],
      'us-cpi',
      'prices',
    );
    expect(cpi).toMatchObject({
      reading: '3.4%',
      readingNote: 'from a year earlier',
      delta: { direction: 'up', magnitude: '0.1 points', window: 'on the month' },
      changed: '+0.2 points against a year ago.',
    });
    expect(cpi?.series?.decimals).toBe(1);
  });

  it('keeps a policy rate at two, and says which end of the Fed’s range it is', () => {
    const values = [4.5, 4.5, 4.25, 4.25, 4, 4, 3.75, 3.75, 3.75, 3.75, 3.75, 3.75, 4];
    const fed = indicatorCard(
      snapshot([monthly('fed-funds', values)]),
      new Map(),
      [],
      'fed-funds',
      'US central bank',
    );
    expect(fed).toMatchObject({
      reading: '4.00%',
      readingNote: 'upper bound of the target range',
      delta: { direction: 'up', magnitude: '0.25 points' },
      changed: '−0.50 points against a year ago.',
    });
    expect(fed?.series?.decimals).toBeUndefined();
  });
});

describe('a move in points, spoken', () => {
  it('says percentage points for a rate and a contract, and not for an index', () => {
    const rate = deltaOf(0.09, { unit: 'rate', window: WEEK_WINDOW });
    expect(rate && spokenDelta(rate)).toBe('up 0.09 percentage points over 7 days');
    const contract = deltaOf(-1, { unit: 'points' });
    expect(contract && spokenDelta(contract)).toBe('down 1 percentage point');
    const score = deltaOf(20.6, { unit: 'score' });
    expect(score && spokenDelta(score)).toBe('up 20.6 points');
    const price = deltaOf(5, { window: WEEK_WINDOW });
    expect(price && spokenDelta(price)).toBe('up 5% over 7 days');
    // A flat rate says its own word.
    const flat = deltaOf(0, { unit: 'rate', window: WEEK_WINDOW });
    expect(flat && spokenDelta(flat)).toBe('unchanged over 7 days');
  });
});

describe('how a series is drawn', () => {
  const rate = (id: string) =>
    indicator({ id, unit: '%', cadence: 'monthly', values: [4.5, 4.5, 4.25, 4.0] });

  it('draws every rate a central bank sets as steps, and nothing else in per cent', () => {
    // The set is the menu's own list of them: a bank added there is one here.
    const banks = listedSeries('rates');
    expect(banks.length).toBeGreaterThan(5);
    for (const id of banks) expect(isPolicyRate(id)).toBe(true);
    for (const group of ['borrowing', 'inflation', 'jobs', 'energy'] as const) {
      for (const id of listedSeries(group)) expect(isPolicyRate(id)).toBe(false);
    }
  });

  it('carries the shape on the card and on the sheet a story’s mention opens', () => {
    const fed = rate('fed-funds');
    const card = indicatorCard(snapshot([fed]), new Map(), [], 'fed-funds', 'US central bank');
    expect(card?.series?.shape).toBe('steps');
    expect(indicatorReading(fed, 4).series.shape).toBe('steps');
    // Inflation is measured each month, not set: its line runs straight.
    const prices = rate('us-cpi');
    expect(
      indicatorCard(snapshot([prices]), new Map(), [], 'us-cpi', 'prices')?.series?.shape,
    ).toBeUndefined();
    expect(indicatorReading(prices, 4).series.shape).toBeUndefined();
  });

  it('draws a contract on a chance’s whole scale, and a rate per dollar turned over', () => {
    const odds = indicator({ id: 'poly-x', source: 'polymarket', unit: '%', values: [7, 14] });
    expect(indicatorReading(odds, 14).series.domain).toEqual([0, 100]);
    expect(indicatorReading(LIRA, 49.22).series.inverted).toBe(true);
    expect(indicatorReading(EURO, 0.89).series.inverted).toBeUndefined();
  });
});
