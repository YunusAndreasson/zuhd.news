import type { Chokepoint, ConflictEvent, GdacsAlert } from '@shared/types';
import { deltaOf } from '../lib/cards/format';
import type { SwipeCard } from '../lib/cards/rank';
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

  it('averages prices, leaving out a monthly one and a card built from two others', () => {
    const figure = groupFigure(
      group('commodities', [
        weekRow('brent', 4),
        weekRow('paxg', 2),
        // Derived from gold and silver: counting it counts them twice.
        weekRow('nisab', 30),
        // A month's move is not a week's.
        weekRow('wheat', -20, { weekly: false }),
      ]),
    );
    expect(figure.move).toMatchObject({ direction: 'up', magnitude: '3%' });
    expect(
      groupFigure(group('crypto', [weekRow('btc', 1), weekRow('eth', -3)])).move,
    ).toMatchObject({
      direction: 'down',
      magnitude: '1%',
    });
  });

  it('prints a level, in plain ink, for a list with no week', () => {
    const lab = weekRow('ai:alpha', 0, {
      weekly: false,
      card: { reading: '167.4' } as SwipeCard,
    });
    expect(groupFigure(group('ai', [lab]))).toEqual({ level: '167.4' });
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
