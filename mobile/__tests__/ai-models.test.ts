import {
  type AiLab,
  type AiModelsSnapshot,
  aiLabCard,
  aiLabCardId,
  aiLabMove,
  compactUsd,
  isAiModelsSnapshot,
  AI_CHANGE_WINDOW,
} from '../lib/ai-models';
import { admitted } from '../lib/cards/sections';
import type { CardSeries, ReadingCard } from '../lib/cards/types';
import { gaugeMove } from '../lib/cards/week-move';
import { moveTone } from '../lib/valence';

const NOW = Date.UTC(2026, 9, 4);

const lab = (over: Partial<AiLab> = {}): AiLab => ({
  id: 'alpha',
  name: 'Alpha',
  iso2: 'US',
  blurb: 'A lab that makes the Alpha models.',
  model: 'Alpha 5',
  score: 167.4,
  low: 164,
  high: 172.04,
  asOf: '2026-09-22',
  series: {
    periods: ['2024-02-29', '2025-09-29', '2025-11-24', '2026-09-01', '2026-09-22'],
    values: [126.9, 146.8, 150.1, 164.8, 167.4],
    models: ['Alpha 3', 'Alpha 4', 'Alpha 4.5', 'Alpha 4.9', 'Alpha 5'],
  },
  ...over,
});

const FRONTIER: AiModelsSnapshot['frontier'] = { score: 167.4, model: 'Alpha 5', lab: 'Alpha' };
const card = (over: Partial<AiLab> = {}, frontier = FRONTIER) =>
  aiLabCard(lab(over), frontier, NOW) as ReadingCard & { series: CardSeries };

describe('a lab’s card', () => {
  it('leads with the score, and says whose model it is and from when', () => {
    const c = card();
    expect(c.id).toBe(aiLabCardId('alpha'));
    expect(c.id).toBe('ai:alpha');
    expect(c).toMatchObject({
      title: 'Alpha',
      kicker: 'Alpha 5 · US',
      asOf: '2026-09-22',
      reading: '167.4',
      readingNote: 'on Epoch’s capability index',
      sourceLabel: 'Epoch AI',
    });
    // One decimal always, so a column of scores lines up.
    expect(card({ score: 130 }).reading).toBe('130.0');
  });

  it('passes the deck’s gate on its standing sentence, and fails without one', () => {
    expect(admitted(card())).toBe(true);
    expect(card().why).toBe('A lab that makes the Alpha models.');
    expect(admitted(card({ blurb: '' }))).toBe(false);
  });

  it('moves in points over 90 days, green up like any move', () => {
    // At the 90-day boundary the best available release scored 150.1.
    const delta = card().delta;
    expect(delta).toMatchObject({
      direction: 'up',
      magnitude: '17.3 points',
      window: AI_CHANGE_WINDOW,
    });
    // Points on an index are not a percentage to sort the strip on…
    expect(delta?.size).toBeUndefined();
    // …and not a contract's points either, which stay slate.
    expect(delta && moveTone(delta)).toBe('rise');
  });

  it('says so when the lab’s best has not moved in 90 days', () => {
    const still = lab({
      series: {
        periods: ['2024-01-01', '2025-06-01'],
        values: [120, 140],
        models: ['One', 'Two'],
      },
    });
    expect(aiLabMove(still, NOW)).toMatchObject({ direction: 'flat', window: AI_CHANGE_WINDOW });
  });

  it('measures a lab under 90 days old from its first model, and names that window', () => {
    const young = lab({
      series: {
        periods: ['2026-07-22', '2026-08-14'],
        values: [149.2, 155.8],
        models: ['First', 'Second'],
      },
    });
    expect(aiLabMove(young, NOW)).toMatchObject({
      direction: 'up',
      magnitude: '6.6 points',
      window: 'since Jul 22',
    });
    expect(
      aiLabMove(lab({ series: { periods: ['2026-09-22'], values: [1], models: ['x'] } }), NOW),
    ).toBeUndefined();
  });

  it('has no week, whatever its releases: it stays out of the strip', () => {
    // Two releases three weeks apart are not a weekly move.
    expect(gaugeMove(card(), NOW)).toBeNull();
  });

  it('draws the best of any lab as a rule, except on the card of the lab that holds it', () => {
    expect(card().series?.reference).toBeUndefined();
    const behind = card({ score: 157.4 }, { score: 167.4, model: 'Alpha 5', lab: 'Alpha' });
    expect(behind.series?.reference).toEqual({ value: 167.4, label: 'best: Alpha' });
    expect(card().series).toMatchObject({
      periods: lab().series.periods,
      values: lab().series.values,
      label: 'Best score at each release',
    });
  });

  it('says what the best was before, with the year when it is not this one', () => {
    expect(card().changed).toBe('Before it: Alpha 4.9, 164.8, Sep 1.');
    const older = card({
      series: {
        periods: ['2025-02-24', '2025-11-24'],
        values: [141.2, 150.1],
        models: ['Alpha 3.7', 'Alpha 4.5'],
      },
    });
    expect(older.changed).toBe('Before it: Alpha 3.7, 141.2, Feb 2025.');
  });

  it('prints the range, then the money, and marks an estimate as one', () => {
    const c = card({
      revenue: { usd: 65_000_000_000, asOf: '2026-07-31', confidence: 'Likely' },
      valuation: { usd: 965_000_000_000, asOf: '2026-05-28', confidence: 'Confident' },
    });
    expect(c.figures).toEqual([
      { label: 'likely range', value: '164–172' },
      { label: 'yearly revenue', value: '$65B', note: 'Jul 2026, estimate' },
      { label: 'valuation', value: '$965B', note: 'May 2026' },
    ]);
  });

  it('prints no money the payload does not carry, and no range without both ends', () => {
    expect(card().figures).toEqual([{ label: 'likely range', value: '164–172' }]);
    expect(card({ low: undefined }).figures).toEqual([]);
  });
});

