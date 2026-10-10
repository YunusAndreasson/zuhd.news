import type { Chokepoint } from '@shared/types';
import { deltaOf } from '../lib/cards/format';
import type { SwipeCard } from '../lib/cards/rank';
import type { ReadingCard } from '../lib/cards/types';
import { WEEK_WINDOW } from '../lib/cards/week-move';
import type { CatalogGroup, CatalogRow, GroupKey } from '../lib/instrument-catalog';
import type { Exchange } from '../lib/markets';
import {
  CURRENCY_TAIL,
  companiesSummary,
  currenciesSummary,
  groupFigure,
  groupLadder,
  groupPath,
  exchangeTally,
  shippingCaption,
  shippingSummary,
  stocksCoverage,
  stocksLadder,
  stocksLine,
  stocksSummary,
  tallyCaption,
} from '../lib/world-summary';

const NOW = Date.UTC(2026, 8, 9);

/** A row with a week of `pct`, as `rowFor` builds one. */
const weekRow = (id: string, pct: number, over: Partial<CatalogRow> = {}): CatalogRow => ({
  id,
  card: null,
  move: deltaOf(pct, { window: WEEK_WINDOW }),
  weekly: true,
  weeklyPct: pct,
  short: id,
  ...over,
});

/** An exchange as the payload carries one: two sessions a week apart. */
const listing = (over: Partial<Exchange>): Exchange => ({
  id: 'x',
  name: 'X',
  indexName: 'X',
  city: 'X',
  iso2: 'XX',
  lat: 0,
  lng: 0,
  level: 100,
  changePct: 0,
  asOf: '2026-09-08',
  sourceLabel: '',
  blurb: '',
  series: {
    periods: ['Sep 1', 'Sep 8'],
    values: [100, 100],
    dates: ['2026-09-01', '2026-09-08'],
  },
  ...over,
});
const exchange = listing({});
const market = (id: string, pct: number, over: Partial<CatalogRow> = {}) =>
  weekRow(id, pct, { exchange, ...over });

const group = (key: GroupKey, rows: CatalogRow[]): CatalogGroup => ({ key, title: key, rows });

describe('world stocks', () => {
  it('counts exchanges only: an index no exchange quotes is not a market rising', () => {
    const rows = [market('a', 2), market('b', -1), weekRow('vix', 9), weekRow('sp500', 4)];
    expect(exchangeTally(rows)).toEqual({ total: 2, rose: 1, fell: 1 });
  });

  it('averages the exchanges’ weeks, each counted once', () => {
    const summary = stocksSummary([group('stocks', [market('a', 3), market('b', -1)])]);
    expect(summary?.move).toMatchObject({ direction: 'up', magnitude: '1%', window: WEEK_WINDOW });
    expect(summary?.members).toBe(2);
  });

  it('leaves an exchange with no week out of the average, and still counts it', () => {
    // Its row prints the session, which is not the week's number.
    const session = market('c', 40, { weekly: false });
    const summary = stocksSummary([group('stocks', [market('a', 3), market('b', -1), session])]);
    expect(summary?.move?.magnitude).toBe('1%');
    expect(summary?.members).toBe(2);
    expect(summary?.tally).toEqual({ total: 3, rose: 2, fell: 1 });
  });

  it('prints no average of one market', () => {
    const summary = stocksSummary([group('stocks', [market('a', 3)])]);
    expect(summary?.move).toBeUndefined();
    expect(summary?.tally.total).toBe(1);
  });

  it('is absent with no exchange in the list, so the row leaves with its list', () => {
    expect(stocksSummary([])).toBeNull();
    expect(stocksSummary([group('stocks', [weekRow('sp500', 4)])])).toBeNull();
  });
});

const WEEK_OF_RATES = ['2026-09-01', '2026-09-08'];
/** New York: priced in dollars, up 1% on the week and in its last session. */
const newYork = (gdp?: number) =>
  market('mkt:nyse', 1, { exchange: listing({ iso2: 'US', currency: 'USD', gdp, changePct: 1 }) });
/** Istanbul: up 3% in lira in a week the lira went from 40 to 42 a dollar,
 *  which is down 1.9% in dollars. */
const istanbul = (gdp?: number, rated = true) =>
  market('mkt:bist', 3, {
    exchange: listing({
      iso2: 'TR',
      currency: 'TRY',
      gdp,
      changePct: 3,
      series: {
        periods: ['Sep 1', 'Sep 8'],
        values: [100, 103],
        dates: WEEK_OF_RATES,
      },
      fx: rated ? { dates: WEEK_OF_RATES, perUsd: [40, 42] } : undefined,
    }),
  });

