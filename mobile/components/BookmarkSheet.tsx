import {
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { memo, useCallback, useRef, useSyncExternalStore } from 'react';

import { StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ANIMATION, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { getSnapshot, subscribe, toggle } from '../lib/bookmark-store';
import { hapticNotification } from '../lib/haptics';
import type { Category } from '../types';
import { ArticleRow } from './ArticleRow';
import { EmptyState } from './EmptyState';
import { SheetHandle } from './SheetHandle';
import { SheetContainer } from './SheetPrimitives';
import { SwipeableRow } from './SwipeableRow';

const BookmarkHandle = () => <SheetHandle title="saved" />;

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
  const { sheetStyles } = useTheme();
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
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={['50%', '85%']}
      enableDynamicSizing={false}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={sheetStyles.bg}
      handleComponent={BookmarkHandle}
      containerComponent={SheetContainer}
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
              entering={FadeInDown.duration(ANIMATION.normal).delay(Math.min(i, 8) * 40)}
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
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: SPACING.screenPadding,
  },
});
