import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { type AccessibilityActionEvent, Pressable, StyleSheet, View } from 'react-native';
import {
  type SharedValue,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mixHex, PRESSED_STYLE, SPACING } from '../../constants/theme';
import { useScrub } from '../../hooks/useScrub';
import { useTheme } from '../../hooks/useTheme';
import { announce } from '../../lib/announce';
import { CONTROL_ROW } from '../../lib/deck-layout';
import { useReadSlugs } from '../../lib/read-store';
import { unreadNewBehind } from '../../lib/resume-landing';
import type { FoundProgress } from '../../lib/story-places';
import { labelledMarks, nearestStory, positionAt, timeTrackLayout } from '../../lib/time-track';
import { Icon, IconButton, Text } from '../primitives';
import { MARK_LABEL_WIDTH, ScrubBar, ScrubTooltip } from '../ScrubBar';

/**
 * The dock: where the reader is in the day, in one row at the foot of the
 * screen, where a thumb already is.
 *
 * `[ story track ]`, with `‹ 3 new` floating over its left end — the track
 * scrubs the day, newest story at its left end (each segment is its story's
 * category hue). It is pinned to the
 * screen, not to the sheet, so it is in the same place whether a story is at
 * rest or open: the row used to sit on top of the sheet, which put it
 * mid-screen at rest and near the top when a story was open — nowhere a thumb
 * holding the phone could reach.
 *
 * **The swipe is the way through (2026-09-22, the user's request).** The row
 * ended in two circles until then: `⌃` opened the story and closed it again,
 * and `›` was the next story (`StoryDeck.step`). Both were copies of a gesture
 * the sheet already answers — the card swipes sideways to the next story, the
 * sheet pulls up to read and down to put the story back, and a tap on the
 * globe above an open story puts it down too — so the track has the row to
 * itself. Screen readers keep both moves: the card's `next story` / `previous
 * story` actions and the sheet handle's adjustable value.
 *
 * **What arrived is visible from the dock (2026-09-21).** When new stories sit
 * between the head of the river and the story in front — a refresh put them
 * ahead of where the reader was, or a scrub skipped them — `‹ 3 new` floats
 * over the track's left end and jumps to the newest of them. It is a pill in
 * the sheet's control material (`playerBg`, a hairline edge), not a badge: ink, no colour, no count
 * on the icon, and it goes when there is nothing left behind the reader to
 * catch up on. The track itself carries no mark for new stories: a dashed
 * rule over their segments was drawn for a day (2026-09-21) and removed at
 * the user's request (2026-09-22) — a second row that said what each card's
 * `· new` and this pill already say.
 *
 * There is no list of every story: one was tried (`IndexSheet`, twice) and
 * the reader did not want it — the track and the swipe are the way through.
 * The menu stays at the top right of the map: it is opened a few times a
 * week, and thumb reach is for what is used every session. The briefing's ▶
 * was the first of this row's circles until 2026-09-21, when the user asked
 * for it at the top beside the menu (`MapHeader`).
 */

/**
 * Which story a fraction of the track points at: the nearest one placed at
 * its time, or the equal segment under it before the track is measured.
 */
function storyAt(fraction: number, count: number, centers: readonly number[] | null): number {
  'worklet';
  if (centers && centers.length === count && count > 0) return nearestStory(centers, fraction);
  return Math.max(0, Math.min(count - 1, Math.ceil(fraction * count) - 1));
}

const ADJUST_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }];

