import { act, render, renderHook, screen } from '@testing-library/react';
import type { Article, Category, GroupedArticles } from '@shared/types';
import { AccessibilityInfo } from 'react-native';
import type { Bookmark } from '../lib/bookmark-store';
import type { ReactNode } from 'react';
import { SheetSearchPage } from '../components/SheetSearchPage';

let mockBookmarks: Bookmark[] = [];
jest.mock('../lib/bookmark-store', () => ({
  getSnapshot: () => mockBookmarks,
  subscribe: () => () => {},
}));
jest.mock('@expo/ui/community/bottom-sheet', () => ({ BottomSheetTextInput: () => null }));
jest.mock('../hooks/useTheme', () => ({
  useTheme: () => ({ colors: {}, textVariants: { body: {} }, resolvedAppearance: 'dark' }),
}));
jest.mock('../components/ArticleRow', () => ({
  ArticleRow: (props: {
    title: string;
    slug: string;
    category: Category;
    onPress: (slug: string, category: Category) => void;
  }) => (
    <button type="button" onClick={() => props.onPress(props.slug, props.category)}>
      {props.title}
    </button>
  ),
}));
jest.mock('../components/EmptyState', () => ({ EmptyState: () => null }));
jest.mock('../components/ListRow', () => ({ ListIntro: () => null, listStyles: {} }));
jest.mock('../components/primitives', () => ({ Icon: () => null }));
jest.mock('../components/SheetContent', () => ({
  SheetFlatList: ({
    data,
    renderItem,
  }: {
    data: Article[];
    renderItem: (row: { item: Article; index: number }) => ReactNode;
  }) => data.map((item, index) => <div key={item.slug}>{renderItem({ item, index })}</div>),
}));
Object.assign(jest.requireMock('react-native'), {
  View: ({ children }: { children?: ReactNode }) => children,
});

const grouped: GroupedArticles = { politics: [], economy: [], science: [], tech: [] };
const props = { grouped, bottomInset: 0, onQueryChange: jest.fn(), onSelectArticle: jest.fn() };

beforeEach(() => {
  mockBookmarks = [];
  jest.useFakeTimers();
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

it('announces the first empty result and another query with the same count', () => {
  const { rerender } = renderHook(({ query }) => SheetSearchPage({ ...props, query }), {
    initialProps: { query: '' },
  });
  act(() => jest.advanceTimersByTime(300));
  expect(AccessibilityInfo.announceForAccessibilityWithOptions).not.toHaveBeenCalled();
  rerender({ query: 'first' });
  act(() => jest.advanceTimersByTime(300));
  expect(AccessibilityInfo.announceForAccessibilityWithOptions).toHaveBeenLastCalledWith(
    'No results',
    { queue: true },
  );
  rerender({ query: 'second' });
  act(() => jest.advanceTimersByTime(300));
  expect(AccessibilityInfo.announceForAccessibilityWithOptions).toHaveBeenCalledTimes(2);
});

it('cancels intermediate announcements while typing, clearing, and leaving', () => {
  const { rerender, unmount } = renderHook(({ query }) => SheetSearchPage({ ...props, query }), {
    initialProps: { query: 'f' },
  });
  act(() => jest.advanceTimersByTime(100));
  rerender({ query: 'first' });
  act(() => jest.advanceTimersByTime(200));
  expect(AccessibilityInfo.announceForAccessibilityWithOptions).not.toHaveBeenCalled();
  rerender({ query: '' });
  act(() => jest.advanceTimersByTime(300));
  expect(AccessibilityInfo.announceForAccessibilityWithOptions).not.toHaveBeenCalled();
  rerender({ query: 'another' });
  unmount();
  act(() => jest.advanceTimersByTime(300));
  expect(AccessibilityInfo.announceForAccessibilityWithOptions).not.toHaveBeenCalled();
});

it('finds saved stories outside the feed and opens the sole current copy when both match', () => {
  const saved: Article = {
    slug: 'archived',
    title: 'Archived story',
    date: '2026-09-27',
    addedAt: 1,
    source: null,
    sourceUrl: null,
    sources: [],
    concepts: [],
    eventCoverage: null,
    location: null,
    lat: null,
    lng: null,
    sentences: ['A searchable sentence.'],
  };
  mockBookmarks = [
    { article: saved, category: 'science', savedAt: 2 },
    { article: { ...saved, slug: 'current', title: 'Old title' }, category: 'tech', savedAt: 3 },
  ];
  const live = { ...saved, slug: 'current', title: 'Current story' };
  render(
    <SheetSearchPage {...props} grouped={{ ...grouped, politics: [live] }} query="searchable" />,
  );
  expect(screen.getAllByRole('button')).toHaveLength(2);
  expect(screen.queryByText('Old title')).toBeNull();
  act(() => screen.getByText('Archived story').click());
  expect(props.onSelectArticle).toHaveBeenLastCalledWith('archived', 'science');
  act(() => screen.getByText('Current story').click());
  expect(props.onSelectArticle).toHaveBeenLastCalledWith('current', 'politics');
});
