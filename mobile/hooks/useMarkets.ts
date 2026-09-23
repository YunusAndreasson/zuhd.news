import { API_SNAPSHOTS } from '../lib/api-snapshots';
import { useApiJson } from './useApiJson';

export function useMarkets() {
  return useApiJson(API_SNAPSHOTS.markets);
}
