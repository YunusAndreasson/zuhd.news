import { BottomSheetFlatList, BottomSheetTextInput } from '@expo/ui/community/bottom-sheet';
import type { Article, Category } from '@shared/types';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, type TextInput, View } from 'react-native';
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
  const { colors, textVariants, resolvedAppearance } = useTheme();
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
        <Icon name="search" tone="secondary" />
        <BottomSheetTextInput
          ref={inputRef}
          value={query}
          onChangeText={setQuery}
          placeholder="search articles…"
          placeholderTextColor={colors.textSecondary}
          // Default caret is iOS system blue — the one off-brand pixel in a
          // monochrome-plus-gold app. Tint it to the single brand accent.
          selectionColor={colors.dome}
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
          // Match the iOS keyboard chrome to the app theme — a light keyboard
          // over the dark search sheet is the giveaway that breaks the illusion.
          keyboardAppearance={resolvedAppearance}
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

      {deferredQuery.length === 0 ? (
        <View style={styles.emptyFill}>
          <EmptyState message="search all coverage" hint="By title, topic, or location" />
        </View>
      ) : results.length === 0 ? (
        <View style={styles.emptyFill}>
          <EmptyState message="no articles found" hint="Try a different term" />
        </View>
      ) : (
        <BottomSheetFlatList
          data={results}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          // `flex: 1` is load-bearing under native sheets. The sheet gives its
          // content a bounded column; a list with no flex would measure to its
          // own content height, overflow the sheet and stop scrolling at the
          // fold. gorhom used to supply this from inside its scrollable HOC —
          // `BottomSheetFlatList` is now a plain RN `FlatList`, so it doesn't.
          // The `emptyFill` siblings below already assume the same bounded box.
          style={styles.list}
          contentContainerStyle={[styles.listContent, { paddingBottom: bottomInset + SPACING.lg }]}
          indicatorStyle={resolvedAppearance === 'dark' ? 'white' : 'black'}
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
    gap: SPACING.sm,
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
    // Spacing before the clear button comes from the row `gap`.
    paddingLeft: 0,
  },
  emptyFill: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: SPACING.screenPadding,
  },
  resultCount: {
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
  },
});
