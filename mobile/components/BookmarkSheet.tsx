import {
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { memo, useCallback, useRef, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { type Bookmark, getSnapshot, subscribe, toggle } from '../lib/bookmark-store';
import { hapticNotification } from '../lib/haptics';
import type { Category } from '../types';
import { ArticleRow } from './ArticleRow';
import { SheetHandle } from './SheetHandle';
import { SheetContainer } from './SheetPrimitives';

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
  const { colors, font, typography, sheetStyles } = useTheme();
  const bookmarks = useSyncExternalStore(subscribe, getSnapshot);
  const bookmarksRef = useRef(bookmarks);
  bookmarksRef.current = bookmarks;

  const BookmarkHandle = useCallback(() => <SheetHandle title="saved" />, []);

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
          <View style={styles.emptyState}>
            <Text
              style={{
                fontFamily: font.regular,
                fontSize: typography.sizeBase,
                color: colors.textSecondary,
              }}
            >
              Long-press an article to save it
            </Text>
          </View>
        ) : (
          bookmarks.map((b) => (
            <ArticleRow
              key={b.article.slug}
              slug={b.article.slug}
              title={b.article.title}
              addedAt={b.article.addedAt}
              category={b.category}
              location={b.article.location}
              onPress={onSelectArticle}
              onLongPress={handleRemove}
            />
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
  emptyState: {
    alignItems: 'center',
    paddingTop: SPACING.xl,
  },
});
