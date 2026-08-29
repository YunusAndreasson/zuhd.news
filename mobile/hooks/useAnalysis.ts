import type { IndicatorAnalysis } from '@shared/types';
import { useMemo } from 'react';
import { API_BASE } from '../constants/theme';
import { isAnalysisSnapshot } from '../lib/validate';
import { useFetchJson } from './useFetchJson';

const EMPTY: ReadonlyMap<string, IndicatorAnalysis> = new Map();

/**
 * Fetches `/api/analysis.json` — the desk's daily account of what moved and
 * why, written by `narrate-indicators.js` at 04:00 UTC.
 *
 * This is a second request rather than a wider `trends.json` because that
 * payload is also the website's, and a paragraph per instrument is 17KB no rail
 * row displays. Cache-first, so a relaunch shows yesterday's analysis rather
 * than a card with nothing under its chart while the network answers.
 *
 * Graceful degrade all the way down: a 404 — which is what every build before
 * this endpoint existed produces — leaves the map empty and every card falls
 * back to its standing definition, which is what they all showed before.
 */
export function useAnalysis(): {
  byId: ReadonlyMap<string, IndicatorAnalysis>;
  ready: boolean;
} {
  const { data, ready } = useFetchJson(`${API_BASE}/api/analysis.json`, isAnalysisSnapshot, {
    refreshOnResume: true,
  });

  const byId = useMemo(() => {
    if (!data) return EMPTY;
    return new Map(Object.entries(data.items));
  }, [data]);

  return { byId, ready };
}
