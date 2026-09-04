import { isMarketSignalsSnapshot } from '@shared/market-signals';
import { useMemo } from 'react';
import { marketSignalCards } from '../lib/cards/market-signals';
import { useApiJson } from './useApiJson';

export function useMarketSignals() {
  const snapshot = useApiJson('/api/market-signals.json', isMarketSignalsSnapshot);
  return useMemo(() => marketSignalCards(snapshot), [snapshot]);
}
