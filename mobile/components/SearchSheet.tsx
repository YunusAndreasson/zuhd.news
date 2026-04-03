import {
  type BottomSheetBackdropProps,
  BottomSheetFlatList,
  BottomSheetModal,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import { memo, useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import type { TextInput } from 'react-native-gesture-handler';
import { FullWindowOverlay } from 'react-native-screens';
import { CATEGORIES, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import type { Article, Category } from '../types';
import { ArticleRow, type ArticleRowItem } from './ArticleRow';
import { SheetHandle } from './SheetHandle';

function SheetContainer({ children }: { children?: React.ReactNode }) {
  return <FullWindowOverlay>{children}</FullWindowOverlay>;
}

interface SearchResult extends Article {
  category: Category;
}

function searchArticles(grouped: Record<Category, Article[]>, query: string): SearchResult[] {
  if (!query) return [];
  const q = query.toLowerCase();
  const results: SearchResult[] = [];
  for (const cat of CATEGORIES) {
    for (const a of grouped[cat] ?? []) {
      if (
        a.title.toLowerCase().includes(q) ||
        a.location?.toLowerCase().includes(q) ||
        a.concepts.some((c) => c.toLowerCase().includes(q)) ||
        a.sentences.some((s) => s.toLowerCase().includes(q))
      ) {
        results.push({ ...a, category: cat });
      }
    }
  }
  results.sort((a, b) => b.addedAt - a.addedAt);
  return results;
}

// ---------------------------------------------------------------------------
// Search sheet
// ---------------------------------------------------------------------------

interface SearchSheetProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  grouped: Record<Category, Article[]>;
  bottomInset: number;
  renderBackdrop: React.FC<BottomSheetBackdropProps>;
  onSelectArticle: (slug: string, category: Category) => void;
  onDismiss: () => void;
}

export const SearchSheet = memo(function SearchSheet({
  sheetRef,
  grouped,
  bottomInset,
  renderBackdrop,
  onSelectArticle,
  onDismiss,
}: SearchSheetProps) {
  const { colors, font, typography, sheetStyles } = useTheme();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim());
  const inputRef = useRef<TextInput>(null);
  const prevCountRef = useRef(0);

  const results = useMemo(() => searchArticles(grouped, deferredQuery), [grouped, deferredQuery]);

  // Announce result count changes for VoiceOver
  const resultCount = results.length;
  if (deferredQuery && resultCount !== prevCountRef.current) {
    prevCountRef.current = resultCount;
    AccessibilityInfo.announceForAccessibility(
      resultCount === 0 ? 'No results' : `${resultCount} result${resultCount === 1 ? '' : 's'}`,
    );
  }

  const SearchHandle = useCallback(() => <SheetHandle title="search" />, []);

  const handleDismiss = useCallback(() => {
    setQuery('');
    prevCountRef.current = 0;
    onDismiss();
  }, [onDismiss]);

  const handleChange = useCallback((index: number) => {
    // Auto-focus input when sheet first appears
    if (index === 0) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: ArticleRowItem }) => <ArticleRow item={item} onPress={onSelectArticle} />,
    [onSelectArticle],
  );

  const keyExtractor = useCallback((item: SearchResult) => item.slug, []);

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={['50%', '85%']}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={sheetStyles.bg}
      handleComponent={SearchHandle}
      containerComponent={SheetContainer}
      onDismiss={handleDismiss}
      onChange={handleChange}
      keyboardBehavior="extend"
      keyboardBlurBehavior="none"
      android_keyboardInputMode="adjustResize"
    >
      <View style={[styles.inputRow, { borderBottomColor: colors.rule }]}>
        <BottomSheetTextInput
          ref={inputRef}
          value={query}
          onChangeText={setQuery}
          placeholder="Search articles..."
          placeholderTextColor={colors.textSecondary}
          style={[
            styles.input,
            {
              fontFamily: font.regular,
              fontSize: typography.sizeBase,
              color: colors.text,
            },
          ]}
          accessibilityRole="search"
          accessibilityLabel="Search articles"
          accessibilityHint="Filter articles by title, topic, or location"
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {deferredQuery.length > 0 && results.length === 0 ? (
        <View style={styles.emptyState}>
          <Text
            style={{
              fontFamily: font.regular,
              fontSize: typography.sizeSm,
              color: colors.textSecondary,
            }}
          >
            No articles found
          </Text>
        </View>
      ) : (
        <BottomSheetFlatList
          data={results}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={[styles.listContent, { paddingBottom: bottomInset + SPACING.lg }]}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  inputRow: {
    paddingHorizontal: SPACING.screenPadding,
    paddingBottom: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  input: {
    height: 40,
    padding: 0,
  },
  listContent: {
    paddingHorizontal: SPACING.screenPadding,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: SPACING.xl,
  },
});
