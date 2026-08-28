import type { Article } from '@shared/types';
import { prepareSwipeCards } from '../lib/cards/rank';
import type { Card, ReadingCard } from '../lib/cards/types';

function reading(id: string, values: number[], extra: Partial<ReadingCard> = {}): ReadingCard {
  return {
    id,
    kind: 'reading',
    kicker: 'test',
    title: id,
    reading: String(values.at(-1) ?? 0),
    whatItIs: `${id} explained`,
    series: {
      values,
      periods: values.map((_, index) => `p${index}`),
      label: id,
    },
    ...extra,
  };
}

function article(slug: string, eventCoverage: number): Article {
  return {
    slug,
    title: slug,
    date: '2026-08-28',
    addedAt: 1,
    source: null,
    sourceUrl: null,
    sources: [],
    concepts: [],
    eventCoverage,
    location: null,
    lat: null,
    lng: null,
    sentences: [],
  };
}

describe('prepareSwipeCards', () => {
  it('requires both a meaningful visual and explanatory copy', () => {
    const withoutVisual: Card = {
      id: 'no-visual',
      kind: 'reading',
      kicker: 'test',
      title: 'No visual',
      reading: '1',
      whatItIs: 'Explained',
    };
    const withoutExplanation = reading('no-copy', [1, 2], {
      whatItIs: undefined,
      changed: undefined,
      why: undefined,
    });
    expect(prepareSwipeCards([withoutVisual, withoutExplanation], [])).toEqual([]);
  });

  it('puts a newly changed card ahead of news relevance and movement', () => {
    const urgent = reading('urgent', [100, 101], { lead: true });
    const linked = reading('linked', [100, 200], {
      related: [{ slug: 'lead-story', title: 'Lead story' }],
    });
    expect(
      prepareSwipeCards([linked, urgent], [article('lead-story', 500)]).map((c) => c.id),
    ).toEqual(['urgent', 'linked']);
  });

  it('puts current-news relevance ahead of an otherwise unusual move', () => {
    const linked = reading('linked', [100, 101, 102], {
      related: [{ slug: 'lead-story', title: 'Lead story' }],
    });
    const mover = reading('mover', [100, 101, 102, 180]);
    expect(
      prepareSwipeCards([mover, linked], [article('lead-story', 20)]).map((c) => c.id),
    ).toEqual(['linked', 'mover']);
  });

  it('normalizes movement against each series own history', () => {
    const ordinary = reading('ordinary', [100, 110, 121, 133.1]);
    const unusual = reading('unusual', [100, 101, 102, 120]);
    const ranked = prepareSwipeCards([ordinary, unusual], []);
    expect(ranked.map((card) => card.id)).toEqual(['unusual', 'ordinary']);
    expect(ranked[0]?.ranking.normalizedMovement).toBeGreaterThan(
      ranked[1]?.ranking.normalizedMovement ?? 0,
    );
  });

  it('uses editorial order and then id as deterministic fallbacks', () => {
    const a = reading('a', [100, 100]);
    const b = reading('b', [100, 100]);
    expect(prepareSwipeCards([b, a], []).map((card) => card.id)).toEqual(['b', 'a']);
    expect(prepareSwipeCards([b, a], []).map((card) => card.id)).toEqual(['b', 'a']);
  });

  it('maps dated condition figures to a timeline visualization', () => {
    const timeline: Card = {
      id: 'calendar',
      kind: 'condition',
      visualStyle: 'timeline',
      kicker: 'ahead',
      title: 'Calendar',
      reading: '2',
      whatItIs: 'Scheduled events explained.',
      figures: [
        { label: '28 Aug', value: 'Decision' },
        { label: '2 Sep', value: 'Release' },
      ],
    };
    expect(prepareSwipeCards([timeline], [])[0]?.visualization.kind).toBe('timeline');
  });
});
