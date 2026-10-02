import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { SPACING } from '../constants/theme';
import { staggerEnter } from '../lib/stagger';
import { Text } from './primitives';

/** A section of a prose page. It once took a link or a list of them; no page
 *  did, and a list of links is a list of `MenuRow`s with the `leave` mark. */
export interface InfoSection {
  heading?: string;
  body: string;
}

interface SheetInfoPageProps {
  sections: InfoSection[];
  /** Interactive tail for a prose page — e.g. the privacy page's erase
   *  control. Sections stay pure data (they live in a static registry), so
   *  anything needing a handler is passed in by the owner instead. */
  footer?: React.ReactNode;
}

/** Prose-heavy sheet page: an optional heading and a body per section. */
export function SheetInfoPage({ sections, footer }: SheetInfoPageProps) {
  return (
    <>
      {sections.map((section, i) => (
        <Animated.View
          key={i}
          entering={staggerEnter(i)}
          style={i > 0 ? styles.section : undefined}
        >
          {section.heading && (
            <Text variant="labelSm" accessibilityRole="header" style={styles.heading}>
              {section.heading}
            </Text>
          )}
          {section.body.length > 0 && (
            // Same two-tier prose ramp the About page uses, so a reader moving
            // between About and privacy sees one typographic voice: the opening
            // unheaded paragraph is the page's `lead` (21), every headed section
            // below it is `body` (17). Both were previously `caption` (13) —
            // the smallest tier in the system, which DESIGN.md reserves for
            // "secondary body, metadata sentences", not pages of policy prose.
            <Text selectable variant={section.heading ? 'body' : 'lead'}>
              {section.body}
            </Text>
          )}
        </Animated.View>
      ))}
      {footer && (
        <Animated.View entering={staggerEnter(sections.length)} style={styles.section}>
          {footer}
        </Animated.View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  // `lg`, not `md`: the sheet rhythm has two tiers — `md` (16) separates
  // paragraphs inside one thought, `lg` (24) separates labeled sections. Every
  // section here carries its own heading, so it belongs to the section tier,
  // the same one SheetAboutPage and EntitySheet use. At `md`
  // the privacy page sat a tier tighter than every other sheet in the app.
  section: {
    marginTop: SPACING.lg,
  },
  heading: {
    marginBottom: SPACING.xs,
  },
});
