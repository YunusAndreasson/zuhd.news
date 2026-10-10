// Flagged markets: the indices the pipeline has singled out, and why.
//
// `/api/market-signals.json` carries at most three exchanges whose index is on
// a run worth a sentence — a sharp day, a losing streak, a month's slide —
// each with the run's own figures, a written account where the coverage
// supports one, and the stories that account cites. The app has shown them
// since they were published; the map drew those three ticks like the other
// twenty-seven.
//
// This is the DOM-free half: which signals are live, which exchange one belongs
// to, and the words for its pattern. The server owns selection and revision;
// nothing here re-decides what is notable.

import { isMarketSignalsSnapshot, type MarketSignal } from '@shared/market-signals'
import { DAY_MS } from './series-window'

export type { MarketSignal }

/**
 * How long a signal stays on the map, in days — the app's own gate
 * (`mobile/lib/cards/market-signals.ts`), on both the snapshot and the run.
 * A flag is "this is happening now", and a pipeline that stopped would
 * otherwise leave last month's streak marked indefinitely.
 */
export const SIGNAL_LIVE_DAYS = 7

/**
 * The signals worth marking, from whatever the endpoint returned.
 *
 * Validated whole by the shared guard: the payload is additive and optional,
 * so a missing or malformed one is no flags, never a thrown mount.
 */
export const liveSignals = (snapshot: unknown, now = Date.now()): MarketSignal[] => {
  if (!isMarketSignalsSnapshot(snapshot)) return []
  const fresh = (iso: string) => now - Date.parse(iso) <= SIGNAL_LIVE_DAYS * DAY_MS
  if (!fresh(snapshot.generatedAt)) return []
  return snapshot.signals.filter((s) => fresh(s.asOf))
}

/**
 * The signal on one exchange, if there is one.
 *
 * A signal's id is `mkt:<exchange id>`. Two indices can also arrive from the
 * trends feed under their own ids (`sp500`, `nasdaq100`); they belong to no
 * mark on this map and are not joined here.
 */
export const signalFor = (
  exchangeId: string,
  signals: readonly MarketSignal[],
): MarketSignal | undefined => signals.find((s) => s.id === `mkt:${exchangeId}`)

/**
 * The pattern in plain words, with its direction where it has one.
 *
 * The app says `Sharp move` and `Week-long trend` beside a coloured chip that
 * carries the direction. Here the words stand in a caption with no chip, so
 * they carry it themselves.
 */
export const patternLabel = (p: MarketSignal['pattern']): string => {
  const up = p.direction > 0
  switch (p.kind) {
    case 'sharp':
      return up ? 'Sharp rise' : 'Sharp fall'
    case 'weekly':
      return up ? 'Week-long rise' : 'Week-long fall'
    case 'monthly':
      return up ? 'Month-long rise' : 'Month-long fall'
    case 'streak':
      return up ? 'Rising streak' : 'Falling streak'
    case 'reversal':
      return 'Reversal'
    case 'divergence':
      return 'Apart from its peers'
  }
}

/**
 * `15.2% over 20 sessions`: the run's own size and length.
 *
 * Unsigned where the words beside it say which way (`Month-long fall`), and
 * signed where they do not: `Reversal` and `Apart from its peers` name a shape
 * and not a direction, and an unsigned figure after them said neither.
 */
export const patternFigure = (p: MarketSignal['pattern']): string => {
  const worded = p.kind !== 'reversal' && p.kind !== 'divergence'
  const sign = worded ? '' : p.changePct > 0 ? '+' : p.changePct < 0 ? '−' : ''
  return `${sign}${Math.abs(p.changePct).toFixed(1)}% over ${p.sessions} ${p.sessions === 1 ? 'session' : 'sessions'}`
}

/** `Month-long fall, 15.2% over 20 sessions`. */
export const patternLine = (p: MarketSignal['pattern']): string =>
  `${patternLabel(p)}, ${patternFigure(p)}`
