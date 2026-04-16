import {
  type BottomSheetBackdropProps,
  type BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { memo, useCallback, useRef, useSyncExternalStore } from 'react';

import { StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ANIMATION, SPACING, staggerDelay } from '../constants/theme';
import { getSnapshot, subscribe, toggle } from '../lib/bookmark-store';
import { hapticNotification } from '../lib/haptics';
import type { Category } from '../types';
import { ArticleRow } from './ArticleRow';
import { EmptyState } from './EmptyState';
import { SheetLayout } from './SheetLayout';
import { SwipeableRow } from './SwipeableRow';

interface BookmarkSheetProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  bottomInset: number;
  renderBackdrop: React.FC<BottomSheetBackdropProps>;
  onSelectArticle: (slug: string, category: Category) => void;
  onDismiss: () => void;
}

export const BookmarkSheet = memo(function BookmarkSheet({
  sheetRef,
  bottomInset,
  renderBackdrop,
  onSelectArticle,
  onDismiss,
}: BookmarkSheetProps) {
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

  return (
    <SheetLayout
      sheetRef={sheetRef}
      snapPoints={['50%', '85%']}
      enableDynamicSizing={false}
      renderBackdrop={renderBackdrop}
      handleTitle="saved"
      onDismiss={onDismiss}
    >
      <BottomSheetScrollView
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomInset + SPACING.lg }]}
      >
        {bookmarks.length === 0 ? (
          <EmptyState message="Long-press an article to save it" />
        ) : (
          bookmarks.map((b, i) => (
            <Animated.View
              key={b.article.slug}
              entering={FadeInDown.duration(ANIMATION.normal).delay(staggerDelay(i))}
            >
              <SwipeableRow onSwipeAction={() => handleRemove(b.article.slug)}>
                <ArticleRow
                  slug={b.article.slug}
                  title={b.article.title}
                  addedAt={b.article.addedAt}
                  category={b.category}
                  location={b.article.location}
                  onPress={onSelectArticle}
                />
              </SwipeableRow>
            </Animated.View>
          ))
        )}
      </BottomSheetScrollView>
    </SheetLayout>
  );
});

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: SPACING.screenPadding,
  },
});
