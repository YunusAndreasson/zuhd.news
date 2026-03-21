import Constants from 'expo-constants';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, FONT, SPACING, TYPOGRAPHY } from '../constants/theme';
import { BrandLogo } from './BrandLogo';

const VERSION = Constants.expoConfig?.version ?? '1.0.0';

export function AboutPage() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.container,
        { paddingBottom: insets.bottom + SPACING.screenPadding },
      ]}
    >
      <Text style={styles.heading}>Zuhd</Text>

      <Text style={styles.body}>
        Detachment from what you do not need. The Prophet ﷺ said, be in this world as if you were a
        stranger, or a traveler.
      </Text>

      <Text style={styles.body}>
        The best of speech is the speech of Allah. Yet looking away from the world has consequences.
        Zuhd means seeing clearly — not consuming more, but understanding what you see.
      </Text>

      <Text style={styles.heading}>Why this exists</Text>

      <Text style={styles.body}>
        While Muslims were not watching, the caliphate was abolished after one world war and
        Palestine was lost after the next. The New York Times did not print the word Nakba until
        1998 — fifty years after it happened.
      </Text>

      <Text style={styles.heading}>How we write</Text>

      <Text style={styles.body}>
        Every article says what happened, why it matters, and what comes next. Then it stops. No
        speculation, no outrage, no engagement tricks.
      </Text>

      <Text style={styles.body}>
        When people are killed, we say who killed them — not "clashes erupted." Fourteen centuries
        ago, the Quran set the standard: if news reaches you, verify it, lest you harm a people out
        of ignorance.
      </Text>

      <Text style={styles.heading}>What we believe</Text>

      <Text style={styles.body}>
        Every human life carries equal dignity. The Quran grants karamah to all children of Adam —
        not only Muslims. A Palestinian death and an Israeli death carry the same weight. Truth is
        what happened. Not both sides. Not balance. What happened.
      </Text>

      <Text style={styles.heading}>What we cover</Text>

      <Text style={styles.body}>
        Forty sources across six continents. The Associated Press sends 90,000 words daily from New
        York but takes in only 19,000 from all of Asia. We chose a different center.
      </Text>

      <Text style={styles.body}>
        The globe starts in Washington and turns to Mecca — the point toward which two billion
        people orient themselves, five times a day.
      </Text>

      <Text style={styles.heading}>Your privacy</Text>

      <Text style={styles.body}>
        Your data is an amanah — a trust. We hold nothing. No tracking, no accounts, no ads. Nothing
        collected, nothing sold.
      </Text>

      <Pressable
        onPress={() => Linking.openURL('mailto:yunus@edenmind.com')}
        hitSlop={SPACING.sm}
        style={({ pressed }) => pressed && { opacity: 0.5 }}
      >
        <Text style={styles.dim}>
          Feedback: <Text style={styles.link}>yunus@edenmind.com</Text>
        </Text>
      </Pressable>

      <View style={styles.signature}>
        <BrandLogo />
        <Text style={styles.version}>v{VERSION}</Text>
      </View>
    </ScrollView>
  );
}

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
