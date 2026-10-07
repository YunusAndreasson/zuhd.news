import type { ReadingCard } from '../lib/cards/types';
import type { Indicator } from '@shared/types';
import {
  cardMoves,
  exchangeMove,
  gaugeMove,
  indicatorMove,
  periodDays,
  WEEK_DAYS,
  WEEK_WINDOW,
  weekMove,
} from '../lib/cards/week-move';
import type { Exchange } from '../lib/markets';

const labels = (from: number, to: number, month = 'Sep') => {
  const out: string[] = [];
  for (let d = from; d <= to; d++) out.push(`${month} ${d}`);
  return out;
};

function card(id: string, values: number[], periods: string[], extra: Partial<ReadingCard> = {}) {
  return {
    id,
    kind: 'reading' as const,
    title: id,
    reading: '1',
    asOf: '2026-09-11',
    series: { values, periods, label: id },
    ...extra,
  };
}

describe('periodDays', () => {
  it('counts the year back when a series crosses New Year', () => {
    const days = periodDays(['Dec 30', 'Dec 31', 'Jan 1'], 2027);
    expect(days[2]! - days[1]!).toBe(1);
    expect(days[1]! - days[0]!).toBe(1);
  });

  it('reads ISO dates as they are', () => {
    const [a, b] = periodDays(['2026-09-04', '2026-09-11'], 1999);
    expect(b! - a!).toBe(WEEK_DAYS);
  });

  it('does not read a month label as a day', () => {
    expect(periodDays(['Jun 2026', 'Jul 2026'], 2026)).toEqual([null, null]);
  });
});

describe('weekMove', () => {
  it('measures seven calendar days, not seven observations', () => {
    // A series that skips the weekend: Sep 4 (Fri) … Sep 11 (Fri), no 5th/6th.
    const periods = ['Sep 3', 'Sep 4', 'Sep 7', 'Sep 8', 'Sep 9', 'Sep 10', 'Sep 11'];
    const move = weekMove([90, 100, 101, 102, 103, 104, 110], periods, 2026);
    expect(move?.from).toBe('Sep 4');
    expect(move?.pct).toBeCloseTo(10);
    expect(move?.points).toEqual([100, 101, 102, 103, 104, 110]);
  });

  it('takes the close before a holiday when the week has none on its day', () => {
    const periods = ['Sep 2', 'Sep 3', 'Sep 8', 'Sep 11'];
    expect(weekMove([100, 105, 1, 110], periods, 2026)?.from).toBe('Sep 3');
  });

  it('has no seven-day move when the last observation before it is too old', () => {
    expect(weekMove([100, 110], ['Aug 20', 'Sep 11'], 2026)).toBeNull();
  });

  it('has no seven-day move on a monthly series', () => {
    expect(weekMove([100, 110], ['Jun 2026', 'Jul 2026'], 2026)).toBeNull();
  });

  it('refuses a zero base rather than printing infinity', () => {
    expect(weekMove([0, 5], ['Sep 4', 'Sep 11'], 2026)).toBeNull();
  });
});

describe('gaugeMove', () => {
  const week = labels(4, 11);

  it('is a percentage over seven days, sized for the strip to sort', () => {
    const g = gaugeMove(card('brent-card', [100, 0, 0, 0, 0, 0, 0, 95], week));
    expect(g?.delta).toMatchObject({
      direction: 'down',
      magnitude: '5%',
      size: 5,
      window: 'over 7 days',
    });
  });

  it("takes the week's direction, whatever the card's own chip says", () => {
    // Brent unchanged over its thirty observations, down 6% on the week.
    const c = card('brent', [100, 1, 1, 1, 1, 1, 1, 94], week, {
      delta: { direction: 'flat', magnitude: 'unchanged' },
    });
    expect(gaugeMove(c)?.delta).toMatchObject({ direction: 'down', magnitude: '6%' });
  });

  it('quotes the currency, not the published rate', () => {
    // 80 → 88 rubles to the dollar is the ruble down 9.1%, not up 10%.
    const c = card('fx-rub-mover', [80, 1, 1, 1, 1, 1, 1, 88], week, {
      delta: { direction: 'down', magnitude: '3%' },
    });
    const g = gaugeMove(c);
    expect(g?.delta.direction).toBe('down');
    expect(g?.delta.magnitude).toBe('9.1%');
  });

  it('is absent for a comparison of several lines and for a series with no week', () => {
    const multi = card('wheat-rice', [1, 2], ['Sep 4', 'Sep 11'], {});
    multi.series = { ...multi.series, multi: [{ label: 'a', values: [1, 2] }] } as never;
    expect(gaugeMove(multi)).toBeNull();
    expect(gaugeMove(card('wheat', [1, 2], ['Jun 2026', 'Jul 2026']))).toBeNull();
  });

  it('says unchanged rather than 0%', () => {
    expect(gaugeMove(card('flat', [100, 1, 1, 1, 1, 1, 1, 100.01], week))?.delta).toMatchObject({
      direction: 'flat',
      magnitude: 'unchanged',
    });
  });

  it('keeps the signed raw move even when the chip rounds to unchanged', () => {
    const result = gaugeMove(card('tiny', [100, 1, 1, 1, 1, 1, 1, 99.99], week));
    expect(result?.delta.direction).toBe('flat');
    expect(result?.pct).toBeCloseTo(-0.01);
  });
});

