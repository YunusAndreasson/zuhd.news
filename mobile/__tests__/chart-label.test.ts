import { type ChartPoint, clearLabelSpot } from '../lib/chart-label';

const base = {
  ruleY: 100,
  labelWidth: 40,
  labelHeight: 14,
  minLeft: 0,
  maxRight: 300,
  step: 8,
};

const flat = (y: number): ChartPoint[] => [
  { x: 0, y },
  { x: 300, y },
];

it('keeps the label at the left, above the rule, when nothing crosses it', () => {
  expect(clearLabelSpot({ ...base, lines: [flat(150)] })).toEqual({ left: 0, above: true });
});

// Russia's fertility sat on replacement through the 1960s and fell away after.
it('moves right past a line that sits on the rule at the left', () => {
  const line: ChartPoint[] = [
    { x: 0, y: 95 },
    { x: 60, y: 98 },
    { x: 100, y: 140 },
    { x: 300, y: 150 },
  ];
  const spot = clearLabelSpot({ ...base, lines: [line] });
  expect(spot?.above).toBe(true);
  expect(spot?.left).toBeGreaterThanOrEqual(64);
});

it('checks segments, not only points: a steep line between two readings still blocks', () => {
  // Two readings either side of the band, the segment between them crossing it.
  const steep: ChartPoint[] = [
    { x: 0, y: 60 },
    { x: 20, y: 140 },
  ];
  const spot = clearLabelSpot({ ...base, maxRight: 60, labelWidth: 30, lines: [steep] });
  expect(spot).toEqual({ left: 24, above: true });
});

it('goes below the rule when every stretch above is taken', () => {
  const above = flat(93);
  expect(clearLabelSpot({ ...base, lines: [above] })).toEqual({ left: 0, above: false });
});

it('considers every line, and takes the stretch they cross least when none is clear', () => {
  // Both sides are taken the whole way. Above, the line is a reading every 10
  // up to x 150 and one long segment after it, so past 150 a label crosses a
  // single segment; below, one flat line crosses every stretch once too, and
  // above wins the tie.
  const dense: ChartPoint[] = [];
  for (let x = 0; x <= 150; x += 10) dense.push({ x, y: 93 });
  dense.push({ x: 300, y: 93 });
  expect(clearLabelSpot({ ...base, lines: [dense, flat(107)] })).toEqual({
    left: 152,
    above: true,
  });
});

it('keeps its clearance from a line that runs just under the rule', () => {
  const under: ChartPoint[] = [
    { x: 0, y: 102 },
    { x: 100, y: 102 },
    { x: 101, y: 160 },
    { x: 300, y: 160 },
  ];
  expect(clearLabelSpot({ ...base, lines: [under] })).toEqual({ left: 0, above: true });
  // Clear of the drop at x 100–101 by 3 as well: 104 is within reach of it.
  expect(clearLabelSpot({ ...base, clearance: 3, lines: [under] })).toEqual({
    left: 112,
    above: true,
  });
});

it('settles for a clear stretch when no stretch has the clearance', () => {
  // Hugging the rule from below the whole way, 2 under it: no air anywhere,
  // but the band above is still clear.
  expect(clearLabelSpot({ ...base, clearance: 3, lines: [flat(102)] })).toEqual({
    left: 0,
    above: true,
  });
});
