import { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, interpolate, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONT, TYPOGRAPHY, SPACING, LAYOUT, CATEGORIES } from '../constants/theme';

const TAB_LABELS = [...CATEGORIES.map((c) => c.toUpperCase()), 'ABOUT'];

interface TabLayout {
  x: number;
  width: number;
}

interface CategoryBarProps {
  pagerOffset: SharedValue<number>;
  categoryProgresses: SharedValue<number[]>;
  onCategoryPress: (index: number) => void;
}

function TabLabel({ label, index, pagerOffset, onPress, onLayout }: {
  label: string;
  index: number;
  pagerOffset: SharedValue<number>;
  onPress: () => void;
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    const distance = Math.abs(pagerOffset.value - index);
    return { color: distance < 0.5 ? COLORS.text : COLORS.textSecondary };
  });

  return (
    <Pressable
      onPress={onPress}
      onLayout={onLayout}
      hitSlop={SPACING.sm}
      style={({ pressed }) => pressed && { opacity: 0.5 }}
    >
      <Animated.Text style={[styles.tabLabel, animatedStyle]}>{label}</Animated.Text>
    </Pressable>
  );
}

export function CategoryBar({ pagerOffset, categoryProgresses, onCategoryPress }: CategoryBarProps) {
  const insets = useSafeAreaInsets();
  const [tabLayouts, setTabLayouts] = useState<TabLayout[]>([]);
  const layoutsRef = useRef<(TabLayout | null)[]>(new Array(TAB_LABELS.length).fill(null));
  const allMeasured = tabLayouts.length === TAB_LABELS.length;

  const onTabLayout = useCallback(
    (index: number) => (e: LayoutChangeEvent) => {
      const { x, width } = e.nativeEvent.layout;
      layoutsRef.current[index] = { x, width };
      if (layoutsRef.current.every((l) => l !== null)) {
        setTabLayouts([...layoutsRef.current] as TabLayout[]);
      }
    },
    [],
  );

  const trackStyle = useAnimatedStyle(() => {
    if (!allMeasured) return { opacity: 0 };
    const indices = TAB_LABELS.map((_, i) => i);
    const x = interpolate(pagerOffset.value, indices, tabLayouts.map((l) => l.x), 'clamp');
    const w = interpolate(pagerOffset.value, indices, tabLayouts.map((l) => l.width), 'clamp');
    return { opacity: 1, left: x, width: w };
  });

  const fillStyle = useAnimatedStyle(() => {
    if (!allMeasured) return { width: 0 };
    const indices = TAB_LABELS.map((_, i) => i);
    const tabWidth = interpolate(pagerOffset.value, indices, tabLayouts.map((l) => l.width), 'clamp');

    // Blend progress between adjacent categories during horizontal swipe
    const idx = Math.floor(Math.max(0, pagerOffset.value));
    const frac = pagerOffset.value - idx;
    const nextIdx = Math.min(idx + 1, TAB_LABELS.length - 1);
    const progressA = idx < CATEGORIES.length ? (categoryProgresses.value[idx] ?? 0) : 1;
    const progressB = nextIdx < CATEGORIES.length ? (categoryProgresses.value[nextIdx] ?? 0) : 1;
    const progress = progressA + (progressB - progressA) * frac;

    return { width: tabWidth * progress };
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Pressable
        onPress={() => onCategoryPress(0)}
        style={({ pressed }) => pressed && { opacity: 0.5 }}
      >
        <Text style={styles.wordmark}>
          <Text style={styles.wordmarkName}>zuhd</Text>
          <Text style={styles.wordmarkDim}>.news</Text>
        </Text>
      </Pressable>

      <View style={styles.tabRow}>
        {TAB_LABELS.map((label, i) => (
          <TabLabel
            key={label}
            label={label}
            index={i}
            pagerOffset={pagerOffset}
            onPress={() => onCategoryPress(i)}
            onLayout={onTabLayout(i)}
          />
        ))}

        <Animated.View style={[styles.track, trackStyle]} />
        <Animated.View style={[styles.fill, trackStyle]}>
          <Animated.View style={[styles.fillInner, fillStyle]} />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.bg,
    zIndex: 10,
    paddingBottom: SPACING.sm,
  },
  wordmark: {
    paddingHorizontal: SPACING.screenPadding,
    paddingTop: SPACING.xs,
    marginBottom: SPACING.sm,
    letterSpacing: TYPOGRAPHY.trackingWordmark,
  },
  wordmarkName: {
    fontFamily: FONT.bold,
    fontSize: TYPOGRAPHY.sizeWordmark,
    color: COLORS.textSecondary,
  },
  wordmarkDim: {
    fontFamily: FONT.regular,
    fontSize: TYPOGRAPHY.sizeWordmark,
    color: COLORS.accent,
  },
  tabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.screenPadding,
    gap: SPACING.lg,
    paddingBottom: SPACING.xs,
  },
  tabLabel: {
    fontFamily: FONT.semiBold,
    fontSize: TYPOGRAPHY.sizeTab,
    letterSpacing: TYPOGRAPHY.trackingCaps,
  },
  track: {
    position: 'absolute',
    bottom: 0,
    height: LAYOUT.progressBarHeight,
    backgroundColor: COLORS.white,
    opacity: 0.15,
    borderRadius: LAYOUT.progressBarHeight,
  },
  fill: {
    position: 'absolute',
    bottom: 0,
    height: LAYOUT.progressBarHeight,
    overflow: 'hidden',
    borderRadius: LAYOUT.progressBarHeight,
  },
  fillInner: {
    height: LAYOUT.progressBarHeight,
    backgroundColor: COLORS.white,
    borderRadius: 1,
  },
});
