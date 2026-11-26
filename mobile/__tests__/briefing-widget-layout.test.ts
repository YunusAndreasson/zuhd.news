import { briefingFrame } from '../lib/briefing-widget-layout';

const layout =
  typeof briefingFrame === 'function'
    ? briefingFrame
    : (new Function(`return (${briefingFrame})`)() as typeof briefingFrame);

it.each([1, 1.3, 2])('reserves the action at font scale %s across Android sizes', (scale) => {
  for (const [width, height] of [
    [144, 110],
    [172, 234],
    [360, 234],
    [360, 480],
  ] as const) {
    const withCover = layout(width, height, scale, false, true);
    const withoutCover = layout(width, height, scale, false, false);
    expect(withCover.footer).toBe(withoutCover.footer);
    expect(withCover.footer).toBeGreaterThanOrEqual(40);
    expect(withCover.body + withCover.artwork + 1 + withCover.footer).toBe(height);
    expect(withoutCover.artwork).toBe(0);
    if (height > 110) expect(withCover.artwork).toBeGreaterThan(0);
    else expect(withCover.artwork).toBe(0);
  }
});

it('puts the market chart and the action in separate rows at wide sizes', () => {
  const frame = layout(360, 234, 1.3, true, true);
  expect(frame.wide).toBe(true);
  expect(frame.artwork).toBe(0);
  expect(frame.body + 1 + frame.footer).toBe(234);
});
