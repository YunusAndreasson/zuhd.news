import Constants from 'expo-constants';
import { useCallback, useMemo, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONT, SPACING, TYPOGRAPHY } from '../constants/theme';
import type { Article, Category } from '../types';
import { BrandLogo } from './BrandLogo';
import { Globe } from './globe/Globe';
import { extractDotLocations } from './globe/storyDots';

const VERSION = Constants.expoConfig?.version ?? '1.0.0';

interface GlobePageProps {
  grouped: Record<Category, Article[]>;
}

export function GlobePage({ grouped }: GlobePageProps) {
  const insets = useSafeAreaInsets();
  const [infoVisible, setInfoVisible] = useState(false);
  const dots = useMemo(() => extractDotLocations(grouped), [grouped]);

  const openInfo = useCallback(() => setInfoVisible(true), []);
  const closeInfo = useCallback(() => setInfoVisible(false), []);

  return (
    <View style={styles.container}>
      <Globe dots={dots} />

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
