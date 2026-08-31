import { INHERITED_GESTURE_MS, resolveSettle, type SettleInput } from '../lib/pager-settle';

const H = 800;
const NOW = 1_000_000;

function settle(overrides: Partial<SettleInput> = {}) {
  return resolveSettle({
    y: 0,
    itemHeight: H,
    count: 5,
    currentIndex: 0,
    innerConsumed: null,
    now: NOW,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Ordinary paging — no inner page involved
// ---------------------------------------------------------------------------

describe('resolveSettle — a gesture the list itself received', () => {
  it('leaves a list resting exactly on a page alone', () => {
    const d = settle({ y: 2 * H, currentIndex: 2 });
    expect(d.index).toBe(2);
    expect(d.scroll).toBe(false);
  });

  it('absorbs sub-pixel rest offsets rather than fighting every swipe', () => {
    expect(settle({ y: 2 * H + 0.6, currentIndex: 2 }).scroll).toBe(false);
    expect(settle({ y: 2 * H + 4, currentIndex: 2 }).scroll).toBe(true);
  });

  it('rounds a rest 40% across back to the page it came from', () => {
    const d = settle({ y: 0.4 * H, currentIndex: 0 });
    expect(d.index).toBe(0);
    expect(d.target).toBe(0);
    expect(d.scroll).toBe(true);
  });

  it('rounds a rest 60% across on to the next page', () => {
    expect(settle({ y: 0.6 * H, currentIndex: 0 }).index).toBe(1);
  });

  it('animates an ordinary correction', () => {
    expect(settle({ y: 0.4 * H }).animated).toBe(true);
  });

  it('leaves the top overscroll alone, where pull-to-refresh lives', () => {
    const d = settle({ y: -60, currentIndex: 0 });
    expect(d.index).toBe(0);
    expect(d.scroll).toBe(false);
  });

  it('still pulls back from the bottom overscroll', () => {
    const d = settle({ y: 4 * H + 90, currentIndex: 4, count: 5 });
    expect(d.index).toBe(4);
    expect(d.scroll).toBe(true);
  });

  it('clamps to the deck', () => {
    expect(settle({ y: -500, currentIndex: 0 }).index).toBe(0);
    expect(settle({ y: 99 * H, currentIndex: 4, count: 5 }).index).toBe(4);
  });

  it('clears a stale mark left by some other page', () => {
    const d = settle({ y: 0, currentIndex: 1, innerConsumed: { index: 0, at: NOW } });
    expect(d.clearMark).toBe(true);
    expect(d.clearMarkTimer).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The gesture this function exists for: an inner scroll handing up its tail
// ---------------------------------------------------------------------------

describe('resolveSettle — a gesture inherited from an inner scroll', () => {
  const mark = { index: 2, at: NOW - 100 };

  it('returns the list to the page it was already on', () => {
    const d = resolveSettle({
      y: 2 * H + 260,
      itemHeight: H,
      count: 5,
      currentIndex: 2,
      innerConsumed: mark,
      now: NOW,
    });
    expect(d.index).toBe(2);
    expect(d.target).toBe(2 * H);
    expect(d.scroll).toBe(true);
  });

  it('pins rather than animates, so it cannot fight inherited momentum', () => {
    const d = settle({ y: 2 * H + 260, currentIndex: 2, innerConsumed: mark });
    expect(d.animated).toBe(false);
  });

  it('keeps the mark while that correction settles', () => {
    const d = settle({ y: 2 * H + 260, currentIndex: 2, innerConsumed: mark });
    expect(d.clearMark).toBe(false);
    expect(d.clearMarkTimer).toBe(false);
  });

  it('retires the mark when the child ate the whole gesture', () => {
    const d = settle({ y: 2 * H, currentIndex: 2, innerConsumed: mark });
    expect(d.index).toBe(2);
    expect(d.scroll).toBe(false);
    expect(d.clearMark).toBe(true);
    expect(d.clearMarkTimer).toBe(true);
  });

  it('stops attributing the gesture once the mark has expired', () => {
    const stale = { index: 2, at: NOW - INHERITED_GESTURE_MS };
    const d = settle({ y: 2 * H + 0.7 * H, currentIndex: 2, innerConsumed: stale });
    // No longer inherited, so this is an ordinary page turn and it animates.
    expect(d.index).toBe(3);
    expect(d.animated).toBe(true);
  });

  it('does not correct a page the reader deliberately flung past', () => {
    // Same overshoot, no mark: this is a real page turn, not a handoff.
    const d = settle({ y: 2 * H + 0.7 * H, currentIndex: 2 });
    expect(d.index).toBe(3);
    expect(d.animated).toBe(true);
  });
});
