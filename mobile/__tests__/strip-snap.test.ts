import { nearestOffsetIndex, sameOffsets, stripSnapOffsets } from '../lib/strip-snap';

describe('stripSnapOffsets', () => {
  it('rests on every slot start the row can reach, then on the end of the row', () => {
    // Six slots on a 90pt pitch in a 300pt viewport: the row can scroll 300,
    // so the last two starts are past the end and the end stands in for them.
    expect(stripSnapOffsets([0, 90, 180, 270, 360, 450], 600, 300)).toEqual([0, 90, 180, 270, 300]);
  });

  it('snaps nowhere when the whole row is on screen', () => {
    expect(stripSnapOffsets([0, 90, 180], 280, 300)).toEqual([]);
    expect(stripSnapOffsets([0, 90, 180], 300, 300)).toEqual([]);
  });

  it('has nothing to say before the row has been measured', () => {
    expect(stripSnapOffsets([], 0, 0)).toEqual([]);
    expect(stripSnapOffsets([0, 90], 600, 0)).toEqual([]);
  });

  it('comes back ascending and unique, whatever order the slots reported in', () => {
    // Layout events arrive in no guaranteed order, and a slot that re-measures
    // to the same place reports twice.
    expect(stripSnapOffsets([180, 0, 90, 90, 180], 600, 300)).toEqual([0, 90, 180, 300]);
  });

  it('always offers the start of the row', () => {
    // The first slot is flush at the inset at rest; that position is a landing
    // even if no slot ever reported an x of exactly 0.
    expect(stripSnapOffsets([90, 180], 600, 300)).toEqual([0, 90, 180, 300]);
  });

  it('ignores a slot that has not been laid out', () => {
    expect(stripSnapOffsets([0, Number.NaN, 90, -20, Number.POSITIVE_INFINITY], 600, 300)).toEqual([
      0, 90, 300,
    ]);
  });

  it('rounds to whole points, because native offsets are pixels', () => {
    expect(stripSnapOffsets([0, 89.6, 180.2], 600.4, 300)).toEqual([0, 90, 180, 300]);
  });
});

describe('nearestOffsetIndex', () => {
  const offsets = [0, 90, 180, 270, 300];

  it('takes the nearer of two neighbours', () => {
    expect(nearestOffsetIndex(offsets, 44)).toBe(0);
    expect(nearestOffsetIndex(offsets, 46)).toBe(1);
    expect(nearestOffsetIndex(offsets, 90)).toBe(1);
  });

  it('clamps at either end', () => {
    expect(nearestOffsetIndex(offsets, -40)).toBe(0);
    expect(nearestOffsetIndex(offsets, 9000)).toBe(4);
  });

  it('answers 0 for a row that snaps nowhere', () => {
    expect(nearestOffsetIndex([], 120)).toBe(0);
  });
});

describe('sameOffsets', () => {
  it('is true only when the geometry has not moved', () => {
    expect(sameOffsets([0, 90, 300], [0, 90, 300])).toBe(true);
    expect(sameOffsets([0, 90, 300], [0, 91, 300])).toBe(false);
    expect(sameOffsets([0, 90], [0, 90, 300])).toBe(false);
    expect(sameOffsets([], [])).toBe(true);
  });
});