describe('world stocks, weighed and in dollars', () => {
  it('weighs each market by its economy, so a small one does not count as a large one', () => {
    // No rates: each in its own currency. (1 × 3 + 3 × 1) / 4, not their mean of 2.
    const summary = stocksSummary([group('stocks', [newYork(3), istanbul(1, false)])]);
    expect(summary).toMatchObject({ weighted: true, dollars: false, members: 2 });
    expect(summary?.move).toMatchObject({ direction: 'up', magnitude: '1.5%' });
  });

  it('reads each market’s week in US dollars where the payload carries the rates', () => {
    // (1 × 3 − 1.905 × 1) / 4: Istanbul’s 3% is a loss to anyone holding dollars.
    const summary = stocksSummary([group('stocks', [newYork(3), istanbul(1)])]);
    expect(summary).toMatchObject({ weighted: true, dollars: true, members: 2 });
    expect(summary?.move).toMatchObject({ direction: 'up', magnitude: '0.3%' });
    // Its last session the same way: these two have one session in the week.
    expect(summary?.day).toMatchObject({
      direction: 'up',
      magnitude: '0.3%',
      window: 'over 1 day',
    });
  });

  it('stays in each market’s own currency when most of the weight has no rate', () => {
    // New York alone is 30% of this list: its week is not the world’s.
    const summary = stocksSummary([group('stocks', [newYork(3), istanbul(7, false)])]);
    expect(summary).toMatchObject({ dollars: false, members: 2 });
    expect(summary?.move?.magnitude).toBe('2.4%');
  });

  it('leaves out a market with no rate when the rest are most of the weight, and says so', () => {
    const unrated = market('mkt:byma', 40, {
      exchange: listing({ id: 'byma', iso2: 'AR', currency: 'ARS', gdp: 0.5, changePct: 2 }),
    });
    const summary = stocksSummary([group('stocks', [newYork(9), istanbul(0.5), unrated])]);
    expect(summary).toMatchObject({ dollars: true, members: 2 });
    expect(summary && stocksCoverage(summary)).toBe(
      '2 of 3 markets in US dollars, weighted by each economy’s size',
    );
  });

  it('counts a country once: two exchanges in one share its weight', () => {
    const german = (id: string, pct: number) =>
      market(id, pct, { exchange: listing({ id, iso2: 'DE', gdp: 4 }) });
    const us = market('mkt:nyse', 1, { exchange: listing({ iso2: 'US', gdp: 4 }) });
    // (4 × 2 + 0 × 2 + 1 × 4) / 8, not (4 × 4 + 0 × 4 + 1 × 4) / 12.
    const summary = stocksSummary([group('stocks', [german('a', 4), german('b', 0), us])]);
    expect(summary?.move?.magnitude).toBe('1.5%');
  });

  it('counts each market once where any has no weight, and says that', () => {
    const summary = stocksSummary([group('stocks', [newYork(3), istanbul(undefined, false)])]);
    expect(summary).toMatchObject({ weighted: false, dollars: false });
    expect(summary?.move?.magnitude).toBe('2%');
    expect(summary && stocksCoverage(summary)).toBe(
      '2 markets in their own currencies, each counted once',
    );
  });

  /** A market with a session thirty days back, one a week back and today's. */
  const month = (
    id: string,
    over: Partial<Exchange>,
    values: [number, number, number],
    perUsd?: (number | null)[],
  ) => {
    const dates = ['2026-08-09', '2026-09-01', '2026-09-08'];
    return market(id, (values[2] / values[1] - 1) * 100, {
      exchange: listing({
        id,
        ...over,
        changePct: (values[2] / values[1] - 1) * 100,
        series: { periods: ['Aug 9', 'Sep 1', 'Sep 8'], values, dates },
        fx: perUsd ? { dates, perUsd } : undefined,
      }),
    });
  };

  it('reads thirty days by the week’s rule, over the same markets and weights', () => {
    const us = month('nyse', { iso2: 'US', currency: 'USD', gdp: 3 }, [100, 100, 101]);
    // Up 14% in lira over a month the lira went from 36 to 42 a dollar.
    const tr = month('bist', { iso2: 'TR', currency: 'TRY', gdp: 1 }, [90, 100, 103], [36, 40, 42]);
    const summary = stocksSummary([group('stocks', [us, tr])]);
    expect(summary?.dollars).toBe(true);
    // (1 × 3 − 1.905 × 1) / 4: in dollars Istanbul is where it was a month ago, less its week.
    expect(summary?.month).toMatchObject({
      direction: 'up',
      magnitude: '0.3%',
      window: 'over 30 days',
    });
    // In its own currency it is (1 × 3 + 14.4 × 1) / 4.
    const local = stocksSummary([
      group('stocks', [us, month('bist', { iso2: 'TR', currency: 'TRY', gdp: 1 }, [90, 100, 103])]),
    ]);
    expect(local?.dollars).toBe(false);
    expect(local?.month?.magnitude).toBe('4.4%');
  });

  it('prints no thirty days where most of the weight has none, and keeps the week', () => {
    const us = month('nyse', { iso2: 'US', currency: 'USD', gdp: 1 }, [100, 100, 101]);
    // Rates for the week alone: its month cannot be said in dollars.
    const tr = month(
      'bist',
      { iso2: 'TR', currency: 'TRY', gdp: 3 },
      [90, 100, 103],
      [null, 40, 42],
    );
    const summary = stocksSummary([group('stocks', [us, tr])]);
    expect(summary).toMatchObject({ dollars: true, members: 2 });
    expect(summary?.move).toBeDefined();
    expect(summary?.month).toBeUndefined();
    // The rung keeps its place, with no move and no bar.
    expect(
      summary && stocksLadder(summary).map((rung) => [rung.label, Boolean(rung.delta)]),
    ).toEqual([
      ['1 day', true],
      ['7 days', true],
      ['30 days', false],
    ]);
  });

  it('is a ladder of a day, seven days and thirty, with the list’s own figure in the middle', () => {
    const summary = stocksSummary([group('stocks', [newYork(3), istanbul(1)])]);
    const rungs = summary ? stocksLadder(summary) : [];
    expect(rungs.map((rung) => rung.label)).toEqual(['1 day', '7 days', '30 days']);
    expect(rungs[1]?.delta).toBe(summary?.move);
    // The stock list's row on the menu is the same three.
    expect(groupLadder(group('stocks', [newYork(3), istanbul(1)]), NOW)).toEqual(rungs);
    expect(summary && stocksLine(summary)).toBe(
      'World stocks +0.3% over 7 days: 2 markets in US dollars, weighted by each economy’s size',
    );
    // One market is no figure, no ladder and no line.
    const one = stocksSummary([group('stocks', [newYork(3)])]);
    expect(one && stocksLine(one)).toBeUndefined();
    expect(groupLadder(group('stocks', [newYork(3)]), NOW)).toBeNull();
    expect(one && stocksLadder(one).some((rung) => rung.delta)).toBe(false);
  });

  it('is the figure its list’s row prints, with what it is of for a listener', () => {
    const figure = groupFigure(group('stocks', [newYork(3), istanbul(1)]), NOW);
    expect(figure.move?.magnitude).toBe('0.3%');
    expect(figure.coverage).toBe('2 markets in US dollars, weighted by each economy’s size');
  });
});

