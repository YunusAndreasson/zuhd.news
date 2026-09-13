import { COUNTRY_DATA } from '@shared/countries/country-data';
import { displayNameFromCode } from '@shared/countries/iso';
import type { Article, Entity } from '@shared/types';
import { memo, type ReactNode, useCallback, useMemo, useSyncExternalStore } from 'react';
import {
  type AccessibilityActionEvent,
  Pressable as RNPressable,
  Text as RNText,
  StyleSheet,
  View,
} from 'react-native';
import { MAX_FONT_SCALE, PROSE_BREAK_PROPS, SPACING } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { articleTime, formatTimeAgo } from '../../lib/article-utils';
import {
  getSnapshot as getBookmarks,
  subscribe as subscribeBookmarks,
} from '../../lib/bookmark-store';
import { hapticTick } from '../../lib/haptics';
import type { StoryRow } from '../../lib/map-feed';
import { COUNTRY_URL_SCHEME, makeMarkdownStyles, renderSentences } from '../../lib/markdown';
import type { RiverArticle } from '../../lib/news-order';
import { useOpenLink } from '../../lib/open-link';
import { displayLocation } from '../../lib/place-names';
import type { StoryOdds } from '../../lib/predictions';
import { articleKicker, LEAD_SENTENCES } from '../../lib/story-card';
import type { TapResult } from '../globe/MiniGlobe';
import { OddsLine } from '../OddsLine';
import { Pressable, Text } from '../primitives';

/**
 * One story, as the sheet holds it — at rest and grown, the same element.
 *
 * **At rest it answers "why should I open this".** The headline alone did
 * not: they are three to five words and often a riddle ("Drone Boat Kills
 * Drone Boat"). The first two sentences are written to be the reason — the
 * hook and why it matters — so the card leads with them, and they are what the
 * web map's preview card leads with too.
 *
 * **Grown, it is the whole story, and nothing has to load or reflow.** The
 * context and what's-next sentences, the market's odds, and the story's
 * sources, save and share are already rendered under the fold. Pulling the
 * sheet up only reveals them. There is no second reading surface to open and
 * no earth to lose: the globe stays above the card, turned to the dateline.
 *
 * **Nothing clamps.** A third title line or a long lead pushes the rest down
 * under the fold at rest and scrolls when grown — the card never ends a
 * sentence with an ellipsis.
 *
 * **Sources, save and share are words you can see.** In the full-screen
 * reader they were a tap on blank prose and a long press, taught by hint
 * pills; a card with room for a row of controls does not need a lesson.
 *
 * **The place is printed once, in the kicker.** The dateline prefix is
 * stripped from the first sentence (`renderSentences`' `location`), because
 * the kicker already says it and a grown card's globe is too small to be the
 * only thing naming it.
 */

interface StoryCardProps {
  row: StoryRow;
  /** The story's category hue — the colour its beacon was drawn in. */
  hue: string;
  odds: StoryOdds | null;
  /** Indicator ids an entity sheet can actually open; see `ArticlePage`. */
  resolvableEntityIds?: ReadonlySet<string>;
  bottomInset: number;
  /** Grow the card into the whole story. */
  onOpen: () => void;
  /** Accessibility actions: the sideways swipe, for those who cannot swipe. */
  onNext?: () => void;
  onPrevious?: () => void;
  onCountryPress: (result: TapResult) => void;
  onEntityPress: (entity: Entity) => void;
  onOddsPress: (odds: StoryOdds) => void;
  onSources: (article: Article) => void;
  onBookmark: (article: RiverArticle) => void;
  onShare: (article: RiverArticle) => void;
}

const DOT = 7;

/** Sentences as spans of one paragraph, a space between each. A nested `Text`
 *  keeps its typography and its links but drops its block margins. */
function interleave(nodes: ReactNode[]): ReactNode[] {
  const out: ReactNode[] = [];
  for (let i = 0; i < nodes.length; i++) {
    if (i > 0) out.push(' ');
    out.push(nodes[i]);
  }
  return out;
}

