import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback, useRef } from 'react';
import {
  type GestureResponderEvent,
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LAYOUT, PRESSED_STYLE, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { ActionButtons } from './ActionButtons';

const BAR_MARGIN = SPACING.md;
const BAR_RADIUS = 14;
const PROGRESS_HEIGHT = 3;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface BriefingBarProps {
  playing: boolean;
  elapsed: number;
  duration: number;
  date: string;
  onToggle: () => void;
  onSeek: (seconds: number) => void;
  onSearchPress: () => void;
  onBookmarkPress: () => void;
}

export const BriefingBar = memo(function BriefingBar({
  playing,
  elapsed,
  duration,
  date,
  onToggle,
  onSeek,
  onSearchPress,
  onBookmarkPress,
}: BriefingBarProps) {
  const { colors, font, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const barWidth = useRef(0);
  const expanded = playing;

  const onBarLayout = useCallback((e: LayoutChangeEvent) => {
    barWidth.current = e.nativeEvent.layout.width;
  }, []);

  const handleProgressPress = useCallback(
    (e: GestureResponderEvent) => {
      if (duration <= 0 || barWidth.current <= 0) return;
      const x = e.nativeEvent.locationX;
      const fraction = Math.max(0, Math.min(1, x / barWidth.current));
      onSeek(fraction * duration);
    },
    [duration, onSeek],
  );

  const progress = duration > 0 ? elapsed / duration : 0;

  // Format date for display: "Mar 31" from "2026-03-31"
  const dateLabel = (() => {
    try {
      const d = new Date(date + 'T00:00:00');
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return date;
    }
  })();

  return (
    <Animated.View
      entering={FadeIn.duration(250)}
      exiting={FadeOut.duration(200)}
      layout={LinearTransition.duration(250)}
      style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, SPACING.sm) }]}
      pointerEvents="box-none"
    >
      {expanded ? (
        /* ── Expanded: full player ── */
        <View
          style={[styles.bar, { backgroundColor: colors.sheetBg, shadowColor: colors.black }]}
          onLayout={onBarLayout}
        >
          <View style={styles.row}>
            <View style={styles.info}>
              <Text
                style={[
                  styles.title,
                  {
                    fontFamily: font.semiBold,
                    fontSize: typography.sizeSm,
                    color: colors.textEmphasis,
                  },
                ]}
                numberOfLines={1}
              >
                Daily Briefing
                <Text
                  style={[
                    styles.dateDim,
                    { fontFamily: font.regular, color: colors.textSecondary },
                  ]}
                >
                  {' '}
                  · {dateLabel}
                </Text>
              </Text>
            </View>

            <Text
              style={[
                styles.time,
                {
                  fontFamily: font.regular,
                  fontSize: typography.sizeXs,
                  color: colors.textEmphasis,
                },
              ]}
            >
              {formatTime(elapsed)}
              <Text style={{ color: colors.textSecondary }}> / {formatTime(duration)}</Text>
            </Text>

            <Pressable
              onPress={onToggle}
              hitSlop={12}
              style={({ pressed }) => pressed && PRESSED_STYLE}
              accessibilityRole="button"
              accessibilityLabel={playing ? 'Pause briefing' : 'Play briefing'}
            >
              <Ionicons name={playing ? 'pause' : 'play'} size={LAYOUT.iconMd} color={colors.textEmphasis} />
            </Pressable>
          </View>

          <Pressable
            onPress={handleProgressPress}
            style={styles.progressTouch}
            accessibilityRole="adjustable"
            accessibilityLabel={`Briefing progress, ${formatTime(elapsed)} of ${formatTime(duration)}`}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) => {
              const step = Math.max(10, duration * 0.05);
              if (e.nativeEvent.actionName === 'increment')
                onSeek(Math.min(elapsed + step, duration));
              else if (e.nativeEvent.actionName === 'decrement')
                onSeek(Math.max(elapsed - step, 0));
            }}
          >
            <View style={[styles.progressTrack, { backgroundColor: colors.rule }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: colors.textSecondary,
                    transform: [{ scaleX: progress }],
                  },
                ]}
              />
            </View>
          </Pressable>
        </View>
      ) : (
        /* ── Collapsed: actions + play button ── */
        <View style={styles.collapsedRow}>
          <ActionButtons onSearchPress={onSearchPress} onBookmarkPress={onBookmarkPress} />
          <Pressable
            onPress={onToggle}
            style={({ pressed }) => [
              styles.pill,
              { backgroundColor: colors.sheetBg, shadowColor: colors.black },
              pressed && PRESSED_STYLE,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Play daily briefing"
          >
            <Ionicons name="play" size={LAYOUT.iconSm} color={colors.textEmphasis} />
            <Text
              style={[
                styles.pillText,
                {
                  fontFamily: font.semiBold,
                  fontSize: typography.sizeSm,
                  color: colors.textEmphasis,
                },
              ]}
            >
              Briefing
            </Text>
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: BAR_MARGIN,
    alignItems: 'flex-end',
  },
  /* ── Expanded bar ── */
  bar: {
    width: '100%',
    borderRadius: BAR_RADIUS,
    paddingTop: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    overflow: 'hidden',
    ...LAYOUT.floatingShadow,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm + 2,
  },
  info: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {},
  dateDim: {},
  time: {
    fontVariant: ['tabular-nums'],
  },
  progressTouch: {
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm + 2,
    marginHorizontal: -SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  progressTrack: {
    height: PROGRESS_HEIGHT,
    borderRadius: PROGRESS_HEIGHT,
    overflow: 'hidden',
  },
  progressFill: {
    width: '100%',
    height: PROGRESS_HEIGHT,
    borderRadius: PROGRESS_HEIGHT,
    transformOrigin: 'left',
  },
  /* ── Collapsed row ── */
  collapsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs + 2,
    borderRadius: BAR_RADIUS,
    paddingVertical: SPACING.sm,
    paddingLeft: SPACING.sm + 2,
    paddingRight: SPACING.md,
    ...LAYOUT.floatingShadow,
  },
  pillText: {},
});
