import { BottomSheetFlatList, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import type { Article, Category } from '@shared/types';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import type { TextInput } from 'react-native-gesture-handler';
import { IS_ANDROID } from '../constants/platform';
import { CATEGORIES, HIT_SLOP, LAYOUT, PRESSED_STYLE, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { ArticleRow } from './ArticleRow';
import { EmptyState } from './EmptyState';
import { Icon, Text } from './primitives';

interface SearchResult extends Article {
  category: Category;
}

interface IndexedArticle {
  article: Article;
  category: Category;
  corpus: string;
}

function buildSearchIndex(grouped: Record<Category, Article[]>): IndexedArticle[] {
  const index: IndexedArticle[] = [];
  for (const cat of CATEGORIES) {
    for (const a of grouped[cat]) {
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

interface SheetSearchPageProps {
  grouped: Record<Category, Article[]>;
  bottomInset: number;
  onSelectArticle: (slug: string, category: Category) => void;
}

export function SheetSearchPage({ grouped, bottomInset, onSelectArticle }: SheetSearchPageProps) {
  const { colors, textVariants } = useTheme();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim());
  const inputRef = useRef<TextInput>(null);
  const prevCountRef = useRef(0);

  const searchIndex = useMemo(() => buildSearchIndex(grouped), [grouped]);
  const results = useMemo(
    () => searchArticles(searchIndex, deferredQuery),
    [searchIndex, deferredQuery],
  );

  const resultCount = results.length;
  useEffect(() => {
    if (!deferredQuery) return;
    if (resultCount === prevCountRef.current) return;
    prevCountRef.current = resultCount;
    AccessibilityInfo.announceForAccessibility(
      resultCount === 0 ? 'No results' : `${resultCount} result${resultCount === 1 ? '' : 's'}`,
    );
  }, [deferredQuery, resultCount]);

  useEffect(() => {
    const h = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(h);
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

  const showAndroidClear = IS_ANDROID && query.length > 0;

  return (
    <>
      <View style={[styles.inputRow, { borderBottomColor: colors.rule }]}>
        <BottomSheetTextInput
          ref={inputRef}
          value={query}
          onChangeText={setQuery}
          placeholder="search articles…"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, textVariants.body]}
          accessibilityRole="search"
          accessibilityLabel="Search articles"
          accessibilityHint="Filter articles by title, topic, or location"
          autoCorrect={false}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          textContentType="none"
          enablesReturnKeyAutomatically
        />
        {showAndroidClear && (
          <Pressable
            onPress={() => setQuery('')}
            hitSlop={HIT_SLOP}
            style={({ pressed }) => [styles.clearButton, pressed && PRESSED_STYLE]}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Icon name="close-circle" tone="secondary" />
          </Pressable>
        )}
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
          keyboardDismissMode="on-drag"
          ListHeaderComponent={
            results.length > 0 ? (
              <Text variant="labelXs" style={styles.resultCount}>
                {results.length} article{results.length === 1 ? '' : 's'}
              </Text>
            ) : null
          }
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.screenPadding,
    paddingBottom: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    height: LAYOUT.inputHeight,
    padding: 0,
  },
  clearButton: {
    paddingLeft: SPACING.sm,
  },
  listContent: {
    paddingHorizontal: SPACING.screenPadding,
  },
  resultCount: {
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
  },
});
