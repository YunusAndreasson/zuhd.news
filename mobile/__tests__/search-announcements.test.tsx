import { act, renderHook } from '@testing-library/react';
import type { GroupedArticles } from '@shared/types';
import { AccessibilityInfo } from 'react-native';
import { SheetSearchPage } from '../components/SheetSearchPage';

jest.mock('@expo/ui/community/bottom-sheet', () => ({ BottomSheetTextInput: 'input' }));
jest.mock('../hooks/useTheme', () => ({
  useTheme: () => ({ colors: {}, textVariants: { body: {} }, resolvedAppearance: 'dark' }),
}));
jest.mock('../components/ArticleRow', () => ({ ArticleRow: () => null }));
jest.mock('../components/EmptyState', () => ({ EmptyState: () => null }));
jest.mock('../components/ListRow', () => ({ ListIntro: () => null, listStyles: {} }));
jest.mock('../components/primitives', () => ({ Icon: () => null }));
jest.mock('../components/SheetContent', () => ({ SheetFlatList: () => null }));

const grouped: GroupedArticles = { politics: [], economy: [], science: [], tech: [] };
const props = { grouped, bottomInset: 0, onQueryChange: jest.fn(), onSelectArticle: jest.fn() };

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

it('announces the first empty result and another query with the same count', () => {
  const { rerender } = renderHook(({ query }) => SheetSearchPage({ ...props, query }), {
    initialProps: { query: '' },
  });
  act(() => jest.advanceTimersByTime(300));
  expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
  rerender({ query: 'first' });
  act(() => jest.advanceTimersByTime(300));
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenLastCalledWith('No results');
  rerender({ query: 'second' });
  act(() => jest.advanceTimersByTime(300));
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(2);
});

it('cancels intermediate announcements while typing, clearing, and leaving', () => {
  const { rerender, unmount } = renderHook(({ query }) => SheetSearchPage({ ...props, query }), {
    initialProps: { query: 'f' },
  });
  act(() => jest.advanceTimersByTime(100));
  rerender({ query: 'first' });
  act(() => jest.advanceTimersByTime(200));
  expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
  rerender({ query: '' });
  act(() => jest.advanceTimersByTime(300));
  expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
  rerender({ query: 'another' });
  unmount();
  act(() => jest.advanceTimersByTime(300));
  expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
});
