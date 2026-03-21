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
        Detachment from what does not matter. The Prophet ﷺ said: be in this world as if you were a
        stranger, or a traveler. A traveler studies the road — then moves on.
      </Text>

      <Text style={styles.heading}>No algorithm</Text>

      <Text style={styles.body}>
        Social media places news beside indecency, gossip beside revelation, truth beside falsehood
        — and calls it a feed. The algorithm surfaces what triggers appetite and frames it as what
        everyone is watching. Its purpose is retention, not comprehension. Zuhd has none of this. You
        read, understand, and leave.
      </Text>

      <Text style={styles.heading}>Why this exists</Text>

      <Text style={styles.body}>
        Ignorance is not neutrality. It has consequences. While Muslims were not
        watching, the caliphate was abolished after one world war and Palestine was lost after the
        next. The New York Times did not print the word Nakba until 1998 — fifty years later.
      </Text>

      <Text style={styles.heading}>How we write</Text>

      <Text style={styles.body}>
        Every article says what happened, why it matters, and what comes next. Then it stops. When
        people are killed, we name who killed them — not {'"'}clashes erupted.{'"'} The Quran,
        fourteen centuries ago: if a fasiq brings you news, verify it, lest you harm a people out of
        ignorance.
      </Text>

      <Text style={styles.heading}>What we believe</Text>

      <Text style={styles.body}>
        Every human life carries equal dignity. The Quran grants karamah to all children of Adam —
        not only Muslims. A Palestinian death and an Israeli death carry the same weight. Truth is
        what happened. Not both sides. What happened.
      </Text>

      <Text style={styles.heading}>What we cover</Text>

      <Text style={styles.body}>
        Forty sources across six continents. The Associated Press sends 90,000 words daily from New
        York but receives 19,000 from Asia. The globe starts in Washington and turns to Mecca —
        the point two billion people face, five times a day.
      </Text>

      <Text style={styles.heading}>Your privacy</Text>

      <Text style={styles.body}>
        Your data is an amanah — a trust. No tracking, no accounts, no ads. Nothing collected,
        nothing sold.
      </Text>

      <Text style={styles.heading}>Feedback</Text>

      <Text style={styles.body}>
        Tell us what we got wrong.{' '}
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