export const StoryDock = memo(function StoryDock({
  refreshing = false,
  index,
  count,
  position,
  progress,
  alert,
  onAlertPress,
  onSeek,
  onClaim,
  timeAt,
  categoryAt,
  ages,
  mostCovered,
  hues,
  fresh,
  slugs,
  ruled = false,
}: {
  /** A pull on the resting sheet is checking for a new cycle. */
  refreshing?: boolean;
  /** The committed story. `count` is the end card. */
  index: number;
  /** Stories in the river. */
  count: number;
  /** The deck's live position, in stories. */
  position: SharedValue<number>;
  /** Found on the globe — spoken, not printed. */
  progress?: FoundProgress;
  /** The newest live Red alert's title, if any. */
  alert?: string | null;
  /** Opens the alert. */
  onAlertPress?: () => void;
  /** Jump to a story from the track. */
  onSeek?: (index: number) => void;
  /** UI worklet: a scrub supersedes pending camera input immediately. */
  onClaim?: () => void;
  /** When a story ran (`5h ago`): what the tooltip says, large, while the
   *  finger scrubs. */
  timeAt: (index: number) => string;
  /** A story's category, the tooltip's quieter second line. */
  categoryAt?: (index: number) => string;
  /** Per story, how long before the river's day ends it ran, in ms: where it
   *  sits on the track. Without it the track is one equal cell per story. */
  ages?: readonly number[];
  /** Per story: over the most-covered bar — its cell stands taller while
   *  unread. No count is printed (2026-09-24). */
  mostCovered?: readonly boolean[];
  /** One category hue per story, for the track's segments. */
  hues?: readonly string[];
  /** Per story: arrived since the reader last had the feed — counted for a
   *  screen reader; the track draws nothing for it. */
  fresh?: readonly boolean[];
  /** Per story, its slug: what the read store is keyed on. */
  slugs?: readonly string[];
  /** A story is open, and its text scrolls up under the dock: draw the rule
   *  it scrolls under. At rest the card's veil already fades the text out
   *  above the track, and a rule there cut the fading line across. */
  ruled?: boolean;
}) {
  const { colors, resolvedAppearance } = useTheme();
  // Read is subscribed here, not on the screen. A story turns read two
  // seconds into every landing (`useReadTracking`), and the only things that
  // change are this track and the pill below; subscribed in `HomeScreen`, each
  // read re-rendered the screen, the sheet and the header with it (profiled
  // 2026-09-22).
  const readSlugs = useReadSlugs();
  const read = useMemo(() => slugs?.map((slug) => readSlugs.has(slug)), [slugs, readSlugs]);
  // New stories the reader has not read, between the head of the river and
  // the story in front: arrivals a refresh put ahead of where they are
  // reading, or new ones they scrubbed or swiped straight past. The pill
  // offers a jump to the newest of them. New stories still ahead of the
  // reader are not counted — they will get there. Read is the track's rule,
  // so the pill and the hairlines agree: it counted any story merely landed
  // on until 2026-09-22, and a new story swiped past in a second stayed bold
  // on the track while the pill said nothing was left.
  const unreadNew = useMemo(() => unreadNewBehind(fresh, read, index), [fresh, read, index]);
  const { count: newCount } = unreadNew;
  const onNewPress = useMemo(
    () =>
      unreadNew.first >= 0 && onSeek
        ? () => {
            onSeek(unreadNew.first);
          }
        : undefined,
    [unreadNew.first, onSeek],
  );
  const insets = useSafeAreaInsets();
  const showingAlert = !refreshing && !!alert;
  const status = refreshing ? 'checking for new stories' : showingAlert ? `now · ${alert}` : null;
  // The status line is a live region, which only Android speaks.
  useEffect(() => {
    if (status) announce(status, { liveRegion: true });
  }, [status]);

  // The thumb's place: the right edge of the story in front's segment. The
  // deck writes it unless a finger is scrubbing the track itself. Nothing is
  // filled to it any more — the segments say what has been read.
  const fraction = useSharedValue(0);
  // The track is the day (2026-09-23, the user's request): now at the left
  // end, a day ago at the right, each story at its time and a mark every six
  // hours — so "twelve hours back" is a place on it, not a count of cells.
  // It is laid out in points, once the track is measured.
  const [trackWidth, setTrackWidth] = useState(0);
  const day = useMemo(
    () =>
      ages && ages.length === count && trackWidth > 0 ? timeTrackLayout(ages, trackWidth) : null,
    [ages, count, trackWidth],
  );
  const centers = useMemo(
    () => (day ? day.centers.map((c) => c / trackWidth) : null),
    [day, trackWidth],
  );
  // The left end is named: without it `6h` could be six in the morning, and
  // nothing said which end of the day was now. A mark whose word would crowd
  // it keeps its tick and gives up its word.
  const marks = useMemo(() => {
    if (!day) return undefined;
    const labelled = labelledMarks(day.marks, MARK_LABEL_MIN_GAP).map((mark) =>
      mark.label && mark.at - MARK_LABEL_WIDTH / 2 < NOW_LABEL_WIDTH + SPACING.xs
        ? { at: mark.at }
        : mark,
    );
    return [{ at: 0, label: 'now', bare: true }, ...labelled];
  }, [day]);
  const stepAt = useMemo(
    () =>
      centers
        ? (f: number) => {
            'worklet';
            return storyAt(f, count, centers);
          }
        : undefined,
    [centers, count],
  );
  // Preview the destination's full category hue on the same UI-thread frame
  // as the thumb moves, without waiting for a committed story or React render.
  const destinationHue = useDerivedValue(
    () => hues?.[storyAt(fraction.value, count, centers)] ?? colors.textEmphasis,
    [hues, count, centers, colors.textEmphasis],
  );
  // The tooltip says when, large, and nothing else loud (2026-09-22, the
  // user's request). It led with `12 of 48` over `politics · 12h ago` in
  // 11pt secondary ink, and when is what a reader scrubbing a day in time
  // order is reading for: the position is on the track under the finger.
  // The words are the card's kicker's, so the tooltip and the card it lands
  // on agree.
  const labelFor = useCallback(
    (f: number) => timeAt(storyAt(f, count, centers)),
    [timeAt, count, centers],
  );
  const detailFor = useCallback(
    (f: number) => {
      const i = storyAt(f, count, centers);
      return categoryAt?.(i) ?? '';
    },
    [categoryAt, count, centers],
  );
  // Each segment in its story's category hue — the globe's beacons and the
  // card's category word, so a teal segment is a teal light — a touch below
  // full: at full strength the row was the loudest colour on the sheet after
  // the globe, and it pulled the eye off the headline. **A read story fades to a
  // hairline** (2026-09-22, the user's request): a far quieter step of its
  // hue at a third of the height, so what is left to read is the part of the
  // track with weight, and the difference is a shape as well as a colour.
  // It was a position fill until then — everything left of the story in front
  // a step quieter — which called a story read because the reader was past
  // it: new stories arriving at the head, and every story a scrub jumped
  // over, looked read. The raised current-story marker carries its full hue
  // separately.
  const tints = useMemo(() => {
    if (!hues || hues.length !== count) return null;
    const tint = (mix: number) => hues.map((hue) => mixHex(hue, colors.sheetBg, mix));
    const unread = tint(UNREAD_MIX[resolvedAppearance]);
    const faded = tint(READ_MIX[resolvedAppearance]);
    return read?.length === count ? unread.map((c, i) => (read[i] ? (faded[i] ?? c) : c)) : unread;
  }, [hues, count, read, colors.sheetBg, resolvedAppearance]);
  const handleCommit = useCallback(
    (f: number) => {
      const i = storyAt(f, count, centers);
      // The playhead to the chosen story's centre, whatever committed it. A
      // tap never holds the track, so the reaction's drop snap misses it, and
      // a tap on the story already in front moves no deck: the playhead was
      // left wherever the finger touched.
      const at = centers?.[i];
      if (at !== undefined) fraction.value = at;
      onSeek?.(i);
    },
    [onSeek, count, centers, fraction],
  );
  const scrub = useScrub({
    fraction,
    detents: count,
    steps: count,
    stepAt,
    labelFor,
    detailFor,
    onCommit: handleCommit,
    onClaim,
    tooltipWidth: TOOLTIP_WIDTH,
    enabled: count > 0 && !!onSeek,
  });
  const holding = scrub.holding;
  useAnimatedReaction(
    () => ({ p: position.value, held: holding.value }),
    ({ p, held }, previous) => {
      if (held) return;
      // A drop: straight to the story the finger chose, the one the commit
      // is taking the deck to. From the deck's position instead, the playhead
      // went back to the story being left until the commit reached the deck.
      if (previous?.held && centers && centers.length === count) {
        fraction.value = centers[nearestStory(centers, fraction.value)] ?? fraction.value;
        return;
      }
      const at = centers ? positionAt(centers, p) : count > 0 ? (p + 1) / count : 0;
      fraction.value = Math.min(1, Math.max(0, at));
    },
    [count, centers],
  );
  const handleAdjust = useCallback(
    (e: AccessibilityActionEvent) => {
      if (!onSeek || count <= 0) return;
      if (e.nativeEvent.actionName === 'increment') onSeek(Math.min(index + 1, count - 1));
      else if (e.nativeEvent.actionName === 'decrement') onSeek(Math.max(index - 1, 0));
    },
    [onSeek, index, count],
  );

  // A tick is a ruler's, quieter than the words under it.
  const markInk = mixHex(colors.textSecondary, colors.sheetBg, 0.45);
  const found = progress?.found ?? 0;
  const freshTotal = fresh?.reduce((n, isFresh) => (isFresh ? n + 1 : n), 0) ?? 0;
  const readTotal = read?.reduce((n, isRead) => (isRead ? n + 1 : n), 0) ?? 0;
  const when = index < count ? timeAt(index) : '';
  const spoken = `${index >= count ? `End of all ${count} stories` : `Story ${index + 1} of ${count}`}${when ? `, ${when}` : ''}${freshTotal > 0 ? `, ${freshTotal} new` : ''}${readTotal > 0 ? `, ${readTotal} read` : ''}${found > 0 ? `, ${found} found on the globe` : ''}`;

  const inset = Math.max(SPACING.articlePadding, insets.left);
  return (
    // **The pill floats above the track, never in its row.** In the row it
    // took its width from the track, so the day was laid out again whenever
    // it came or went — and it comes exactly when a scrub drops past new
    // stories: every cell and every `6h` tick moved under the finger that had
    // just aimed at one (2026-09-24, the user's report). The column is
    // anchored at the foot, so the pill grows it upward and the track keeps
    // its width. It sits over the track's left end, where the new stories are,
    // the way a feed's "new posts" pill floats over the list it jumps.
    <View style={styles.foot} pointerEvents="box-none">
      {newCount > 0 && onNewPress ? (
        <IconButton
          onPress={onNewPress}
          hitSlop={0}
          style={[styles.newAction, { marginLeft: inset }]}
          accessibilityLabel={`${newCount} new ${newCount === 1 ? 'story' : 'stories'}`}
          accessibilityHint="Goes to the newest story you have not seen"
        >
          {/* Solid: it rests on the card's text, which `pillBg` lets through. */}
          <View
            style={[styles.newPill, { backgroundColor: colors.playerBg, borderColor: colors.rule }]}
          >
            <Icon name="chevron-back" size="sm" tone="emphasis" />
            <Text variant="labelXs" tone="emphasis">
              {`${newCount} new`}
            </Text>
          </View>
        </IconButton>
      ) : null}
      <View
        style={[
          styles.dock,
          {
            // The track runs to the same margin at both ends.
            paddingLeft: inset,
            paddingRight: Math.max(SPACING.articlePadding, insets.right),
            paddingBottom: insets.bottom,
            backgroundColor: colors.sheetBg,
            // Transparent rather than no border, so the dock keeps its height.
            borderColor: ruled ? colors.rule : 'transparent',
          },
        ]}
      >
        {status ? (
          <Pressable
            onPress={showingAlert ? onAlertPress : undefined}
            disabled={!showingAlert || !onAlertPress}
            accessibilityLiveRegion="polite"
            accessibilityRole={showingAlert ? 'button' : 'text'}
            style={({ pressed }) => [styles.status, pressed && showingAlert ? PRESSED_STYLE : null]}
          >
            <Text variant="caption" tone="secondary" numberOfLines={2}>
              {status}
            </Text>
          </Pressable>
        ) : count > 0 ? (
          <ScrubBar
            scrub={scrub}
            fraction={fraction}
            interactive={!!onSeek}
            segments={count}
            activeSegment={index}
            // The loudest ink on the sheet, not the story's hue: a hue can match
            // the cells either side, and the reader could not find their place.
            activeSegmentColor={colors.textEmphasis}
            height={TRACK}
            trackColor={colors.rule}
            trackColors={tints ?? undefined}
            faded={read}
            cells={day?.cells}
            cellKeys={slugs}
            tall={mostCovered}
            marks={marks}
            markColor={markInk}
            onTrackWidth={setTrackWidth}
            thumbColor={destinationHue}
            style={styles.scrub}
            accessibilityRole="adjustable"
            // Where you are is the value, not the name, so VoiceOver reads the
            // new position after each adjustment.
            accessibilityLabel="Today's stories"
            accessibilityValue={{
              min: 1,
              max: count,
              now: Math.min(index + 1, count),
              text: spoken,
            }}
            accessibilityHint="Now is at the left and a day ago at the right. Drag along it to move through the day's stories"
            accessibilityActions={ADJUST_ACTIONS}
            onAccessibilityAction={handleAdjust}
          >
            <ScrubTooltip
              scrub={scrub}
              backgroundColor={colors.toastBg}
              stemColor={destinationHue}
              labelScale={TIME_SCALE}
            />
          </ScrubBar>
        ) : (
          <View style={styles.shrink} />
        )}
      </View>
    </View>
  );
});

