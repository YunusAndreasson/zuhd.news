import { StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ANIMATION, SPACING, staggerDelay } from '../constants/theme';
import { useOpenLink } from '../lib/open-link';
import { Pressable, Text } from './primitives';

export interface InfoSection {
  heading?: string;
  body: string;
  link?: { label: string; url: string };
  /** Multiple links stacked vertically — useful when a section references
   *  several external sources (e.g. the About page's data-source list). */
  links?: { label: string; url: string }[];
}

interface SheetInfoPageProps {
  sections: InfoSection[];
}

/** Prose-heavy sheet page: optional heading, body, optional link per section. */
export function SheetInfoPage({ sections }: SheetInfoPageProps) {
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
            <Text variant="labelSm" style={styles.heading}>
              {section.heading}
            </Text>
          )}
          {section.body.length > 0 && (
            <Text selectable variant="caption" tone={section.heading ? 'default' : 'accent'}>
              {section.body}
            </Text>
          )}
          {section.link && (
            <Pressable
              onPress={() => section.link?.url && openLink(section.link.url)}
              style={styles.link}
              accessibilityRole="link"
              accessibilityLabel={section.link.label}
            >
              <Text variant="captionEmphasis" tone="accent" style={styles.linkText}>
                {section.link.label}
              </Text>
            </Pressable>
          )}
          {section.links?.map((l) => (
            <Pressable
              key={l.url}
              onPress={() => openLink(l.url)}
              style={styles.link}
              accessibilityRole="link"
              accessibilityLabel={l.label}
            >
              <Text variant="captionEmphasis" tone="accent" style={styles.linkText}>
                {l.label}
              </Text>
            </Pressable>
          ))}
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
  linkText: {
    textDecorationLine: 'underline',
  },
});
