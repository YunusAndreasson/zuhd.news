import type { MarketSignalsSnapshot } from '@shared/market-signals';
import type { SwipeCard } from './rank';

/** The server owns selection and revision; the client owns presentation only. */
export function marketSignalCards(
  snapshot: MarketSignalsSnapshot | null,
  now = Date.now(),
): SwipeCard[] {
  if (!snapshot || now - Date.parse(snapshot.generatedAt) > 7 * 86400000) return [];
  return snapshot.signals
    .filter((s) => now - Date.parse(s.asOf) <= 7 * 86400000)
    .map((s) => {
      const p = s.pattern;
      const label = {
        sharp: 'Sharp move',
        weekly: 'Week-long trend',
        monthly: 'Month-long trend',
        streak: p.direction > 0 ? 'Rising streak' : 'Falling streak',
        reversal: 'Reversal',
        divergence: 'Markets diverge',
      }[p.kind];
      return {
        id: `market-signal:${s.id}`,
        kind: 'reading',
        title: s.title,
        editorialRevision: s.revision,
        kicker: label,
        asOf: s.asOf,
        reading:
          s.series.values.at(-1)?.toLocaleString('en-US', { maximumFractionDigits: 0 }) ?? '',
        readingNote: 'index points',
        delta: {
          direction: p.direction > 0 ? 'up' : 'down',
          magnitude: `${Math.abs(p.changePct).toFixed(1)}%`,
          window: `${p.sessions} ${p.sessions === 1 ? 'session' : 'sessions'}`,
          valence: 'neutral',
        },
        why: s.commentary ? `${s.facts}\n\n${s.commentary}` : s.facts,
        sourceLabel: s.sourceLabel,
        sources: s.citations.map((c) => ({ label: c.title, url: c.url })),
        series: {
          values: s.series.values,
          periods: s.series.dates.map((d) =>
            new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              timeZone: 'UTC',
            }),
          ),
          label: 'Index points',
          unit: 'points',
        },
      };
    });
}
