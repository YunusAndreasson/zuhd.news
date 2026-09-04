import { readableScrollOffset } from '../lib/scroll-consumption';

describe('readableScrollOffset', () => {
  const contentHeight = 1_100;
  const viewportHeight = 800;

  it('preserves movement within the readable range', () => {
    expect(readableScrollOffset(125, contentHeight, viewportHeight)).toBe(125);
  });

  it('clamps top-edge bounce so it is not reported as consumed content', () => {
    expect(readableScrollOffset(-28, contentHeight, viewportHeight)).toBe(0);
  });

  it('clamps bottom-edge bounce so it does not suppress the next page turn', () => {
    expect(readableScrollOffset(337, contentHeight, viewportHeight)).toBe(300);
  });

  it('stays at zero when the content fits the viewport', () => {
    expect(readableScrollOffset(12, 600, viewportHeight)).toBe(0);
  });
});
