import type { Category } from '@shared/types';
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Animated from 'react-native-reanimated';
import { HIT_SLOP } from '../constants/theme';
import { announce } from '../lib/announce';
import { articleTime } from '../lib/article-utils';
import { type Bookmark, getSnapshot, restore, subscribe, toggle } from '../lib/bookmark-store';
import { hapticNotification } from '../lib/haptics';
import { staggerEnter } from '../lib/stagger';
import { ArticleRow } from './ArticleRow';
import { EmptyState } from './EmptyState';
import { Pressable, Stack, Text } from './primitives';
import { SwipeableRow } from './SwipeableRow';

interface SheetBookmarksPageProps {
  onSelectArticle: (slug: string, category: Category) => void;
}

export function SheetBookmarksPage({ onSelectArticle }: SheetBookmarksPageProps) {
  const bookmarks = useSyncExternalStore(subscribe, getSnapshot);
  const [removed, setRemoved] = useState<Bookmark[]>([]);
  const bookmarksRef = useRef(bookmarks);
  bookmarksRef.current = bookmarks;

  const handleRemove = useCallback((slug: string) => {
    const bookmark = bookmarksRef.current.find((b) => b.article.slug === slug);
    if (bookmark) {
      toggle(bookmark.article, bookmark.category);
      setRemoved((previous) => [...previous, bookmark]);
      hapticNotification();
      announce('Story removed. Undo is available at the top of saved stories.');
    }
  }, []);

  const handleUndo = useCallback(() => {
    for (const bookmark of removed) restore(bookmark);
    setRemoved([]);
    hapticNotification();
    announce('Saved stories restored');
  }, [removed]);

  // The swipe's twin for screen readers, which cannot draw it.
  const removeAction = useMemo(
    () => ({ label: 'Remove from saved', onAction: handleRemove }),
    [handleRemove],
  );

  return (
    <>
      {removed.length > 0 ? (
        <Stack direction="row" justify="space-between" align="center" gap="item" paddingY="md">
          <Text variant="caption">
            {removed.length === 1 ? 'Story removed' : `${removed.length} stories removed`}
          </Text>
          <Pressable
            onPress={handleUndo}
            accessibilityRole="button"
            accessibilityLabel="Undo removal of saved stories"
            hitSlop={HIT_SLOP}
          >
            <Text variant="labelSm" tone="emphasis">
              undo
            </Text>
          </Pressable>
        </Stack>
      ) : null}
      {bookmarks.length === 0 ? (
        <EmptyState message="nothing saved" hint="Tap save at the end of a story to keep it here" />
      ) : null}
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
