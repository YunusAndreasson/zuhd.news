import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '../constants/theme';
import { fetchWithTimeout } from '../lib/fetch';
import type { ContextBrief } from '../types';

const cache = new Map<string, ContextBrief>();
const MAX_CACHE = 50;

interface ContextBriefState {
  brief: ContextBrief | null;
  loading: boolean;
  fetchBrief: (threadId: string) => Promise<void>;
}

export function useContextBrief(): ContextBriefState {
  const [brief, setBrief] = useState<ContextBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const inflightRef = useRef<AbortController | null>(null);

  useEffect(() => () => inflightRef.current?.abort(), []);

  const fetchBrief = useCallback(async (threadId: string) => {
    // Cancel any in-flight request — its response must not overwrite this one
    inflightRef.current?.abort();

    const cached = cache.get(threadId);
    if (cached) {
      setBrief(cached);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    inflightRef.current = controller;
    setBrief(null);
    setLoading(true);

    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/context/${threadId}.json`, 5000, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ContextBrief = await res.json();
      if (cache.size >= MAX_CACHE) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(threadId, data);
      if (!controller.signal.aborted) {
        setBrief(data);
        setLoading(false);
      }
    } catch {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  return { brief, loading, fetchBrief };
}
