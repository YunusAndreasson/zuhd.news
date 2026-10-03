import { API_SNAPSHOTS } from '../lib/api-snapshots';
import { useApiJson } from './useApiJson';

/** The AI labs' capability scores (`lib/ai-models.ts`), one of the snapshots
 *  an arrival carries. Null on a site from before the endpoint. */
export function useAiModels() {
  return useApiJson(API_SNAPSHOTS.aiModels);
}