describe('tallyCaption', () => {
  it('leads with the larger side, and prints both on a tie', () => {
    expect(tallyCaption({ total: 26, rose: 18, fell: 8 })).toBe('18 of 26 rose');
    expect(tallyCaption({ total: 26, rose: 8, fell: 17 })).toBe('17 of 26 fell');
    expect(tallyCaption({ total: 26, rose: 13, fell: 13 })).toBe('13 rose, 13 fell');
    expect(tallyCaption({ total: 4, rose: 0, fell: 0 })).toBe('none of 4 moved');
  });

  it('says against what', () => {
    expect(tallyCaption({ total: 15, rose: 4, fell: 11 }, CURRENCY_TAIL)).toBe(
      '11 of 15 fell against the dollar',
    );
  });
});

/** A strait's row: its charted series and its distance from its normal. */
function strait(id: string, periods: string[], values: number[], vsNormal = 0): CatalogRow {
  return {
    id: `strait-${id}`,
    card: {
      id: `strait-${id}`,
      kind: 'reading',
      title: id,
      reading: String(values.at(-1)),
      asOf: '2026-09-08',
      series: { values, periods, label: 'ships a day' },
    } as SwipeCard,
    weekly: true,
    short: id,
    chokepoint: { delta7vs90: { n_total: vsNormal } } as Chokepoint,
  };
}

const DAYS = ['Sep 1', 'Sep 4', 'Sep 8'];

describe('shipping', () => {
  it('adds the straits’ ships day by day and prints the sum’s week', () => {
    const summary = shippingSummary(
      [group('straits', [strait('a', DAYS, [100, 110, 120]), strait('b', DAYS, [100, 90, 100])])],
      NOW,
    );
    // 200 → 220.
    expect(summary?.move).toMatchObject({ direction: 'up', magnitude: '10%' });
    expect(summary?.members).toBe(2);
  });

  it('leaves a strait that ends on another day out of the sum', () => {
    const late = strait('c', ['Sep 1', 'Sep 6'], [1000, 10]);
    const summary = shippingSummary(
      [
        group('straits', [
          strait('a', DAYS, [100, 110, 120]),
          strait('b', DAYS, [100, 90, 100]),
          late,
        ]),
      ],
      NOW,
    );
    expect(summary?.move?.magnitude).toBe('10%');
    expect(summary).toMatchObject({ total: 3, members: 2 });
  });

  it('skips a day one strait has no count for, rather than summing fewer', () => {
    const summary = shippingSummary(
      [
        group('straits', [
          strait('a', DAYS, [100, 5000, 120]),
          strait('b', ['Sep 1', 'Sep 8'], [100, 100]),
        ]),
      ],
      NOW,
    );
    expect(summary?.move).toMatchObject({ direction: 'up', magnitude: '10%' });
  });

  it('counts the straits the globe draws pinched, and no others', () => {
    const summary = shippingSummary(
      [
        group('straits', [
          strait('a', DAYS, [1, 1, 1], -0.57),
          strait('b', DAYS, [1, 1, 1], -0.15),
          strait('c', DAYS, [1, 1, 1], -0.1),
          strait('d', DAYS, [1, 1, 1], 0.4),
        ]),
      ],
      NOW,
    );
    expect(summary).toMatchObject({ total: 4, disrupted: 2 });
    expect(summary && shippingCaption(summary)).toBe('2 of 4 straits disrupted');
  });

  it('keeps a strait with no history in the count, and says none when none is', () => {
    const bare: CatalogRow = {
      id: 'strait-e',
      card: null,
      weekly: false,
      short: 'e',
      chokepoint: { delta7vs90: {} } as Chokepoint,
    };
    const summary = shippingSummary([group('straits', [bare])], NOW);
    expect(summary).toMatchObject({ total: 1, disrupted: 0, members: 0 });
    expect(summary?.move).toBeUndefined();
    expect(summary && shippingCaption(summary)).toBe('none of 1 straits disrupted');
    expect(shippingSummary([], NOW)).toBeNull();
  });
});

