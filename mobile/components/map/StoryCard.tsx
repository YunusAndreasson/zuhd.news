import { COUNTRY_DATA } from '@shared/countries/country-data';
import { displayNameFromCode } from '@shared/countries/iso';
import type { Article, Entity } from '@shared/types';
import { memo, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  type AccessibilityActionEvent,
  Pressable as RNPressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import {
  categoryTextColor,
  HIT_SLOP,
  MAX_FONT_SCALE,
  SPACING,
  withAlpha,
} from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { articleTime, formatTimeAgo } from '../../lib/article-utils';
import {
  getSnapshot as getBookmarks,
  subscribe as subscribeBookmarks,
} from '../../lib/bookmark-store';
import { ACTIONS_ROW } from '../../lib/deck-layout';
import { hapticImpact } from '../../lib/haptics';
import type { StoryRow } from '../../lib/map-feed';
import { COUNTRY_URL_SCHEME, makeMarkdownStyles, renderSentences } from '../../lib/markdown';
import type { RiverArticle } from '../../lib/news-order';
import { useOpenLink } from '../../lib/open-link';
import type { StoryOdds } from '../../lib/predictions';
import { articleThreadContext, hookOf, restOf } from '../../lib/story-card';
import type { TapResult } from '../globe/MiniGlobe';
import { OddsLine } from '../OddsLine';
import { Pressable, Text } from '../primitives';

/**
 * One story, as the sheet holds it — at rest and open, the same element.
 *
 * **At rest it answers "why should I open this", in one line or two.** The
 * headline alone did not: they are three to five words and often a riddle
 * ("Drone Boat Kills Drone Boat"). The hook is written to be the reason, so
 * the card leads with it. It rested on the hook and the why-it-matters
 * sentence until 2026-09-19 — half the article — and a reader swiping forty
 * stories ended up reading each one to get past it.
 *
 * **Open, it is the whole story, and nothing has to load or reflow.** The
 * other three sentences, the market's odds and the thread line are laid out
 * under the hook all along. At rest a `Veil` of the sheet's own ground lies
 * over them: the first line shows through at half strength and the second
 * fades to nothing, which says "there is more" without handing the reader a
 * second sentence to read — the whole point of resting on the hook. The veil
 * lifts as the sheet rises (`progress`) and a tap on it opens the story. The
 * rest takes no touches and is hidden from screen readers until the sheet has
 * settled open, so a veiled country link can never be tapped. There is no
 * second reading surface to open and no earth to lose: the globe stays above
 * the card, turned to the dateline.
 *
 * **Nothing clamps.** A third title line or a long hook pushes the rest down
 * and scrolls when open — the card never ends a sentence with an ellipsis.
 *
 * **Sources, save and share are words you can see**, at the end of the story.
 * For a day they were pinned above the dock so they never moved, which put
 * the open card's spare space between the last sentence and the buttons — a
 * hole in the middle of the card. After the text, the spare space is where a
 * story ends.
 *
 * **The map supplies the place.** The kicker shows category and time only;
 * the dateline prefix is stripped from the prose. The accessible title still
 * names the location for readers who cannot use the map.
 */

interface StoryCardProps {
  row: StoryRow;
  odds: StoryOdds | null;
  /** Indicator ids an entity sheet can actually open. */
  resolvableEntityIds?: ReadonlySet<string>;
  /** The sheet has settled open: the rest of the story takes touches. */
  open: boolean;
  /** The sheet's rise, 0 at rest and 1 open; the veil lifts with it. */
  progress: SharedValue<number>;
  /** False only for `StoryMeasure`, which needs the card's size and nothing
   *  drawn over it. */
  veil?: boolean;
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

/** Body lines the veil takes to go from half strength to nothing. */
const VEIL_LINES = 2;
/** How much of the sheet's ground lies over the veil's first line. */
const VEIL_TOP = 0.5;

/**
 * The fade over the rest of a resting story: `VEIL_LINES` of gradient from
 * `VEIL_TOP` of the sheet's ground to all of it, then solid ground to the
 * bottom. It is attached to the rest of the story, not to a place on the
 * screen, so it can never lie over the hook; a hook long enough to fill the
 * card simply leaves the veil below the dock.
 *
 * A gradient, and a carve-out (`DESIGN.md`, native chrome): text that is
 * meant to be read is quiet by an ink step, never by opacity. This text is
 * not meant to be read at rest — it is the edge of what opening reveals.
 */
const Veil = memo(function Veil({
  progress,
  open,
  lineHeight,
  color,
  onOpen,
}: {
  progress: SharedValue<number>;
  open: boolean;
  lineHeight: number;
  color: string;
  onOpen: () => void;
}) {
  const height = Math.round(lineHeight * VEIL_LINES);
  // A view's own CSS gradient, not a Skia canvas: every card mounts one as a
  // swipe lands, and each new canvas made Skia redraw on the JS thread and
  // serialize its tree for the UI thread in that commit (~14 ms, dev build,
  // profiled 2026-09-22). The native view draws the same two stops.
  const gradient = useMemo(
    () => ({
      height,
      experimental_backgroundImage: `linear-gradient(to bottom, ${withAlpha(color, VEIL_TOP)}, ${withAlpha(color, 1)})`,
    }),
    [height, color],
  );
  // The same first-frame guard as `DeckSlot`'s: a card mounts as a swipe
  // lands, and a JS read of a value the UI thread is writing waits for it. Lifted by the time the sheet is half open, so the rest reads as
  // it rises rather than arriving at the stop.
  const style = useAnimatedStyle(() => {
    if (globalThis.__RUNTIME_KIND === 1) return { opacity: open ? 0 : 1 };
    return { opacity: 1 - Math.min(1, Math.max(0, progress.value / 0.5)) };
  }, [progress]);
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, style]}
      pointerEvents={open ? 'none' : 'auto'}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <RNPressable style={styles.fill} onPress={onOpen} accessible={false}>
        <View style={gradient} pointerEvents="none" />
        <View style={[styles.fill, { backgroundColor: color }]} />
      </RNPressable>
    </Animated.View>
  );
});

