import {
  BAND_MIN,
  computeDeckLayout,
  type DeckLayoutInput,
  grownGlobeTransform,
  grownReach,
  openHeightNeedsMeasuring,
  openStoryHeight,
} from '../lib/deck-layout';

// Line heights as `makeTextVariants` resolves them on a 360-wide window
// (`fs` scale 0.96): caption 12×1.55, labelXs 11×1.55, title 20×1.2, body 16×1.55.
const SMALL_LINES = { caption: 18.6, labelXs: 17.05, title: 24, body: 24.8 };
// And on a 430-wide one (scale 1.1): caption 14, labelXs 12, title 23, body 19.
const LARGE_LINES = { caption: 21.7, labelXs: 18.6, title: 27.6, body: 29.45 };
const CAPS = { caption: 1.5, labelXs: 1.4, title: 1.3, body: 1.5 };

function tall(overrides: Partial<DeckLayoutInput> = {}): DeckLayoutInput {
  return {
    width: 430,
    height: 932,
    chromeHeight: 171,
    bottomInset: 34,
    fontScale: 1,
    lines: LARGE_LINES,
    caps: CAPS,
    ...overrides,
  };
}

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
    // 16 handle + 17 kicker + 4 + 48 title + 8 + 3×25 hook + 16 + 72 dock (48 row + 24 inset)
    expect(layout.dock).toBe(72);
    expect(layout.peek).toBe(256);
    expect(layout.band).toBe(256);
    expect(layout.radius).toBe(118);
    expect(layout.centerY).toBe(256);
  });

  it('keeps the globe its share of the window when the type grows', () => {
    const layout = computeDeckLayout(small({ fontScale: 1.3 }));
    // The card wants 296; the globe's 34% floor caps it, and the hook runs
    // on under the dock.
    expect(layout.peek).toBe(294);
    expect(layout.band).toBe(218);
  });

  it('never lets the globe band drop under the absolute minimum', () => {
    const layout = computeDeckLayout(small({ height: 480, fontScale: 1.5 }));
    expect(layout.band).toBeGreaterThanOrEqual(BAND_MIN);
  });

  it('spends a tall phone on the globe, not on white space', () => {
    const layout = computeDeckLayout(tall());
    // 16 + 19 + 4 + 56 + 8 + 3×29 + 16 + 82
    expect(layout.peek).toBe(288);
    expect(layout.band).toBe(473);
    expect(layout.radius).toBe(198);
  });

  it('opens every story to one height, leaving the globe a band under the bar', () => {
    const layout = computeDeckLayout(small());
    // The longest story wants 657; the 140pt band caps it.
    expect(layout.full).toBe(640 - 128 - BAND_MIN);
    expect(layout.storyBand).toBe(BAND_MIN);
    expect(layout.storyRadius).toBe(64);
    expect(layout.storyCenterY).toBe(128 + BAND_MIN / 2);
  });

  it('stops at the longest story when the window has room to spare', () => {
    // 1300, not 1100: once every block draws its own paragraph gap the
    // estimate outgrew a 1100pt window, where `storyCap` — not the story —
    // decided the height and this test stopped testing what it says.
    const layout = computeDeckLayout(tall({ height: 1300 }));
    // 16 + 19 + 4 + 56 + 8 + 15×29 story + 40 block gaps + 16 + 22 odds
    // + 8 + 40 actions + 82 dock
    //
    // 15 is STORY_LINES: the writer's 560-character ceiling counted per block
    // at ~43 characters a line. 40 is the four gaps between five blocks, at
    // `mdStyles.sentence`'s marginBottom. Both move with the writer's budget;
    // `scripts/lib/article-budget.test.js` is what holds them together.
    expect(layout.full).toBe(746);
    expect(layout.storyBand).toBe(1300 - 171 - 746);
  });

  it('lets the globe band cap the estimate on a real phone', () => {
    // The stand-in estimate no longer fits a 932pt window — it is the worst
    // case the writer's ceiling allows, set as five separate paragraphs — so
    // `storyCap` binds and the globe keeps its 20%. This is the first frame
    // only: `StoryMeasure` replaces it with the day's measured cards.
    const layout = computeDeckLayout(tall());
    expect(layout.full).toBe(932 - 171 - Math.round(0.2 * 932));
    expect(layout.storyBand).toBe(Math.round(0.2 * 932));
  });

  it('opens to the measured card height once there is one, not the estimate', () => {
    const estimated = computeDeckLayout(tall({ height: 1100 }));
    // 16 handle + a 300pt card (its actions included) + 82 dock
    const measured = computeDeckLayout(tall({ height: 1100, storyContent: 300 }));
    expect(measured.full).toBe(398);
    expect(measured.full).toBeLessThan(estimated.full);
    // The peek does not depend on it.
    expect(measured.peek).toBe(estimated.peek);
  });

  it('never opens shorter than the resting card, however short today is', () => {
    const layout = computeDeckLayout(small({ storyContent: 40 }));
    expect(layout.full).toBe(layout.peek);
  });

  it('keeps the globe a fifth of a tall window with a story open', () => {
    const layout = computeDeckLayout(tall());
    expect(layout.full).toBe(932 - 171 - Math.round(0.2 * 932));
  });
});

