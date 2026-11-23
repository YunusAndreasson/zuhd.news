import { renderHook } from '@testing-library/react';
import { useStoryArrivals } from '../hooks/useStoryArrivals';

it('renders once when the reader swipes through an unchanged feed', () => {
  const slugs = ['a', 'b', 'c'];
  const rendered = jest.fn();
  const { rerender } = renderHook(
    ({ index }) => {
      rendered();
      return useStoryArrivals(slugs, index);
    },
    { initialProps: { index: 1 } },
  );
  rendered.mockClear();
  rerender({ index: 2 });
  expect(rendered).toHaveBeenCalledTimes(1);
});

it('acknowledges the whole batch on visiting a pending story in the same feed', () => {
  const { result, rerender } = renderHook(({ slugs, index }) => useStoryArrivals(slugs, index), {
    initialProps: { slugs: ['a', 'b'], index: 1 },
  });
  const slugs = ['new-a', 'new-b', 'a', 'b'];
  rerender({ slugs, index: 3 });
  rerender({ slugs, index: 2 });
  expect(result.current).toEqual({ count: 2, first: 0 });
  rerender({ slugs, index: 1 });
  expect(result.current).toEqual({ count: 0, first: -1 });
});

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