export const StoryCard = memo(function StoryCard({
  row,
  hue,
  odds,
  resolvableEntityIds,
  bottomInset,
  onOpen,
  onNext,
  onPrevious,
  onCountryPress,
  onEntityPress,
  onOddsPress,
  onSources,
  onBookmark,
  onShare,
}: StoryCardProps) {
  const { colors, font, typography } = useTheme();
  const { article } = row;

  const meta = useMemo(() => {
    const place = displayLocation(article.location) ?? article.location;
    return [articleKicker(article), formatTimeAgo(articleTime(article)), place]
      .filter(Boolean)
      .join(' · ');
  }, [article]);

  const mdStyles = useMemo(
    () => makeMarkdownStyles(colors, font, typography),
    [colors, font, typography],
  );

  // Only the mentions that lead somewhere — the same filter `ArticlePage`
  // applies, for the same reason: an accent-coloured word that opens nothing
  // teaches the reader that accent-coloured words lie.
  const tappableEntities = useMemo(() => {
    const all = article.entities;
    if (!all?.length || !resolvableEntityIds) return undefined;
    const usable = all.filter((e) => resolvableEntityIds.has(e.indicatorId));
    return usable.length > 0 ? usable : undefined;
  }, [article.entities, resolvableEntityIds]);

  const rawOpenLink = useOpenLink();
  const openLink = useCallback(
    (url: string) => {
      if (url.startsWith(COUNTRY_URL_SCHEME)) {
        const cc = url.slice(COUNTRY_URL_SCHEME.length).toUpperCase();
        const countryName = displayNameFromCode(cc);
        if (!countryName) return;
        hapticTick();
        onCountryPress({
          countryName,
          location: null,
          localTime: null,
          data: COUNTRY_DATA[countryName] ?? null,
        });
        return;
      }
      rawOpenLink(url);
    },
    [onCountryPress, rawOpenLink],
  );

  // One pass over all four sentences, then split: entity mentions are tagged
  // on their first occurrence across the whole body, and two passes would tag
  // a name once in the lead and again in the rest.
  const sentences = useMemo(
    () =>
      renderSentences(
        article.sentences,
        mdStyles,
        typography,
        undefined,
        article.location,
        null,
        openLink,
        undefined,
        tappableEntities,
        onEntityPress,
        true,
      ),
    [
      article.sentences,
      article.location,
      mdStyles,
      typography,
      openLink,
      tappableEntities,
      onEntityPress,
    ],
  );
  // Each half is one paragraph, not a block per sentence. Four one-sentence
  // blocks spent a paragraph gap after every sentence and left a short hook —
  // "This court sat unused for 30 years." — alone on a line with the rest of
  // it blank, which at rest was a line of lead the card had been sized to show
  // and did not. Run on, the same words take a line or two fewer.
  const lead = interleave(sentences.slice(0, LEAD_SENTENCES));
  const rest = interleave(sentences.slice(LEAD_SENTENCES));

  const accessibilityActions = useMemo(
    () => [
      { name: 'activate', label: 'Read the whole story' },
      ...(onNext ? [{ name: 'next', label: 'Next story' }] : []),
      ...(onPrevious ? [{ name: 'previous', label: 'Previous story' }] : []),
    ],
    [onNext, onPrevious],
  );
  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      const name = event.nativeEvent.actionName;
      if (name === 'activate') onOpen();
      else if (name === 'next') onNext?.();
      else if (name === 'previous') onPrevious?.();
    },
    [onNext, onOpen, onPrevious],
  );

  const handleSources = useCallback(() => onSources(article), [article, onSources]);
  const handleBookmark = useCallback(() => onBookmark(article), [article, onBookmark]);
  const handleShare = useCallback(() => onShare(article), [article, onShare]);
  const sourceCount = article.sources.length;
  // The word says what the store says. It read `save` after a save, so the
  // only confirmation was a toast that had gone by the time the reader looked
  // back, and a second tap — the natural way to check — silently unsaved it.
  const bookmarks = useSyncExternalStore(subscribeBookmarks, getBookmarks, getBookmarks);
  const saved = useMemo(
    () => bookmarks.some((b) => b.article.slug === article.slug),
    [bookmarks, article.slug],
  );

  return (
    <View style={[styles.card, { paddingBottom: bottomInset + SPACING.lg }]}>
      <RNPressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${meta}. ${row.title}`}
        accessibilityHint="Opens the whole story"
        accessibilityActions={accessibilityActions}
        onAccessibilityAction={handleAccessibilityAction}
      >
        <View style={styles.kicker}>
          <View style={[styles.dot, { backgroundColor: hue }]} />
          {row.mark ? (
            <Text variant="labelXs" tone="emphasis" numberOfLines={1}>
              {`${row.mark} · `}
            </Text>
          ) : null}
          <Text variant="labelXs" numberOfLines={1} style={styles.kickerText}>
            {meta}
          </Text>
        </View>
        <Text variant="title" maxFontSizeMultiplier={MAX_FONT_SCALE.heading} style={styles.title}>
          {row.title}
        </Text>
      </RNPressable>

      {/* The lead is a large, obvious target for "tell me more" — but not an
          accessibility element of its own: the sentences are read as text. */}
      <RNPressable onPress={onOpen} accessible={false}>
        <RNText
          {...PROSE_BREAK_PROPS}
          style={mdStyles.sentence}
          maxFontSizeMultiplier={MAX_FONT_SCALE.body}
        >
          {lead}
        </RNText>
      </RNPressable>

      {rest.length > 0 ? (
        <RNText
          {...PROSE_BREAK_PROPS}
          style={mdStyles.sentence}
          maxFontSizeMultiplier={MAX_FONT_SCALE.body}
        >
          {rest}
        </RNText>
      ) : null}

      {odds ? <OddsLine odds={odds} onPress={onOddsPress} /> : null}

      <View style={styles.actions}>
        {sourceCount > 0 ? (
          <Pressable
            onPress={handleSources}
            haptic="tick"
            accessibilityRole="button"
            accessibilityLabel={`${sourceCount} ${sourceCount === 1 ? 'source' : 'sources'}`}
            hitSlop={SPACING.sm}
          >
            <Text variant="labelSm" tone="secondary">
              {`${sourceCount} ${sourceCount === 1 ? 'source' : 'sources'}`}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={handleBookmark}
          haptic="none"
          accessibilityRole="button"
          accessibilityLabel={saved ? 'Saved. Remove from bookmarks' : 'Save this story'}
          accessibilityState={{ selected: saved }}
          hitSlop={SPACING.sm}
        >
          <Text variant="labelSm" tone={saved ? 'emphasis' : 'secondary'}>
            {saved ? 'saved' : 'save'}
          </Text>
        </Pressable>
        <Pressable
          onPress={handleShare}
          haptic="none"
          accessibilityRole="button"
          accessibilityLabel="Share this story"
          accessibilityHint="Opens the system share sheet"
          hitSlop={SPACING.sm}
        >
          <Text variant="labelSm" tone="secondary">
            share
          </Text>
        </Pressable>
      </View>
    </View>
  );
});

/**
 * The last place in the deck: the day is finite and the card says so.
 *
 * It replaces the reader's "Back to top" toast. An app that refuses to be an
 * infinite feed should be willing to tell the reader they can stop, and a card
 * in the same place as the stories is where a reader swiping through them
 * will actually see it.
 */
export const EndCard = memo(function EndCard({
  bottomInset,
  onAllStories,
}: {
  bottomInset: number;
  onAllStories: () => void;
}) {
  return (
    <View style={[styles.card, { paddingBottom: bottomInset + SPACING.lg }]}>
      <Text variant="labelXs" tone="emphasis" style={styles.kicker}>
        caught up
      </Text>
      <Text variant="title" style={styles.title}>
        That is today's news.
      </Text>
      <Text variant="body" tone="secondary">
        New stories arrive through the day.
      </Text>
      <View style={styles.actions}>
        <Pressable
          onPress={onAllStories}
          haptic="tick"
          accessibilityRole="button"
          accessibilityLabel="All stories"
          hitSlop={SPACING.sm}
        >
          <Text variant="labelSm" tone="secondary">
            all stories →
          </Text>
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { paddingHorizontal: SPACING.articlePadding },
  kicker: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.xs },
  kickerText: { flexShrink: 1 },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, marginRight: SPACING.xs },
  title: { marginBottom: SPACING.sm },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
    marginTop: SPACING.sm,
  },
});
