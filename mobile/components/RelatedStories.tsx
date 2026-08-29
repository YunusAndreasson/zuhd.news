import type { Article, Category } from '@shared/types';
import type { ComponentProps } from 'react';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { CATEGORIES, SPACING } from '../constants/theme';
import { ArticleRow } from './ArticleRow';
import { Text } from './primitives';

/** Cap on related stories surfaced in a sheet's strip. The matching helpers
 *  (each sheet finds its own related set) stop collecting at this count. */
export const MAX_RELATED = 3;

/** Last-resort feed-category guess from concept tags. Concepts are entity
 *  tags ("Somalia", "OPEC"), not categories, so this almost always lands on
 *  the politics fallback — prefer articles that carry their real `category`
 *  (HomeScreen's news river attaches it). The tap handler re-resolves the
 *  true category from the feed either way; this only feeds the row label. */
function resolveCategory(article: Article): Category {
  return CATEGORIES.find((c) => (article.concepts || []).includes(c)) ?? 'politics';
}

interface RelatedStoriesProps {
  articles: (Article & { category?: Category })[];
  onArticlePress: (slug: string, category: Category) => void;
  /** Reanimated entering animation forwarded to the wrapping view (stagger). */
  entering?: ComponentProps<typeof Animated.View>['entering'];
}

/** "related stories" heading + ArticleRow list, shared by ChokepointSheet and
 *  EntitySheet. Renders nothing for an empty list; callers still gate on
 *  `onArticlePress` so the stagger index only advances when it shows. */
export function RelatedStories({ articles, onArticlePress, entering }: RelatedStoriesProps) {
  if (articles.length === 0) return null;
  return (
    <Animated.View entering={entering} style={styles.section}>
      <Text variant="labelXs" style={styles.heading}>
        related stories
      </Text>
      {articles.map((a) => (
        <ArticleRow
          key={a.slug}
          slug={a.slug}
          title={a.title}
          addedAt={a.addedAt}
          category={a.category ?? resolveCategory(a)}
          location={a.location}
          onPress={onArticlePress}
        />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: SPACING.lg },
  heading: { marginBottom: SPACING.xs },
});
