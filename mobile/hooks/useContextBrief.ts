import { useCallback, useRef, useState } from 'react';
import { API_BASE } from '../constants/theme';
import { fetchWithTimeout } from '../lib/fetch';
import type { ContextBrief } from '../types';

const cache = new Map<string, ContextBrief>();
const MAX_CACHE = 50;

export function useContextBrief() {
  const [brief, setBrief] = useState<ContextBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const activeId = useRef<string | null>(null);

  const fetchBrief = useCallback(async (threadId: string) => {
    activeId.current = threadId;

    const cached = cache.get(threadId);
    if (cached) {
      setBrief(cached);
      setLoading(false);
      return;
    }

    setBrief(null);
    setLoading(true);
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/context/${threadId}.json`, 5000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ContextBrief = await res.json();
      if (cache.size >= MAX_CACHE) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(threadId, data);
      if (activeId.current === threadId) {
        setBrief(data);
      }
    } catch {
      // Sheet stays open with loading state cleared; user can dismiss and retry
    } finally {
      if (activeId.current === threadId) {
        setLoading(false);
      }
    }
  }, []);

  return { brief, loading, fetchBrief };
}
