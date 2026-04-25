import type { ContextBrief } from '@shared/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '../constants/theme';
import { fetchJson } from '../lib/fetchJson';
import { isContextBrief, parseArticleBlocks } from '../lib/validate';

// Dev override — when true (__DEV__), every CONTEXT button returns the
// hand-crafted gallery brief instead of fetching the real one. The import is
// dynamic so Metro tree-shakes the 436-line fixture from production bundles.
const USE_DEV_GALLERY = typeof __DEV__ !== 'undefined' && __DEV__;

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

    if (USE_DEV_GALLERY) {
      const { GALLERY_BRIEF } = await import('../lib/__dev__/gallery-brief');
      setBrief(GALLERY_BRIEF);
      setLoading(false);
      return;
    }

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
      const raw = await fetchJson(`${API_BASE}/api/context/${threadId}.json`, isContextBrief, {
        signal: controller.signal,
      });
      const normalized = normalizeBrief(raw);
      if (cache.size >= MAX_CACHE) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(threadId, normalized);
      if (!controller.signal.aborted) {
        setBrief(normalized);
        setLoading(false);
      }
    } catch {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  return { brief, loading, fetchBrief };
}