/** Room for `now` at the track's left end, in the marks' 11pt tabular. */
const NOW_LABEL_WIDTH = 26;
/** Two marks' words closer than this lose the quarter's: `12h` stays. */
const MARK_LABEL_MIN_GAP = MARK_LABEL_WIDTH + SPACING.xs;
/** The track's thickness: a rule you can see, not a control you can grab. */
const TRACK = 3;
/** The `‹ 3 new` pill's height, inside its 48pt touch target. It was the
 *  height of the dock's circles, which went on 2026-09-22. */
const PILL = 40;
/** The tooltip's time at body size: 11pt tabular × 17/11. The tabular
 *  variants do not follow Dynamic Type, so the fixed width below holds. */
const TIME_SCALE = 17 / 11;
/** Wide enough for `45m ago` at `TIME_SCALE`, and a category under it. */
const TOOLTIP_WIDTH = 112;
/** How far an unread segment's hue is mixed toward the sheet: still plainly
 *  its category, a touch under the globe's beacons. */
const UNREAD_MIX = { dark: 0.15, light: 0.15 } as const;
/**
 * How far a read segment's hue is mixed toward the sheet: a trace of its
 * category, far enough down that the unread stories carry the track. The old
 * position fill stopped at 0.45 / 0.6, and read as a second palette rather
 * than as done.
 */
const READ_MIX = { dark: 0.7, light: 0.75 } as const;
const styles = StyleSheet.create({
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    // A hairline, not a shadow: the text scrolls up out from under it.
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  shrink: { flex: 1 },
  status: { flex: 1, minHeight: CONTROL_ROW, justifyContent: 'center' },
  // A full-height target, sized to its words.
  newAction: {
    height: CONTROL_ROW,
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  // Hairline edge so the pill holds its shape on the sheet without a shadow.
  newPill: {
    height: PILL,
    borderRadius: PILL / 2,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACING.smPlus,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xxs,
  },
  // The touch area is taller than the 3pt track it holds.
  scrub: { flex: 1, minHeight: CONTROL_ROW, justifyContent: 'center' },
});
