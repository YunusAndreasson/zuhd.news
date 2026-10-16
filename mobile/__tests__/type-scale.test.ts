import {
  baseFontSize,
  FONT_SIZE_SCALE,
  type FontSize,
  makeTypography,
  typographyFor,
  widthTypeScale,
} from '../constants/theme';

// The type follows the live window's width, within 0.9–1.1 of its 375pt
// sizes. These are the sizes phones have always been given: the change is
// that a window that resizes gets them again.

const sizes = (width: number) => {
  const t = makeTypography(1, widthTypeScale(width));
  return [t.sizeBase, t.sizeLg, t.sizeSm, t.sizeXs, t.sizeH1, t.sizeWordmark];
};

it('scales with the width between its clamps, and only up as it widens', () => {
  expect(widthTypeScale(300)).toBe(0.9);
  expect(widthTypeScale(337.5)).toBe(0.9);
  expect(widthTypeScale(375)).toBe(1);
  expect(widthTypeScale(412.5)).toBeCloseTo(1.1);
  expect(widthTypeScale(1280)).toBe(1.1);
  let last = 0;
  for (let width = 280; width <= 1400; width += 10) {
    expect(widthTypeScale(width)).toBeGreaterThanOrEqual(last);
    last = widthTypeScale(width);
  }
});

it('gives phones the sizes they have always had', () => {
  expect(sizes(360)).toEqual([16, 20, 12, 11, 27, 13]);
  expect(sizes(375)).toEqual([17, 21, 13, 11, 28, 14]);
  expect(sizes(393)).toEqual([18, 22, 14, 12, 29, 15]);
  expect(sizes(402)).toEqual([18, 23, 14, 12, 30, 15]);
  expect(sizes(430)).toEqual([19, 23, 14, 12, 31, 15]);
  // Past the clamp, a tablet or an unfolded phone keeps the largest phone's.
  expect(sizes(1280)).toEqual(sizes(430));
});

it('previews each size preference at the size the app will take', () => {
  for (const pref of Object.keys(FONT_SIZE_SCALE) as FontSize[]) {
    for (const width of [360, 393, 430]) {
      const scale = widthTypeScale(width);
      expect(baseFontSize(pref, scale)).toBe(makeTypography(FONT_SIZE_SCALE[pref], scale).sizeBase);
    }
  }
});

it('hands back one typography while a resize crosses no size step', () => {
  expect(typographyFor(1, widthTypeScale(500))).toBe(typographyFor(1, widthTypeScale(1280)));
  expect(typographyFor(1, widthTypeScale(375))).not.toBe(typographyFor(1, widthTypeScale(430)));
  const distinct = new Set<unknown>();
  for (let width = 300; width <= 1400; width += 1)
    distinct.add(typographyFor(1, widthTypeScale(width)));
  expect(distinct.size).toBeLessThanOrEqual(19);
});
