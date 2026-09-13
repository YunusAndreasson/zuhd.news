import { BlurView } from 'expo-blur';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  type AccessibilityActionEvent,
  ActivityIndicator,
  type LayoutChangeEvent,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  FadeInDown,
  FadeOut,
  LinearTransition,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ANIMATION, OPACITY, RADIUS, SPACING, withAlpha } from '../constants/theme';
import { useScrub } from '../hooks/useScrub';
import { useTheme } from '../hooks/useTheme';
import { Icon, IconButton, Text } from './primitives';
import { ScrubBar, ScrubTooltip } from './ScrubBar';

const BAR_MARGIN = SPACING.md;
const PROGRESS_HEIGHT = 3;
const TOOLTIP_WIDTH = 48;
// Haptic detents across the full track. The ratchet is *spatial*, not
// temporal: a fixed number of notches per swipe regardless of how long the
// briefing is, so a 4-minute and a 20-minute briefing feel identical under
// the finger. Firing per audio-second instead (what `seek` used to do)
// pegged the haptic to the frame rate — on a 12-minute briefing one point
// of finger travel spans ~2 audio seconds, so every frame crossed a
// boundary and the "tick per second" became a continuous buzz.
const SCRUB_DETENTS = 40;

const SEEK_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface BriefingBarProps {
  state: 'idle' | 'preparing' | 'playing' | 'paused';
  elapsed: number;
  duration: number;
  date: string;
  onToggle: () => void;
  onSeek: (seconds: number) => void;
  onDismiss: () => void;
}

export const BriefingBar = memo(function BriefingBar({
  state,
  elapsed,
  duration,
  date,
  onToggle,
  onSeek,
  onDismiss,
}: BriefingBarProps) {
  const { colors } = useTheme();
  const preparing = state === 'preparing';
  const playing = state === 'playing';
  const insets = useSafeAreaInsets();

  const progress = duration > 0 ? Math.max(0, Math.min(elapsed / duration, 1)) : 0;
  const progressSV = useSharedValue(0);
  const scrubbingRef = useRef(false);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    // The gesture owns progressSV while the finger is down. Native playback
    // status can briefly report the pre-seek position; letting that value start
    // a timing animation here made the fill fight the finger and snap backward.
    if (scrubbingRef.current) return;
    if (reduceMotion) {
      progressSV.value = progress;
    } else {
      // Slow fill for smooth playback tracking (matches the elapsed-update cadence)
      progressSV.value = withTiming(progress, { duration: ANIMATION.long });
    }
  }, [progress, reduceMotion, progressSV]);

  // The scrub owns `progressSV` while a finger is down (see the effect above);
  // one latest-value seek is committed when it lifts. `useScrub` holds the
  // gesture, detents and tooltip for this and for the story track.
  const handleScrubStart = useCallback(() => {
    scrubbingRef.current = true;
  }, []);
  const handleScrubEnd = useCallback(() => {
    scrubbingRef.current = false;
  }, []);
  const handleCommit = useCallback((f: number) => onSeek(f * duration), [onSeek, duration]);
  const labelFor = useCallback((f: number) => formatTime(Math.round(f * duration)), [duration]);
  const scrub = useScrub({
    fraction: progressSV,
    detents: SCRUB_DETENTS,
    steps: Math.max(1, Math.round(duration)),
    labelFor,
    onCommit: handleCommit,
    onScrubStart: handleScrubStart,
    onScrubEnd: handleScrubEnd,
    tooltipWidth: TOOLTIP_WIDTH,
    enabled: !preparing,
  });
  const handleSeekAction = useCallback(
    (e: AccessibilityActionEvent) => {
      const step = Math.max(10, duration * 0.05);
      if (e.nativeEvent.actionName === 'increment') onSeek(Math.min(elapsed + step, duration));
      else if (e.nativeEvent.actionName === 'decrement') onSeek(Math.max(elapsed - step, 0));
    },
    [duration, elapsed, onSeek],
  );

  const dateLabel = useMemo(() => {
    try {
      return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return date;
    }
  }, [date]);

  return (
    <Animated.View
      entering={FadeInDown.duration(ANIMATION.normal).withInitialValues({
        transform: [{ translateY: 12 }],
      })}
      exiting={FadeOut.duration(ANIMATION.fast)}
      layout={LinearTransition.duration(ANIMATION.normal)}
      style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, SPACING.sm) }]}
      pointerEvents="box-none"
    >
      <BarBackground tintColor={colors.pillBg}>
        {/* Tooltip lives outside the clipping inner so it can float ABOVE
            the bar without being chopped by the inner's overflow:hidden. */}
        <ScrubTooltip scrub={scrub} backgroundColor={colors.toastBg} />

        {/* Inner container clips the edge-to-edge progress strip to the
            pill's bottom-corner curve. The strip is only PROGRESS_HEIGHT
            tall, so it can't carry RADIUS.floating on its own — the curve
            has to come from a parent overflow:hidden + matching radius. */}
        <View style={styles.barInner}>
          <View style={styles.row}>
            <View style={styles.info}>
              <Text
                variant="labelSm"
                tone="emphasis"
                numberOfLines={1}
                accessibilityLiveRegion="polite"
              >
                {preparing ? 'preparing' : 'briefing'}
                <Text variant="labelSm">
                  {' · '}
                  {dateLabel}
                </Text>
              </Text>
            </View>

            {/* 13/11 = match `sizeSm` so the readout sits at the same optical
                size as the `briefing · {date}` label and reads as a peer of the
                lg icons rather than a tiny caption. */}
            <Text variant="tabular" tone="emphasis" scale={13 / 11}>
              {formatTime(elapsed)}
              <Text variant="tabular" tone="secondary" scale={13 / 11}>
                {' / '}
                {formatTime(duration)}
              </Text>
            </Text>

            {preparing ? (
              <ActivityIndicator
                size="small"
                color={colors.textEmphasis}
                accessibilityLabel="Preparing briefing"
              />
            ) : (
              <IconButton
                onPress={onToggle}
                accessibilityLabel={playing ? 'Pause briefing' : 'Play briefing'}
              >
                <Icon name={playing ? 'pause' : 'play'} tone="emphasis" size="lg" />
              </IconButton>
            )}

            {/* Same size as play/pause; visual hierarchy comes from `tone`,
                not a smaller box — `close-sharp` glyph is already thin so a
                size step down made the X read meaningfully smaller. */}
            <IconButton
              onPress={onDismiss}
              accessibilityLabel={preparing ? 'Cancel briefing loading' : 'Hide briefing player'}
            >
              <Icon name="close-sharp" tone="secondary" size="lg" />
            </IconButton>
          </View>

          <ScrubBar
            scrub={scrub}
            fraction={progressSV}
            interactive={!preparing}
            height={PROGRESS_HEIGHT}
            trackColor={withAlpha(colors.textEmphasis, OPACITY.soft)}
            fillColor={colors.textSecondary}
            thumbColor={colors.textEmphasis}
            style={styles.progressTouch}
            accessibilityRole={preparing ? 'progressbar' : 'adjustable'}
            accessibilityLabel={
              preparing
                ? `Preparing briefing, ${formatTime(duration)} total`
                : `Briefing progress, ${formatTime(elapsed)} of ${formatTime(duration)}`
            }
            accessibilityActions={preparing ? undefined : SEEK_ACTIONS}
            onAccessibilityAction={preparing ? undefined : handleSeekAction}
          />
        </View>
      </BarBackground>
    </Animated.View>
  );
});

