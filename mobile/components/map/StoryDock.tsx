import { memo, useCallback, useEffect, useMemo } from 'react';
import { type AccessibilityActionEvent, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mixHex, PRESSED_STYLE, SPACING } from '../../constants/theme';
import { useScrub } from '../../hooks/useScrub';
import { useTheme } from '../../hooks/useTheme';
import { announce } from '../../lib/announce';
import { CONTROL_ROW } from '../../lib/deck-layout';
import type { FoundProgress } from '../../lib/story-places';
import { Icon, IconButton, Text } from '../primitives';
import { ScrubBar, ScrubTooltip } from '../ScrubBar';

/**
 * The dock: every control a reader moves through the day with, in one row at
 * the foot of the screen, where a thumb already is.
 *
 * `(‹ 3 new) [ story track ] (⌃) (›)` — the track scrubs the day, newest
 * story at its left end (each segment is its story's category hue), ⌃ opens
 * the story on the card and closes it again, and › is the next story,
 * in the corner because it is the control a reader uses forty times a
 * session. Open and close sit beside it because they are the next most
 * common: without them, closing a story meant a pull down the sheet or a tap
 * on the globe at the top of the screen. It is pinned to the screen, not to the sheet, so it
 * is in the same place whether a story is at rest or open: the row used to
 * sit on top of the sheet, which put it mid-screen at rest and near the top
 * when a story was open — nowhere a thumb holding the phone could reach.
 *
 * The next button slides the deck exactly as a swipe does (`StoryDeck.step`);
 * the swipe still works, and the button is the one-handed way to do it.
 *
 * **What arrived is visible from the dock (2026-09-21).** Stories new since
 * the reader last had the feed carry a rule over their segments, so a glance
 * at the track's left end says whether anything came in. When new stories sit
 * between the head of the river and the story in front — a refresh put them
 * ahead of where the reader was, or a scrub skipped them — `‹ 3 new` leads the
 * row and jumps to the newest of them. It is a pill in the circles' own
 * material, not a badge: ink, no colour, no count on the icon, and it goes
 * when there is nothing left behind the reader to catch up on.
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
  detailAt,
  hues,
  fresh,
  newCount = 0,
  onNewPress,
  onNext,
  storyOpen,
  sheetProgress,
  onToggleStory,
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
  /** A story's category and when it ran (`tech · 5h ago`), shown under its
   *  position while scrubbing. */
  detailAt?: (index: number) => string;
  /** One category hue per story, for the track's segments. */
  hues?: readonly string[];
  /** Per story: arrived since the reader last had the feed. */
  fresh?: readonly boolean[];
  /** New stories behind the one in front that the reader has not had. */
  newCount?: number;
  /** Jump to the newest of them. */
  onNewPress?: () => void;
  /** The next story. Disabled on the end card. */
  onNext: () => void;
  /** The sheet has settled open. */
  storyOpen: boolean;
  /** The sheet's rise, 0 at rest and 1 open: the chevron turns with it. */
  sheetProgress: SharedValue<number>;
  /** Open the story on the card, or put it down. */
  onToggleStory: () => void;
}) {
  const { colors, resolvedAppearance } = useTheme();
  const insets = useSafeAreaInsets();
  const showingAlert = !refreshing && !!alert;
  const status = refreshing ? 'checking for new stories' : showingAlert ? `now · ${alert}` : null;
  // The status line is a live region, which only Android speaks.
  useEffect(() => {
    if (status) announce(status, { liveRegion: true });
  }, [status]);

  // One story of 48 fills a 48th of the track; the end card fills it. The deck
  // writes this unless a finger is scrubbing the track itself.
  const fraction = useSharedValue(0);
  // Preview the destination's full category hue on the same UI-thread frame
  // as the thumb moves, without waiting for a committed story or React render.
  const destinationHue = useDerivedValue(
    () => hues?.[storyAt(fraction.value, count)] ?? colors.textEmphasis,
  );
  const labelFor = useCallback((f: number) => `${storyAt(f, count) + 1} of ${count}`, [count]);
  // Where in the day is only half of it; when is the other half, in the words
  // the card's kicker and the index already use.
  const detailFor = useCallback(
    (f: number) => (detailAt ? detailAt(storyAt(f, count)) : ''),
    [detailAt, count],
  );
  // Each segment in its story's category hue — the globe's beacons and the
  // card's dot, so a teal segment is a teal light. Stories already passed take
  // the hue a step quieter, as found places dim on the globe, so the colour sits
  // on what is left to read and the track still says how far through the day
  // you are. Upcoming stories sit a touch below full too: at full strength
  // the row was the loudest colour on the sheet after the globe, and it pulled
  // the eye off the headline. The raised current-story marker carries its
  // full hue separately, so neither track palette changes on every landing.
  const tints = useMemo(() => {
    if (!hues || hues.length !== count) return null;
    const quiet = QUIET_MIX[resolvedAppearance];
    const ahead = AHEAD_MIX[resolvedAppearance];
    const tint = (mix: number) => hues.map((hue) => mixHex(hue, colors.sheetBg, mix));
    return { passed: tint(quiet), ahead: tint(ahead) };
  }, [hues, count, colors.sheetBg, resolvedAppearance]);
  const handleCommit = useCallback((f: number) => onSeek?.(storyAt(f, count)), [onSeek, count]);
  const scrub = useScrub({
    fraction,
    detents: count,
    steps: count,
    labelFor,
    detailFor,
    onCommit: handleCommit,
    tooltipWidth: detailAt ? DETAIL_TOOLTIP_WIDTH : 64,
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
  const spoken = `${index >= count ? `End of all ${count} stories` : `Story ${index + 1} of ${count}`}${freshTotal > 0 ? `, ${freshTotal} new` : ''}${found > 0 ? `, ${found} found on the globe` : ''}`;
  const hasNext = index < count;
  // The end card has nothing more to open; an open sheet can always close.
  const canToggle = storyOpen || index < count;
  // Up at rest, down open, and every angle between while a finger drags the
  // sheet: the arrow always points the way the sheet would go. Finger-tracked,
  // so it is exempt from Reduce Motion like the sheet itself.
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${180 * Math.min(1, Math.max(0, sheetProgress.value))}deg` }],
  }));

  return (
    <View
      style={[
        styles.dock,
        {
          paddingLeft: Math.max(SPACING.articlePadding, insets.left),
          // The last circle's edge sits as far from the screen's as the
          // track's start does, half the gap being inside its touch target.
          paddingRight: insets.right + SPACING.articlePadding - BUTTON_GAP / 2,
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
          fillColor={colors.textSecondary}
          trackColors={tints?.ahead}
          fillColors={tints?.passed}
          marks={fresh}
          markColor={colors.textEmphasis}
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
          <ScrubTooltip scrub={scrub} backgroundColor={colors.toastBg} stemColor={destinationHue} />
        </ScrubBar>
      ) : (
        <View style={styles.shrink} />
      )}
      <View style={styles.actions}>
        <IconButton
          onPress={onToggleStory}
          disabled={!canToggle}
          haptic="none"
          style={styles.action}
          hitSlop={0}
          accessibilityLabel={storyOpen ? 'Close the story' : 'Open the whole story'}
          accessibilityState={{ expanded: storyOpen, disabled: !canToggle }}
        >
          <View
            style={[
              styles.circle,
              {
                backgroundColor: canToggle ? colors.pillBg : 'transparent',
                borderColor: colors.rule,
              },
            ]}
          >
            <Animated.View style={chevronStyle}>
              <Icon name="chevron-up" size="md" tone={canToggle ? 'default' : 'secondary'} />
            </Animated.View>
          </View>
        </IconButton>
        <IconButton
          onPress={onNext}
          disabled={!hasNext}
          haptic="none"
          style={styles.action}
          hitSlop={0}
          accessibilityLabel="Next story"
          accessibilityState={{ disabled: !hasNext }}
        >
          <View
            style={[
              styles.circle,
              // The end card: the day is finite, and the button says so by
              // dropping its fill — an ink step, never an opacity. `⌃` does the
              // same when there is nothing to open.
              {
                backgroundColor: hasNext ? colors.pillBg : 'transparent',
                borderColor: colors.rule,
              },
            ]}
          >
            <Icon name="chevron-forward" size="md" tone={hasNext ? 'emphasis' : 'secondary'} />
          </View>
        </IconButton>
      </View>
    </View>
  );
});

/** The track's thickness: a rule you can see, not a control you can grab. */
const TRACK = 3;
/**
 * Every dock button is the same circle. Listen, open/close and next were three
 * treatments for three controls of one kind — a 28pt circle, a bare chevron
 * and a 40pt circle — and the row read as three unrelated marks. `›` is still
 * the one in emphasis ink; the size no longer has to say it. (Listen has since
 * moved to the top bar.)
 */
const BUTTON = 40;
/** Between one circle and the next, and the slack each touch target carries
 *  beyond its circle: targets are `BUTTON + BUTTON_GAP` (48pt) wide and touch,
 *  so the circles sit this far apart and every target is still 48 × 48. */
const BUTTON_GAP = SPACING.sm;
/** Between the track and the first circle: twice the buttons' own gap, so
 *  where you are (the track) and what you can do (the buttons) read as two
 *  groups rather than one row of five things. */
const TRACK_GAP = SPACING.md;
/** Wide enough for `politics · 12h ago` at the tabular size. */
const DETAIL_TOOLTIP_WIDTH = 116;
/**
 * How far a passed segment's hue is mixed toward the sheet. Less on the dark
 * sheet: at 0.6 the quiet politics and economy hues both went a muddy brown
 * there, while on the light sheet 0.6 still reads as four distinct pastels.
 */
const QUIET_MIX = { dark: 0.45, light: 0.6 } as const;
/** How far an upcoming segment's hue is mixed toward the sheet: still plainly
 *  its category, and a step brighter than what has been passed. */
const AHEAD_MIX = { dark: 0.15, light: 0.15 } as const;
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
  // Hairline edge so the button holds its shape on the sheet without a shadow.
  circle: {
    width: BUTTON,
    height: BUTTON,
    borderRadius: BUTTON / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  // The track's edge to the first circle is TRACK_GAP; half a button gap of
  // it is inside the first target.
  actions: { flexDirection: 'row', marginLeft: TRACK_GAP - BUTTON_GAP / 2 },
  // Full-height targets that touch, so the circles keep an even gap.
  action: {
    width: BUTTON + BUTTON_GAP,
    height: CONTROL_ROW,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The same height and material as the circles, sized to its words, and as
  // far off the track as the circles are on the other side.
  newAction: {
    height: CONTROL_ROW,
    flexShrink: 0,
    justifyContent: 'center',
    marginRight: TRACK_GAP,
  },
  newPill: {
    height: BUTTON,
    borderRadius: BUTTON / 2,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACING.smPlus,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xxs,
  },
  // The touch area is taller than the 3pt track it holds.
  scrub: { flex: 1, minHeight: CONTROL_ROW, justifyContent: 'center' },
});
