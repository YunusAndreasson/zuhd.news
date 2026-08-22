import type { Article } from '@shared/types';
import {
  deltaFrom,
  formatMagnitudePct,
  formatMagnitudePoints,
  formatQuantity,
  formatReading,
  formatSignedPct,
  formatSignedPoints,
  GRAMS_PER_TROY_OUNCE,
  nisab,
  relatedForTags,
  seriesExtremes,
  windowChange,
  windowPointChange,
} from '../lib/cards/format';

const series = (values: number[], periods?: string[]) => ({
  values,
  periods: periods ?? values.map((_, i) => `p${i}`),
});

describe('windowChange', () => {
  it('measures across the last N observations, not the last N days', () => {
    // Brent's 60 "daily" points span 11 May to 3 Aug. Asking for 30 measures
    // 30 observations and reports the period labels it actually used.
    const c = windowChange(series([100, 110, 120, 130], ['a', 'b', 'c', 'd']), 2);
    expect(c).toEqual({ pct: expect.closeTo(18.18, 2), from: 'b', to: 'd', points: 2 });
  });

  it('clamps to the series rather than returning NaN', () => {
    const c = windowChange(series([50, 75]), 30);
    expect(c?.points).toBe(1);
    expect(c?.pct).toBeCloseTo(50, 6);
  });

  it('refuses a series it cannot divide by', () => {
    expect(windowChange(series([0, 10]), 1)).toBeNull();
    expect(windowChange(series([10]), 1)).toBeNull();
  });
});

describe('windowPointChange', () => {
  it('reports a probability move in points, not as a relative percentage', () => {
    // The live ceasefire contract went 26 → 86. As a relative change that is
    // +231%, which is arithmetic pretending to be journalism.
    const c = windowPointChange(series([26, 50, 86]), 2);
    expect(c?.pct).toBe(60);
    expect(formatSignedPoints(c?.pct ?? 0)).toBe('+60 points');
  });

  it('says "point", singular, when it moved one', () => {
    expect(formatSignedPoints(1)).toBe('+1 point');
    expect(formatSignedPoints(-1)).toBe('−1 point');
    expect(formatSignedPoints(0)).toBe('unchanged');
  });
});

describe('formatting', () => {
  it('keeps decimals where they change the meaning and drops them where they do not', () => {
    expect(formatReading(4.69, '%')).toBe('4.69');
    expect(formatReading(199.6482875619048)).toBe('200');
    expect(formatReading(4352.19)).toBe('4,352');
  });

  it('formats a count of ships differently from a price', () => {
    // 0.9 ships a day is a different fact from 1; the second digit of 128 is not.
    expect(formatQuantity(0.9)).toBe('0.9');
    expect(formatQuantity(8.8)).toBe('8.8');
    expect(formatQuantity(128.1)).toBe('128');
  });

  it('uses a minus sign, not a hyphen', () => {
    expect(formatSignedPct(-9.14)).toBe('−9.1%');
    expect(formatSignedPct(16.2)).toBe('+16%');
    expect(formatSignedPct(0)).toBe('unchanged');
  });
});

describe('seriesExtremes', () => {
  it('reports both extremes with the period they happened in', () => {
    expect(seriesExtremes(series([16, 32, 17], ['Jul 10', 'Jul 19', 'Aug 9']))).toEqual({
      min: 16,
      minAt: 'Jul 10',
      max: 32,
      maxAt: 'Jul 19',
    });
  });
});

describe('nisab', () => {
  // Live figures on 2026-08-09: gold $4,352.19/oz, silver $52.56/oz.
  const live = nisab(4352.19, 52.56);

  it('converts 85 g of gold and 595 g of silver from the troy ounce price', () => {
    expect(live?.gold).toBeCloseTo((4352.19 / GRAMS_PER_TROY_OUNCE) * 85, 6);
    expect(Math.round(live?.gold ?? 0)).toBe(11894);
    expect(Math.round(live?.silver ?? 0)).toBe(1005);
  });

  it('binds on the lower of the two, which is the majority position', () => {
    expect(live?.binding).toBe('silver');
    expect(live?.threshold).toBe(live?.silver);
  });

  it('binds on gold when gold is the cheaper threshold', () => {
    // Not hypothetical arithmetic for its own sake: the binding metal is a
    // market fact, so the card must not assume silver forever.
    const flipped = nisab(100, 5000);
    expect(flipped?.binding).toBe('gold');
    expect(flipped?.threshold).toBe(flipped?.gold);
  });

  it('refuses a price it cannot use rather than printing a threshold of zero', () => {
    expect(nisab(0, 52)).toBeNull();
    expect(nisab(Number.NaN, 52)).toBeNull();
  });
});

