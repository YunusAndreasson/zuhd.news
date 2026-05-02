import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchJson } from '../lib/fetchJson';
import {
  collectionToAlerts,
  GDACS_GEOJSON_URL,
  type GdacsAlert,
  isGdacsFeatureCollection,
} from '../lib/gdacs';
import { useAppResume } from './useAppResume';

const STALE_MS = 60 * 60 * 1000; // 1 hour — GDACS publishes roughly daily

/** Fetches the current GDACS Orange+Red alerts. Mirrors the silent-failure
 *  pattern of useChokepoints — any failure leaves the list empty and the
 *  globe simply skips the layer. Resume-refresh re-pulls if the app was
 *  away for more than an hour. */
export function useGdacsAlerts(): { alerts: GdacsAlert[] } {
  const [alerts, setAlerts] = useState<GdacsAlert[]>([]);

  const fetchAlerts = useCallback((signal?: AbortSignal) => {
    return fetchJson(GDACS_GEOJSON_URL, isGdacsFeatureCollection, { signal, timeoutMs: 8000 })
      .then((collection) => {
        setAlerts(collectionToAlerts(collection));
      })
      .catch(() => {
        // Silent — keeps the empty render path.
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchAlerts(controller.signal);
    return () => controller.abort();
  }, [fetchAlerts]);

  const onResume = useCallback(() => {
    fetchAlerts();
  }, [fetchAlerts]);
  useAppResume(onResume, STALE_MS);

  return useMemo(() => ({ alerts }), [alerts]);
}
