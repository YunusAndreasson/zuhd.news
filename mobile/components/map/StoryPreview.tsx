import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  type SharedValue,
  useAnimatedScrollHandler,
  useReducedMotion,
} from 'react-native-reanimated';
import { ANIMATION, MAX_FONT_SCALE, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { Icon, IconButton, Pressable, Text } from '../primitives';
import { FeedRow } from './FeedRow';

/**
 * A story, opened in the sheet from its mark on the globe.
 *
 * The reader is still where a story is *read* — this is where it is *found*.
 * A tap on a light should answer "what is this?" without taking the earth
 * away, because the next light is the reason the reader is on this screen. So
 * the sheet stays at peek, the globe stays live and touchable above it, and a
 * tap on another mark swaps this preview rather than stacking a second one.
 *
 * **What fits at peek is decided, not left to chance.** The kicker, the title
 * and `read story` sit above the fold at the peek height on every phone; the
 * lead sentences and the other stories at the same place are below it, a drag
 * up away. A preview whose primary action was below the fold would make the
 * sheet's own handle the only way to reach the reader.
 *
 * **The dot is the only colour.** It is the mark's hue, and it is what ties
 * the light that was just tapped to the words now under it. The title stays
 * in ink: a category is a fact about the story, not a tint for its headline.
 *
 * It is the scroll view itself, with `bounces={false}`, because `MapSheet`
 * hands whatever `renderList` returns straight to a native gesture.
 */

export interface PreviewSibling {
  slug: string;
  title: string;
  meta: string;
}

interface StoryPreviewProps {
  slug: string;
  title: string;
  /** `politics · 2h ago · Kyiv`. Lowercase; the small-caps face does the rest. */
  meta: string;
  /** The category hue — the same colour the globe drew the mark in. */
  color: string;
  sentences: readonly string[];
  /** Other stories at this place the reader has not found yet. */
  siblings: readonly PreviewSibling[];
  rowHeight: number;
  scrollEnabled: boolean;
  onScrollOffset: SharedValue<number>;
  bottomInset: number;
  onRead: (slug: string) => void;
  onClose: () => void;
  onSelectSibling: (slug: string) => void;
}

/** How many of the article's sentences the preview carries — the lead and
 *  what follows it, which is the Smart Brevity top of every story. */
const LEAD_SENTENCES = 3;

/** Sentences carry the body's inline emphasis; the preview is plain text. */
function plain(sentence: string): string {
  return sentence.replace(/\*\*|__/g, '');
}

const SiblingRow = memo(function SiblingRow({
  sibling,
  height,
  onPress,
}: {
  sibling: PreviewSibling;
  height: number;
  onPress: (slug: string) => void;
}) {
  const handlePress = useCallback(() => onPress(sibling.slug), [onPress, sibling.slug]);
  return (
    <FeedRow
      height={height}
      title={sibling.title}
      meta={sibling.meta}
      onPress={handlePress}
      accessibilityLabel={sibling.title}
      accessibilityHint="Opens this story here"
    />
  );
});

export const StoryPreview = memo(function StoryPreview({
  slug,
  title,
  meta,
  color,
  sentences,
  siblings,
  rowHeight,
  scrollEnabled,
  onScrollOffset,
  bottomInset,
  onRead,
  onClose,
  onSelectSibling,
}: StoryPreviewProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      onScrollOffset.value = event.contentOffset.y;
    },
  });

  const handleRead = useCallback(() => onRead(slug), [onRead, slug]);

  const lead = sentences.slice(0, LEAD_SENTENCES);

  return (
    <Animated.ScrollView
      // Keyed by story so a swap to the next find starts at the top and fades
      // in, rather than keeping the last story's scroll position.
      key={slug}
      entering={reduceMotion ? undefined : FadeIn.duration(ANIMATION.fast)}
      style={styles.fill}
      contentContainerStyle={[styles.content, { paddingBottom: bottomInset + SPACING.lg }]}
      scrollEnabled={scrollEnabled}
      onScroll={scrollHandler}
      scrollEventThrottle={16}
      bounces={false}
      overScrollMode="never"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.kicker}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text variant="labelXs" numberOfLines={1} style={styles.kickerText}>
          {meta}
        </Text>
        <IconButton onPress={onClose} haptic="tick" accessibilityLabel="Back to all news">
          <Icon name="close" size="md" tone="secondary" />
        </IconButton>
      </View>

      <Text
        variant="title"
        numberOfLines={3}
        maxFontSizeMultiplier={MAX_FONT_SCALE.heading}
        accessibilityRole="header"
      >
        {title}
      </Text>

      <Pressable
        onPress={handleRead}
        accessibilityRole="button"
        accessibilityLabel={`Read the story: ${title}`}
        style={[styles.read, { borderColor: colors.rule }]}
      >
        <Text variant="label" tone="emphasis">
          read story
        </Text>
        <Icon name="arrow-forward" size="sm" tone="emphasis" />
      </Pressable>

      {lead.map((sentence, i) => (
        <Text key={i} variant="body" style={styles.sentence}>
          {plain(sentence)}
        </Text>
      ))}

      {siblings.length > 0 ? (
        <View style={styles.siblings}>
          <Text variant="labelXs" tone="emphasis" style={styles.siblingsHeading}>
            {`${siblings.length} more here`}
          </Text>
          {siblings.map((s) => (
            <SiblingRow key={s.slug} sibling={s} height={rowHeight} onPress={onSelectSibling} />
          ))}
        </View>
      ) : null}
    </Animated.ScrollView>
  );
});

const DOT = 8;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: SPACING.articlePadding },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
  kickerText: { flex: 1 },
  read: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: SPACING.md,
  },
  sentence: { marginBottom: SPACING.sm },
  // The sibling rows are the sheet's own `FeedRow`, which pads itself.
  siblings: { marginTop: SPACING.md, marginHorizontal: -SPACING.articlePadding },
  siblingsHeading: { paddingHorizontal: SPACING.articlePadding, paddingBottom: SPACING.xs },
});
