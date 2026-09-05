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
      const exchange = s.exchange?.trim();
      const standing = s.standing?.trim();
      const commentary = s.commentary?.trim();
      /**
       * Two paragraphs at most, and `facts` is no longer one of them.
       *
       * This is the only card in the app headed by an index symbol, and it was
       * the only one that never said what the symbol meant: `BIST 100` over
       * *"BIST 100 fell 4.8% over 4 consecutive sessions"*, at a reader who does
       * not know what BIST 100 is. That opening sentence is also the reading,
       * the delta chip and the kicker restated in prose — the chart read aloud,
       * which `cycle.md` spends a section forbidding the desk to write.
       *
       * So the definition takes its place. `commentary` follows it where the
       * window carried coverage the model could ground a cause in, which on an
       * ordinary day is nowhere — and one paragraph on those days is exactly
       * what CLAUDE.md's "only one of them is on screen" asks for.
       *
       * `facts` survives as the last rung rather than no rung: a card with no
       * `why` is a card with nothing under its chart, and the two indices that
       * arrive from the trends feed rather than the exchange catalog carry no
       * `standing`.
       */
      const why = [standing, commentary].filter(Boolean).join('\n\n') || s.facts;
      return {
        id: `market-signal:${s.id}`,
        kind: 'reading',
        title: s.title,
        editorialRevision: s.revision,
        // The exchange the index belongs to, directly above its ticker — the
        // kicker is the subject slot, and the pattern label that used to sit
        // here is not a subject. It restated the delta chip immediately below
        // it while the one line with room for an answer said nothing.
        kicker: exchange || label,
        // Where the kicker names the exchange, the pattern keeps its own line
        // in the supporting tier: what changed in this window, which is what
        // this field is for.
        changed: exchange ? label : undefined,
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
        why,
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
