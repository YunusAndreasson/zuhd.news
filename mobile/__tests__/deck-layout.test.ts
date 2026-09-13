import {
  BAND_MIN,
  computeDeckLayout,
  type DeckLayoutInput,
  grownGlobeTransform,
  grownReach,
} from '../lib/deck-layout';

// Line heights as `makeTextVariants` resolves them on a 360-wide window
// (`fs` scale 0.96): caption 12×1.55, labelXs 11×1.55, title 20×1.2, body 16×1.55.
const SMALL_LINES = { caption: 18.6, labelXs: 17.05, title: 24, body: 24.8 };
// And on a 430-wide one (scale 1.1): caption 14, labelXs 12, title 23, body 19.
const LARGE_LINES = { caption: 21.7, labelXs: 18.6, title: 27.6, body: 29.45 };
const CAPS = { caption: 1.5, labelXs: 1.4, title: 1.3, body: 1.5 };

function small(overrides: Partial<DeckLayoutInput> = {}): DeckLayoutInput {
  return {
    width: 360,
    height: 640,
    chromeHeight: 128,
    bottomInset: 24,
    fontScale: 1,
    lines: SMALL_LINES,
    caps: CAPS,
    ...overrides,
  };
}

describe('computeDeckLayout', () => {
  it('sizes the resting card from its type on a small phone', () => {
    const layout = computeDeckLayout(small());
    // 16 handle + 56 masthead (a 48pt row) + 21 kicker + 48 title + 8 + 5×25 lead + 16 + 24 inset
    expect(layout.peek).toBe(294);
    expect(layout.band).toBe(218);
    expect(layout.radius).toBe(100);
    expect(layout.centerY).toBe(237);
  });

  it('keeps the globe its share of the window when the type grows', () => {
    const layout = computeDeckLayout(small({ fontScale: 1.3 }));
    // The card wants 344; the globe's 34% floor caps it, and the lead runs
    // on under the fold.
    expect(layout.peek).toBe(294);
    expect(layout.band).toBe(218);
  });

  it('never lets the globe band drop under the absolute minimum', () => {
    const layout = computeDeckLayout(small({ height: 480, fontScale: 1.5 }));
    expect(layout.band).toBeGreaterThanOrEqual(BAND_MIN);
  });

  it('spends a tall phone on the globe, not on white space', () => {
    const layout = computeDeckLayout({
      width: 430,
      height: 932,
      chromeHeight: 171,
      bottomInset: 34,
      fontScale: 1,
      lines: LARGE_LINES,
      caps: CAPS,
    });
    // 16 + 56 + 23 + 56 + 8 + 5×29 + 16 + 34
    expect(layout.peek).toBe(354);
    expect(layout.band).toBe(407);
    expect(layout.radius).toBe(187);
  });

  it('grows the story under the bar, leaving the globe a band', () => {
    const layout = computeDeckLayout(small());
    expect(layout.storyBand).toBe(BAND_MIN);
    expect(layout.full).toBe(640 - 128 - BAND_MIN);
    expect(layout.storyRadius).toBe(64);
    expect(layout.storyCenterY).toBe(128 + BAND_MIN / 2);
  });
});

describe('grownGlobeTransform', () => {
  it('lands the resting centre on the grown centre at the grown radius', () => {
    const layout = computeDeckLayout(small());
    const { scale, translateY } = grownGlobeTransform(layout, 640);
    expect(scale * layout.radius).toBeCloseTo(layout.storyRadius);
    // Scaling about the canvas centre, then translating.
    const landed = 320 + scale * (layout.centerY - 320) + translateY;
    expect(landed).toBeCloseTo(layout.storyCenterY);
  });

  it("gives a short story's globe the band its sheet did not take", () => {
    const layout = computeDeckLayout(small());
    const tall = grownGlobeTransform(layout, 640);
    // A story 324pt tall: the band under a 128pt bar is 188, not 140.
    const short = grownGlobeTransform(layout, 640, 324);
    expect(short.scale).toBeGreaterThan(tall.scale);
    expect(short.scale * layout.radius).toBeCloseTo(Math.round(0.46 * 188));
    const landed = 320 + short.scale * (layout.centerY - 320) + short.translateY;
    expect(landed).toBeCloseTo(128 + 188 / 2);
  });

  it('never draws the grown disc larger than the resting one', () => {
    const layout = computeDeckLayout(small());
    expect(grownGlobeTransform(layout, 640, layout.peek - 200).scale).toBeLessThanOrEqual(1);
  });
});

describe('grownReach', () => {
  it('covers every screen corner under any grown transform', () => {
    const layout = computeDeckLayout(small());
    const reach = grownReach(layout, 640);
    for (const sheet of [layout.full, layout.peek, 324, 400]) {
      const { scale, translateY } = grownGlobeTransform(layout, 640, sheet);
      for (const [px, py] of [
        [0, 0],
        [360, 0],
        [0, 640],
        [360, 640],
      ] as const) {
        // The canvas point a screen corner shows once the drawing is shrunk.
        const x = 180 + (px - 180) / scale;
        const y = 320 + (py - 320 - translateY) / scale;
        expect(Math.hypot(x - 180, y - layout.centerY)).toBeLessThanOrEqual(reach + 1);
      }
    }
  });

  it('reaches past the resting screen, which the shrink uncovers', () => {
    const layout = computeDeckLayout(small());
    expect(grownReach(layout, 640)).toBeGreaterThan(Math.hypot(180, 640 - layout.centerY));
  });
});
