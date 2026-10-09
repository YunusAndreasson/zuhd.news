import { act, renderHook } from '@testing-library/react';
import { useStableStrip } from '../hooks/useStableStrip';
import type { StripItem } from '../lib/now';
const a = { id: 'a' } as StripItem;
const b = { id: 'b' } as StripItem;
const c = { id: 'c' } as StripItem;
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());
it('holds through touch and momentum, then applies only the latest context', () => {
  const { result, rerender } = renderHook(({ items }) => useStableStrip(items, false), {
    initialProps: { items: [a] },
  });
  act(() => result.current.hold());
  rerender({ items: [b] });
  act(() => result.current.release());
  act(() => result.current.hold());
  act(() => jest.advanceTimersByTime(500));
  expect(result.current.items).toEqual([a]);
  rerender({ items: [c] });
  act(() => result.current.release());
  act(() => jest.advanceTimersByTime(150));
  expect(result.current.items).toEqual([c]);
});
it('pins an eligible selection and holds until the instrument card closes', () => {
  const { result, rerender } = renderHook(
    ({ items, locked, pinned }) => useStableStrip(items, locked, pinned),
    { initialProps: { items: [a], locked: false, pinned: undefined as StripItem | undefined } },
  );
  rerender({ items: [b], locked: true, pinned: c });
  expect(result.current.items).toEqual([c, a]);
  rerender({ items: [b], locked: true, pinned: c });
  expect(result.current.items).toEqual([c, a]);
  rerender({ items: [b], locked: false, pinned: undefined });
  expect(result.current.items).toEqual([b]);
});
it('releases a touch without momentum and cancels pending release on unmount', () => {
  const { result, rerender, unmount } = renderHook(({ items }) => useStableStrip(items, false), {
    initialProps: { items: [a] },
  });
  act(() => result.current.hold());
  rerender({ items: [b] });
  act(() => result.current.release());
  act(() => jest.advanceTimersByTime(150));
  expect(result.current.items).toEqual([b]);
  act(() => result.current.release());
  unmount();
  expect(jest.getTimerCount()).toBe(0);
});

it('defers priority changes during a swipe and promotes story links after release', () => {
  const items = [a, b];
  const { result, rerender } = renderHook(
    ({ priority }) => useStableStrip(items, false, undefined, priority),
    { initialProps: { priority: new Set<string>() } },
  );
  act(() => result.current.hold());
  rerender({ priority: new Set(['b']) });
  expect(result.current.items).toEqual([a, b]);
  act(() => result.current.release());
  act(() => jest.advanceTimersByTime(150));
  expect(result.current.items).toEqual([b, a]);
});