describe('compactUsd', () => {
  it('prints dollars at the size they are quoted in', () => {
    expect(compactUsd(965_000_000_000)).toBe('$965B');
    expect(compactUsd(1_600_000_000)).toBe('$1.6B');
    expect(compactUsd(428_000_000)).toBe('$428M');
    expect(compactUsd(1_250_000_000_000)).toBe('$1.3T');
    expect(compactUsd(24_000_000_000)).toBe('$24B');
  });
});

describe('isAiModelsSnapshot', () => {
  const snapshot = (labs: unknown[], over: Record<string, unknown> = {}) => ({
    generated: '2026-10-04T05:00:00.000Z',
    frontier: FRONTIER,
    labs,
    ...over,
  });

  it('accepts the published shape, with and without money', () => {
    expect(isAiModelsSnapshot(snapshot([lab()]))).toBe(true);
    expect(
      isAiModelsSnapshot(
        snapshot([lab({ revenue: { usd: 1e9, asOf: '2026-09-08', confidence: 'Confident' } })]),
      ),
    ).toBe(true);
    // Fields the app does not read are the pipeline's to add.
    expect(isAiModelsSnapshot(snapshot([lab()], { source: 'Epoch AI', skipped: [] }))).toBe(true);
    expect(isAiModelsSnapshot(snapshot([]))).toBe(true);
  });

  it('refuses a payload a card could not be built from', () => {
    expect(isAiModelsSnapshot(null)).toBe(false);
    expect(isAiModelsSnapshot(snapshot([lab()], { frontier: undefined }))).toBe(false);
    expect(isAiModelsSnapshot(snapshot([lab(), lab()]))).toBe(false);
    expect(isAiModelsSnapshot(snapshot([{ ...lab(), score: '167' }]))).toBe(false);
    expect(isAiModelsSnapshot(snapshot([{ ...lab(), asOf: 'Sep 22' }]))).toBe(false);
    expect(
      isAiModelsSnapshot(
        snapshot([
          { ...lab(), series: { periods: ['2026-01-01'], values: [1, 2], models: ['a'] } },
        ]),
      ),
    ).toBe(false);
    // A period the chart cannot place in time.
    expect(
      isAiModelsSnapshot(
        snapshot([{ ...lab(), series: { periods: ['Sep 22'], values: [1], models: ['a'] } }]),
      ),
    ).toBe(false);
    expect(
      isAiModelsSnapshot(snapshot([{ ...lab(), revenue: { usd: 0, asOf: '2026-01-01' } }])),
    ).toBe(false);
  });
});