export const StoryCard = memo(function StoryCard({
  row,
  odds,
  resolvableEntityIds,
  open,
  progress,
  veil = true,
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
  const { fontScale } = useWindowDimensions();
  const { article } = row;

  const meta = useMemo(() => {
    return [article.category, formatTimeAgo(articleTime(article))].filter(Boolean).join(' · ');
  }, [article]);

  const threadContext = articleThreadContext(article);

  // `sources · save · share` mount when the JS thread is next idle, not with
  // the card. A card mounts as a swipe lands — the neighbour coming into the
  // deck's window, off screen — and the three pressables were 25 ms of that
  // commit's 103 (dev build, profiled 2026-09-22), in the frames where the
  // globe resumes reprojecting. Until then the row is an empty box of the
  // same fixed height (`ACTIONS_ROW`), so nothing moves when they arrive; at
  // rest they are under the veil and hidden from screen readers anyway, and
  // opening the card mounts them at once.
  const [actionsIdle, setActionsIdle] = useState(false);
  useEffect(() => {
    if (actionsIdle) return;
    const id = requestIdleCallback(() => setActionsIdle(true), { timeout: 1000 });
    return () => cancelIdleCallback(id);
  }, [actionsIdle]);
  const showActions = actionsIdle || open;

  const mdStyles = useMemo(
    () => makeMarkdownStyles(colors, font, typography),
    [colors, font, typography],
  );

  // Only the mentions that lead somewhere: an accent-coloured word that opens
  // nothing teaches the reader that accent-coloured words lie.
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
        hapticImpact();
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

  // One pass over every sentence, then split: entity mentions are tagged on
  // their first occurrence across the whole body, and two passes would tag a
  // name once in the hook and again in the rest.
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
  // A block per paragraph, with the gap `mdStyles.sentence`'s marginBottom
  // draws between them. Everything after the hook ran on as ONE paragraph
  // between 2026-09-19 and 2026-09-20, to buy back the vertical the gaps
  // cost; what it actually bought was the writer's blank lines meaning
  // nothing on the surface most readers use. `scripts/write-prompt.md` spends
  // a paragraph of its format section telling the writer that the blank line
  // between blocks is what the reader sees as separation, and the web reader
  // has rendered one `<p>` per block all along. The app was the odd one out.
  const hook = hookOf(sentences);
  const rest = restOf(sentences);

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

  // The ink step that says where the reader is in the day rides on the kicker,
  // which is always visible; below the hook it would be hidden at rest, and
  // landing on `earlier` is the caught-up moment. It closes the line
  // (2026-09-23, the user's request): it is on some cards and not others,
  // and leading, it moved the category word sideways from one card to the
  // next as the reader swiped. Now the category always starts at the text's
  // edge.
  // The category is its own colour, and there is no dot (2026-09-23, the
  // user's request): the word already said the category, and the dot beside
  // it said it again in a second channel. Set in `categoryText*`, the
  // globe's hue where that is readable as 11pt caps and a deeper step of it
  // on cream, where it is not.
  //
  // `884 reports` closes the line on a story over the most-covered bar
  // (`coverageLabel`), in the ink step `new` uses, and the dock's track draws
  // that story's cell taller and says the same in its tooltip. Words, not a
  // shape: a coloured bar beside the kicker was tried for a day (2026-09-23)
  // and not understood — reach is a word in every news app (Jakob's law).
  // See `lib/coverage.ts` for why the unit is reports.
  const categoryInk = categoryTextColor(article.category, colors);
  const age = formatTimeAgo(articleTime(article));
  const reach = row.coverage;
  const kicker = [meta, row.mark, reach].filter(Boolean).join(' · ');

  return (
    <View style={styles.card}>
      <RNPressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${[kicker, article.location].filter(Boolean).join(' · ')}. ${row.title}`}
        accessibilityHint="Opens the whole story"
        accessibilityActions={accessibilityActions}
        onAccessibilityAction={handleAccessibilityAction}
      >
        <View style={styles.kicker}>
          <Text variant="labelXs" numberOfLines={1} style={styles.kickerText}>
            {article.category ? (
              <Text variant="labelXs" style={{ color: categoryInk }}>
                {article.category}
              </Text>
            ) : null}
            {article.category ? ` · ${age}` : age}
            {[row.mark, reach].map((word) =>
              word ? (
                <Text key={word} variant="labelXs" tone="emphasis">
                  {` · ${word}`}
                </Text>
              ) : null,
            )}
          </Text>
        </View>
        <Text variant="title" maxFontSizeMultiplier={MAX_FONT_SCALE.heading} style={styles.title}>
          {row.title}
        </Text>
      </RNPressable>

      {/* The hook is a large, obvious target for "tell me more" — but not an
          accessibility element of its own: the sentence is read as text. */}
      <RNPressable onPress={onOpen} accessible={false}>
        {hook}
      </RNPressable>

      <View>
        <View
          pointerEvents={open ? 'auto' : 'none'}
          accessibilityElementsHidden={!open}
          importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
        >
          {rest}

          {odds ? <OddsLine odds={odds} onPress={onOddsPress} /> : null}

          {threadContext ? (
            <Text variant="labelXs" tone="secondary" style={styles.threadContext}>
              {threadContext}
            </Text>
          ) : null}

          {showActions ? (
            <StoryActions
              article={article}
              onSources={onSources}
              onBookmark={onBookmark}
              onShare={onShare}
            />
          ) : (
            <View style={styles.actions} />
          )}
        </View>
        {veil ? (
          <Veil
            progress={progress}
            open={open}
            lineHeight={
              (mdStyles.sentence.lineHeight ?? 0) * Math.min(fontScale, MAX_FONT_SCALE.body)
            }
            color={colors.sheetBg}
            onOpen={onOpen}
          />
        ) : null}
      </View>
    </View>
  );
});

/** Sources, save and share, as words, at the end of the story. Under the
 *  veil at rest, like the rest of it. */
const StoryActions = memo(function StoryActions({
  article,
  onSources,
  onBookmark,
  onShare,
}: {
  article: RiverArticle;
  onSources: (article: Article) => void;
  onBookmark: (article: RiverArticle) => void;
  onShare: (article: RiverArticle) => void;
}) {
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
    <View style={styles.actions}>
      {sourceCount > 0 ? (
        <Pressable
          onPress={handleSources}
          accessibilityRole="button"
          accessibilityLabel={`${sourceCount} ${sourceCount === 1 ? 'source' : 'sources'}`}
          hitSlop={HIT_SLOP}
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
        accessibilityLabel={saved ? 'Saved. Remove from saved stories' : 'Save this story'}
        accessibilityState={{ selected: saved }}
        hitSlop={HIT_SLOP}
      >
        {/* Held at the longer word's width, so `share` stays put when the
            word changes under the finger. */}
        <View>
          <Text variant="labelSm" style={styles.reserve} importantForAccessibility="no">
            saved
          </Text>
          <Text variant="labelSm" tone={saved ? 'emphasis' : 'secondary'} style={styles.word}>
            {saved ? 'saved' : 'save'}
          </Text>
        </View>
      </Pressable>
      <Pressable
        onPress={handleShare}
        haptic="none"
        accessibilityRole="button"
        accessibilityLabel="Share this story"
        accessibilityHint="Opens the system share sheet"
        hitSlop={HIT_SLOP}
      >
        <Text variant="labelSm" tone="secondary">
          share
        </Text>
      </Pressable>
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
export const EndCard = memo(function EndCard() {
  return (
    <View style={styles.card}>
      <Text variant="labelXs" tone="emphasis" style={styles.kicker}>
        caught up
      </Text>
      <Text variant="title" style={styles.title}>
        That is today’s news.
      </Text>
      <Text variant="body" tone="secondary">
        New stories arrive through the day.
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
  card: { paddingHorizontal: SPACING.articlePadding, paddingBottom: SPACING.md },
  kicker: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.xs },
  kickerText: { flexShrink: 1 },
  threadContext: { marginBottom: SPACING.sm },

  title: { marginBottom: SPACING.sm },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
    height: ACTIONS_ROW,
  },
  reserve: { opacity: 0 },
  word: { position: 'absolute', top: 0, left: 0 },
});
