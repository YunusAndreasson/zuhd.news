import { COUNTRY_DATA } from '@shared/countries/country-data';
import { displayNameFromCode } from '@shared/countries/iso';
import type { Article, Entity } from '@shared/types';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  Pressable as RNPressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { categoryTextColor, MAX_FONT_SCALE, SPACING, withAlpha } from '../../constants/theme';
import { useTheme } from '../../hooks/useTheme';
import { articleTime, formatTimeAgo } from '../../lib/article-utils';
import {
  getSnapshot as getBookmarks,
  subscribe as subscribeBookmarks,
} from '../../lib/bookmark-store';
import type { GraphCard } from '../../lib/cards/types';
import { ACTIONS_ROW, AFTER_PROSE_GAP } from '../../lib/deck-layout';
import { useNewSpent } from '../../lib/fresh-store';
import type { StoryRow } from '../../lib/map-feed';
import { COUNTRY_URL_SCHEME, makeMarkdownStyles, renderSentences } from '../../lib/markdown';
import type { RiverArticle } from '../../lib/news-order';
import { openExternal } from '../../lib/open-link';
import type { StoryOdds } from '../../lib/predictions';
import { useReadSlugs } from '../../lib/read-store';
import { unreadNewBehind } from '../../lib/resume-landing';
import { articleThreadContext, hookOf, restOf } from '../../lib/story-card';
import type { TapResult } from '../../lib/tap-result';
import { OddsLine } from '../OddsLine';
import { Pressable, Text } from '../primitives';
import { StoryChart } from '../StoryChart';

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
 * goes as soon as the sheet leaves rest (`progress`), comes back as it lands,
 * and a tap on it opens the story. The
 * rest takes no touches and is hidden from screen readers until the sheet has
 * settled open, so a veiled country link can never be tapped. There is no
 * second reading surface to open and no earth to lose: the globe stays above
 * the card, turned to the dateline.
 *
 * **Nothing clamps.** A third title line or a long hook pushes the rest down
 * and scrolls when open — the card never ends a sentence with an ellipsis.
 *
 * **Sources, save and share are not in the card.** They are `StoryFooter`,
 * which the deck sets under the card's scroll area (`DeckSlot`): directly
 * after a story that fits, and held at the sheet's foot while a longer one
 * scrolls above it. See `StoryFooter` for why they left the end of the text.
 *
 * **The map supplies the place.** The kicker shows category and time only;
 * the dateline prefix is stripped from the prose. The accessible title still
 * names the location for readers who cannot use the map.
 */

