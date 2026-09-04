import { act, renderHook } from '@testing-library/react';
import { AppState } from 'react-native';
import { useCardVisit } from '../hooks/useCardVisit';
import { cardStatus, clearCardHistory } from '../lib/card-history';
import type { SwipeCard } from '../lib/cards/rank';

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: { getItemSync: jest.fn(), setItemSync: jest.fn() },
}));
const card: SwipeCard = {
  id: 'oil',
  kind: 'reading',
  title: 'Oil',
  reading: '80',
  series: { values: [80], periods: ['2026-09-04'], label: 'Oil' },
};
beforeEach(() => {
  jest.useFakeTimers();
  clearCardHistory();
});
afterEach(() => jest.useRealTimers());

test('preloading does not mark viewed, foreground settled dwell does', () => {
  const { rerender } = renderHook(
    ({ active, moving }) => useCardVisit('markets', [card], active, 0, moving),
    { initialProps: { active: false, moving: false } },
  );
  act(() => jest.advanceTimersByTime(2000));
  expect(cardStatus('markets', card)).toBe('new');
  rerender({ active: true, moving: true });
  act(() => jest.advanceTimersByTime(2000));
  expect(cardStatus('markets', card)).toBe('new');
  rerender({ active: true, moving: false });
  act(() => jest.advanceTimersByTime(800));
  expect(cardStatus('markets', card)).toBe('viewed');
});
test('leaving or backgrounding before dwell cancels the view', () => {
  const { rerender } = renderHook(
    ({ active }) => useCardVisit('markets', [card], active, 0, false),
    { initialProps: { active: true } },
  );
  act(() => jest.advanceTimersByTime(400));
  rerender({ active: false });
  act(() => jest.advanceTimersByTime(1000));
  expect(cardStatus('markets', card)).toBe('new');
  rerender({ active: true });
  const listener = jest.mocked(AppState.addEventListener).mock.calls.at(-1)?.[1];
  act(() => listener?.('background'));
  act(() => jest.advanceTimersByTime(1000));
  expect(cardStatus('markets', card)).toBe('new');
});
test('new data is held until next visit and then becomes an updated card', () => {
  const { result, rerender } = renderHook(
    ({ cards, active }) => useCardVisit('markets', cards, active, 0, false),
    { initialProps: { cards: [card], active: true } },
  );
  act(() => jest.advanceTimersByTime(800));
  const changed = { ...card, reading: '81' };
  const original = result.current.pages;
  rerender({ cards: [changed], active: true });
  expect(result.current.pages).toBe(original);
  rerender({ cards: [changed], active: false });
  rerender({ cards: [changed], active: true });
  expect(result.current.pages[0]).toMatchObject({ kind: 'card', status: 'updated', card: changed });
});