describe('grownGlobeTransform', () => {
  it('lands the resting centre on the open centre at the open radius', () => {
    const layout = computeDeckLayout(small());
    const { scale, translateY } = grownGlobeTransform(layout, 640);
    expect(scale * layout.radius).toBeCloseTo(0.46 * layout.storyBand);
    // Scaling about the canvas centre, then translating.
    const landed = 320 + scale * (layout.centerY - 320) + translateY;
    expect(landed).toBeCloseTo(layout.storyCenterY);
  });

  it('never draws the open disc larger than the resting one', () => {
    const roomy = computeDeckLayout(tall({ height: 1100 }));
    expect(grownGlobeTransform(roomy, 1100).scale).toBeLessThanOrEqual(1);
  });
});

describe('grownReach', () => {
  it('covers every screen corner under the open transform', () => {
    const layout = computeDeckLayout(small());
    const reach = grownReach(layout, 640);
    const { scale, translateY } = grownGlobeTransform(layout, 640);
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
  });

  it('reaches past the resting screen, which the shrink uncovers', () => {
    const layout = computeDeckLayout(small());
    expect(grownReach(layout, 640)).toBeGreaterThan(Math.hypot(180, 640 - layout.centerY));
  });
});

describe('openStoryHeight', () => {
  it('fits three in four of the day whole, not the one tallest card', () => {
    // Today's 22 cards as measured on a 411dp emulator, one of them carrying a
    // market line.
    const day = [
      353, 353, 353, 383, 383, 384, 384, 414, 414, 414, 414, 414, 414, 414, 444, 444, 444, 444, 445,
      445, 445, 475,
    ];
    expect(openStoryHeight(day)).toBe(444);
  });

  it('fits the only card whole, and waits for one', () => {
    expect(openStoryHeight([401.5])).toBe(402);
    expect(openStoryHeight([])).toBeUndefined();
  });
});

describe('openHeightNeedsMeasuring', () => {
  // A typical story at the writer's budget: ~480 characters over five blocks.
  const typical = [
    'Kyiv — A machine gun, not a missile, sank a Russian drone boat on Monday.',
    "Until now only a warship's guns could counter a drone boat, which made each one a costly target to defend.",
    'Ukraine says a Sargan drone boat carried the gun and sank a Russian boat of the same kind near Crimea, a first for either navy in the war.',
    'Russia has not confirmed the loss, and no independent footage has been released to verify the claim so far.',
    'Both navies are expected to arm more unmanned boats with guns in the coming months, analysts said.',
  ];
  const short = ['A short hook.', 'Why it matters.', 'How.', 'Next.'];

  it('skips the measurement on a phone, where the cap decides the height anyway', () => {
    // Measuring every card was 742ms of a 1,365ms arrival commit (dev build).
    const stories = Array.from({ length: 44 }, () => typical);
    expect(openHeightNeedsMeasuring(tall(), stories)).toBe(false);
    expect(computeDeckLayout(tall()).full).toBe(
      computeDeckLayout(tall({ storyContent: 10_000 })).full,
    );
  });

  it('measures when a day of short stories could fit under the cap', () => {
    const stories = Array.from({ length: 44 }, () => short);
    expect(openHeightNeedsMeasuring(tall(), stories)).toBe(true);
  });

  it('measures on a tall window, where the cap leaves room for a whole story', () => {
    const stories = Array.from({ length: 44 }, () => typical);
    expect(openHeightNeedsMeasuring(tall({ width: 1024, height: 1366 }), stories)).toBe(true);
  });

  it('counts a link as the words it prints, not its markdown', () => {
    const linked = typical.map((t) => `[${t}](country:UA)`);
    const stories = Array.from({ length: 44 }, () => linked);
    expect(openHeightNeedsMeasuring(tall(), stories)).toBe(false);
    expect(openHeightNeedsMeasuring(tall(), [])).toBe(false);
  });
});
