import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useApiJson } from '../hooks/useApiJson';
import { useHeatmap } from '../hooks/useHeatmap';
import { API_SNAPSHOTS } from '../lib/api-snapshots';
import { fetchJsonIfChanged } from '../lib/fetchJson';

jest.mock('../lib/fetchJson', () => ({ fetchJsonIfChanged: jest.fn() }));

it('leaves stale restored layers to the coordinated arrival instead of downloading again on reconnect', async () => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: 0, refetchOnMount: false },
    },
  });
  const generated = '2026-10-01T12:00:00Z';
  const trends = { generated, trends: [] };
  const heatmap = { generated, points: [] };
  client.setQueryData(
    API_SNAPSHOTS.trends.queryKey,
    { snapshot: trends, etag: 'trends-v1' },
    { updatedAt: Date.now() - 7 * 86400000 },
  );
  client.setQueryData(
    API_SNAPSHOTS.heatmap.queryKey,
    { snapshot: heatmap, etag: 'heatmap-v1' },
    { updatedAt: Date.now() - 7 * 86400000 },
  );
  jest.mocked(fetchJsonIfChanged).mockResolvedValue({ changed: true, data: heatmap, etag: 'v2' });
  onlineManager.setOnline(false);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result, unmount } = renderHook(
    () => ({ trends: useApiJson(API_SNAPSHOTS.trends), heatmap: useHeatmap(generated) }),
    { wrapper },
  );
  try {
    expect(result.current.trends).toEqual(trends);
    expect(result.current.heatmap.ready).toBe(true);
    await act(async () => {
      onlineManager.setOnline(true);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(fetchJsonIfChanged).not.toHaveBeenCalled();
    expect(result.current.trends).toEqual(trends);
  } finally {
    unmount();
    client.clear();
    onlineManager.setOnline(true);
  }
});
