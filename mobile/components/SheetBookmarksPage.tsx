import type { Category } from '@shared/types';
import { useCallback, useRef, useSyncExternalStore } from 'react';
import Animated from 'react-native-reanimated';
import { articleTime } from '../lib/article-utils';
import { getSnapshot, subscribe, toggle } from '../lib/bookmark-store';
import { hapticNotification } from '../lib/haptics';
import { staggerEnter } from '../lib/stagger';
import { ArticleRow } from './ArticleRow';
import { EmptyState } from './EmptyState';
import { SwipeableRow } from './SwipeableRow';

interface SheetBookmarksPageProps {
  onSelectArticle: (slug: string, category: Category) => void;
}

export function SheetBookmarksPage({ onSelectArticle }: SheetBookmarksPageProps) {
  const bookmarks = useSyncExternalStore(subscribe, getSnapshot);
  const bookmarksRef = useRef(bookmarks);
  bookmarksRef.current = bookmarks;

  const handleRemove = useCallback((slug: string) => {
    const bookmark = bookmarksRef.current.find((b) => b.article.slug === slug);
    if (bookmark) {
      toggle(bookmark.article, bookmark.category);
      hapticNotification();
    }
  }, []);

  if (bookmarks.length === 0) {
    return <EmptyState message="nothing saved" hint="Long-press any article to save it" />;
  }

  return (
    <>
      {bookmarks.map((b, i) => (
        <Animated.View key={b.article.slug} entering={staggerEnter(i)}>
          <SwipeableRow onSwipeAction={() => handleRemove(b.article.slug)}>
            <ArticleRow
              slug={b.article.slug}
              title={b.article.title}
              time={articleTime(b.article)}
              category={b.category}
              location={b.article.location}
              onPress={onSelectArticle}
            />
          </SwipeableRow>
        </Animated.View>
      ))}
    </>
  );
}
