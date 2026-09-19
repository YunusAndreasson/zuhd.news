import type { Category } from '@shared/types';
import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
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

  // The swipe's twin for screen readers, which cannot draw it.
  const removeAction = useMemo(
    () => ({ label: 'Remove from saved', onAction: handleRemove }),
    [handleRemove],
  );

  if (bookmarks.length === 0) {
    return (
      <EmptyState message="nothing saved" hint="Tap save at the end of a story to keep it here" />
    );
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
              secondaryAction={removeAction}
            />
          </SwipeableRow>
        </Animated.View>
      ))}
    </>
  );
}
