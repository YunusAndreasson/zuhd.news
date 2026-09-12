import { isMarketSignalsSnapshot, type MarketSignal } from '@shared/market-signals';
import { useMemo } from 'react';
import { marketSignalCards } from '../lib/cards/market-signals';
import type { SwipeCard } from '../lib/cards/rank';
import { useApiJson } from './useApiJson';

/**
 * The server's ranked market highlights, in both the shapes the app needs.
 *
 * `cards` is what the deck and the instruments list render. `signals` is the
 * raw payload, which the globe needs and the card does not: a card has no
 * place, but the exchange behind it does, and `lat`/`lng` ride on the signal
 * rather than on the card because a `Card` deliberately carries no geometry.
 */
export interface MarketSignals {
  cards: SwipeCard[];
  signals: MarketSignal[];
}

export function useMarketSignals(): MarketSignals {
  const snapshot = useApiJson('/api/market-signals.json', isMarketSignalsSnapshot);
  return useMemo(
    () => ({ cards: marketSignalCards(snapshot), signals: snapshot?.signals ?? [] }),
    [snapshot],
  );
}
