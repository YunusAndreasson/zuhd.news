import { BottomSheetTextInput } from '@expo/ui/community/bottom-sheet';
import type { Article, Category, GroupedArticles } from '@shared/types';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, type TextInput, View } from 'react-native';
import { IS_ANDROID } from '../constants/platform';
import { CATEGORIES, HIT_SLOP, LAYOUT, PRESSED_STYLE, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { articleTime } from '../lib/article-utils';
import { buildSearchIndex, plainText, type SearchDoc, type SearchNote } from '../lib/search';
import { ArticleRow } from './ArticleRow';
import { EmptyState } from './EmptyState';
import { ListIntro, listStyles } from './ListRow';
import { Icon } from './primitives';
import { SheetFlatList } from './SheetContent';

interface SearchResult extends Article {
  category: Category;
  /** Why it is here, when its title does not say (`lib/search.ts`). */
  note?: SearchNote;
}

/** The feed as search reads it: the words on the card, not its markdown. */
function searchDocs(grouped: GroupedArticles): SearchDoc<SearchResult>[] {
  const docs: SearchDoc<SearchResult>[] = [];
  for (const category of CATEGORIES) {
    for (const article of grouped[category]) {
      docs.push({
        item: { ...article, category },
        time: articleTime(article),
        title: article.title,
        place: article.location ?? '',
        topics: article.concepts,
        body: article.sentences.map(plainText),
      });
    }
  }
  return docs;
}

interface SheetSearchPageProps {
  grouped: GroupedArticles;
  bottomInset: number;
  /** The words searched for, held by the menu so they outlive this page. */
  query: string;
  onQueryChange: (query: string) => void;
  onSelectArticle: (slug: string, category: Category) => void;
}

export function SheetSearchPage({
  grouped,
  bottomInset,
  query,
  onQueryChange: setQuery,
  onSelectArticle,
}: SheetSearchPageProps) {
  const { colors, textVariants, resolvedAppearance } = useTheme();
  const deferredQuery = useDeferredValue(query.trim());
  const inputRef = useRef<TextInput>(null);

  const searchIndex = useMemo(() => buildSearchIndex(searchDocs(grouped)), [grouped]);
  const results = useMemo(
    () =>
      searchIndex
        .search(deferredQuery)
        .map((hit): SearchResult => ({ ...hit.item, note: hit.note })),
    [searchIndex, deferredQuery],
  );

  const resultCount = results.length;
  useEffect(() => {
    if (!deferredQuery) return;
    // A different query deserves feedback even when its count is unchanged,
    // including the first search returning zero matches.
    const timer = setTimeout(() => {
      AccessibilityInfo.announceForAccessibility(
        resultCount === 0 ? 'No results' : `${resultCount} result${resultCount === 1 ? '' : 's'}`,
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [deferredQuery, resultCount]);

  // The keyboard comes up for a search still to be typed. Reopened on one
  // already made, the page is its results: a keyboard there covered half of
  // them, for a reader who came back to pick the next.
  const [startedEmpty] = useState(() => query.length === 0);
  useEffect(() => {
    if (!startedEmpty) return;
    const h = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(h);
  }, [startedEmpty]);

  const renderItem = useCallback(
    ({ item, index }: { item: SearchResult; index: number }) => (
      <ArticleRow
        slug={item.slug}
        title={item.title}
        time={articleTime(item)}
        category={item.category}
        location={item.location}
        note={item.note}
        first={index === 0}
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
          placeholder="search stories…"
          placeholderTextColor={colors.textSecondary}
          // Default caret is iOS system blue — the one off-brand pixel in a
          // monochrome-plus-gold app. Tint it to the single brand accent.
          selectionColor={colors.dome}
          style={[styles.input, textVariants.body]}
          accessibilityRole="search"
          accessibilityLabel="Search stories"
          accessibilityHint="Filter stories by title, topic, or location"
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
          {/* The feed is the last couple of days. It said "every story", which
              promised an archive the app does not hold. */}
          <EmptyState message="search recent stories" hint="By title, topic or place" />
        </View>
      ) : results.length === 0 ? (
        <View style={styles.emptyFill}>
          <EmptyState message="no recent story matches" hint="Try fewer words, or another one" />
        </View>
      ) : (
        <SheetFlatList
          data={results}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          bottomInset={bottomInset}
          contentContainerStyle={listStyles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListHeaderComponent={
            <ListIntro
              note={`${results.length} ${results.length === 1 ? 'story' : 'stories'}`}
              style={styles.resultCount}
            />
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
  // `flexShrink`, not `flex`. Every sheet is content-sized now, so the box
  // these sit in has an auto height with a `maxHeight` cap — and `flex: 1`
  // carries `flexBasis: 0`, which measures to nothing in an auto-height column
  // and collapses the list to zero. `flexShrink: 1` fits the list to the cap
  // when the results overflow it and is inert when they don't.
  emptyFill: {
    flexShrink: 1,
  },
  resultCount: {
    paddingTop: SPACING.md,
  },
});