describe('the largest companies', () => {
  it.each([-0.04198, 0.03659])('preserves the sign of a near-zero average (%s)', (pct) => {
    const summary = companiesSummary([
      group('companies', [weekRow('co:a', pct), weekRow('co:b', pct)]),
    ]);
    expect(summary?.move).toMatchObject({
      direction: pct < 0 ? 'down' : 'up',
      magnitude: '0.04%',
    });
    expect(summary?.move?.size).toBeCloseTo(Math.abs(pct));
  });

  it('retains tiny constituents when larger moves almost cancel', () => {
    const summary = companiesSummary([
      group('companies', [weekRow('co:a', 1), weekRow('co:b', -1), weekRow('co:c', -0.003)]),
    ]);
    expect(summary?.move).toMatchObject({ direction: 'down', magnitude: '<0.01%' });
  });

  it('are one number: their weeks averaged, each counted once', () => {
    const summary = companiesSummary([
      group('companies', [weekRow('co:a', 6), weekRow('co:b', -2), weekRow('co:c', 2)]),
    ]);
    expect(summary?.move).toMatchObject({ direction: 'up', magnitude: '2%', window: WEEK_WINDOW });
    expect(summary).toMatchObject({ members: 3, total: 3 });
  });

  it('print a week that rounds to nothing as a number, not a word', () => {
    const summary = companiesSummary([
      group('companies', [weekRow('co:a', 1), weekRow('co:b', -1)]),
    ]);
    expect(summary?.move).toMatchObject({ direction: 'flat', magnitude: '0.0%' });
  });

  it('leave a company with an old quote out of the average, and hold the slot', () => {
    const old = weekRow('co:c', 50, { weekly: false });
    const summary = companiesSummary([group('companies', [weekRow('co:a', 6), old])]);
    // One member is one company's week, not the list's.
    expect(summary).toMatchObject({ members: 1, total: 2 });
    expect(summary?.move).toBeUndefined();
    expect(companiesSummary([])).toBeNull();
  });
});

describe('currencies', () => {
  it('are the middle currency’s week against the dollar', () => {
    const summary = currenciesSummary([
      group('currencies', [
        weekRow('fx-try-mover', -5),
        weekRow('market-signal:fx-egp', -2),
        weekRow('fx-eur', 1),
        // No week: it cannot be said to have risen or fallen.
        weekRow('fx-jpy', 3, { weekly: false }),
        // Not a currency.
        weekRow('usd-index', 9),
      ]),
    ]);
    expect(summary?.move).toMatchObject({
      direction: 'down',
      magnitude: '2%',
      window: WEEK_WINDOW,
    });
    expect(summary?.tally).toEqual({ total: 3, rose: 1, fell: 2 });
  });

  it('are the median, so one collapsing currency is not the whole number', () => {
    const summary = currenciesSummary([
      group('currencies', [
        weekRow('fx-lbp', -40),
        weekRow('fx-eur', 0.4),
        weekRow('fx-jpy', 0.2),
        weekRow('fx-cny', 0.6),
      ]),
    ]);
    // Mean −9.7%; the middle of the four is +0.3%.
    expect(summary?.move).toMatchObject({ direction: 'up', magnitude: '0.3%' });
  });

  it('have no number of one currency, and none with no currency', () => {
    expect(currenciesSummary([group('currencies', [weekRow('fx-eur', 1)])])?.move).toBeUndefined();
    expect(currenciesSummary([group('currencies', [weekRow('usd-index', 2)])])).toBeNull();
    expect(currenciesSummary([])).toBeNull();
  });
});