interface StoryCardProps {
  row: StoryRow;
  odds: StoryOdds | null;
  /** The series the prose cites (`lib/story-chart.ts`). Where there is one it
   *  takes the odds line's place: one data line under a story, never two. */
  chart?: GraphCard | null;
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
  onChartPress?: (card: GraphCard) => void;
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
/** How far a finger may travel and still have tapped, in points. */
const TAP_SLOP = 10;

interface TapHandlers {
  onPressIn: (e: GestureResponderEvent) => void;
  onPress: (e: GestureResponderEvent) => void;
}

/**
 * **A swipe across the card is never a tap on it** (2026-09-24, found
 * swiping on the emulator: sideways flicks opened the story, then the share
 * sheet under the next one). The deck's pan should cancel these presses when
 * it claims a swipe, but a `Pressable` fires on any touch that ends inside it,
 * and the card is the width of the screen: a swipe the pan claimed late, or
 * not at all, became a press on whatever was under the finger. So a press
 * counts only when the finger lifted near where it went down.
 */
function useTapOnly(action: () => void): TapHandlers {
  const start = useRef({ x: 0, y: 0 });
  const onPressIn = useCallback((e: GestureResponderEvent) => {
    start.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
  }, []);
  const onPress = useCallback(
    (e: GestureResponderEvent) => {
      const dx = e.nativeEvent.pageX - start.current.x;
      const dy = e.nativeEvent.pageY - start.current.y;
      if (dx * dx + dy * dy > TAP_SLOP * TAP_SLOP) return;
      action();
    },
    [action],
  );
  return useMemo(() => ({ onPressIn, onPress }), [onPressIn, onPress]);
}

const Veil = memo(function Veil({
  progress,
  open,
  lineHeight,
  color,
  tap,
}: {
  progress: SharedValue<number>;
  open: boolean;
  lineHeight: number;
  color: string;
  tap: TapHandlers;
}) {
  const height = Math.round(lineHeight * VEIL_LINES);
  // A view's own CSS gradient, not a Skia canvas: every card mounts one as a
  // swipe lands, and each new canvas made Skia redraw on the JS thread and
  // serialize its tree for the UI thread in that commit (~14 ms, dev build,
  // profiled 2026-09-22). The native view draws the same two stops.
  // `no-repeat` because the default `repeat` wraps the one gradient in two
  // `CAReplicatorLayer`s on iOS, to tile an image exactly the view's size.
  const gradient = useMemo(
    () => ({
      height,
      experimental_backgroundImage: `linear-gradient(to bottom, ${withAlpha(color, VEIL_TOP)}, ${withAlpha(color, 1)})`,
      experimental_backgroundRepeat: 'no-repeat',
    }),
    [height, color],
  );
  // **The veil is on only with the sheet at rest, and switches, never fades**
  // (2026-10-03, three rounds with the user on an iPhone Pro):
  // - Faded with the sheet, it lagged opening and stalled a close just before
  //   it landed, where the emulator did not: on iOS a translucent layer with
  //   sublayers is drawn off screen as a group on every frame its opacity sits
  //   between 0 and 1.
  // - Switched on within 1% of rest, it popped in while the sheet still had a
  //   few points to crawl — the critically damped landing spends its last
  //   ~100 ms there — which read as a glitch.
  // - Faded in after that, it looked strange.
  // So it is on when the sheet is exactly at rest — `progress` is exactly 0
  // once the landing spring ends on its target, and at peek or under a pull —
  // and off whenever it is anywhere above. Reanimated touches the view only
  // when the value changes: two updates a trip. Opacity never goes on the
  // gradient view itself, where any change rebuilds its background-image
  // layers (`invalidateLayer`, RCTViewComponentView.mm).
  //
  // The same first-frame guard as `DeckSlot`'s: a card mounts as a swipe
  // lands, and a JS read of a value the UI thread is writing waits for it.
  const shown = useAnimatedStyle(() => {
    if (globalThis.__RUNTIME_KIND === 1) return { opacity: open ? 0 : 1 };
    return { opacity: progress.value > 0 ? 0 : 1 };
  }, [progress]);
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, shown]}
      pointerEvents={open ? 'none' : 'auto'}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <RNPressable style={styles.fill} {...tap} accessible={false}>
        <View style={gradient} pointerEvents="none" />
        <View style={[styles.fill, { backgroundColor: color }]} />
      </RNPressable>
    </Animated.View>
  );
});

