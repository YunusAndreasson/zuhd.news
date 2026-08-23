import type { Article } from '@shared/types';
import {
  deltaFrom,
  isFresh,
  labelledWhy,
  formatMagnitudePct,
  formatMagnitudePoints,
  formatQuantity,
  formatReading,
  formatSignedPct,
  formatSignedPoints,
  GRAMS_PER_TROY_OUNCE,
  nisab,
  plotWindow,
  readingParts,
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

  it('measures a move off zero, which is the largest one a contract can make', () => {
    // It delegated to `windowChange` and inherited a guard that belongs to
    // division: a relative change from 0 is undefined, a point change from 0
    // is just the latest value. A contract priced 0% a week ago and 45% today
    // returned null — no chip on the card, and a ranking key of 0 that sorted
    // the biggest mover last in the one column ordered by what moved.
    const c = windowPointChange(series([0, 20, 45]), 2);
    expect(c?.pct).toBe(45);
  });

  it('still refuses a window it cannot measure at all', () => {
    expect(windowPointChange(series([42]), 2)).toBeNull();
    expect(windowPointChange(series([Number.NaN, 45]), 1)).toBeNull();
  });
});

describe('windowChange keeps the guard that is its own', () => {
  it('refuses to divide by a zero base', () => {
    // Unchanged behaviour, asserted so the split above cannot quietly take it
    // with it: a relative change from 0 has no meaning.
    expect(windowChange(series([0, 20, 45]), 2)).toBeNull();
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

  it('holds the decimal in a column and drops it in a sentence', () => {
    // The fifteen-row currency table printed "+1%" beside "+0.8%" and "+3%"
    // beside "+3.5%" — two decimal positions and two pill widths describing
    // moves measured the same way over the same window. A reader reads that
    // as a difference in precision; there isn't one.
    expect(formatSignedPct(1.04, { tabular: true })).toBe('+1.0%');
    expect(formatSignedPct(2.96, { tabular: true })).toBe('+3.0%');
    expect(formatSignedPct(-0.84, { tabular: true })).toBe('−0.8%');
    // Ten and above keeps its decimal *in a column*, where the prose rule
    // ("whole numbers at ten and above") would put "+16%" beside "+0.8%" —
    // the widest pill-width disagreement in the table, on the row the eye
    // reaches first. In a sentence the rule still holds.
    expect(formatSignedPct(16.2, { tabular: true })).toBe('+16.2%');
    expect(formatSignedPct(16.2)).toBe('+16%');
    // The noise floor does not move with the register.
    expect(formatSignedPct(0.04, { tabular: true })).toBe('unchanged');
    // Prose is unchanged: "wheat +1% against a year ago" is not "+1.0%".
    expect(formatSignedPct(1.04)).toBe('+1%');
  });

  it('rounds every move by the same rule, in points as in per cent', () => {
    // `formatSignedPoints` was the last holdout on a plain `Math.round`, so
    // the same fifteen-basis-point move was "0.2 points" through the chip
    // formatter and **unchanged** through this one — which is the exact bug
    // `formatMagnitudePoints` was written to fix, still live one function
    // down.
    expect(formatMagnitudePoints(0.24)).toBe('0.2 points');
    expect(formatSignedPoints(0.24)).toBe('+0.2 points');
    expect(formatMagnitudePct(0.24)).toBe('0.2%');
    // And a move that truly rounds to nothing is still the word, not a zero.
    expect(formatSignedPoints(0.04)).toBe('unchanged');
    expect(formatMagnitudePoints(0.04)).toBeNull();
    expect(formatMagnitudePct(0.04)).toBeNull();
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
    // Sub-point moves keep a decimal rather than rounding away, because the
    // series that needs points most is a yield: the ten-year moved 0.15 over
    // the window this app holds, an integer round called that nothing, and
    // the card fell back to reporting "+3.3%" — a relative change printed
    // under a reading of "4.69%". Below the printable floor it is still null.
    expect(formatMagnitudePoints(0.4)).toBe('0.4 points');
    expect(formatMagnitudePoints(0.16)).toBe('0.2 points');
    expect(formatMagnitudePoints(0.04)).toBeNull();
  });
});

describe('isFresh', () => {
  const now = new Date('2026-08-23T00:00:00Z');

  it('accepts a payload inside the window', () => {
    expect(isFresh('2026-08-16', now, 14)).toBe(true);
    expect(isFresh('2026-08-23', now, 14)).toBe(true);
  });

  it('rejects one that has gone stale', () => {
    expect(isFresh('2026-08-01', now, 14)).toBe(false);
  });

  it('rejects a payload dated in the future, which every gate used to accept', () => {
    // `daysSince` is negative ahead of the clock and every gate was written
    // `daysSince(...) <= limit`, so clock skew, a foreign timezone or a typed
    // `2027` all satisfied it — and the card they let through is the one that
    // tells the reader its data moved this morning.
    expect(isFresh('2027-08-16', now, 14)).toBe(false);
    expect(isFresh('2026-08-24', now, 14)).toBe(false);
  });

  it('treats a date it cannot read as stale, not as fresh', () => {
    expect(isFresh(undefined, now, 14)).toBe(false);
    expect(isFresh('', now, 14)).toBe(false);
    expect(isFresh('not a date', now, 14)).toBe(false);
  });

  it('reads an offsetless timestamp as UTC, not as the reader’s local time', () => {
    // The spec splits on this: a date-only form is UTC, a date-*time* with no
    // designator is local. GDACS emits the second — "modifiedDate":
    // "2026-08-23T04:15:01" — and every other dated field the cards gate on is
    // the first, so one payload was being read in two zones.
    //
    // West of UTC the bare string parsed *ahead* of the real instant, so the
    // freshest hazard alerts in the file looked like they came from the
    // future, and `isFresh` — whose whole job is rejecting the future — threw
    // them out. `disasterCard` looks for exactly those alerts, so the card
    // leading `commodities` vanished for those readers.
    const at = new Date('2026-08-23T06:00:00Z');
    expect(isFresh('2026-08-23T04:15:01', at, 14)).toBe(true);
    // And a genuinely future instant is still refused.
    expect(isFresh('2026-08-23T09:15:01', at, 14)).toBe(false);
  });

  it('leaves a stamp that carries its own offset alone', () => {
    const at = new Date('2026-08-23T06:00:00Z');
    expect(isFresh('2026-08-23T04:15:01Z', at, 14)).toBe(true);
    expect(isFresh('2026-08-23T06:15:01+02:00', at, 14)).toBe(true);
  });
});

describe('readingParts', () => {
  it('reads a unit aloud instead of printing the data column', () => {
    expect(readingParts(95.4, '$/bbl')).toEqual({ reading: '$95', note: 'a barrel' });
    expect(readingParts(4586.2, '$/oz')).toEqual({ reading: '$4,586', note: 'an ounce' });
    expect(readingParts(4.69, '%')).toEqual({ reading: '4.69%' });
    expect(readingParts(2409.1, '$')).toEqual({ reading: '$2,409', note: undefined });
  });

  it('gives an index no note, because "index" cannot say what is counted', () => {
    expect(readingParts(16.01, 'index')).toEqual({ reading: '16' });
  });

  it('is what the sheet uses too, so a card and its sheet cannot disagree', () => {
    // `EntitySheet` appended `indicator.unit` raw: "4.69 %" against the card's
    // "4.69%", "95 $/bbl" against "$95 a barrel", "16 index" against "16".
    const { reading, note } = readingParts(4.69, '%');
    expect(`${reading}${note ? ` ${note}` : ''}`).toBe('4.69%');
  });
});

describe('labelledWhy', () => {
  it('gives a paragraph and its owner together', () => {
    expect(labelledWhy('The world price of milling wheat…', 'on wheat')).toEqual({
      why: 'The world price of milling wheat…',
      whyLabel: 'on wheat',
    });
  });

  it('drops both when the paragraph is only whitespace', () => {
    // Three cards guarded the label on `standing?.trim()` and passed `why`
    // through unguarded, so "   " drew the rule and an empty body with no
    // label above it — two fields answering different questions about one
    // string.
    expect(labelledWhy('   ', 'on wheat')).toEqual({});
    expect(labelledWhy(undefined, 'on wheat')).toEqual({});
  });
});

describe('plotWindow', () => {
  /** Sixty-one daily observations, the shape `brent` actually ships. */
  const series = {
    values: Array.from({ length: 61 }, (_, i) => 100 + i),
    periods: Array.from({ length: 61 }, (_, i) => `d${i}`),
  };

  it('plots the window the chip measured and nothing either side of it', () => {
    // The bug this exists for: `DAILY_WINDOW` measures thirty observations and
    // brent ships sixty-one, so the card said "up 33%, since Jul 7" over a
    // line that opened on 26 May and fell across the width of the screen.
    const change = windowChange(series, 30);
    const plot = plotWindow(series, change);
    expect(plot.values).toHaveLength(31);
    expect(plot.periods[0]).toBe(change?.from);
    expect(plot.periods[plot.periods.length - 1]).toBe(change?.to);
  });

  it('opens the chart at the level the chip is measured from', () => {
    const change = windowChange(series, 30);
    const plot = plotWindow(series, change);
    // The reference line and the chip's denominator are the same number, which
    // is the whole point of returning them together.
    expect(plot.baseline).toBe(plot.values[0]);
    expect(plot.baseline).toBe(series.values[30]);
  });

  it('leaves a series whose window is the whole of it exactly as it was', () => {
    // Every FX mover, every contract and the nisab metal take this path: the
    // chip already spans the series, so the only thing added is the reference.
    const change = windowChange(series, series.values.length - 1);
    const plot = plotWindow(series, change);
    expect(plot.values).toEqual(series.values);
    expect(plot.periods).toEqual(series.periods);
    expect(plot.baseline).toBe(series.values[0]);
  });

  it('keeps the reference on a series too short to cut but not too short to read', () => {
    // The six-point ceasefire contract, which is both the shortest series in
    // the app and one whose chart is already exactly its window. A length
    // guard written against slicing took the reference off the one card with
    // the least else to go on: no `standing`, one sentence of range, and a
    // curve through six readings.
    const short = { values: [83, 88, 90, 86, 89, 91], periods: ['a', 'b', 'c', 'd', 'e', 'f'] };
    const plot = plotWindow(short, windowChange(short, short.values.length - 1));
    expect(plot.values).toEqual(short.values);
    expect(plot.baseline).toBe(83);
  });

  it('draws no reference when there is no change to reference', () => {
    // A chip that never rendered cannot have a window, so nothing on the chart
    // may claim one.
    const plot = plotWindow(series, null);
    expect(plot.values).toEqual(series.values);
    expect(plot.baseline).toBeUndefined();
  });

  it('keeps the whole series rather than drawing a window too short to be a chart', () => {
    // A monthly cadence read one month back would ask for two points. No card
    // reaches this today; the guard is for the cadence the pipeline is free to
    // introduce tomorrow. It also drops the baseline, because a reference at
    // the far right of a series it does not span reads as a claim about the
    // whole of it.
    const change = windowChange(series, 1);
    const plot = plotWindow(series, change);
    expect(plot.values).toEqual(series.values);
    expect(plot.baseline).toBeUndefined();
  });
});
