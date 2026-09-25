import { assignSlots, sameKeys } from '../lib/deck-slots';

const slotsOf = (keys: string[], previous = new Map<string, number>()) => {
  const map = assignSlots(keys, previous);
  return { map, slots: keys.map((key) => map.get(key)) };
};

describe('assignSlots', () => {
  it('numbers a first window in order', () => {
    expect(slotsOf(['a', 'b', 'c']).slots).toEqual([0, 1, 2]);
  });

  it('keeps the stories that stay and hands the one entering the slot the one leaving gave up', () => {
    const first = slotsOf(['a', 'b', 'c']);
    // A landing on `c`: `a` leaves, `d` enters.
    const next = slotsOf(['b', 'c', 'd'], first.map);
    expect(next.slots).toEqual([1, 2, 0]);
    // And back again: `d` leaves, `a` takes its slot.
    expect(slotsOf(['a', 'b', 'c'], next.map).slots).toEqual([0, 1, 2]);
  });

  it('keeps the story being read in its slot when an arrival moves its index', () => {
    const reading = slotsOf(['b', 'c', 'd']);
    // Two stories arrived at the head; `c` is still in front, now at a new index.
    const after = slotsOf(['x', 'c', 'y'], reading.map);
    expect(after.map.get('c')).toBe(reading.map.get('c'));
  });

  it('redraws every slot on a jump, and never gives two stories one slot', () => {
    const before = slotsOf(['a', 'b', 'c']);
    const jump = slotsOf(['p', 'q', 'r'], before.map);
    expect(new Set(jump.slots)).toEqual(new Set([0, 1, 2]));
  });

  it('handles the short windows at either end of the river', () => {
    const start = slotsOf(['a', 'b']);
    expect(start.slots).toEqual([0, 1]);
    const middle = slotsOf(['a', 'b', 'c'], start.map);
    expect(middle.slots).toEqual([0, 1, 2]);
    const lonely = slotsOf(['end'], middle.map);
    expect(lonely.slots).toEqual([0]);
  });
});

describe('sameKeys', () => {
  it('is order-sensitive', () => {
    expect(sameKeys(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameKeys(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(sameKeys(['a'], ['a', 'b'])).toBe(false);
  });
});