describe('a list’s figure on the menu’s first page', () => {
  const rate = (id: string, periods: string[], values: number[]): CatalogRow =>
    weekRow(id, 0, {
      weekly: false,
      card: { kind: 'reading', series: { periods, values, unit: '%' } } as SwipeCard,
    });

  it('takes the median central-bank rate at the newest month all banks share', () => {
    const figure = groupFigure(
      group('rates', [
        rate('fed-funds', ['Aug 2026', 'Sep 2026'], [4, 4.5]),
        rate('ecb-rate', ['Aug 2026'], [2.5]),
        rate('tcmb-rate', ['Aug 2026', 'Sep 2026'], [37, 38]),
      ]),
    );
    expect(figure).toMatchObject({ level: '4.00%', measure: 'median' });
    expect(figure.coverage).toContain('Aug 2026 · median of 3 central banks');
  });

  it('averages inflation levels for a common reporting month, including negative inflation', () => {
    const figure = groupFigure(
      group('inflation', [
        rate('us-cpi', ['Dec 2025', 'Jan 2026'], [3, 2]),
        rate('ez-cpi', ['Dec 2025', 'Jan 2026'], [5, -1]),
      ]),
    );
    expect(figure).toMatchObject({ level: '0.50%', measure: 'average' });
    expect(figure.move).toMatchObject({
      direction: 'down',
      magnitude: '3.50 points',
      window: 'on the month',
    });
    expect(figure.coverage).toContain('Jan 2026 · US and eurozone');
  });

  it('does not combine different months, units, missing data or a single economy', () => {
    const a = rate('us-cpi', ['Aug 2026'], [3]);
    expect(groupFigure(group('inflation', [a]))).toEqual({});
    expect(groupFigure(group('inflation', [a, rate('ez-cpi', ['Sep 2026'], [4])]))).toEqual({});
    expect(groupFigure(group('inflation', [a, rate('ez-cpi', ['Aug 2026'], [NaN])]))).toEqual({});
    const wrongUnit = rate('ez-cpi', ['Aug 2026'], [4]);
    (wrongUnit.card as ReadingCard).series!.unit = '$';
    expect(groupFigure(group('inflation', [a, wrongUnit]))).toEqual({});
    const jobs = groupFigure(group('jobs', [rate('us-unemployment', ['Aug 2026'], [4])]));
    expect(jobs.level).toBe('4.00%');
    expect(jobs.move).toBeUndefined();
  });

  it('changes the median level, not the median of each bank’s changes', () => {
    const figure = groupFigure(
      group('rates', [
        rate('fed-funds', ['Aug 2026', 'Sep 2026'], [1, 4]),
        rate('ecb-rate', ['Aug 2026', 'Sep 2026'], [2, 2]),
        rate('boe-rate', ['Aug 2026', 'Sep 2026'], [3, 3]),
      ]),
    );
    expect(figure.level).toBe('3.00%');
    expect(figure.move).toMatchObject({ direction: 'up', magnitude: '1.00 points' });
    expect(figure.move?.unit).toBe('rate'); // Economic moves retain up/down colour.
  });

  it('shows US unemployment’s monthly change without pretending it is an average', () => {
    const figure = groupFigure(
      group('jobs', [rate('us-unemployment', ['Aug 2026', 'Sep 2026'], [4.1, 4.2])]),
    );
    expect(figure).toMatchObject({
      level: '4.20%',
      measure: 'rate',
      move: { direction: 'up', magnitude: '0.10 points' },
    });
    expect(figure.coverage).toContain('US unemployment');
  });

  it('prints a list of rates published to one decimal to one decimal, the level and its move', () => {
    const published = (id: string, values: number[]): CatalogRow =>
      weekRow(id, 0, {
        weekly: false,
        card: {
          kind: 'reading',
          series: { periods: ['Jul 2026', 'Aug 2026'], values, unit: '%', decimals: 1 },
        } as SwipeCard,
      });
    const inflation = groupFigure(
      group('inflation', [published('us-cpi', [3.2, 3.4]), published('ez-cpi', [3.2, 3.2])]),
    );
    expect(inflation).toMatchObject({
      level: '3.3%',
      move: { direction: 'up', magnitude: '0.1 points', window: 'on the month' },
    });
    const jobs = groupFigure(group('jobs', [published('us-unemployment', [4.2, 4.2])]));
    expect(jobs).toMatchObject({
      level: '4.2%',
      move: { direction: 'flat', magnitude: '0.0 points' },
    });
  });

  it('reads the borrowing basket over a month, as every row beside it, on dates all members share', () => {
    // The yields are quoted daily and the mortgage rate each Thursday: the
    // basket is read on the Thursdays, against the one four weeks back. It
    // read over seven days, the one row under `economy` that did.
    const figure = groupFigure(
      group('borrowing', [
        rate('us-2y', ['2026-09-03', '2026-09-24', '2026-10-01', '2026-10-02'], [4, 4.2, 4.3, 9]),
        rate('us-10y', ['2026-09-03', '2026-09-24', '2026-10-01'], [5, 5.2, 5.3]),
        rate('us-mortgage', ['2026-09-03', '2026-09-24', '2026-10-01'], [6, 6.2, 6.3]),
      ]),
    );
    expect(figure).toMatchObject({
      level: '5.30%',
      measure: 'average',
      move: { direction: 'up', magnitude: '0.30 points', window: 'on the month' },
    });
    expect(figure.coverage).toContain('Oct 1, 2026');
    expect(figure.coverage).toContain('four weeks');
  });

  it('takes the day a few days past four weeks where that Thursday was a holiday', () => {
    const basket = (first: string) =>
      groupFigure(
        group('borrowing', [
          rate('us-2y', [first, '2026-10-01'], [4, 4.5]),
          rate('us-10y', [first, '2026-10-01'], [5, 5.5]),
        ]),
      );
    // Thirty days back stands for the month; thirty-two is another window.
    expect(basket('2026-09-01').move).toMatchObject({ magnitude: '0.50 points' });
    expect(basket('2026-08-30').move).toBeUndefined();
    // Three weeks is not a month either.
    expect(basket('2026-09-10').move).toBeUndefined();
  });

  it('does not turn a missing prior period into a monthly or weekly change', () => {
    const figure = groupFigure(
      group('inflation', [
        rate('us-cpi', ['Jun 2026', 'Aug 2026'], [3, 4]),
        rate('ez-cpi', ['Jun 2026', 'Aug 2026'], [2, 3]),
      ]),
    );
    expect(figure.level).toBe('3.50%');
    expect(figure.move).toBeUndefined();
    const borrowing = groupFigure(
      group('borrowing', [
        rate('us-2y', ['2026-09-17', '2026-10-01'], [4, 5]),
        rate('us-10y', ['2026-09-17', '2026-10-01'], [5, 6]),
      ]),
    );
    expect(borrowing.move).toBeUndefined();
  });

  it('is the summary of everything in it, never its largest mover', () => {
    // Sorted as the catalog sorts: the largest move first.
    const stocks = group('stocks', [market('a', -9), market('b', 2), market('c', 1)]);
    const figure = groupFigure(stocks, NOW);
    expect(figure.move).toMatchObject({ direction: 'down', magnitude: '2%' });
    expect(figure.detail).toBe('2 of 3 rose');
    expect(
      groupFigure(group('companies', [weekRow('co:a', 6), weekRow('co:b', -2)])).move,
    ).toMatchObject({ direction: 'up', magnitude: '2%' });
  });

  it('names what the figure is of its rows, for the list’s own page', () => {
    const two = (key: GroupKey) => group(key, [weekRow(`${key}:a`, 3), weekRow(`${key}:b`, 1)]);
    expect(groupFigure(group('stocks', [market('a', 3), market('b', 1)])).measure).toBe('average');
    expect(groupFigure(two('companies')).measure).toBe('average');
    expect(groupFigure(two('crypto')).measure).toBe('average');
    // No figure, so nothing to name.
    expect(groupFigure(two('rates'))).toEqual({});
  });

  it('adds the straits’ ships and says how many are disrupted', () => {
    const straits = group('straits', [
      strait('a', DAYS, [100, 110, 120], -0.3),
      strait('b', DAYS, [100, 90, 100]),
    ]);
    expect(groupFigure(straits, NOW)).toMatchObject({
      move: { direction: 'up', magnitude: '10%' },
      detail: '1 of 2 straits disrupted',
    });
  });

  const price = (id: string, periods: string[], values: number[]) =>
    weekRow(id, 99, {
      card: { kind: 'reading', series: { periods, values, unit: '$' } } as SwipeCard,
    });

  it('splits price averages by matching dates and excludes composites and monthly readings', () => {
    const figure = groupFigure(
      group('metals', [
        price('paxg', ['2026-09-24', '2026-10-01', '2026-10-02'], [100, 104, 150]),
        price('xag', ['2026-09-24', '2026-10-01'], [200, 204]),
        price('nisab', ['2026-09-24', '2026-10-01'], [100, 190]),
        price('copper', ['Aug 2026', 'Sep 2026'], [100, 80]),
      ]),
    );
    expect(figure.move).toMatchObject({ direction: 'up', magnitude: '3%', window: WEEK_WINDOW });
    expect(figure.measure).toBe('average');
    expect(figure.coverage).toBe(
      '2026-09-24–2026-10-01 · equal-weight average · 2 of 3 prices · other readings excluded',
    );
  });

  it('averages monthly food returns over matching months, including year rollover', () => {
    const figure = groupFigure(
      group('food', [
        price('wheat', ['Dec 2025', 'Jan 2026', 'Feb 2026'], [100, 110, 200]),
        price('rice', ['Dec 2025', 'Jan 2026'], [200, 180]),
      ]),
    );
    expect(figure.move).toMatchObject({
      direction: 'flat',
      magnitude: '0.0%',
      window: 'on the month',
    });
    expect(figure.coverage).toContain('Dec 2025–Jan 2026');
  });

  it('shows a single price change without calling it an average', () => {
    const figure = groupFigure(
      group('energy', [price('brent', ['2026-09-24', '2026-10-01'], [100, 105])]),
    );
    expect(figure.move).toMatchObject({ direction: 'up', magnitude: '5%' });
    expect(figure.measure).toBeUndefined();
    expect(figure.coverage).toContain('brent · 1 of 1 prices');
  });

  it('does not mix unmatched weeks, bridge monthly gaps, or divide by zero', () => {
    const cases = [
      [
        price('brent', ['2026-09-24', '2026-10-01'], [100, 105]),
        price('wti', ['2026-09-23', '2026-09-30'], [100, 110]),
      ],
      [price('wheat', ['Jul 2026', 'Sep 2026'], [100, 105])],
      [price('brent', ['2026-09-24', '2026-10-01'], [0, 105])],
    ];
    for (const rows of cases) expect(groupFigure(group('energy', rows)).move).toBeUndefined();
  });

  it('still averages crypto weekly changes', () => {
    expect(
      groupFigure(group('crypto', [weekRow('btc', 1), weekRow('eth', -3)])).move,
    ).toMatchObject({ direction: 'down', magnitude: '1%' });
  });

  it('averages every lab’s unrounded capability score, not only the leader', () => {
    const labs = [167.44, 150.44, 140.44].map((score, i) =>
      weekRow(`ai:${i}`, 0, { weekly: false, score }),
    );
    const figure = groupFigure(group('ai', labs));
    expect(figure).toEqual({
      level: '152.8',
      measure: 'average',
      detail: 'average capability score across labs',
    });
    expect(groupFigure(group('ai', [...labs].reverse()))).toEqual(figure);
    expect(groupFigure(group('ai', [...labs, weekRow('missing', 0)]))).toEqual(figure);
    expect(groupFigure(group('ai', [labs[0]!, weekRow('invalid', 0, { score: NaN })]))).toEqual({});
  });

  it('averages matched 90-day score gains, excluding new labs and future releases', () => {
    const a = {
      ...price(
        'ai:a',
        ['2025-01-01', '2026-07-01', '2026-09-01', '2026-12-01'],
        [100, 150, 167.44, 250],
      ),
      score: 167.44,
    };
    const b = { ...price('ai:b', ['2025-01-01', '2026-08-01'], [140, 150.44]), score: 150.44 };
    const young = { ...price('ai:new', ['2026-08-01', '2026-09-01'], [50, 200]), score: 200 };
    const figure = groupFigure(group('ai', [a, b, young]), Date.UTC(2026, 9, 4));
    expect(figure.move).toMatchObject({
      direction: 'up',
      magnitude: '13.9 points',
      window: 'over 90 days',
    });
    expect(figure.coverage).toContain('2 of 3 labs');
    expect(figure.move?.size).toBeUndefined();
    expect(groupFigure(group('ai', [young, b, a]), Date.UTC(2026, 9, 4))).toEqual(figure);
    expect(groupFigure(group('ai', [a, young]), Date.UTC(2026, 9, 4)).move).toBeUndefined();
  });

  it('counts labs with no releases during the quarter as unchanged', () => {
    const a = { ...price('ai:a', ['2025-01-01'], [150]), score: 150 };
    const b = { ...price('ai:b', ['2025-01-01'], [160]), score: 160 };
    expect(groupFigure(group('ai', [a, b]), NOW).move).toMatchObject({
      direction: 'flat',
      window: 'over 90 days',
    });
  });

  it('keeps the nearest date for a list of upcoming events', () => {
    const date = weekRow('fomc', 0, { weekly: false, card: { reading: 'in 4 days' } as SwipeCard });
    expect(groupFigure(group('calendar', [date]))).toEqual({ level: 'in 4 days' });
  });

  it('prints nothing for a list whose members are not one quantity', () => {
    expect(groupFigure(group('rates', [weekRow('us-10y', 1), weekRow('us-2y', 2)]))).toEqual({});
    expect(groupFigure(group('predictions', [weekRow('poly-x', 5)]))).toEqual({});
    // Nor a number of one member, which would be that member's.
    expect(groupFigure(group('crypto', [weekRow('btc', 1)])).move).toBeUndefined();
  });
});

