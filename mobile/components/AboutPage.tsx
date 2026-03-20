import { View, Text, ScrollView, Pressable, Linking, StyleSheet } from 'react-native';
import Constants from 'expo-constants';
import { COLORS, FONT, TYPOGRAPHY, SPACING } from '../constants/theme';
import { BrandLogo } from './BrandLogo';

const VERSION = Constants.expoConfig?.version ?? '1.0.0';

export function AboutPage() {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      {/* Philosophy */}
      <Text style={styles.body}>
        Zuhd — the discipline of doing without what you do not need.
      </Text>
      <Text style={styles.body}>
        Each article says what happened, why it matters, and what comes next. Then it stops.
      </Text>
      <Text style={styles.body}>
        Forty sources across six continents, because where a story is told from determines who is a
        person and who is a number. People who bear power's consequences are the subject, not the
        scenery.
      </Text>

      {/* Commitment + contact */}
      <View style={styles.meta}>
        <Text style={styles.dim}>
          No tracking. No accounts. No ads. No data collected.
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
      </View>

      {/* Brand signature */}
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
    paddingTop: SPACING.lg,
  },
  body: {
    fontFamily: FONT.regular,
    fontSize: TYPOGRAPHY.sizeBase,
    lineHeight: TYPOGRAPHY.sizeBase * TYPOGRAPHY.leadingBody,
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  meta: {
    marginTop: SPACING.xl,
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
    textDecorationLine: 'underline' as const,
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
