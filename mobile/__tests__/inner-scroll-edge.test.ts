import { resolveInnerEdgePageGesture } from '../lib/inner-scroll-edge';

describe('resolveInnerEdgePageGesture', () => {
  it('pages forward on an upward swipe that started at the bottom', () => {
    expect(
      resolveInnerEdgePageGesture({
        startOffset: 300,
        maxOffset: 300,
        translationY: -80,
        velocityY: -200,
      }),
    ).toBe(1);
  });

  it('accepts a short, decisive flick at the bottom', () => {
    expect(
      resolveInnerEdgePageGesture({
        startOffset: 299,
        maxOffset: 300,
        translationY: -12,
        velocityY: -900,
      }),
    ).toBe(1);
  });

  it('stops after revealing prose when the swipe began away from the edge', () => {
    expect(
      resolveInnerEdgePageGesture({
        startOffset: 120,
        maxOffset: 300,
        translationY: -180,
        velocityY: -900,
      }),
    ).toBe(0);
  });

  it('pages backward on a downward swipe that started at the top', () => {
    expect(
      resolveInnerEdgePageGesture({
        startOffset: 0,
        maxOffset: 300,
        translationY: 70,
        velocityY: 100,
      }),
    ).toBe(-1);
  });

  it('ignores horizontal and indecisive movement', () => {
    expect(
      resolveInnerEdgePageGesture({
        startOffset: 300,
        maxOffset: 300,
        translationY: -10,
        velocityY: -100,
      }),
    ).toBe(0);
  });
});
