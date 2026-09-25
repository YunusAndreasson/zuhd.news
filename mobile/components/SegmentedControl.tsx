import { useEffect } from 'react';
import { Pressable as RNPressable, StyleSheet, type TextStyle, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { ANIMATION, EASING, LAYOUT, OPACITY, SPACING, type TextTone } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { hapticTick } from '../lib/haptics';
import { Text } from './primitives';

/** Between the track's edge and the selected segment. The `Toggle`'s inset,
 *  less one: a segment is wider than a thumb and wants a finer frame. */
const INSET = 3;

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Spoken instead of `label` — when the visible word is a sample, not a name. */
  accessibilityLabel?: string;
}

interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
  /** Names the group for screen readers ("text size"). */
  accessibilityLabel: string;
  /** `radio` for a setting, `tab` for a filter over the list under it. */
  role?: 'radio' | 'tab';
  /** `compact` sets the labels at caption size, for four or more segments. */
  size?: 'regular' | 'compact';
  /** Multiplies one option's label size — the text-size picker sets each size in itself. */
  labelScale?: (value: T) => number;
  /** Merged onto one option's label — the font picker sets each family in itself. */
  labelStyle?: (value: T) => TextStyle | undefined;
}

/**
 * One choice among a few, all visible — the settings' text size, font and
 * appearance, and the markets browser's filters.
 *
 * The settings used to print their options as bare words, `small default
 * large`, told apart by a step of grey: they read as a sentence rather than a
 * control, and each was a ~30pt target. This is the `Toggle`'s material laid
 * sideways: a `rule` track, and the chosen segment filled with `text` ink with
 * its word in `inverse` — so "on" looks the same in both controls.
 *
 * **The selected segment slides, and its word never changes colour.** Two
 * copies of the labels are drawn: one in `text` ink on the track, and one in
 * `inverse` inside the moving fill, counter-translated so it lines up with the
 * first. As the fill slides it reveals the inverted words exactly where it
 * covers them. Recolouring the words on selection instead left the new one
 * track-on-track, near invisible, until the fill arrived.
 */
export function SegmentedControl<T extends string>({
  options,
  selected,
  onSelect,
  accessibilityLabel,
  role = 'radio',
  size = 'regular',
  labelScale,
  labelStyle,
}: SegmentedControlProps<T>) {
  const { colors } = useTheme();
  const count = options.length;
  // One segment's width, measured on the UI thread's terms. A shared value, not
  // state: with the fill mounted only once a width was known, the style it
  // mounted with was the one computed before layout — every fill at the first
  // option — and nothing moved it until the selection changed. Reopened,
  // settings showed "small" and "system" filled beside "large" and "dark"
  // checked. Until the first layout the fill is zero wide, and the chosen word
  // shows in plain ink for that frame.
  const segment = useSharedValue(0);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === selected),
  );
  const pos = useSharedValue(index);
  useEffect(() => {
    pos.set(withTiming(index, { duration: ANIMATION.fast, easing: EASING.out }));
  }, [index, pos]);

  const fillStyle = useAnimatedStyle(() => ({
    width: segment.value,
    transform: [{ translateX: pos.value * segment.value }],
  }));
  const copyStyle = useAnimatedStyle(() => ({
    width: segment.value * count,
    transform: [{ translateX: -pos.value * segment.value }],
  }));

  const variant = size === 'compact' ? 'captionEmphasis' : 'body';
  const label = (o: SegmentOption<T>, tone: TextTone) => (
    <Text
      variant={variant}
      tone={tone}
      scale={labelScale?.(o.value)}
      style={labelStyle?.(o.value)}
      numberOfLines={1}
    >
      {o.label}
    </Text>
  );

  return (
    <View
      style={[styles.track, { backgroundColor: colors.rule }]}
      onLayout={(e) => segment.set((e.nativeEvent.layout.width - INSET * 2) / count)}
      accessibilityRole={role === 'tab' ? 'tablist' : 'radiogroup'}
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((o) => {
        const active = o.value === selected;
        return (
          // A plain press, not the spring primitive: a segment that shrank
          // under the finger would part from its twin in the fill.
          <RNPressable
            key={o.value}
            onPress={() => {
              if (active) return;
              hapticTick();
              onSelect(o.value);
            }}
            style={({ pressed }) => [styles.segment, pressed && !active && styles.pressed]}
            accessibilityRole={role}
            accessibilityState={role === 'tab' ? { selected: active } : { checked: active }}
            accessibilityLabel={o.accessibilityLabel ?? o.label}
          >
            {label(o, 'default')}
          </RNPressable>
        );
      })}
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.fill, { backgroundColor: colors.text }, fillStyle]}
      >
        <Animated.View style={[styles.copy, copyStyle]}>
          {options.map((o) => (
            <View key={o.value} style={styles.segment}>
              {label(o, 'inverse')}
            </View>
          ))}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const SEGMENT_HEIGHT = LAYOUT.controlHeight - INSET * 2;

const styles = StyleSheet.create({
  // Radii follow the height, as the `Toggle`'s do: the curve is the shape's.
  track: {
    flexDirection: 'row',
    padding: INSET,
    minHeight: LAYOUT.controlHeight,
    borderRadius: LAYOUT.controlHeight / 2,
  },
  segment: {
    flex: 1,
    minHeight: SEGMENT_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xs,
  },
  pressed: { opacity: OPACITY.pressed },
  fill: {
    position: 'absolute',
    top: INSET,
    bottom: INSET,
    left: INSET,
    borderRadius: SEGMENT_HEIGHT / 2,
    overflow: 'hidden',
  },
  copy: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    flexDirection: 'row',
  },
});
