import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useRef, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { interpolate, type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CATEGORIES,
  COLORS,
  FONT,
  LAYOUT,
  PRESSED_STYLE,
  SPACING,
  TYPOGRAPHY,
} from '../constants/theme';

const TAB_LABELS = CATEGORIES.map((c) => c.toUpperCase());

interface TabLayout {
  x: number;
  width: number;
}

interface CategoryBarProps {
  pagerOffset: SharedValue<number>;
  categoryProgresses: SharedValue<number[]>;
  currentCategory: number;
  onCategoryPress: (index: number) => void;
  briefingAvailable: boolean;
  briefingPlaying: boolean;
  onBriefingPress: () => void;
}

function TabLabel({
  label,
  index,
  pagerOffset,
  onPress,
  onLayout,
}: {
  label: string;
  index: number;
  pagerOffset: SharedValue<number>;
  onPress: () => void;
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    'worklet';
    const distance = Math.abs(pagerOffset.value - index);
    const opacity = interpolate(distance, [0, 1], [1, 0.4], 'clamp');
    return { color: COLORS.text, opacity };
  });

  return (
    <Pressable
      onPress={onPress}
      onLayout={onLayout}
      hitSlop={12}
      style={({ pressed }) => pressed && PRESSED_STYLE}
    >
      <Animated.Text style={[styles.tabLabel, animatedStyle]}>{label}</Animated.Text>
    </Pressable>
  );
}

export function CategoryBar({
  pagerOffset,
  categoryProgresses,
  currentCategory,
  onCategoryPress,
  briefingAvailable,
  briefingPlaying,
  onBriefingPress,
}: CategoryBarProps) {
  const insets = useSafeAreaInsets();
  const [tabLayouts, setTabLayouts] = useState<TabLayout[]>([]);
  const layoutsRef = useRef<(TabLayout | null)[]>(new Array(TAB_LABELS.length).fill(null));
  const allMeasured = tabLayouts.length === TAB_LABELS.length;

  const handleTabLayout = useCallback((index: number, e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    layoutsRef.current[index] = { x, width };
    if (layoutsRef.current.every((l) => l !== null)) {
      setTabLayouts([...layoutsRef.current] as TabLayout[]);
    }
  }, []);

  const tabLayoutHandlers = useMemo(
    () => TAB_LABELS.map((_, i) => (e: LayoutChangeEvent) => handleTabLayout(i, e)),
    [handleTabLayout],
  );

  // Track: interpolated (smooth slide). Fill: snapped (both left + width from same index).
  const trackPos = useAnimatedStyle(() => {
    if (!allMeasured) return { width: 0 };
    const indices = TAB_LABELS.map((_, i) => i);
    const x = interpolate(
      pagerOffset.value,
      indices,
      tabLayouts.map((l) => l.x),
      'clamp',
    );
    const w = interpolate(
      pagerOffset.value,
      indices,
      tabLayouts.map((l) => l.width),
      'clamp',
    );
    // Hide underline on icon tabs
    return { left: x, width: w, opacity: 0.15 };
  });

  const fillPos = useAnimatedStyle(() => {
    if (!allMeasured) return { width: 0 };

    const currentIdx = Math.min(Math.round(Math.max(0, pagerOffset.value)), tabLayouts.length - 1);
    const tab = tabLayouts[currentIdx];
    const progress =
      currentIdx < CATEGORIES.length ? (categoryProgresses.value[currentIdx] ?? 0) : 1;

    return { left: tab?.x ?? 0, width: (tab?.width ?? 0) * progress, opacity: 1 };
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Pressable
        onPress={() => onCategoryPress(currentCategory)}
        style={({ pressed }) => pressed && PRESSED_STYLE}
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
            onLayout={tabLayoutHandlers[i]!}
          />
        ))}
        {briefingAvailable && (
          <Pressable
            onPress={onBriefingPress}
            hitSlop={12}
            style={({ pressed }) => pressed && PRESSED_STYLE}
          >
            <View style={styles.tabIcon}>
              <Ionicons
                name={briefingPlaying ? 'pause' : 'play'}
                size={TYPOGRAPHY.sizeSm}
                color={COLORS.text}
                style={{ opacity: briefingPlaying ? 1 : 0.4 }}
              />
            </View>
          </Pressable>
        )}

        <Animated.View style={[styles.progressBar, trackPos]} />
        <Animated.View style={[styles.progressBar, fillPos]} />
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
    fontSize: TYPOGRAPHY.sizeXs,
    letterSpacing: TYPOGRAPHY.trackingCaps,
  },
  tabIcon: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressBar: {
    position: 'absolute',
    bottom: 0,
    height: LAYOUT.progressBarHeight,
    borderRadius: LAYOUT.progressBarHeight,
    backgroundColor: COLORS.textEmphasis,
  },
});