/** Day labels for `n` consecutive days ending on 8 September 2026. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const lastDays = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => {
    const day = new Date(Date.UTC(2026, 8, 8) - (n - 1 - i) * 86_400_000);
    return `${MONTHS[day.getUTCMonth()]} ${day.getUTCDate()}`;
  });

/**
 * A row quoted every day for a month: its price thirty days ago, seven days
 * ago, yesterday and today, held level in between. Its week is its series'.
 */
function daily(
  id: string,
  [month, week, yesterday, today]: [number, number, number, number],
  over: Partial<CatalogRow> = {},
): CatalogRow {
  const values = Array.from({ length: 31 }, (_, i) =>
    i === 30 ? today : i === 29 ? yesterday : i >= 23 ? week : month,
  );
  const card = {
    id,
    kind: 'reading',
    title: id,
    reading: String(today),
    asOf: '2026-09-08',
    series: { values, periods: lastDays(31), unit: '$' },
  } as SwipeCard;
  return weekRow(id, (today / week - 1) * 100, { card, ...over });
}

const rung = (rungs: ReturnType<typeof groupLadder>, i: number) =>
  rungs?.[i]?.delta && [rungs[i]?.delta?.direction, rungs[i]?.delta?.magnitude];

describe('a list’s ladder on the menu’s first page', () => {
  it('is the list over a day, seven days and thirty, with its own figure in the middle', () => {
    const companies = group('companies', [
      daily('co:a', [100, 110, 120, 121]),
      daily('co:b', [100, 100, 100, 99]),
    ]);
    const rungs = groupLadder(companies, NOW);
    expect(rungs?.map((r) => r.label)).toEqual(['1 day', '7 days', '30 days']);
    // (0.83 − 1) / 2, (10 − 1) / 2 and (21 − 1) / 2: each company counted once.
    expect(rung(rungs, 0)).toEqual(['down', '0.08%']);
    expect(rung(rungs, 1)).toEqual(['up', '4.5%']);
    expect(rung(rungs, 2)).toEqual(['up', '10%']);
    expect(rungs?.[1]?.delta).toEqual(groupFigure(companies, NOW).move);
    expect(rungs?.map((r) => r.delta?.window)).toEqual([
      'over 1 day',
      'over 7 days',
      'over 30 days',
    ]);
  });

  it('reads a currency’s own move, and takes the middle one', () => {
    // Lira to the dollar: up is the lira down. The euro is quoted in dollars.
    const currencies = group('currencies', [
      daily('fx-try', [40, 41, 42, 42]),
      daily('fx-egp', [50, 50, 50, 50]),
      daily('fx-eur', [1.1, 1.1, 1.1, 1.133]),
    ]).rows.map((row) => {
      const pct = (row.weeklyPct as number) * (row.id === 'fx-eur' ? 1 : -1);
      return { ...row, weeklyPct: pct, move: deltaOf(pct, { window: WEEK_WINDOW }) };
    });
    const rungs = groupLadder(group('currencies', currencies), NOW);
    // The pound unmoved is the middle of the three over every window.
    expect(rung(rungs, 0)).toEqual(['flat', '0.0%']);
    expect(rungs?.[2]?.delta).toMatchObject({ direction: 'flat' });
    // With the pound gone the middle is between the lira and the euro: 40 → 42
    // is the lira down 4.8%, and the euro is up 3%.
    const two = groupLadder(
      group(
        'currencies',
        currencies.filter((row) => row.id !== 'fx-egp'),
      ),
      NOW,
    );
    expect(rung(two, 2)).toEqual(['down', '0.9%']);
  });

  it('is the basket of prices quoted daily, over matching dates', () => {
    // A pump price published weekly does not cut two daily ones to its dates.
    const weekly = weekRow('us-gas-retail', 0, {
      card: {
        id: 'us-gas-retail',
        kind: 'reading',
        asOf: '2026-09-08',
        series: { periods: ['Aug 25', 'Sep 1', 'Sep 8'], values: [3, 3, 9], unit: '$' },
      } as SwipeCard,
    });
    const energy = group('energy', [
      daily('brent', [100, 100, 104, 105]),
      daily('wti', [100, 100, 100, 101]),
      weekly,
    ]);
    const rungs = groupLadder(energy, NOW);
    expect(rung(rungs, 0)).toEqual(['up', '1%']);
    expect(rung(rungs, 1)).toEqual(['up', '3%']);
    expect(rung(rungs, 2)).toEqual(['up', '3%']);
    // The list's own figure is the same basket.
    expect(groupFigure(energy, NOW).move?.magnitude).toBe('3%');
    expect(groupFigure(energy, NOW).coverage).toContain('2 of 3 prices · other readings excluded');
  });

  it('adds the straits’ ships over each window', () => {
    const rows = [0, 1].map((n) => {
      const row = daily(`strait-${n}`, [100, 80, 99, 100]);
      return { ...row, chokepoint: { delta7vs90: { n_total: 0 } } as Chokepoint };
    });
    const rungs = groupLadder(group('straits', rows), NOW);
    // 160 → 200 on the week, 198 → 200 on the day, and level on the month.
    expect(rung(rungs, 0)).toEqual(['up', '1%']);
    expect(rung(rungs, 1)).toEqual(['up', '25%']);
    expect(rung(rungs, 2)).toEqual(['flat', '0.0%']);
  });

  it('keeps a rung’s place where the rows do not reach back', () => {
    // A week of history: no thirty days. The rung stays, with no move.
    const short = (id: string, week: number, today: number) =>
      weekRow(id, (today / week - 1) * 100, {
        card: {
          id,
          kind: 'reading',
          asOf: '2026-09-08',
          series: {
            periods: lastDays(8),
            values: [week, week, week, week, week, week, week, today],
          },
        } as SwipeCard,
      });
    const rungs = groupLadder(
      group('crypto', [short('btc', 100, 110), short('eth', 100, 90)]),
      NOW,
    );
    expect(rungs?.map((r) => Boolean(r.delta))).toEqual([true, true, false]);
    expect(rungs?.[2]?.label).toBe('30 days');
  });

  it('is absent for a list with no week: it keeps its one number', () => {
    const monthly = (id: string) =>
      weekRow(id, 0, {
        weekly: false,
        card: {
          kind: 'reading',
          series: { periods: ['Aug 2026', 'Sep 2026'], values: [100, 105], unit: '$' },
        } as SwipeCard,
      });
    expect(groupLadder(group('food', [monthly('wheat'), monthly('rice')]), NOW)).toBeNull();
    expect(groupLadder(group('rates', [weekRow('fed-funds', 1)]), NOW)).toBeNull();
    // One company is no average, so no ladder either.
    expect(groupLadder(group('companies', [daily('co:a', [100, 110, 120, 121])]), NOW)).toBeNull();
  });
});