describe('cardMoves', () => {
  const week = labels(4, 11);
  const own = { direction: 'up', magnitude: '23%', window: 'since Aug 17' } as const;

  it('leads with the week the strip printed, then the card’s own window', () => {
    // Oil on 2026-10-06: ▼ on the strip, ▲23% since Aug 17 on the card it opened.
    const c = card('brent', [100, 1, 1, 1, 1, 1, 1, 94], week, { delta: own });
    expect(cardMoves(c)).toEqual([gaugeMove(c)?.delta, own]);
    expect(cardMoves(c)[0]).toMatchObject({ direction: 'down', magnitude: '6%' });
  });

  it('prints the card’s own move alone where the series has no week', () => {
    const monthly = card('wheat', [1, 2], ['Jun 2026', 'Jul 2026'], { delta: own });
    expect(cardMoves(monthly)).toEqual([own]);
    expect(cardMoves(card('bare', [1, 2], ['Jun 2026', 'Jul 2026']))).toEqual([]);
  });

  it('prints the week once where it is the card’s own move too', () => {
    const c = card('brent', [100, 1, 1, 1, 1, 1, 1, 94], week);
    c.delta = gaugeMove(c)?.delta;
    expect(cardMoves(c)).toEqual([c.delta]);
  });

  it('prints once a move that is the week under another name', () => {
    // A market signal measured over five sessions has the week's own anchor:
    // the card read `▲12% over 7 days` over `▲12.3% 5 sessions`.
    const c = card('market-signal:mkt:b3', [100, 1, 1, 1, 1, 1, 1, 112.34], week, {
      delta: { direction: 'up', magnitude: '12.3%', size: 12.34, window: '5 sessions' },
    });
    expect(cardMoves(c)).toEqual([gaugeMove(c)?.delta]);
    // The same size the other way, or over another span, is another fact.
    c.delta = { direction: 'down', magnitude: '12.3%', size: 12.34, window: '5 sessions' };
    expect(cardMoves(c)).toHaveLength(2);
    c.delta = { direction: 'up', magnitude: '14.1%', size: 14.1, window: '20 sessions' };
    expect(cardMoves(c)).toHaveLength(2);
  });

  it('gives an AI lab no week: its line is releases, in points', () => {
    // Two releases eight days apart are not a week's move, least of all a
    // percentage of an index.
    const points = { direction: 'up', magnitude: '6.3 points', window: 'over 90 days' } as const;
    const lab = card('ai:deepseek', [150, 151], ['2026-09-03', '2026-09-11'], { delta: points });
    expect(gaugeMove(lab)).toBeNull();
    expect(cardMoves(lab)).toEqual([points]);
  });

  it('moves a yield in points, the week and its own window alike', () => {
    // The ten-year on 2026-10-06: `▲2.1%` on the strip and its card,
    // `▲0.11 points` in the menu. 4% to 4.09% is 0.09 points.
    const own = { direction: 'up', magnitude: '0.61 points', window: 'since Aug 20' } as const;
    const c = card('us-10y', [4, 1, 1, 1, 1, 1, 1, 4.09], week, { delta: own });
    c.series = { ...c.series, unit: '%' };
    const g = gaugeMove(c);
    expect(g?.delta).toEqual({ direction: 'up', magnitude: '0.09 points', window: WEEK_WINDOW });
    // Still placed among the strip's percentages by its relative move.
    expect(g?.pct).toBeCloseTo(2.25);
    expect(cardMoves(c)).toEqual([g?.delta, own]);
  });

  it('says which way a currency went, as its own chip does', () => {
    const c = card('fx-rub-mover', [80, 1, 1, 1, 1, 1, 1, 88], week, {
      delta: { direction: 'down', magnitude: '3%', window: 'weaker since Sep 1' },
    });
    expect(cardMoves(c).map((move) => move.window)).toEqual([
      'weaker over 7 days',
      'weaker since Sep 1',
    ]);
  });
});

