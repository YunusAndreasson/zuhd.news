import type { ReadingCard } from '../lib/cards/types';
import type { Indicator } from '@shared/types';
import {
  cardWindows,
  exchangeMove,
  gaugeMove,
  gaugeSpan,
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

describe('gaugeSpan', () => {
  it('reads a day as the newest observation against the one before it', () => {
    expect(gaugeSpan(card('brent', [100, 102], labels(10, 11)), 1)).toBeCloseTo(2);
    // A Monday against the Friday before it: the weekend is not a gap.
    expect(gaugeSpan(card('brent', [100, 103], ['Sep 4', 'Sep 7']), 1)).toBeCloseTo(3);
  });

  it('measures a price quoted now from its own day’s midnight close', () => {
    // A coin's series ends on the day's close and the price now, under one date:
    // the day is the second against the first, not against the day before.
    const coin = card('btc', [90, 100, 101], ['Sep 10', 'Sep 11', 'Sep 11']);
    expect(gaugeSpan(coin, 1)).toBeCloseTo(1);
  });

  it('sets aside a close repeated under its own date, which is no second reading', () => {
    // An exchange after its close: the build appends the newest quote under
    // the session's date, and it is the close again. Sydney on 2026-10-09
    // read `unchanged` on a day it rose 0.6%.
    const sydney = card('mkt:asx', [8660.9, 8716.6, 8716.6], ['Sep 10', 'Sep 11', 'Sep 11']);
    expect(gaugeSpan(sydney, 1)).toBeCloseTo(0.643, 2);
    // Two days at one level are still two days.
    expect(gaugeSpan(card('flat', [100, 100], labels(10, 11)), 1)).toBe(0);
  });

  it('has no day for a series published weekly, and no month for one a week long', () => {
    expect(gaugeSpan(card('pump', [3, 3.3], ['Sep 4', 'Sep 11']), 1)).toBeNull();
    expect(gaugeSpan(card('brent', [100, 102], labels(4, 11)), 30)).toBeNull();
  });

  it('reads thirty days by the week’s rule, in the quantity the card quotes', () => {
    expect(gaugeSpan(card('brent', [100, 120], ['Aug 12', 'Sep 11']), 30)).toBeCloseTo(20);
    // 80 → 88 rubles to the dollar is the ruble down 9.1%; the euro, in dollars, is as it reads.
    expect(gaugeSpan(card('fx-rub', [80, 88], ['Aug 12', 'Sep 11']), 30)).toBeCloseTo(-9.09, 1);
    expect(gaugeSpan(card('fx-eur', [1.1, 1.21], ['Aug 12', 'Sep 11']), 30)).toBeCloseTo(10);
  });
});

describe('cardWindows', () => {
  /** A month of days, Aug 12 to Sep 11, so the newest has a day, a week and
   *  thirty days behind it. */
  const month = [...labels(12, 31, 'Aug'), ...labels(1, 11)];
  /** A series level at `base`, then `week` seven days back, `day` yesterday
   *  and `now` today. */
  const levels = (base: number, week: number, day: number, now: number) =>
    month.map((_, i) =>
      i === month.length - 1
        ? now
        : i === month.length - 2
          ? day
          : i >= month.length - 8
            ? week
            : base,
    );
  const moves = (c: Parameters<typeof cardWindows>[0]) =>
    cardWindows(c)?.rungs.map((rung) => [rung.label, rung.delta?.direction, rung.delta?.magnitude]);

  it('reads a day, seven days and thirty, as the menu’s table does', () => {
    // 100 a month ago, 110 a week ago, 120 yesterday, 121 today.
    const c = card('brent', levels(100, 110, 120, 121), month);
    expect(moves(c)).toEqual([
      ['1 day', 'up', '0.8%'],
      ['7 days', 'up', '10%'],
      ['30 days', 'up', '21%'],
    ]);
    // The middle one is the strip's number, and the others are made its way.
    const windows = cardWindows(c);
    expect(windows?.rungs[1]?.delta).toEqual(gaugeMove(c)?.delta);
    expect(windows?.rungs[0]?.delta?.size).toBeCloseTo(gaugeSpan(c, 1) as number);
    expect(windows?.rungs[2]?.delta?.size).toBeCloseTo(gaugeSpan(c, 30) as number);
    expect(windows?.rungs.map((rung) => rung.delta?.window)).toEqual([
      'over 1 day',
      WEEK_WINDOW,
      'over 30 days',
    ]);
    // Where the thirty days began, for the chart's rule.
    expect(windows?.from).toBe('Aug 12');
  });

  it('drops a move of the card’s own that is another stretch of the same series', () => {
    // Oil on 2026-10-06: ▼ on the strip, and `▲23% since Aug 17` beside it on
    // the card: thirty observations, a window like the week counted another way.
    const own = { direction: 'up', magnitude: '23%', window: 'since Aug 17' } as const;
    const c = card('brent', levels(100, 110, 120, 121), month, { delta: own });
    expect(cardWindows(c)?.own).toBeUndefined();
  });

  it('keeps one that measures against something else, beside the three', () => {
    const versus = {
      direction: 'down',
      magnitude: '43%',
      window: 'vs its 90-day average',
      versus: true,
    } as const;
    const strait = card('strait-hormuz', levels(100, 110, 120, 121), month, { delta: versus });
    expect(cardWindows(strait)?.own).toEqual(versus);
    expect(cardWindows(strait)?.rungs).toHaveLength(3);
  });

  it('keeps a window’s place where the series does not reach it', () => {
    // Eight days of history: a day and a week, no thirty days.
    const short = card('btc', [100, 1, 1, 1, 1, 1, 104, 105], labels(4, 11));
    expect(moves(short)).toEqual([
      ['1 day', 'up', '1%'],
      ['7 days', 'up', '5%'],
      ['30 days', undefined, undefined],
    ]);
    expect(cardWindows(short)?.from).toBeUndefined();
    // Published weekly: a week and no day.
    const weekly = card('pump', [3, 3.3], ['Sep 4', 'Sep 11']);
    expect(moves(weekly)?.[0]).toEqual(['1 day', undefined, undefined]);
    expect(moves(weekly)?.[1]).toEqual(['7 days', 'up', '10%']);
  });

  it('has none for a card with no week: it prints its own move', () => {
    expect(cardWindows(card('wheat', [1, 2], ['Jun 2026', 'Jul 2026']))).toBeNull();
    // Two releases eight days apart are not a week's move, least of all a
    // percentage of an index.
    const lab = card('ai:deepseek', [150, 151], ['2026-09-03', '2026-09-11']);
    expect(gaugeMove(lab)).toBeNull();
    expect(cardWindows(lab)).toBeNull();
  });

  it('moves a yield in points over all three', () => {
    // The ten-year on 2026-10-06: `▲2.1%` on the strip and its card,
    // `▲0.11 points` in the menu. 4% to 4.09% is 0.09 points.
    const c = card('us-10y', levels(3.5, 4, 4.05, 4.09), month);
    c.series = { ...c.series, unit: '%' };
    expect(moves(c)).toEqual([
      ['1 day', 'up', '0.04 points'],
      ['7 days', 'up', '0.09 points'],
      ['30 days', 'up', '0.59 points'],
    ]);
    const g = gaugeMove(c);
    expect(g?.delta).toEqual({
      direction: 'up',
      magnitude: '0.09 points',
      window: WEEK_WINDOW,
      unit: 'rate',
    });
    // Still placed among the strip's percentages by its relative move.
    expect(g?.pct).toBeCloseTo(2.25);
  });

  it('names what moved under a rate per dollar, and reads the currency’s own way', () => {
    // 80 rubles to the dollar a month ago, 88 now: the ruble fell.
    const ruble = card('fx-rub-mover', levels(80, 84, 87, 88), month, { title: 'Russian rouble' });
    expect(cardWindows(ruble)?.subject).toBe('the rouble');
    expect(moves(ruble)?.map((move) => move[1])).toEqual(['down', 'down', 'down']);
    // The euro is quoted in dollars: its reading is its own, and needs no name.
    const euro = card('fx-eur', levels(1.1, 1.12, 1.13, 1.14), month, { title: 'Euro' });
    expect(cardWindows(euro)?.subject).toBeUndefined();
    expect(moves(euro)?.map((move) => move[1])).toEqual(['up', 'up', 'up']);
    expect(cardWindows(card('brent', levels(100, 110, 120, 121), month))?.subject).toBeUndefined();
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
      unit: 'rate',
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
    // A rate's points, coloured like any move: a contract's are `points`.
    expect(move?.unit).toBe('rate');
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