describe('a list’s thirty days as a line on the menu’s first page', () => {
  it('is made of the rows its numbers are made of, and ends where its month does', () => {
    const companies = group('companies', [
      daily('co:a', [100, 110, 120, 121]),
      daily('co:b', [100, 100, 100, 99]),
    ]);
    const path = groupPath(companies, NOW);
    expect(path?.days).toHaveLength(31);
    expect(path?.values[0]).toBe(0);
    // (21 − 1) / 2, the list's thirty-day number.
    expect(path?.values.at(-1)).toBeCloseTo(10);
    expect(groupLadder(companies, NOW)?.[2]?.delta?.magnitude).toBe('10%');
  });

  it('draws a currency the way its moves are read, and the middle one of them', () => {
    const currencies = group('currencies', [
      daily('fx-try', [40, 41, 42, 42]),
      daily('fx-eur', [1.1, 1.1, 1.1, 1.133]),
    ]);
    // 40 → 42 lira to the dollar is the lira down 4.8%; the euro is up 3%.
    expect(groupPath(currencies, NOW)?.values.at(-1)).toBeCloseTo((-4.76 + 3) / 2, 1);
  });

  it('draws the stock markets in dollars and by weight, as their numbers are', () => {
    const us = market('nyse', 1, {
      exchange: listing({
        id: 'nyse',
        iso2: 'US',
        currency: 'USD',
        gdp: 3,
        changePct: 1,
        series: {
          periods: ['Aug 9', 'Sep 1', 'Sep 8'],
          values: [100, 100, 101],
          dates: ['2026-08-09', '2026-09-01', '2026-09-08'],
        },
      }),
    });
    const dates = ['2026-08-09', '2026-09-01', '2026-09-08'];
    const tr = market('bist', 3, {
      exchange: listing({
        id: 'bist',
        iso2: 'TR',
        currency: 'TRY',
        gdp: 1,
        changePct: 3,
        series: { periods: ['Aug 9', 'Sep 1', 'Sep 8'], values: [90, 100, 103], dates },
        fx: { dates, perUsd: [36, 40, 42] },
      }),
    });
    const stocks = group('stocks', [us, tr]);
    const path = groupPath(stocks, NOW);
    expect(path?.days).toHaveLength(3);
    // (1 × 3 − 1.905 × 1) / 4, the row's thirty-day number.
    expect(path?.values.at(-1)).toBeCloseTo((3 - 1.905) / 4, 2);
  });

  it('adds the straits’ ships, and draws the basket of prices quoted daily', () => {
    const straits = [0, 1].map((n) => ({
      ...daily(`strait-${n}`, [100, 80, 99, 100]),
      chokepoint: { delta7vs90: { n_total: 0 } } as Chokepoint,
    }));
    const ships = groupPath(group('straits', straits), NOW);
    expect(Math.min(...(ships?.values ?? []))).toBeCloseTo(-20);
    expect(ships?.values.at(-1)).toBeCloseTo(0);
    const energy = group('energy', [
      daily('brent', [100, 100, 104, 105]),
      daily('wti', [100, 100, 100, 101]),
    ]);
    expect(groupPath(energy, NOW)?.values.at(-1)).toBeCloseTo(3);
  });

  it('is nothing for a list that prints no windows, or with too little to draw', () => {
    const monthly = (id: string) =>
      weekRow(id, 0, {
        weekly: false,
        card: {
          kind: 'reading',
          series: { periods: ['Aug 2026', 'Sep 2026'], values: [100, 105], unit: '$' },
        } as SwipeCard,
      });
    expect(groupPath(group('food', [monthly('wheat'), monthly('rice')]), NOW)).toBeNull();
    expect(groupPath(group('rates', [weekRow('fed-funds', 1)]), NOW)).toBeNull();
    // A week of history is not a month's line.
    const short = (id: string) =>
      weekRow(id, 1, {
        card: {
          id,
          kind: 'reading',
          asOf: '2026-09-08',
          series: { periods: lastDays(8), values: [1, 1, 1, 1, 1, 1, 1, 2] },
        } as SwipeCard,
      });
    expect(groupPath(group('crypto', [short('btc'), short('eth')]), NOW)).toBeNull();
  });
});
