import { isMarketsSnapshot } from '../lib/markets';
import { useApiJson } from './useApiJson';

export function useMarkets() {
  return useApiJson('/api/markets.json', isMarketsSnapshot);
}
