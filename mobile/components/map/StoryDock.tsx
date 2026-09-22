import { memo, useCallback, useEffect, useMemo } from 'react';
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
import type { FoundProgress } from '../../lib/story-places';
import { Icon, IconButton, Text } from '../primitives';
import { ScrubBar, ScrubTooltip } from '../ScrubBar';

/**
 * The dock: where the reader is in the day, in one row at the foot of the
 * screen, where a thumb already is.
 *
 * `(‹ 3 new) [ story track ]` — the track scrubs the day, newest story at its
 * left end (each segment is its story's category hue). It is pinned to the
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
 * ahead of where the reader was, or a scrub skipped them — `‹ 3 new` leads the
 * row and jumps to the newest of them. It is a pill in the sheet's control
 * material (`pillBg`, a hairline edge), not a badge: ink, no colour, no count
 * on the icon, and it goes when there is nothing left behind the reader to
 * catch up on. The track itself carries no mark for new stories: a dashed
 * rule over their segments was drawn for a day (2026-09-21) and removed at
 * the user's request (2026-09-22) — a second row that said what each card's
 * `new ·` kicker and this pill already say.
 *
 * There is no list of every story: one was tried (`IndexSheet`, twice) and
 * the reader did not want it — the track and the swipe are the way through.
 * The menu stays at the top right of the map: it is opened a few times a
 * week, and thumb reach is for what is used every session. The briefing's ▶
 * was the first of this row's circles until 2026-09-21, when the user asked
 * for it at the top beside the menu (`MapHeader`).
 */

/** Which story a fraction of the track points at: the segment under it. */
function storyAt(fraction: number, count: number): number {
  'worklet';
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
  hues,
  fresh,
  slugs,
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
  /** One category hue per story, for the track's segments. */
  hues?: readonly string[];
  /** Per story: arrived since the reader last had the feed — counted for a
   *  screen reader; the track draws nothing for it. */
  fresh?: readonly boolean[];
  /** Per story, its slug: what the read store is keyed on. */
  slugs?: readonly string[];
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
  const unreadNew = useMemo(() => {
    let newCount = 0;
    let first = -1;
    for (let i = 0; i < index; i++) {
      if (!fresh?.[i] || read?.[i]) continue;
      if (first < 0) first = i;
      newCount++;
    }
    return { newCount, first };
  }, [fresh, read, index]);
  const { newCount } = unreadNew;
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
  // Preview the destination's full category hue on the same UI-thread frame
  // as the thumb moves, without waiting for a committed story or React render.
  const destinationHue = useDerivedValue(
    () => hues?.[storyAt(fraction.value, count)] ?? colors.textEmphasis,
  );
  // The tooltip says when, large, and nothing else loud (2026-09-22, the
  // user's request). It led with `12 of 48` over `politics · 12h ago` in
  // 11pt secondary ink, and when is what a reader scrubbing a day in time
  // order is reading for: the position is on the track under the finger.
  // The words are the card's kicker's, so the tooltip and the card it lands
  // on agree.
  const labelFor = useCallback((f: number) => timeAt(storyAt(f, count)), [timeAt, count]);
  const detailFor = useCallback(
    (f: number) => (categoryAt ? categoryAt(storyAt(f, count)) : ''),
    [categoryAt, count],
  );
  // Each segment in its story's category hue — the globe's beacons and the
  // card's dot, so a teal segment is a teal light — a touch below full: at
  // full strength the row was the loudest colour on the sheet after the
  // globe, and it pulled the eye off the headline. **A read story fades to a
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
  const handleCommit = useCallback((f: number) => onSeek?.(storyAt(f, count)), [onSeek, count]);
  const scrub = useScrub({
    fraction,
    detents: count,
    steps: count,
    labelFor,
    detailFor,
    onCommit: handleCommit,
    onClaim,
    tooltipWidth: TOOLTIP_WIDTH,
    enabled: count > 0 && !!onSeek,
  });
  const holding = scrub.holding;
  useAnimatedReaction(
    () => position.value,
    (p) => {
      if (holding.value) return;
      const filled = count > 0 ? (p + 1) / count : 0;
      fraction.value = Math.min(1, Math.max(0, filled));
    },
    [count],
  );
  const handleAdjust = useCallback(
    (e: AccessibilityActionEvent) => {
      if (!onSeek || count <= 0) return;
      if (e.nativeEvent.actionName === 'increment') onSeek(Math.min(index + 1, count - 1));
      else if (e.nativeEvent.actionName === 'decrement') onSeek(Math.max(index - 1, 0));
    },
    [onSeek, index, count],
  );

  const found = progress?.found ?? 0;
  const freshTotal = fresh?.reduce((n, isFresh) => (isFresh ? n + 1 : n), 0) ?? 0;
  const readTotal = read?.reduce((n, isRead) => (isRead ? n + 1 : n), 0) ?? 0;
  const spoken = `${index >= count ? `End of all ${count} stories` : `Story ${index + 1} of ${count}`}${freshTotal > 0 ? `, ${freshTotal} new` : ''}${readTotal > 0 ? `, ${readTotal} read` : ''}${found > 0 ? `, ${found} found on the globe` : ''}`;

  return (
    <View
      style={[
        styles.dock,
        {
          // The track runs to the same margin at both ends.
          paddingLeft: Math.max(SPACING.articlePadding, insets.left),
          paddingRight: Math.max(SPACING.articlePadding, insets.right),
          paddingBottom: insets.bottom,
          backgroundColor: colors.sheetBg,
          borderColor: colors.rule,
        },
      ]}
    >
      {newCount > 0 && onNewPress ? (
        <IconButton
          onPress={onNewPress}
          hitSlop={0}
          style={styles.newAction}
          accessibilityLabel={`${newCount} new ${newCount === 1 ? 'story' : 'stories'}`}
          accessibilityHint="Goes to the newest story you have not seen"
        >
          <View
            style={[styles.newPill, { backgroundColor: colors.pillBg, borderColor: colors.rule }]}
          >
            <Icon name="chevron-back" size="sm" tone="emphasis" />
            <Text variant="labelXs" tone="emphasis">
              {`${newCount} new`}
            </Text>
          </View>
        </IconButton>
      ) : null}
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
          activeSegmentColor={hues?.[index]}
          height={TRACK}
          trackColor={colors.rule}
          trackColors={tints ?? undefined}
          faded={read}
          thumbColor={destinationHue}
          style={styles.scrub}
          accessibilityRole="adjustable"
          // Where you are is the value, not the name, so VoiceOver reads the
          // new position after each adjustment.
          accessibilityLabel="Today's stories"
          accessibilityValue={{ min: 1, max: count, now: Math.min(index + 1, count), text: spoken }}
          accessibilityHint="Drag along it to move through the day's stories"
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
  );
});

/** The track's thickness: a rule you can see, not a control you can grab. */
const TRACK = 3;
/** The `‹ 3 new` pill's height, inside its 48pt touch target. It was the
 *  height of the dock's circles, which went on 2026-09-22. */
const PILL = 40;
/** Between the pill and the track, so the jump reads as its own control
 *  rather than the track's first segment. */
const TRACK_GAP = SPACING.md;
/** The tooltip's time at body size: 11pt tabular × 17/11. The tabular
 *  variants do not follow Dynamic Type, so the fixed width below holds. */
const TIME_SCALE = 17 / 11;
/** Wide enough for `45m ago` at `TIME_SCALE`, and `economy` under it. */
const TOOLTIP_WIDTH = 96;
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
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
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
    flexShrink: 0,
    justifyContent: 'center',
    marginRight: TRACK_GAP,
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
