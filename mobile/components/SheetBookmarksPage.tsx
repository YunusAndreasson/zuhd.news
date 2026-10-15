import type { Category } from '@shared/types';
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { HIT_SLOP } from '../constants/theme';
import { announce } from '../lib/announce';
import { articleTime } from '../lib/article-utils';
import { type Bookmark, getSnapshot, restore, subscribe, toggle } from '../lib/bookmark-store';
import { hapticNotification } from '../lib/haptics';
import { ArticleRow } from './ArticleRow';
import { EmptyState } from './EmptyState';
import { listStyles } from './ListRow';
import { Pressable, Stack, Text } from './primitives';
import { SheetFlatList } from './SheetContent';
import { SwipeableRow } from './SwipeableRow';

interface SheetBookmarksPageProps {
  bottomInset: number;
  onSelectArticle: (slug: string, category: Category) => void;
}

export function SheetBookmarksPage({ bottomInset, onSelectArticle }: SheetBookmarksPageProps) {
  const bookmarks = useSyncExternalStore(subscribe, getSnapshot);
  const [removed, setRemoved] = useState<Bookmark[]>([]);
  // The store's own snapshot, read when the swipe lands: the latest list, with
  // no ref mirrored from it during render — which kept the page from React
  // Compiler.
  const handleRemove = useCallback((slug: string) => {
    const bookmark = getSnapshot().find((b) => b.article.slug === slug);
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

  const renderItem = useCallback(
    ({ item: b, index }: { item: Bookmark; index: number }) => (
      <SwipeableRow id={b.article.slug} onSwipeAction={handleRemove}>
        <ArticleRow
          slug={b.article.slug}
          title={b.article.title}
          time={articleTime(b.article)}
          category={b.category}
          location={b.article.location}
          first={index === 0}
          onPress={onSelectArticle}
          secondaryAction={removeAction}
        />
      </SwipeableRow>
    ),
    [handleRemove, onSelectArticle, removeAction],
  );
  const keyExtractor = useCallback((b: Bookmark) => b.article.slug, []);

  return (
    <SheetFlatList
      data={bookmarks}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      bottomInset={bottomInset}
      contentContainerStyle={listStyles.content}
      ListEmptyComponent={
        <EmptyState message="nothing saved" hint="Tap save at the end of a story to keep it here" />
      }
      ListHeaderComponent={
        removed.length > 0 ? (
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
        ) : null
      }
    />
  );
}
