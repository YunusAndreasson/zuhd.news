import { middle, movePath, PATH_DAYS } from '../lib/cards/path';
import { QUIET_SPAN_PCT } from '../lib/cards/chart-scale';
import { sparkDirection, sparkPoints } from '../lib/cards/spark';

/** A member with a price on each of `days`. */
const member = (days: number[], values: number[], weight?: number) => ({ days, values, weight });
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe('a list’s thirty days as one line', () => {
  it('sets every member to where it stood on the first day, and combines them by weight', () => {
    const days = range(0, 30);
    const flat = member(
      days,
      days.map(() => 50),
      3,
    );
    const riser = member(
      days,
      days.map((d) => 100 + d),
      1,
    );
    const path = movePath([flat, riser]);
    expect(path?.days).toEqual(days);
    expect(path?.values[0]).toBe(0);
    // The riser ends 30% up and weighs a quarter.
    expect(path?.values.at(-1)).toBeCloseTo(7.5);
  });

  it('reaches back thirty days and no further', () => {
    const days = range(0, 60);
    const path = movePath([
      member(
        days,
        days.map((d) => 100 + d),
      ),
    ]);
    expect(path?.days[0]).toBe(60 - PATH_DAYS);
    expect(path?.days.at(-1)).toBe(60);
  });

  it('carries a member’s last price over a day it has none for', () => {
    // One trades every day; the other skips days 5 and 6 and comes back higher.
    const every = range(0, 20);
    const a = member(
      every,
      every.map(() => 100),
    );
    const gappy = every.filter((d) => d !== 5 && d !== 6);
    const b = member(
      gappy,
      gappy.map((d) => (d < 5 ? 100 : 120)),
    );
    const path = movePath([a, b]);
    expect(path?.days).toEqual(every);
    // Level over the gap, and only then up: the line does not move for the holiday.
    expect(path?.values[5]).toBe(0);
    expect(path?.values[6]).toBe(0);
    expect(path?.values[7]).toBeCloseTo(10);
  });

  it('starts where its latest member starts, and leaves out one too short to draw', () => {
    const long = member(
      range(0, 30),
      range(0, 30).map(() => 100),
    );
    const late = member(
      range(10, 30),
      range(10, 30).map((d) => 100 + d),
    );
    expect(movePath([long, late])?.days[0]).toBe(10);
    const stub = member(
      range(25, 30),
      range(25, 30).map(() => 1),
    );
    expect(movePath([long, stub])?.days[0]).toBe(0);
  });

  it('leaves out a member whose last price is old', () => {
    const live = member(
      range(0, 30),
      range(0, 30).map((d) => 100 + d),
    );
    const stale = member(
      range(0, 20),
      range(0, 20).map(() => 100),
    );
    expect(movePath([live, stale])?.values.at(-1)).toBeCloseTo(30);
  });

  it('reads a price quoted now as its day’s, over that day’s close', () => {
    const path = movePath([member([0, 10, 20, 20], [100, 100, 100, 110])]);
    expect(path?.days).toEqual([0, 10, 20]);
    expect(path?.values.at(-1)).toBeCloseTo(10);
  });

  it('is the middle member where asked, so one collapsing does not draw the line', () => {
    const days = range(0, 30);
    const steady = (to: number) =>
      member(
        days,
        days.map((d) => 100 + (to * d) / 30),
      );
    const path = movePath([steady(1), steady(2), steady(-60)], middle);
    expect(path?.values.at(-1)).toBeCloseTo(1);
  });

  it('is nothing with no member, with too few days, or with no price above nothing', () => {
    expect(movePath([])).toBeNull();
    expect(
      movePath([
        member(
          range(0, 9),
          range(0, 9).map(() => 1),
        ),
      ]),
    ).toBeNull();
    expect(
      movePath([
        member(
          range(0, 30),
          range(0, 30).map(() => 0),
        ),
      ]),
    ).toBeNull();
    expect(movePath([{ days: [null, null], values: [1, 2] }])).toBeNull();
  });
});

describe('a small line’s geometry', () => {
  const box = (values: number[]) =>
    sparkPoints({ days: values.map((_, i) => i * 10), values }, 60, 20, 2);

  it('runs from the box’s left to its right, a day at its place between', () => {
    const points = sparkPoints({ days: [0, 10, 30], values: [0, 1, 2] }, 62, 20, 1);
    expect(points.map((p) => p.x)).toEqual([1, 21, 61]);
  });

  it('draws up as up: a higher value is nearer the top', () => {
    const [start, , end] = box([0, 5, 10]);
    expect(end?.y).toBeLessThan(start?.y as number);
    expect([start?.y, end?.y]).toEqual([18, 2]);
  });

  it('lays a quiet month nearly flat across the middle, not from corner to corner', () => {
    const [start, end] = box([0, QUIET_SPAN_PCT / 10]);
    expect(Math.abs((end?.y as number) - (start?.y as number))).toBeCloseTo(1.6);
    expect(((start?.y as number) + (end?.y as number)) / 2).toBeCloseTo(10);
  });

  it('says which way the line went, and nowhere for a line that ends where it began', () => {
    expect(sparkDirection({ days: [0, 30], values: [0, 2] })).toBe('up');
    expect(sparkDirection({ days: [0, 30], values: [0, -2] })).toBe('down');
    expect(sparkDirection({ days: [0, 15, 30], values: [0, 9, 0.01] })).toBe('flat');
  });
});