describe('indicatorMove', () => {
  const indicator = (extra: Partial<Indicator>): Indicator => ({
    id: 'brent',
    label: 'Brent',
    unit: '$/bbl',
    source: 'fred',
    sourceLabel: 'FRED',
    values: [100, 101, 102, 103, 104, 105, 106, 110],
    periods: ['Sep 4', 'Sep 5', 'Sep 6', 'Sep 7', 'Sep 8', 'Sep 9', 'Sep 10', 'Sep 11'],
    asOf: '2026-09-11',
    ...extra,
  });

  it("uses the week where the series has one, in the gauges' words", () => {
    expect(indicatorMove(indicator({}))).toMatchObject({ magnitude: '10%', window: 'over 7 days' });
  });

  it('falls back to the last step, naming the day it started', () => {
    const monthly = indicator({ values: [100, 95], periods: ['Jun 2026', 'Jul 2026'] });
    expect(indicatorMove(monthly)).toMatchObject({ direction: 'down', window: 'since Jun 2026' });
  });

  it('moves a yield in points over its week, as the strip and its card do', () => {
    const tenYear = indicator({
      id: 'us-10y',
      unit: '%',
      cadence: 'daily',
      values: [4, 4.01, 4.02, 4.03, 4.04, 4.05, 4.06, 4.09],
    });
    expect(indicatorMove(tenYear)).toEqual({
      direction: 'up',
      magnitude: '0.09 points',
      window: WEEK_WINDOW,
    });
  });

  it('moves a published rate in points, the number its card prints', () => {
    // The Fed's target, 4.00 → 3.75: the card said ▼0.25 points and the
    // sheet a story's mention opens said ▼6.3%.
    const fed = indicator({
      id: 'fed-funds',
      unit: '%',
      cadence: 'monthly',
      values: [4, 3.75],
      periods: ['Jul 2026', 'Aug 2026'],
    });
    const move = indicatorMove(fed);
    expect(move).toMatchObject({ direction: 'down', magnitude: '0.25 points' });
    expect(move?.unit).toBeUndefined();
  });

  it('moves a contract in points, marked so the chip never colours it', () => {
    const contract = indicator({ id: 'poly-x', source: 'polymarket', unit: '%', values: [40, 52] });
    expect(indicatorMove(contract)).toMatchObject({ magnitude: '12 points', unit: 'points' });
  });
});

describe('exchangeMove', () => {
  const exchange = (values: number[], periods: string[]): Exchange => ({
    id: 'bist',
    name: 'Borsa İstanbul',
    indexName: 'BIST 100',
    city: 'Istanbul',
    iso2: 'TR',
    lat: 41,
    lng: 29,
    level: values[values.length - 1] ?? 0,
    changePct: 0.09,
    asOf: '2026-09-11',
    sourceLabel: 'Provider',
    blurb: '',
    series: { values, periods },
  });

  it('prints the week the strip prints, not the session', () => {
    // The strip said ▼2.9% and the mark it flew to said ↑0.09%.
    const e = exchange([100, 100, 100, 100, 100, 100, 100, 97.1], labels(4, 11));
    expect(exchangeMove(e)).toMatchObject({
      direction: 'down',
      magnitude: '2.9%',
      window: WEEK_WINDOW,
    });
  });

  it('falls back to the session where the series has no week', () => {
    const e = exchange([100, 101], ['Sep 10', 'Sep 11']);
    expect(exchangeMove(e)).toMatchObject({ direction: 'up', window: 'vs prior close' });
  });
});
