import type { ReadingCard } from '../lib/cards/types';
import { gaugeMove, periodDays, WEEK_DAYS, weekMove } from '../lib/cards/week-move';

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
    expect(g?.points).toHaveLength(8);
  });

  it('colours the direction the way the card already does', () => {
    // The card says a rise is bad (a fuel price up, unfavourable).
    const c = card('brent', [100, 1, 1, 1, 1, 1, 1, 90], week, {
      delta: { direction: 'up', magnitude: '4%', valence: 'unfavorable' },
    });
    expect(gaugeMove(c)?.delta.valence).toBe('favorable');
  });

  it('quotes the currency, not the published rate', () => {
    // 80 → 88 rubles to the dollar is the ruble down 9.1%, not up 10%.
    const c = card('fx-rub-mover', [80, 1, 1, 1, 1, 1, 1, 88], week, {
      delta: { direction: 'down', magnitude: '3%', valence: 'unfavorable' },
    });
    const g = gaugeMove(c);
    expect(g?.delta.direction).toBe('down');
    expect(g?.delta.magnitude).toBe('9.1%');
    expect(g?.delta.valence).toBe('unfavorable');
  });

  it("colours a strait's week by the strait's own one-sided rule", () => {
    expect(gaugeMove(card('strait-hormuz', [100, 1, 1, 1, 1, 1, 1, 80], week))?.delta.valence).toBe(
      'unfavorable',
    );
    expect(
      gaugeMove(card('strait-hormuz', [100, 1, 1, 1, 1, 1, 1, 130], week))?.delta.valence,
    ).toBe('neutral');
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
});
