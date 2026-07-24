import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { SPACING } from '../constants/theme';
import { useOpenLink } from '../lib/open-link';
import { staggerEnter } from '../lib/stagger';
import { Text } from './primitives';
import { SheetLink } from './SheetContent';

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
          entering={staggerEnter(i)}
          style={i > 0 ? styles.section : undefined}
        >
          {section.heading && (
            <Text variant="labelSm" style={styles.heading}>
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
          {section.link && (
            <SheetLink
              label={section.link.label}
              onPress={() => section.link?.url && openLink(section.link.url)}
            />
          )}
          {section.links?.map((l) => (
            <SheetLink key={l.url} label={l.label} onPress={() => openLink(l.url)} />
          ))}
        </Animated.View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  // `lg`, not `md`: the sheet rhythm has two tiers — `md` (16) separates
  // paragraphs inside one thought, `lg` (24) separates labeled sections. Every
  // section here carries its own heading, so it belongs to the section tier,
  // the same one SheetAboutPage, ChokepointSheet and EntitySheet use. At `md`
  // the privacy page sat a tier tighter than every other sheet in the app.
  section: {
    marginTop: SPACING.lg,
  },
  heading: {
    marginBottom: SPACING.xs,
  },
});
