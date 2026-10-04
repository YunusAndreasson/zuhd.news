import type { Category } from '@shared/types';
import { memo, useCallback, useMemo } from 'react';
import { type AccessibilityActionEvent, StyleSheet, View } from 'react-native';
import { categoryMarkColor, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { formatTimeAgo } from '../lib/article-utils';
import { displayLocation } from '../lib/place-names';
import type { SearchNote } from '../lib/search';
import { ListRow } from './ListRow';
import { Text } from './primitives';

interface ArticleRowProps {
  slug: string;
  title: string;
  /** When zuhd published the story — `articleTime(article)`, the time every
   *  surface prints, never `addedAt`, which a rebase on the pipeline box can
   *  reset. */
  time: number;
  category: Category;
  location: string | null;
  /** The first row of its list draws no rule above it. */
  first?: boolean;
  onPress: (slug: string, category: Category) => void;
  /** Why the row is in a search's results when its title does not show it:
   *  the words around the match, the match itself in stronger ink. */
  note?: SearchNote;
  /** A second thing the row can do, reached by a gesture the row's owner
   *  draws (Saved's swipe-to-remove). Offered to screen readers as an
   *  accessibility action, which is the only way they can reach it. */
  secondaryAction?: { label: string; onAction: (slug: string) => void };
}

export const ArticleRow = memo(function ArticleRow({
  slug,
  title,
  time,
  category,
  location,
  first,
  onPress,
  note,
  secondaryAction,
}: ArticleRowProps) {
  const { colors } = useTheme();

  const handlePress = useCallback(() => {
    onPress(slug, category);
  }, [slug, category, onPress]);

  const actions = useMemo(
    () => (secondaryAction ? [{ name: 'secondary', label: secondaryAction.label }] : undefined),
    [secondaryAction],
  );
  const handleAction = useCallback(
    (e: AccessibilityActionEvent) => {
      if (e.nativeEvent.actionName === 'secondary') secondaryAction?.onAction(slug);
    },
    [secondaryAction, slug],
  );

  return (
    <ListRow
      title={title}
      titleLines={2}
      first={first}
      onPress={handlePress}
      accessibilityLabel={note ? `${title}. ${note.before}${note.match}${note.after}` : title}
      accessibilityActions={actions}
      onAccessibilityAction={actions ? handleAction : undefined}
    >
      {/* The dot is the story's globe hue. */}
      <View style={styles.meta}>
        <View style={[styles.dot, { backgroundColor: categoryMarkColor(category, colors) }]} />
        <Text variant="caption" numberOfLines={1} style={styles.metaText}>
          {category} · {formatTimeAgo(time)}
          {location ? ` · ${displayLocation(location)}` : ''}
        </Text>
      </View>
      {note ? (
        <Text variant="caption" numberOfLines={2}>
          {note.before}
          <Text variant="captionEmphasis">{note.match}</Text>
          {note.after}
        </Text>
      ) : null}
    </ListRow>
  );
});

const DOT = 7;

const styles = StyleSheet.create({
  meta: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, marginRight: SPACING.xs },
  metaText: { flex: 1 },
});
