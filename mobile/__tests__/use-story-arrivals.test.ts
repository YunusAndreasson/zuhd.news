import { renderHook } from '@testing-library/react';
import { useStoryArrivals } from '../hooks/useStoryArrivals';

it('keeps an arrival notice across ordinary renders, clears it on arrival, and never recreates it by scrubbing', () => {
  const { result, rerender } = renderHook(({ slugs, index }) => useStoryArrivals(slugs, index), {
    initialProps: { slugs: ['old-a', 'old-b'], index: 1 },
  });
  expect(result.current).toEqual({ count: 0, first: -1 });
  rerender({ slugs: ['new-a', 'new-b', 'old-a', 'old-b'], index: 3 });
  expect(result.current).toEqual({ count: 2, first: 0 });
  rerender({ slugs: ['new-a', 'new-b', 'old-a', 'old-b'], index: 2 });
  expect(result.current).toEqual({ count: 2, first: 0 });
  rerender({ slugs: ['new-a', 'new-b', 'old-a', 'old-b'], index: 0 });
  expect(result.current).toEqual({ count: 0, first: -1 });
  rerender({ slugs: ['new-a', 'new-b', 'old-a', 'old-b'], index: 3 });
  expect(result.current).toEqual({ count: 0, first: -1 });
});

it('uses the held slug while a feed insertion is still remapping the deck index', () => {
  const { result, rerender } = renderHook(
    ({ slugs, index, anchor }) => useStoryArrivals(slugs, index, anchor),
    { initialProps: { slugs: ['old-a', 'old-b'], index: 0, anchor: 'old-a' } },
  );
  rerender({ slugs: ['new-a', 'new-b', 'old-a', 'old-b'], index: 0, anchor: 'old-a' });
  expect(result.current).toEqual({ count: 2, first: 0 });
  rerender({ slugs: ['new-a', 'new-b', 'old-a', 'old-b'], index: 2, anchor: 'old-a' });
  expect(result.current).toEqual({ count: 2, first: 0 });
  rerender({ slugs: ['new-a', 'new-b', 'old-a', 'old-b'], index: 0, anchor: 'new-a' });
  expect(result.current).toEqual({ count: 0, first: -1 });
});
