import Constants from 'expo-constants';
import { memo } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONT, SPACING, TYPOGRAPHY } from '../constants/theme';
import { BrandLogo } from './BrandLogo';

const VERSION = Constants.expoConfig?.version ?? '1.0.0';

export const AboutPage = memo(function AboutPage() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.container,
        { paddingBottom: insets.bottom + SPACING.screenPadding },
      ]}
    >
      <Text style={styles.heading}>About</Text>

      <Text style={styles.body}>
        zuhd.news is an independent global news service with no advertising, no algorithms, and
        no tracking. Zuhd is the Arabic concept of detachment from excess — not deprivation, but
        clarity. Applied to news: what remains has earned its place.
      </Text>

      <Text style={styles.heading}>Principles</Text>

      <Text style={styles.body}>
        Accuracy over speed. Every claim sourced. Language is precise — passive voice does not
        obscure responsibility. Every human life carries equal weight regardless of nationality
        or faith.
      </Text>

      <Text style={styles.heading}>Format</Text>

      <Text style={styles.body}>
        Each article states what happened, why it matters, and what comes next — written to be read
        in under 30 seconds. No opinion, no editorializing, no filler.
      </Text>

      <Text style={styles.heading}>Sources</Text>

      <Text style={styles.body}>
        Researched and written from sources across six continents, with deliberate weight toward
        regions underrepresented in Western wire services.
      </Text>

      <Text style={styles.heading}>Privacy</Text>

      <Text style={styles.body}>
        {'No accounts.\nNo tracking.\nNo analytics.\nNo data collected.\nNothing sold because nothing gathered.'}
      </Text>

      <Text style={styles.heading}>Contact</Text>

      <Text style={styles.body}>
        Corrections, feedback, and source suggestions:{' '}
        <Text style={styles.link} onPress={() => Linking.openURL('mailto:yunus@edenmind.com')}>
          yunus@edenmind.com
        </Text>
      </Text>

      <View style={styles.signature}>
        <BrandLogo />
        <Text style={styles.version}>v{VERSION}</Text>
      </View>
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  container: {
    padding: SPACING.screenPadding,
    paddingTop: 0,
  },
  heading: {
    fontFamily: FONT.semiBold,
    fontSize: TYPOGRAPHY.sizeXs,
    color: COLORS.textSecondary,
    letterSpacing: TYPOGRAPHY.trackingCaps,
    textTransform: 'uppercase',
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  body: {
    fontFamily: FONT.regular,
    fontSize: TYPOGRAPHY.sizeBase,
    lineHeight: TYPOGRAPHY.sizeBase * TYPOGRAPHY.leadingBody,
    color: COLORS.text,
    marginBottom: SPACING.md,
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
