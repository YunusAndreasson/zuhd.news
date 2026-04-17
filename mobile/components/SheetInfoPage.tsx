import { StyleSheet, Text } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ANIMATION, SPACING, staggerDelay } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { useOpenLink } from '../lib/open-link';
import { HapticPressable } from './HapticPressable';

export interface InfoSection {
  heading?: string;
  body: string;
  link?: { label: string; url: string };
}

interface SheetInfoPageProps {
  sections: InfoSection[];
}

/** Prose-heavy sheet page: optional heading, body, optional link per section. */
export function SheetInfoPage({ sections }: SheetInfoPageProps) {
  const { colors, font, typography, textStyles } = useTheme();
  const openLink = useOpenLink();
  return (
    <>
      {sections.map((section, i) => (
        <Animated.View
          key={i}
          entering={FadeInDown.duration(ANIMATION.normal).delay(staggerDelay(i))}
          style={i > 0 ? styles.section : undefined}
        >
          {section.heading && (
            <Text style={[styles.heading, textStyles.smallCaps]}>{section.heading}</Text>
          )}
          {section.body.length > 0 && (
            <Text
              selectable
              style={{
                ...font.regular,
                fontSize: typography.sizeSm,
                lineHeight: typography.sizeSm * typography.leadingBody,
                color: section.heading ? colors.text : colors.accent,
              }}
            >
              {section.body}
            </Text>
          )}
          {section.link && (
            <HapticPressable
              onPress={() => section.link?.url && openLink(section.link.url)}
              style={styles.link}
              accessibilityRole="link"
              accessibilityLabel={section.link.label}
            >
              <Text
                style={{
                  ...font.semiBold,
                  fontSize: typography.sizeSm,
                  color: colors.accent,
                  textDecorationLine: 'underline',
                }}
              >
                {section.link.label}
              </Text>
            </HapticPressable>
          )}
        </Animated.View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: SPACING.md,
  },
  heading: {
    marginBottom: SPACING.xs,
  },
  link: {
    marginTop: SPACING.xs,
  },
});