describe('relatedForTags', () => {
  const article = (slug: string, concepts: string[]): Article => ({
    slug,
    title: slug,
    date: '2026-08-22',
    addedAt: 1,
    source: null,
    sourceUrl: null,
    sources: [],
    concepts,
    eventCoverage: null,
    location: null,
    lat: null,
    lng: null,
    sentences: [],
  });

  it('matches a lowercase tag against a proper-noun concept', () => {
    const out = relatedForTags([article('a', ['Strait of Hormuz'])], ['hormuz']);
    expect(out.map((r) => r.slug)).toEqual(['a']);
  });

  it('matches whole words only, so "gulf" does not catch "Gulfstream"', () => {
    expect(relatedForTags([article('a', ['Gulfstream'])], ['gulf'])).toEqual([]);
  });

  it('ranks by how many tags an article touches', () => {
    // A fertility story that merely mentions Iran must not outrank a story
    // about the strait itself on an oil indicator.
    const strait = article('strait', ['Iran', 'Strait of Hormuz', 'Oil refinery']);
    const fertility = article('fertility', ['Iran']);
    const out = relatedForTags([fertility, strait], ['iran', 'hormuz', 'oil'], 1);
    expect(out.map((r) => r.slug)).toEqual(['strait']);
  });

  it('ignores tags too short to mean anything', () => {
    expect(relatedForTags([article('a', ['US'])], ['us'])).toEqual([]);
  });

  it('returns nothing rather than guessing when there are no tags', () => {
    expect(relatedForTags([article('a', ['Iran'])], undefined)).toEqual([]);
    expect(relatedForTags([article('a', ['Iran'])], [])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The delta chip
// ---------------------------------------------------------------------------

describe('deltaFrom', () => {
  const up = { pct: 6.8, from: 'Jul 11', to: 'Aug 9', points: 30 };
  const down = { pct: -6.8, from: 'Jul 11', to: 'Aug 9', points: 30 };

  it('names the window it measured, the way every other change here does', () => {
    expect(deltaFrom(up, null)).toMatchObject({ window: 'since Jul 11' });
    expect(deltaFrom(up, null, { window: 'on the month' })).toMatchObject({
      window: 'on the month',
    });
  });

  it('carries the direction in the arrow and the magnitude unsigned', () => {
    // The sign and the arrow are the same fact, and printing both is the
    // stutter this whole change exists to remove.
    expect(deltaFrom(up, null)).toMatchObject({ direction: 'up', magnitude: '6.8%' });
    expect(deltaFrom(down, null)).toMatchObject({ direction: 'down', magnitude: '6.8%' });
  });

  it('applies the valence to the direction, not to the number', () => {
    // This is the one that already bit: for something whose rise hurts, a
    // *fall* is the favorable direction. A lookup table of colours cannot
    // express that, which is why `riseMeans` is phrased as a question about
    // the rise.
    expect(deltaFrom(up, 'unfavorable')?.valence).toBe('unfavorable');
    expect(deltaFrom(down, 'unfavorable')?.valence).toBe('favorable');
    expect(deltaFrom(up, 'favorable')?.valence).toBe('favorable');
    expect(deltaFrom(down, 'favorable')?.valence).toBe('unfavorable');
  });

  it('says "no position" in the colour rather than by withholding it', () => {
    // `null` is a decision, not an omission — bitcoin, the gold-silver ratio,
    // how many people looked something up — and it now reads as slate. It was
    // an absent valence, which put two thirds of the app's readings in
    // near-white and made "is this coloured?" the reader's first question.
    expect(deltaFrom(up, null)?.valence).toBe('neutral');
    expect(deltaFrom(down, null)?.valence).toBe('neutral');
  });

  it('drops the arrow but keeps a colour once the move rounds to nothing', () => {
    const flat = deltaFrom({ pct: 0.02, from: 'Jul 11', to: 'Aug 9', points: 30 }, 'unfavorable');
    expect(flat).toMatchObject({ direction: 'flat', magnitude: 'unchanged' });
    // No direction to point at, so no caret — but still slate rather than
    // monochrome: a white chip in a column of coloured ones reads as a fourth
    // state rather than as the quietest one.
    expect(flat?.valence).toBe('neutral');
  });

  it('counts a percentage in points, so 26 → 86 is 60 points and never +231%', () => {
    expect(
      deltaFrom({ pct: 60, from: 'Jul 17', to: 'Aug 9', points: 20 }, null, {
        unit: 'points',
      }),
    ).toMatchObject({ direction: 'up', magnitude: '60 points' });
  });

  it('returns nothing at all rather than a chip that says nothing', () => {
    expect(deltaFrom(null, null)).toBeUndefined();
    expect(deltaFrom({ pct: Number.NaN, from: 'a', to: 'b', points: 1 }, null)).toBeUndefined();
  });
});

describe('magnitude formatters', () => {
  it('rounds exactly as the signed formatters do, so a chip and a sentence agree', () => {
    // If these ever diverge, a card can say "unchanged" in prose beside an
    // arrow claiming it moved.
    for (const pct of [0.04, 0.5, 4.44, 9.95, 10.4, 231]) {
      const signed = formatSignedPct(pct);
      const magnitude = formatMagnitudePct(pct);
      if (signed === 'unchanged') expect(magnitude).toBeNull();
      else expect(signed).toContain(magnitude as string);
    }
  });

  it('says "points" out loud, and gets the singular right', () => {
    expect(formatMagnitudePoints(1)).toBe('1 point');
    expect(formatMagnitudePoints(-60)).toBe('60 points');
    expect(formatMagnitudePoints(0.4)).toBeNull();
  });
});
