import type { Indicator, TrendsSnapshot } from '@shared/types';
import { MARKET_CAVEAT, oddsByStory, oddsLabels } from '../lib/predictions';

function contract(id: string, values: number[], extra: Partial<Indicator> = {}): Indicator {
  return {
    id,
    label: `${id}?`,
    unit: '%',
    source: 'polymarket',
    sourceLabel: 'Polymarket',
    values,
    periods: values.map((_, i) => `p${i}`),
    relatedArticles: [{ slug: 'story-a', title: 'Story A' }],
    ...extra,
  };
}

const snapshot = (indicators: Indicator[]): TrendsSnapshot => ({
  fetchedAt: '2026-09-12T00:00:00Z',
  asOf: '2026-09-12',
  indicators,
});

describe('oddsByStory', () => {
  it('ties a contract to every story the desk grounded it in', () => {
    const odds = oddsByStory(
      snapshot([
        contract('poly-fed', [56, 62], {
          relatedArticles: [
            { slug: 'story-a', title: 'A' },
            { slug: 'story-b', title: 'B' },
          ],
        }),
      ]),
    );
    expect(odds.get('story-a')?.id).toBe('poly-fed');
    expect(odds.get('story-b')?.id).toBe('poly-fed');
  });

  it('ignores everything that is not a prediction market', () => {
    const brent = contract('brent', [60, 68], { source: 'fred' });
    expect(oddsByStory(snapshot([brent])).size).toBe(0);
  });

  it('ignores a contract the desk tied to nothing', () => {
    const loose = contract('poly-loose', [40, 50], { relatedArticles: [] });
    expect(oddsByStory(snapshot([loose])).size).toBe(0);
  });

  it('prints the level, which is the whole reading for a belief', () => {
    const odds = oddsByStory(snapshot([contract('poly-fed', [56, 61.6])]));
    expect(odds.get('story-a')?.level).toBe('62%');
  });

  it('measures movement in points, never as a percentage of a percentage', () => {
    // 26 → 86 is 60 points. "+231%" would be arithmetic pretending to be
    // journalism, which is the mistake `windowPointChange` exists to prevent.
    const odds = oddsByStory(snapshot([contract('poly-x', [26, 86])]));
    expect(odds.get('story-a')?.move).toBe('▲ 60 pts this week');
  });

  it('says nothing rather than "0 pts" when a contract has not moved', () => {
    expect(
      oddsByStory(snapshot([contract('poly-flat', [50, 50])])).get('story-a')?.move,
    ).toBeNull();
  });

  it('marks a fall with a down arrow', () => {
    expect(oddsByStory(snapshot([contract('poly-x', [80, 65])])).get('story-a')?.move).toBe(
      '▼ 15 pts this week',
    );
  });

  it('keeps the contract that actually reacted when two cite one story', () => {
    const sleepy = contract('poly-sleepy', [50, 51], { change24h: 1 });
    const awake = contract('poly-awake', [20, 40], { change24h: -18 });
    const odds = oddsByStory(snapshot([sleepy, awake]));
    expect(odds.get('story-a')?.id).toBe('poly-awake');
  });

  it('survives a contract with no finite values', () => {
    const empty = contract('poly-empty', []);
    expect(oddsByStory(snapshot([empty])).size).toBe(0);
  });

  it('returns nothing for an absent snapshot rather than throwing', () => {
    expect(oddsByStory(null).size).toBe(0);
  });
});

describe('oddsLabels', () => {
  it('reduces to the bare percentage a feed row can carry', () => {
    const odds = oddsByStory(snapshot([contract('poly-fed', [56, 62])]));
    expect(oddsLabels(odds).get('story-a')).toBe('62%');
  });
});

describe('the disclosure', () => {
  it('is a constant, so it cannot be edited out of one surface', () => {
    expect(MARKET_CAVEAT).toBe('a market, not a forecast');
  });
});