export const StoryCard = memo(function StoryCard({
  row,
  odds,
  chart,
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
  onChartPress,
}: StoryCardProps) {
  const { colors, font, typography } = useTheme();
  const { fontScale } = useWindowDimensions();
  const { article } = row;

  const meta = useMemo(() => {
    return [article.category, formatTimeAgo(articleTime(article))].filter(Boolean).join(' · ');
  }, [article]);

  const threadContext = articleThreadContext(article);
  const shownOdds = chart ? null : odds;

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

  const openLink = useCallback(
    (url: string) => {
      if (url.startsWith(COUNTRY_URL_SCHEME)) {
        const cc = url.slice(COUNTRY_URL_SCHEME.length).toUpperCase();
        const countryName = displayNameFromCode(cc);
        if (!countryName) return;
        onCountryPress({
          countryName,
          location: null,
          localTime: null,
          data: COUNTRY_DATA[countryName] ?? null,
        });
        return;
      }
      openExternal(url);
    },
    [onCountryPress],
  );

  // One pass over every sentence, then split: entity mentions are tagged on
  // their first occurrence across the whole body, and two passes would tag a
  // name once in the hook and again in the rest.
  const sentences = useMemo(
    () =>
      renderSentences(article.sentences, mdStyles, {
        location: article.location,
        openLink,
        entities: tappableEntities,
        onEntityPress,
      }),
    [article.sentences, article.location, mdStyles, openLink, tappableEntities, onEntityPress],
  );
  // **At rest the hook's links are its words** (`plainBlocks`): the resting
  // card is one button, and a country in the hook was a second, underlined
  // target inside it that opened a country sheet instead of the story. Open,
  // they are links again; the lines are the same either way, so nothing
  // reflows. Built apart from the pass above so that opening swaps this one
  // block and leaves the rest's elements as they were: `open` changes in the
  // commit that follows the sheet's landing (`MapSheet`).
  const restingHook = useMemo(
    () =>
      renderSentences(hookOf(article.sentences), mdStyles, {
        location: article.location,
        plainBlocks: 1,
      }),
    [article.sentences, article.location, mdStyles],
  );
  // A block per paragraph, with the gap `mdStyles.sentence`'s marginBottom
  // draws between them. Everything after the hook ran on as ONE paragraph
  // between 2026-09-19 and 2026-09-20, to buy back the vertical the gaps
  // cost; what it actually bought was the writer's blank lines meaning
  // nothing on the surface most readers use. `scripts/write-prompt.md` spends
  // a paragraph of its format section telling the writer that the blank line
  // between blocks is what the reader sees as separation, and the web reader
  // has rendered one `<p>` per block all along. The app was the odd one out.
  const hook = open ? hookOf(sentences) : restingHook;
  const rest = restOf(sentences);

  const openTap = useTapOnly(onOpen);
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
  // No report count (2026-09-24, the user's request): `· 884 reports` closed
  // the line for a day. See `lib/coverage.ts`.
  //
  // A story read once and left says `new` no more (2026-09-26, the user's
  // request); `fresh-store` spends it on leaving, never while it is in front.
  const newSpent = useNewSpent(row.slug);
  const mark = row.mark === 'new' && newSpent ? null : row.mark;
  const categoryInk = categoryTextColor(article.category, colors);
  const age = formatTimeAgo(articleTime(article));
  const kicker = [meta, mark].filter(Boolean).join(' · ');

  return (
    <View style={styles.card}>
      <RNPressable
        {...openTap}
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
            {mark ? (
              <Text variant="labelXs" tone="emphasis">
                {` · ${mark}`}
              </Text>
            ) : null}
          </Text>
        </View>
        {/* Emphasis ink, as the web's title: never quieter than the lede
            under it, which is set in the same step. */}
        <Text
          variant="title"
          tone="emphasis"
          maxFontSizeMultiplier={MAX_FONT_SCALE.heading}
          style={styles.title}
        >
          {row.title}
        </Text>
      </RNPressable>

      {/* The story's chart, over the hook: at the end of the prose a reader
          at rest could not tell a story had one. At rest it is part of the
          card's one button; open, a press on it opens the chart. */}
      {chart ? (
        <RNPressable {...openTap} accessible={false}>
          <View
            pointerEvents={open ? 'auto' : 'none'}
            accessibilityElementsHidden={!open}
            importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
          >
            <StoryChart card={chart} pressable={open} onPress={onChartPress} />
          </View>
        </RNPressable>
      ) : null}

      {/* The hook is a large, obvious target for "tell me more" — but not an
          accessibility element of its own: the sentence is read as text. */}
      <RNPressable {...openTap} accessible={false}>
        {hook}
      </RNPressable>

      <View>
        <View
          pointerEvents={open ? 'auto' : 'none'}
          accessibilityElementsHidden={!open}
          importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
        >
          {rest}

          {/* What follows the prose is set apart by space, not a rule beyond
              the exhibit's own: a section gap, so the odds line reads as an
              exhibit and not as one more paragraph under "what's next" (its
              top rule sat a paragraph gap from the last sentence), and the
              thread line under it closes the story. A story with a chart
              shows the chart, over its hook, instead of the odds line. */}
          {shownOdds || threadContext ? (
            <View style={styles.afterProse}>
              {shownOdds ? (
                <OddsLine odds={shownOdds} last={!threadContext} onPress={onOddsPress} />
              ) : null}

              {threadContext ? (
                <Text variant="labelXs" tone="secondary" style={styles.thread}>
                  {threadContext}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
        {veil ? (
          <Veil
            progress={progress}
            open={open}
            lineHeight={
              (mdStyles.sentence.lineHeight ?? 0) * Math.min(fontScale, MAX_FONT_SCALE.body)
            }
            color={colors.sheetBg}
            tap={openTap}
          />
        ) : null}
      </View>
    </View>
  );
});

/** The row's targets: its whole height and 4pt past it — Material's 48dp,
 *  which also covers Apple's 44. They were the words' own 20pt plus 12. */
const ACTION_SLOP = { top: 4, bottom: 4, left: 12, right: 12 } as const;

/**
 * `save · share · sources`, under an open story's text — outside the card, so
 * the deck can hold it in sight (`DeckSlot`).
 *
 * **It follows the text and never leaves the sheet** (2026-10-03, the user's
 * choice). The slot's scroll area is as tall as the story up to the room
 * there is, and this row comes straight after it: under the last line of a
 * story that fits, and at the sheet's foot, over the dock, while a longer one
 * scrolls above. No gap either way, and nothing measured to get there.
 *
 * It was the last thing *in* the card. Since most open stories scroll, that
 * put it out of sight when a story opened for an estimated 58–87% of a
 * fortnight's stories on a 393×852 phone, and somewhere different on each of
 * the rest — the only way the app has to save or share a story, a scroll
 * away. Pinned above the dock was tried once before (2026-09-19) and left
 * four or five blank lines between the text and the row, because the sheet
 * was then sized for the longest story and the row sat at its foot whatever
 * the text did; following the text is what removes the hole.
 *
 * **`save · share · sources`, at the right, under the thumb** (the same day,
 * the user's requests). All three were at the left, the far corner from the
 * hand holding the phone. Moved right, `2 sources` did not sit with the
 * other two — a number and a noun beside two plain words — so the number
 * went: it was the row's one piece of noise, and three words of a kind are
 * one group. `sources` is in the corner, the user's choice.
 *
 * **Words, one step softer than the text** (the same day). In grey small
 * caps the card's only three buttons looked like its two labels, the kicker
 * and the thread line; in the text's own ink, once the rules over and under
 * the row went, they read as a last line of the story. They are `accent`, the
 * palette's second voice, and `saved` is the emphasis ink: on is brighter. A swipe can start here — it is where the thumb rests —
 * so a press counts only as a tap (`tapSlop`).
 *
 * The words mount when the JS thread is next idle, or at once when the story
 * opens: a slot's first mount lands as a swipe does, and the three pressables
 * were 25 ms of that commit (profiled 2026-09-22). The row keeps its height
 * meanwhile, so nothing moves when they arrive.
 */
export const StoryFooter = memo(function StoryFooter({
  article,
  open,
  onSources,
  onBookmark,
  onShare,
}: {
  article: RiverArticle;
  /** The story is open and in front: mount the words now. */
  open: boolean;
  onSources: (article: Article) => void;
  onBookmark: (article: RiverArticle) => void;
  onShare: (article: RiverArticle) => void;
}) {
  const { colors } = useTheme();
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (idle) return;
    const id = requestIdleCallback(() => setIdle(true), { timeout: 1000 });
    return () => cancelIdleCallback(id);
  }, [idle]);
  // The sheet's ground coming up over the last points of the text above. A
  // view's own gradient, still: nothing here animates (the `Veil`'s notes say
  // what animating one costs), and it is never mounted or unmounted with the
  // sheet. It was, for a day, only while the story was open — and every
  // other time the row is in sight had the hard cut back: the card coming in
  // on a sideways swipe, and the whole of a closing spring (a review's
  // finding). At rest it lies under the dock with the row; the resting card
  // is the same picture with it and without, pixel for pixel.
  const fade = useMemo(
    () => ({
      experimental_backgroundImage: `linear-gradient(to bottom, ${withAlpha(colors.sheetBg, 0)}, ${withAlpha(colors.sheetBg, 1)})`,
      experimental_backgroundRepeat: 'no-repeat',
    }),
    [colors.sheetBg],
  );
  return (
    <View style={styles.footer}>
      <View style={[styles.fade, fade]} pointerEvents="none" />
      {idle || open ? (
        <StoryActions
          article={article}
          onSources={onSources}
          onBookmark={onBookmark}
          onShare={onShare}
        />
      ) : null}
    </View>
  );
});

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
      {/* First, at the row's free end, because its word changes length: the
          row is set to the right, so `saved` grows to the left, into the empty
          row, and `share` and `sources` stay where they are. */}
      <Pressable
        onPress={handleBookmark}
        tapSlop={TAP_SLOP}
        style={styles.action}
        accessibilityRole="button"
        accessibilityLabel={saved ? 'Saved. Remove from saved stories' : 'Save this story'}
        accessibilityState={{ selected: saved }}
        hitSlop={ACTION_SLOP}
      >
        <Text variant="captionEmphasis" tone={saved ? 'emphasis' : 'accent'}>
          {saved ? 'saved' : 'save'}
        </Text>
      </Pressable>
      <Pressable
        onPress={handleShare}
        tapSlop={TAP_SLOP}
        style={styles.action}
        accessibilityRole="button"
        accessibilityLabel="Share this story"
        accessibilityHint="Opens the system share sheet"
        hitSlop={ACTION_SLOP}
      >
        <Text variant="captionEmphasis" tone="accent">
          share
        </Text>
      </Pressable>
      {/* Last, in the corner under the thumb (the user's choice). The word,
          not the count: `2 sources` was a number and a noun beside two plain
          words, the one thing in the row that changed from story to story,
          and the count is the first thing the sheet it opens shows. A screen
          reader still hears it: there it is information, not clutter. The
          word is the sheet's name, so it is `sources` for one source too,
          and never changes width. */}
      {sourceCount > 0 ? (
        <Pressable
          onPress={handleSources}
          tapSlop={TAP_SLOP}
          style={styles.action}
          accessibilityRole="button"
          // The word on screen, then the count: `1 source` did not contain
          // `sources`, so "tap sources" found nothing on a one-source story.
          accessibilityLabel={`Sources, ${sourceCount}`}
          hitSlop={ACTION_SLOP}
        >
          <Text variant="captionEmphasis" tone="accent">
            sources
          </Text>
        </Pressable>
      ) : null}
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
 *
 * **It says `caught up` only when it is true** (2026-09-24). A scrub to the
 * end of the day skips everything between, and the card said `caught up`
 * beside the dock's `‹ 18 new` — two claims about the same stories that
 * could not both hold. It counts what the pill counts (`unreadNewBehind`).
 */
export const EndCard = memo(function EndCard({
  fresh,
  slugs,
}: {
  fresh?: readonly boolean[];
  slugs?: readonly string[];
}) {
  const readSlugs = useReadSlugs();
  const unread = useMemo(() => {
    const read = slugs?.map((slug) => readSlugs.has(slug));
    return unreadNewBehind(fresh, read, slugs?.length ?? 0).count;
  }, [fresh, slugs, readSlugs]);
  return (
    <View style={styles.card}>
      <Text variant="labelXs" tone="emphasis" style={styles.kicker}>
        {unread > 0 ? 'end of the day' : 'caught up'}
      </Text>
      <Text variant="title" tone="emphasis" style={styles.title}>
        That is today’s news.
      </Text>
      <Text variant="body" tone="secondary">
        {unread > 0
          ? `${unread} new ${unread === 1 ? 'story is' : 'stories are'} still unread.`
          : 'New stories arrive through the day.'}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // `sm` under the last line: with that block's own gap, about a paragraph's
  // space before the footer's row, so the row reads as the story's end and
  // not as a second section. It is also the room the footer's fade lies in
  // (`styles.fade`): nothing of a story may be set in its last `md`.
  card: { paddingHorizontal: SPACING.articlePadding, paddingBottom: SPACING.sm },
  kicker: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.xs },
  kickerText: { flexShrink: 1 },
  // With the last block's own gap, about `SPACING.lg` from the prose: the
  // section tier, over the paragraph's.
  afterProse: { paddingTop: AFTER_PROSE_GAP },

  title: { marginBottom: SPACING.sm },
  // No rule over the row and none under it (2026-10-03, the user's request).
  // A hairline closed it above and the dock's closed it below, and the two
  // boxed three words in. The row is told apart from the prose by its ink —
  // one step softer — and its place, and from the track by being words.
  footer: {
    height: ACTIONS_ROW,
    paddingHorizontal: SPACING.articlePadding,
  },
  // What the rule over the row was for, without the rule. A story longer than
  // the sheet scrolls behind this row, and with nothing there its text was cut
  // through the middle of a line, a few points over the row's words (seen on
  // the emulator at a phone's height). The text now goes out into the sheet's
  // ground over its last `md`. That is the space every story already ends on
  // — a paragraph's gap, a chart's padding or the thread line's margin, plus
  // the card's own — so a story that fits, and the end of one that scrolls,
  // have nothing under the fade and look as they did.
  fade: { position: 'absolute', left: 0, right: 0, top: -SPACING.md, height: SPACING.md },
  // Keeps the thread line clear of that fade when it ends the story.
  thread: { marginBottom: SPACING.sm },
  // Three words, set to the right: the row sits over the dock, at the foot of
  // the screen, and its right end is where the thumb of the hand holding the
  // phone already is. `share` and `sources` never change width, so they are
  // in one place on every story.
  actions: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: SPACING.lg },
  // Each word's target is the row's whole height, the word centred in it.
  action: { justifyContent: 'center' },
});
