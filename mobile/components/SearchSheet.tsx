import {
  type BottomSheetBackdropProps,
  BottomSheetFlatList,
  type BottomSheetModal,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import type { TextInput } from 'react-native-gesture-handler';
import { CATEGORIES, LAYOUT, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import type { Article, Category } from '../types';
import { ArticleRow } from './ArticleRow';
import { EmptyState } from './EmptyState';
import { SheetLayout } from './SheetLayout';

interface SearchResult extends Article {
  category: Category;
}

interface IndexedArticle {
  article: Article;
  category: Category;
  corpus: string; // pre-lowercased searchable text
}

function buildSearchIndex(grouped: Record<Category, Article[]>): IndexedArticle[] {
  const index: IndexedArticle[] = [];
  for (const cat of CATEGORIES) {
    for (const a of grouped[cat] ?? []) {
      const corpus = [a.title, a.location ?? '', ...a.concepts, ...a.sentences]
        .join('\n')
        .toLowerCase();
      index.push({ article: a, category: cat, corpus });
    }
  }
  index.sort((a, b) => b.article.addedAt - a.article.addedAt);
  return index;
}

function searchArticles(index: IndexedArticle[], query: string): SearchResult[] {
  if (!query) return [];
  const q = query.toLowerCase();
  const results: SearchResult[] = [];
  for (const entry of index) {
    if (entry.corpus.includes(q)) {
      results.push({ ...entry.article, category: entry.category });
    }
  }
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
  const { colors, font, typography, textStyles } = useTheme();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim());
  const inputRef = useRef<TextInput>(null);
  const prevCountRef = useRef(0);

  const searchIndex = useMemo(() => buildSearchIndex(grouped), [grouped]);
  const results = useMemo(
    () => searchArticles(searchIndex, deferredQuery),
    [searchIndex, deferredQuery],
  );

  // Announce result count changes for VoiceOver (in effect, not render)
  const resultCount = results.length;
  useEffect(() => {
    if (!deferredQuery) return;
    if (resultCount === prevCountRef.current) return;
    prevCountRef.current = resultCount;
    AccessibilityInfo.announceForAccessibility(
      resultCount === 0 ? 'No results' : `${resultCount} result${resultCount === 1 ? '' : 's'}`,
    );
  }, [deferredQuery, resultCount]);

  const handleDismiss = useCallback(() => {
    setQuery('');
    prevCountRef.current = 0;
    onDismiss();
  }, [onDismiss]);

  const handleChange = useCallback((index: number) => {
    // Focus input once the sheet has settled at its snap point
    if (index === 0) {
      inputRef.current?.focus();
    }
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: SearchResult }) => (
      <ArticleRow
        slug={item.slug}
        title={item.title}
        addedAt={item.addedAt}
        category={item.category}
        location={item.location}
        onPress={onSelectArticle}
      />
    ),
    [onSelectArticle],
  );

  const keyExtractor = useCallback((item: SearchResult) => item.slug, []);

  return (
    <SheetLayout
      sheetRef={sheetRef}
      snapPoints={['85%']}
      enableDynamicSizing={false}
      renderBackdrop={renderBackdrop}
      handleTitle="search"
      onDismiss={handleDismiss}
      onChange={handleChange}
      keyboardBehavior="extend"
      keyboardBlurBehavior="none"
      enableBlurKeyboardOnGesture
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
              ...font.regular,
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
        <EmptyState message="No articles found" />
      ) : (
        <BottomSheetFlatList
          data={results}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={[styles.listContent, { paddingBottom: bottomInset + SPACING.lg }]}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            results.length > 0 ? (
              <Text style={[styles.resultCount, textStyles.smallCapsXs]}>
                {results.length} article{results.length === 1 ? '' : 's'}
              </Text>
            ) : null
          }
        />
      )}
    </SheetLayout>
  );
});

const styles = StyleSheet.create({
  inputRow: {
    paddingHorizontal: SPACING.screenPadding,
    paddingBottom: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  input: {
    height: LAYOUT.inputHeight,
    padding: 0,
  },
  listContent: {
    paddingHorizontal: SPACING.screenPadding,
  },
  resultCount: {
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
  },
});
