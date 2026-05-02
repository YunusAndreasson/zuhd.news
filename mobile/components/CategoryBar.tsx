import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Animated, { interpolate, type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CATEGORIES,
  HIT_SLOP,
  LAYOUT,
  MAX_FONT_SCALE,
  OPACITY,
  PRESSED_STYLE,
  SPACING,
} from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { Icon, IconButton } from './primitives';

// Lowercase strings render via the dedicated small-caps font (SourceSans3SC),
// matching the labelSm/labelXs treatment used by every other small-caps
// surface (BottomActionBar pills, sheet titles). Uppercasing here would
// route uppercase glyphs through the small-caps font, which renders them
// as full caps and breaks the editorial smallcaps voice.
const TAB_LABELS = [...CATEGORIES];
const TAB_INDICES = TAB_LABELS.map((_, i) => i);

interface TabLayout {
  x: number;
  width: number;
}

interface CategoryBarProps {
  pagerOffset: SharedValue<number>;
  categoryProgresses: SharedValue<number[]>;
  currentCategory: number;
  onCategoryPress: (index: number) => void;
  onMenuPress: () => void;
}

function TabLabel({
  label,
  index,
  pagerOffset,
  isSelected,
  labelStyle,
  onCategoryPress,
  onLayout,
}: {
  label: string;
  index: number;
  pagerOffset: SharedValue<number>;
  isSelected: boolean;
  labelStyle: { fontFamily?: string; fontSize: number; letterSpacing: number; color: string };
  onCategoryPress: (index: number) => void;
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  const handlePress = useCallback(() => onCategoryPress(index), [onCategoryPress, index]);

  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    const distance = Math.abs(pagerOffset.value - index);
    const opacity = interpolate(distance, [0, 1], [1, 0.4], 'clamp');
    return { color: labelStyle.color, opacity };
  });

  return (
    <Pressable
      onPress={handlePress}
      onLayout={onLayout}
      hitSlop={HIT_SLOP}
      style={({ pressed }) => pressed && PRESSED_STYLE}
      accessibilityRole="tab"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={label}
    >
      <Animated.Text
        style={[labelStyle, animatedStyle]}
        maxFontSizeMultiplier={MAX_FONT_SCALE.chrome}
      >
        {label}
      </Animated.Text>
    </Pressable>
  );
}

export const CategoryBar = memo(function CategoryBar({
  pagerOffset,
  categoryProgresses,
  currentCategory,
  onCategoryPress,
  onMenuPress,
}: CategoryBarProps) {
  const { colors, font, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const [tabLayouts, setTabLayouts] = useState<TabLayout[]>([]);
  const layoutsRef = useRef<(TabLayout | null)[]>(new Array(TAB_LABELS.length).fill(null));
  const allMeasured = tabLayouts.length === TAB_LABELS.length;

  const handleTabLayout = useCallback((index: number, e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    layoutsRef.current[index] = { x, width };
    const layouts = layoutsRef.current;
    if (layouts.every((l): l is TabLayout => l !== null)) {
      setTabLayouts([...layouts]);
    }
  }, []);

  const tabLayoutHandlers = useMemo(
    () => TAB_LABELS.map((_, i) => (e: LayoutChangeEvent) => handleTabLayout(i, e)),
    [handleTabLayout],
  );

  // Track: interpolated (smooth slide). Fill: snapped (both left + width from same index).
  const trackPos = useAnimatedStyle(() => {
    if (!allMeasured) return { width: 0 };
    const x = interpolate(
      pagerOffset.value,
      TAB_INDICES,
      tabLayouts.map((l) => l.x),
      'clamp',
    );
    const w = interpolate(
      pagerOffset.value,
      TAB_INDICES,
      tabLayouts.map((l) => l.width),
      'clamp',
    );
    return { left: x, width: w, opacity: OPACITY.soft };
  });

  const fillPos = useAnimatedStyle(() => {
    if (!allMeasured) return { width: 0 };

    const currentIdx = Math.min(Math.round(Math.max(0, pagerOffset.value)), tabLayouts.length - 1);
    const tab = tabLayouts[currentIdx];
    const progress =
      currentIdx < CATEGORIES.length ? (categoryProgresses.value[currentIdx] ?? 0) : 1;

    return { left: tab?.x ?? 0, width: (tab?.width ?? 0) * progress, opacity: 1 };
  });

  const labelStyle = {
    ...font.smallCaps,
    fontSize: typography.sizeXs,
    letterSpacing: typography.trackingCaps,
    color: colors.text,
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.bg }]}>
      <View style={styles.tabRow}>
        {TAB_LABELS.map((label, i) => (
          <TabLabel
            key={label}
            label={label}
            index={i}
            pagerOffset={pagerOffset}
            isSelected={currentCategory === i}
            labelStyle={labelStyle}
            onCategoryPress={onCategoryPress}
            onLayout={tabLayoutHandlers[i] ?? (() => {})}
          />
        ))}
        <IconButton onPress={onMenuPress} accessibilityLabel="Menu" style={styles.menuButton}>
          <Icon name="menu" size="md" />
        </IconButton>
        <Animated.View
          style={[styles.progressBar, { backgroundColor: colors.textEmphasis }, trackPos]}
        />
        <Animated.View
          style={[styles.progressBar, { backgroundColor: colors.textEmphasis }, fillPos]}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    zIndex: 10,
    paddingBottom: SPACING.sm,
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // Aligned with the article reader's column — `articlePadding` mirrors
    // the body's horizontal inset so the small-caps labels visually line up
    // with the title's first character. Left: +2 optical compensation
    // because the small-caps side-bearings are tighter than H1 body text;
    // matching the inset exactly makes the row look outdented. Right: raw
    // `articlePadding` (the menu glyph's own sidebearing reads flush).
    paddingLeft: SPACING.articlePadding + 2,
    paddingRight: SPACING.articlePadding,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
    gap: SPACING.lg,
  },
  menuButton: {
    marginLeft: 'auto',
    // Pull icon up ~1px so its optical center lines up with the small-caps
    // labels' x-height rather than the row's geometric midline.
    transform: [{ translateY: -1 }],
  },
  progressBar: {
    position: 'absolute',
    bottom: 0,
    height: LAYOUT.progressBarHeight,
    borderRadius: LAYOUT.progressBarHeight,
  },
});
