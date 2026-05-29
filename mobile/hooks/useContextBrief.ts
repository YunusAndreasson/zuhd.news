import type { ContextBrief } from '@shared/types';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { API_BASE } from '../constants/theme';
import { fetchJson } from '../lib/fetchJson';
import { isContextBrief, parseArticleBlocks } from '../lib/validate';

/** Sanitize optional block fields on the brief and each timeline entry so
 *  downstream renderers never see malformed / unknown-type blocks from the
 *  pipeline. Also coerces `sources` to a clean string array so block source
 *  index references always resolve to usable strings. */
function normalizeBrief(raw: ContextBrief): ContextBrief {
  const hasBriefBlocks = raw.blocks !== undefined;
  const hasEntryBlocks = raw.timeline.some((e) => e.blocks !== undefined);
  const hasSources = raw.sources !== undefined;
  if (!hasBriefBlocks && !hasEntryBlocks && !hasSources) return raw;
  return {
    ...raw,
    blocks: hasBriefBlocks ? parseArticleBlocks(raw.blocks) : undefined,
    sources: hasSources
      ? (raw.sources ?? []).filter((s): s is string => typeof s === 'string' && s.length > 0)
      : undefined,
    timeline: raw.timeline.map((e) =>
      e.blocks === undefined ? e : { ...e, blocks: parseArticleBlocks(e.blocks) },
    ),
  };
}

interface ContextBriefState {
  brief: ContextBrief | null;
  loading: boolean;
  error: boolean;
  fetchBrief: (threadId: string) => Promise<void>;
  retry: () => Promise<void>;
  reset: () => void;
}

/** Imperative loader for /api/context/{threadId}.json. Uses TanStack Query's
 *  cache for dedup + offline persistence, but exposes a tap-driven API
 *  (`fetchBrief(threadId)`) so the context sheet can open before data
 *  arrives. Multiple rapid taps cancel the in-flight request and bind to
 *  the latest threadId, never overwriting later state with an older
 *  response. */
export function useContextBrief(): ContextBriefState {
  const queryClient = useQueryClient();
  const [brief, setBrief] = useState<ContextBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const lastThreadIdRef = useRef<string | null>(null);

  const fetchBrief = useCallback(
    async (threadId: string) => {
      lastThreadIdRef.current = threadId;

      // Cache-first short-circuit: if TanStack Query already has fresh data
      // for this thread, surface it synchronously without round-tripping
      // through fetchQuery (which always returns a Promise and forces a
      // microtask hop where setBrief(null) would briefly clear the UI).
      const cached = queryClient.getQueryData<ContextBrief>(['context-brief', threadId]);
      if (cached) {
        setBrief(normalizeBrief(cached));
        setLoading(false);
        setError(false);
        return;
      }

      setBrief(null);
      setLoading(true);
      setError(false);

      try {
        const raw = await queryClient.fetchQuery({
          queryKey: ['context-brief', threadId],
          queryFn: ({ signal }) =>
            fetchJson(`${API_BASE}/api/context/${threadId}.json`, isContextBrief, { signal }),
          // Cache-first within session: a brief that arrived once stays. The
          // pipeline regenerates briefs only when their thread rotates, so
          // staleness within a session is rare; cross-session staleness is
          // handled by the persister's maxAge.
          staleTime: Infinity,
        });
        // Only apply if a newer fetchBrief call hasn't superseded us.
        if (lastThreadIdRef.current !== threadId) return;
        setBrief(normalizeBrief(raw));
        setLoading(false);
      } catch {
        if (lastThreadIdRef.current !== threadId) return;
        setLoading(false);
        setError(true);
      }
    },
    [queryClient],
  );

  const retry = useCallback(async () => {
    if (lastThreadIdRef.current) await fetchBrief(lastThreadIdRef.current);
  }, [fetchBrief]);

  const reset = useCallback(() => {
    lastThreadIdRef.current = null;
    setBrief(null);
    setError(false);
    setLoading(false);
  }, []);

  return { brief, loading, error, fetchBrief, retry, reset };
}
