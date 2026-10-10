import {
  chartScale,
  partLabels,
  QUIET_SPAN_PCT,
  QUIET_SPAN_POINTS,
} from '../lib/cards/chart-scale';

describe('the range a chart’s height stands for', () => {
  it('takes a series that moved further than the floor at its own range', () => {
    // The peso over a month: 7.8% from low to high.
    expect(chartScale({ values: [16.97, 17.6, 18.41] })).toEqual({
      lo: 16.97,
      hi: 18.41,
      min: 16.97,
      max: 18.41,
    });
  });

  it('centres a quiet series in a range that is a share of its level', () => {
    // The yuan: 0.3% from low to high. It filled the box, as the peso does.
    const { lo, hi, min, max } = chartScale({ values: [6.6927, 6.7, 6.7135] });
    expect([min, max]).toEqual([6.6927, 6.7135]);
    const centre = (6.6927 + 6.7135) / 2;
    expect(hi - lo).toBeCloseTo((centre * QUIET_SPAN_PCT) / 100, 10);
    expect((lo + hi) / 2).toBeCloseTo(centre, 10);
    // The series takes about a twentieth of the height it took.
    expect((max - min) / (hi - lo)).toBeLessThan(0.06);
  });

  it('counts a series in per cent in points, never as a share of itself', () => {
    // One cut of a tenth of a point ran from the chart's top to its foot.
    const { lo, hi } = chartScale({ values: [3.1, 3.1, 3.0], unit: '%' });
    expect(hi - lo).toBeCloseTo(QUIET_SPAN_POINTS, 10);
    expect((lo + hi) / 2).toBeCloseTo(3.05, 10);
    // A rate that moved more than a point keeps its own range.
    expect(chartScale({ values: [5, 4.5, 3.75], unit: '%' })).toMatchObject({ lo: 3.75, hi: 5 });
  });

  it('keeps the foot at nothing for a quantity that cannot go under it', () => {
    // A rate at a quarter of a point: a point's range centred on it would
    // start below zero.
    expect(chartScale({ values: [0.25, 0.25, 0.5], unit: '%' })).toMatchObject({ lo: 0, hi: 1 });
    // A series that is itself below zero is centred as any other.
    const below = chartScale({ values: [-0.5, -0.4], unit: '%' });
    expect(below.lo).toBeCloseTo(-0.95, 10);
    expect(below.hi).toBeCloseTo(0.05, 10);
  });

  it('draws a quantity with a scale of its own on that scale', () => {
    // A contract between 7% and 14% drew the zigzag of one from 31% to 85%.
    expect(chartScale({ values: [7, 14, 10], unit: '%', domain: [0, 100] })).toEqual({
      lo: 0,
      hi: 100,
      min: 7,
      max: 14,
    });
    // A value outside its scale is still on the chart.
    expect(chartScale({ values: [50, 104], domain: [0, 100] })).toMatchObject({ lo: 0, hi: 104 });
  });

  it('gives a level series, and no series, a range to be drawn in', () => {
    const level = chartScale({ values: [50, 50, 50] });
    expect(level.hi - level.lo).toBeCloseTo(3, 10);
    expect(chartScale({ values: [0, 0] })).toMatchObject({ lo: 0, hi: 1 });
    expect(chartScale({ values: [] })).toEqual({ lo: 0, hi: 1, min: 0, max: 0 });
    expect(chartScale({ values: [Number.NaN, 4, 5] })).toMatchObject({ min: 4, max: 5 });
  });
});

describe('two labels beside their rules', () => {
  it('leaves each on its rule while they are a label apart', () => {
    expect(partLabels(24, 134, 28, 0, 148)).toEqual([24, 134]);
    expect(partLabels(60, 88, 28, 0, 148)).toEqual([60, 88]);
  });

  it('parts two that would print over each other around their middle', () => {
    // A quiet currency's high and low, six points apart on the canvas.
    expect(partLabels(76, 82, 28, 0, 148)).toEqual([65, 93]);
    expect(partLabels(79, 79, 14, 0, 148)).toEqual([72, 86]);
  });

  it('keeps both inside the chart', () => {
    expect(partLabels(2, 6, 28, 0, 148)).toEqual([14, 42]);
    expect(partLabels(140, 146, 28, 0, 148)).toEqual([106, 134]);
  });
});