/** iOS uses a frosted-glass background so the chrome floats over the article
 *  reader; Android falls back to a solid `pillBg` fill because Android's
 *  BlurView implementation is uneven across vendors. Both wrap the bar's
 *  rounded-rect with the same border radius and clip overflow so the inner
 *  edge-to-edge progress strip follows the corner curve. */
const BarBackground = memo(function BarBackground({
  children,
  onLayout,
  tintColor,
}: {
  children: React.ReactNode;
  onLayout?: (e: LayoutChangeEvent) => void;
  tintColor: string;
}) {
  if (Platform.OS === 'ios') {
    return (
      <BlurView intensity={60} tint="systemThinMaterial" style={styles.bar} onLayout={onLayout}>
        {children}
      </BlurView>
    );
  }
  return (
    <View style={[styles.bar, { backgroundColor: tintColor }]} onLayout={onLayout}>
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: BAR_MARGIN,
  },
  // No overflow:hidden — the scrub tooltip floats above the bar. The
  // progress strip is clipped by `barInner`'s overflow:hidden so it can
  // run edge-to-edge and follow the pill's bottom-corner curve.
  bar: {
    width: '100%',
    borderRadius: RADIUS.floating,
  },
  // Clipping container for the bar's content. Holds the row + progress;
  // shares the bar's borderRadius so its overflow:hidden trims the strip
  // along the same outer curve. Padding lives here (was on `bar`) so the
  // strip can sit flush with the inner's bottom edge.
  barInner: {
    borderRadius: RADIUS.floating,
    overflow: 'hidden',
    paddingTop: SPACING.smPlus,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.smPlus,
    paddingHorizontal: SPACING.md,
  },
  info: {
    flex: 1,
    justifyContent: 'center',
  },
  progressTouch: {
    // Vertical hit area above the visible 3px strip. The strip itself is
    // flush with the bar's bottom edge, so all the touch slack goes above —
    // which also lifts the grabbable zone clear of the system gesture inset
    // at the screen's bottom edge. `lg` (was `md`) widens the thin target so
    // drag-to-scrub is easy to catch without clipping the home-indicator zone.
    paddingTop: SPACING.lg,
  },
});
