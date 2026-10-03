import { API_SNAPSHOTS } from '../lib/api-snapshots';
import { useApiJson } from './useApiJson';

/** The largest companies' share prices (`lib/companies.ts`), one of the
 *  snapshots an arrival carries. */
export function useCompanies() {
  return useApiJson(API_SNAPSHOTS.companies);
}
