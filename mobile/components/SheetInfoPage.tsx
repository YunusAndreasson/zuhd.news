import { Linking, StyleSheet, Text, View } from 'react-native';
import { SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
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
  return (
    <>
      {sections.map((section, i) => (
        <View key={i} style={i > 0 ? styles.section : undefined}>
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
              onPress={() => Linking.openURL(section.link?.url ?? '')}
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
        </View>
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
