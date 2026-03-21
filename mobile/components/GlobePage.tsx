import Constants from 'expo-constants';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONT, SPACING, TYPOGRAPHY } from '../constants/theme';
import type { Article, Category } from '../types';
import { BrandLogo } from './BrandLogo';
import { Globe } from './globe/Globe';
import { type DotLocation, extractDotLocations } from './globe/storyDots';

const VERSION = Constants.expoConfig?.version ?? '1.0.0';
const TOOLTIP_MS = 4000;

interface GlobePageProps {
  grouped: Record<Category, Article[]>;
  visible: boolean;
}

export function GlobePage({ grouped, visible }: GlobePageProps) {
  const insets = useSafeAreaInsets();
  const [infoVisible, setInfoVisible] = useState(false);
  const [selectedDot, setSelectedDot] = useState<DotLocation | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dots = useMemo(() => extractDotLocations(grouped), [grouped]);

  const openInfo = useCallback(() => setInfoVisible(true), []);
  const closeInfo = useCallback(() => setInfoVisible(false), []);

  const handleDotTap = useCallback((dot: DotLocation) => {
    setSelectedDot(dot);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => setSelectedDot(null), TOOLTIP_MS);
  }, []);

  const dismissTooltip = useCallback(() => {
    setSelectedDot(null);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
  }, []);

  return (
    <View style={styles.container}>
      <Globe dots={dots} visible={visible} onDotTap={handleDotTap} />

      {/* Article titles tooltip — appears on dot tap */}
      {selectedDot && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(200)}
          style={[styles.tooltip, { bottom: insets.bottom + SPACING.xxl }]}
        >
          <Pressable onPress={dismissTooltip}>
            {selectedDot.titles.map((title, i) => (
              <Text
                key={selectedDot.slugs[i]}
                style={[styles.tooltipTitle, i > 0 && styles.tooltipTitleExtra]}
                numberOfLines={1}
              >
                {title}
              </Text>
            ))}
            {selectedDot.count > 1 && (
              <Text style={styles.tooltipCount}>
                {selectedDot.count} stories from this location
              </Text>
            )}
          </Pressable>
        </Animated.View>
      )}

      {/* Info button */}
      <Pressable
        style={[styles.infoButton, { bottom: insets.bottom + SPACING.lg }]}
        onPress={openInfo}
        hitSlop={12}
      >
        <Text style={styles.infoLabel}>about</Text>
      </Pressable>

      {/* Info sheet */}
      <Modal transparent visible={infoVisible} animationType="slide">
        <Pressable style={styles.backdrop} onPress={closeInfo} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.lg }]}>
          <View style={styles.handle} />
          <Text style={styles.body}>
            Zuhd — the discipline of doing without what you do not need.
          </Text>
          <Text style={styles.body}>
            Each article says what happened, why it matters, and what comes next. Then it stops.
          </Text>
          <Text style={styles.body}>
            Forty sources across six continents, because where a story is told from determines who
            is a person and who is a number.
          </Text>
          <View style={styles.meta}>
            <Text style={styles.dim}>No tracking. No accounts. No ads. No data collected.</Text>
            <Pressable
              onPress={() => Linking.openURL('mailto:yunus@edenmind.com')}
              hitSlop={SPACING.sm}
              style={({ pressed }) => pressed && { opacity: 0.5 }}
            >
              <Text style={styles.dim}>
                Feedback: <Text style={styles.link}>yunus@edenmind.com</Text>
              </Text>
            </Pressable>
          </View>
          <View style={styles.signature}>
            <BrandLogo />
            <Text style={styles.version}>v{VERSION}</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  tooltip: {
    position: 'absolute',
    left: SPACING.screenPadding,
    right: SPACING.screenPadding,
    backgroundColor: '#1c1c1c',
    borderRadius: 10,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  tooltipTitle: {
    fontFamily: FONT.semiBold,
    fontSize: TYPOGRAPHY.sizeSm,
    lineHeight: TYPOGRAPHY.sizeSm * 1.4,
    color: COLORS.text,
  },
  tooltipTitleExtra: {
    marginTop: SPACING.xs,
    color: COLORS.textSecondary,
  },
  tooltipCount: {
    fontFamily: FONT.regular,
    fontSize: TYPOGRAPHY.sizeXs,
    color: COLORS.accent,
    marginTop: SPACING.xs,
  },
  infoButton: {
    position: 'absolute',
    right: SPACING.screenPadding,
  },
  infoLabel: {
    fontFamily: FONT.semiBold,
    fontSize: TYPOGRAPHY.sizeXs,
    color: COLORS.textSecondary,
    letterSpacing: TYPOGRAPHY.trackingCaps,
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#1c1c1c',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: SPACING.screenPadding,
    paddingTop: SPACING.md,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.rule,
    alignSelf: 'center',
    marginBottom: SPACING.lg,
  },
  body: {
    fontFamily: FONT.regular,
    fontSize: TYPOGRAPHY.sizeBase,
    lineHeight: TYPOGRAPHY.sizeBase * TYPOGRAPHY.leadingBody,
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  meta: {
    marginTop: SPACING.lg,
    gap: SPACING.sm,
  },
  dim: {
    fontFamily: FONT.regular,
    fontSize: TYPOGRAPHY.sizeSm,
    lineHeight: TYPOGRAPHY.sizeSm * TYPOGRAPHY.leadingBody,
    color: COLORS.accent,
  },
  link: {
    color: COLORS.textSecondary,
    textDecorationLine: 'underline',
  },
  signature: {
    alignItems: 'center',
    marginTop: SPACING.xxl,
    gap: SPACING.sm,
  },
  version: {
    fontFamily: FONT.regular,
    fontSize: TYPOGRAPHY.sizeXs,
    color: COLORS.accent,
  },
});
