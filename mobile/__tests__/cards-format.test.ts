import type { Article } from '@shared/types';
import {
  deltaFrom,
  deltaOf,
  formatCount,
  formatMagnitudePct,
  formatMagnitudePoints,
  formatNumber,
  formatQuantity,
  formatReading,
  formatSignedPct,
  GRAMS_PER_TROY_OUNCE,
  markMove,
  moveRuns,
  nisab,
  relatedForTags,
  spokenDelta,
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
  it('measures a move from zero, which a relative change cannot', () => {
    // A rate raised off 0% moved a quarter of a point; the relative change's
    // divide-by-zero guard used to drop it.
    expect(windowPointChange(series([0, 0.25]), 1)?.pct).toBe(0.25);
  });

  it('reports a probability move in points, not as a relative percentage', () => {
    // The live ceasefire contract went 26 → 86. As a relative change that is
    // +231%, which is arithmetic pretending to be journalism.
    const c = windowPointChange(series([26, 50, 86]), 2);
    expect(c?.pct).toBe(60);
    expect(deltaFrom(c, { unit: 'points' })).toMatchObject({
      direction: 'up',
      magnitude: '60 points',
    });
  });
});

describe('formatting', () => {
  it('keeps decimals where they change the meaning and drops them where they do not', () => {
    expect(formatReading(4.69, '%')).toBe('4.69');
    expect(formatReading(199.6482875619048)).toBe('200');
    expect(formatReading(4352.19)).toBe('4,352');
  });

  it('keeps four decimals on a price under a dollar', () => {
    // At two, Dogecoin at $0.0931 read `0.09` whatever it did that week.
    expect(formatReading(0.093117, '$')).toBe('0.0931');
    expect(formatReading(0.335863, '$')).toBe('0.3359');
    // From a dollar up, and for anything that is not a price, as before.
    expect(formatReading(1.4879, '$')).toBe('1.49');
    expect(formatReading(2.91, '$/MMBtu')).toBe('2.91');
    expect(formatReading(0.85)).toBe('0.85');
    expect(formatReading(0.5, '%')).toBe('0.50');
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

  it('prints exactly what toLocaleString did, through one formatter per precision', () => {
    // The sites it replaced each built a formatter per call; the strings they
    // printed must not move by a character.
    const values = [0, -0, 0.5, 1.005, 12.5, 999.9995, 1234.5678, -78317.84, 1e7 + 0.25];
    const precisions: [number, number][] = [
      [3, 0],
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 2],
      [4, 4],
    ];
    for (const n of values) {
      expect(formatNumber(n)).toBe(n.toLocaleString('en-US'));
      for (const [max, min] of precisions) {
        expect(formatNumber(n, max, min)).toBe(
          n.toLocaleString('en-US', { maximumFractionDigits: max, minimumFractionDigits: min }),
        );
      }
      expect(formatCount(n)).toBe(Math.round(n).toLocaleString('en-US'));
    }
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
    expect(deltaFrom(up)).toMatchObject({ window: 'since Jul 11' });
    expect(deltaFrom(up, { window: 'on the month' })).toMatchObject({
      window: 'on the month',
    });
  });

  it('carries the direction in the arrow and the magnitude unsigned', () => {
    // The sign and the arrow are the same fact, and printing both is the
    // stutter this whole change exists to remove.
    expect(deltaFrom(up)).toMatchObject({ direction: 'up', magnitude: '6.8%' });
    expect(deltaFrom(down)).toMatchObject({ direction: 'down', magnitude: '6.8%' });
  });

  it('drops the arrow once the move rounds to nothing', () => {
    const flat = deltaFrom({ pct: 0.02, from: 'Jul 11', to: 'Aug 9', points: 30 });
    expect(flat).toMatchObject({ direction: 'flat', magnitude: 'unchanged' });
  });

  it('counts a percentage in points, so 26 → 86 is 60 points and never +231%', () => {
    // And marks it, so the chip leaves a contract slate (`moveTone`).
    expect(
      deltaFrom({ pct: 60, from: 'Jul 17', to: 'Aug 9', points: 20 }, { unit: 'points' }),
    ).toMatchObject({ direction: 'up', magnitude: '60 points', unit: 'points' });
    expect(deltaFrom(up)?.unit).toBeUndefined();
  });

  it('prints an index’s move in its own points, to the decimal the index has', () => {
    // An AI lab's best score: 146.8 → 167.4 is 20.6 points, not 14%.
    expect(deltaOf(20.6, { unit: 'score', window: 'over the past year' })).toEqual({
      direction: 'up',
      magnitude: '20.6 points',
      window: 'over the past year',
      size: undefined,
    });
    expect(deltaOf(0.04, { unit: 'score' })?.direction).toBe('flat');
    // Not a contract's points: nothing marks it to be left uncoloured.
    expect(deltaOf(-3, { unit: 'score' })).not.toHaveProperty('unit');
  });

  it('returns nothing at all rather than a chip that says nothing', () => {
    expect(deltaFrom(null)).toBeUndefined();
    expect(deltaFrom({ pct: Number.NaN, from: 'a', to: 'b', points: 1 })).toBeUndefined();
  });
});

describe('deltaOf', () => {
  it('is deltaFrom for a move measured some other way', () => {
    for (const pct of [-57.2, -6.8, -0.04, 0, 0.5, 6.8, 231]) {
      expect(deltaOf(pct, { window: 'over 7 days' })).toEqual(
        deltaFrom({ pct, from: 'x', to: 'y', points: 7 }, { window: 'over 7 days' }),
      );
    }
    expect(deltaOf(Number.POSITIVE_INFINITY)).toBeUndefined();
  });

  it('prints the word its caller gives a move that rounds to nothing', () => {
    // A strait at its own normal is not "unchanged": it is where it usually is.
    expect(deltaOf(0.04, { window: 'vs its 90-day normal', flat: 'at its normal' })).toEqual({
      direction: 'flat',
      magnitude: 'at its normal',
      window: 'vs its 90-day normal',
      size: 0.04,
    });
  });
});

describe('a move in words and in marks', () => {
  const up = { direction: 'up', magnitude: '5%', window: 'over 7 days', size: 5 } as const;
  const down = { direction: 'down', magnitude: '2.9%', window: 'over 7 days' } as const;
  const flat = { direction: 'flat', magnitude: 'unchanged', window: 'over 7 days' } as const;

  it('marks a move with an arrow, and one that rounds to nothing as −0%', () => {
    expect(markMove(up)).toBe('↑5%');
    expect(markMove(down)).toBe('↓2.9%');
    expect(markMove(flat)).toBe('−0%');
  });

  it('finds the moves a line prints, each with the way it went', () => {
    // What the card's sentence, a rate's year and the chooser's row print.
    expect(moveRuns('Since Jul 7, wheat +14% and rice −29%.')).toEqual([
      { text: 'Since Jul 7, wheat ' },
      { text: '+14%', direction: 'up' },
      { text: ' and rice ' },
      { text: '−29%', direction: 'down' },
      { text: '.' },
    ]);
    expect(moveRuns('−0.25 points against a year ago.')[0]).toEqual({
      text: '−0.25 points',
      direction: 'down',
    });
    for (const delta of [up, down, flat]) {
      expect(moveRuns(`markets · ${markMove(delta)} over 7 days · Sep 27`)[1]).toEqual({
        text: markMove(delta),
        direction: delta.direction,
      });
    }
    expect(moveRuns(`rice ${formatSignedPct(-9.14)}`)[1]?.direction).toBe('down');
    // A move of nothing is a word in a sentence, and still a move: slate.
    expect(moveRuns(`wheat ${formatSignedPct(0)} and rice −29%`)[1]).toEqual({
      text: 'unchanged',
      direction: 'flat',
    });
    expect(moveRuns('Unchanged against a year ago.')[0]?.direction).toBe('flat');
  });

  it('leaves a line with no move, a date range or a level as it is', () => {
    for (const line of [
      'The threshold fell with silver — more wealth is zakatable since Jul 7.',
      'Now 4.25%, down from 4.50% in Aug 2026.',
      'M 4.9 · 64 km deep',
      'Sep 21–27 · 90-day normal',
      'Down 12 points in a day.',
    ]) {
      expect(moveRuns(line)).toEqual([{ text: line }]);
    }
  });

  it('speaks the direction as a word and never says "flat unchanged"', () => {
    expect(spokenDelta(up)).toBe('up 5% over 7 days');
    expect(spokenDelta(flat)).toBe('unchanged over 7 days');
    expect(spokenDelta(up, { window: false })).toBe('up 5%');
    expect(spokenDelta({ direction: 'down', magnitude: '1%' })).toBe('down 1%');
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
