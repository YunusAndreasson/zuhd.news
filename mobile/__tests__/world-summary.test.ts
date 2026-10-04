import type { Chokepoint, ConflictEvent, GdacsAlert } from '@shared/types';
import { deltaOf } from '../lib/cards/format';
import type { SwipeCard } from '../lib/cards/rank';
import type { ReadingCard } from '../lib/cards/types';
import { WEEK_WINDOW } from '../lib/cards/week-move';
import type { CatalogGroup, CatalogRow, GroupKey } from '../lib/instrument-catalog';
import type { Exchange } from '../lib/markets';
import type { FamineCountryTotal } from '../lib/overlays';
import {
  CURRENCY_TAIL,
  companiesSummary,
  currenciesSummary,
  groupFigure,
  exchangeTally,
  hazardParts,
  shippingCaption,
  shippingSummary,
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

const exchange = { id: 'x' } as Exchange;
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
    expect(figure.move?.unit).toBeUndefined(); // Economic moves retain up/down colour.
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

  it('uses shared dates and percentage-point changes for the borrowing basket', () => {
    const figure = groupFigure(
      group('borrowing', [
        rate('us-2y', ['2026-09-24', '2026-10-01', '2026-10-02'], [4, 4.3, 9]),
        rate('us-10y', ['2026-09-24', '2026-10-01'], [5, 5.3]),
        rate('us-mortgage', ['2026-09-24', '2026-10-01'], [6, 6.3]),
      ]),
    );
    expect(figure).toMatchObject({
      level: '5.30%',
      measure: 'average',
      move: { direction: 'up', magnitude: '0.30 points', window: 'over 7 days' },
    });
    expect(figure.coverage).toContain('Oct 1, 2026');
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

const alert = (alertlevel: GdacsAlert['alertlevel']) => ({ alertlevel }) as GdacsAlert;
const WEEK = {
  windowStart: '2026-08-25',
  windowEnd: '2026-08-31',
  events: [{ fatalities: 600 }, { fatalities: 48 }] as ConflictEvent[],
};
const TOTALS = [{ p3plus: 19_466_533 }, { p3plus: 108_800_000 }] as FamineCountryTotal[];

describe('world hazards', () => {
  it('counts the dead with their dates, and the hungry in people', () => {
    expect(hazardParts({ disasters: [], conflictWeek: WEEK, famineTotals: TOTALS })).toEqual([
      '648 killed, Aug 25–31',
      '128M in hunger',
    ]);
  });

  it('leads with the alerts standing now, red over orange, and holds two parts', () => {
    const disasters = [alert('Red'), alert('Orange'), alert('Orange'), alert('Green')];
    expect(hazardParts({ disasters, conflictWeek: WEEK, famineTotals: TOTALS })).toEqual([
      '1 red alert',
      '648 killed, Aug 25–31',
    ]);
    expect(hazardParts({ disasters: [alert('Orange'), alert('Orange')] })).toEqual([
      '2 orange alerts',
    ]);
  });

  it('never prints a toll without its dates, or a part that runs past the line', () => {
    const undated = { ...WEEK, windowStart: '', windowEnd: '' };
    expect(hazardParts({ disasters: [], conflictWeek: undated })).toEqual([]);
    const long = {
      windowStart: '2026-08-29',
      windowEnd: '2026-09-04',
      events: [{ fatalities: 12_480 }] as ConflictEvent[],
    };
    expect(hazardParts({ disasters: [], conflictWeek: long, famineTotals: TOTALS })).toEqual([
      '12,480 killed, Aug 29 – Sep 4',
    ]);
  });

  it('is empty on a day of minor alerts with nothing else loaded', () => {
    expect(hazardParts({ disasters: [alert('Green')], conflictWeek: null })).toEqual([]);
  });
});
