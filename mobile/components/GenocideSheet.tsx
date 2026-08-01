import { COUNTRY_DATA } from '@shared/countries/country-data';
import type { GenocideSituation } from '@shared/genocide';
import { memo, useCallback, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { SPACING } from '../constants/theme';
import { useSheetSnaps } from '../hooks/useSheetSnaps';
import { useTheme } from '../hooks/useTheme';
import { useOpenLink } from '../lib/open-link';
import { makeStaggerEnter } from '../lib/stagger';
import { Text } from './primitives';
import { SheetFlagRow, SheetScrollView, SheetSourceFooter } from './SheetContent';
import { type BaseSheetProps, SheetLayout } from './SheetLayout';

interface GenocideSheetProps extends BaseSheetProps {
  situation: GenocideSituation | null;
  /** Tap on the country chip — opens the CountrySheet for that country. */
  onCountryPress?: (countryName: string) => void;
}

/** "2023-10" → "October 2023"; "2016-10-15" → "October 2016". The `since`
 *  field is month precision by design — a genocide does not begin on a day
 *  anyone can cite, and printing one would be a precision the record does not
 *  claim. Falls back to the raw string rather than inventing a format. */
function formatSince(since: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(since);
  if (!m) return since;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) return since;
  const name = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    timeZone: 'UTC',
  });
  return `${name} ${year}`;
}

/** ISO date → "16 September 2025". The date of the finding is the single most
 *  load-bearing fact on this sheet after the body that made it, so it is
 *  spelled out rather than abbreviated. */
function formatFindingDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * What the one red mark on the globe means.
 *
 * ── The order of this sheet is the argument ────────────────────────────────
 *
 * It leads with **who made the finding**, not with a casualty figure. The
 * first question a reader has about a mark this grave is not "how many" — it
 * is "says who", and a number at the top would answer a question nobody asked
 * while leaving the real one to the small print. `shared/genocide.ts` records
 * the same decision on the data side: every entry carries its body, its
 * numbered document and its date, and a situation cannot reach the map
 * without all three.
 *
 * The bar itself is stated in plain words on the sheet rather than left
 * implicit, because a reader who has just seen the only red thing in the app
 * is owed the standard it was drawn to. `determination` means a UN body has
 * stated the conclusion. Warnings of "risk" — which UN bodies issue far more
 * often, and which the record also keeps — are deliberately not drawn, and
 * saying so here is what stops the mark from quietly meaning four things.
 *
 * There is no severity channel anywhere on this sheet: no tint ramp, no tier,
 * no comparison between situations. `lib/severity.ts` grades events; this is
 * not an event.
 */
export const GenocideSheet = memo(function GenocideSheet({
  sheetRef,
  situation,
  bottomInset,
  renderBackdrop,
  onDismiss,
  onCountryPress,
}: GenocideSheetProps) {
  const { colors } = useTheme();
  const snapProps = useSheetSnaps(false);
  const openLink = useOpenLink();

  const handleSourcePress = useCallback(() => {
    if (situation?.url) openLink(situation.url);
  }, [situation?.url, openLink]);

  // The flag chip links to the country PROFILE, which is not the same word as
  // the mark's own name: the Gaza mark links to Palestine, the Rakhine mark to
  // Myanmar. `profile` carries that name so the chip cannot label a country
  // page with the name of a place inside it.
  const flag = useMemo(() => {
    if (!situation?.profile) return null;
    const data = COUNTRY_DATA[situation.profile];
    return data?.flag ? { name: situation.profile, flag: data.flag } : null;
  }, [situation?.profile]);

  const enter = makeStaggerEnter();

  return (
    <SheetLayout
      sheetRef={sheetRef}
      {...snapProps}
      renderBackdrop={renderBackdrop}
      onDismiss={onDismiss}
      handleTitle={situation?.name}
    >
      <SheetScrollView bottomInset={bottomInset}>
        {situation && (
          <>
            {/* The finding, in the app's one red — the same hue as the ring
                the reader just tapped, so the mark and its meaning are
                visibly the same object. Deliberately NOT `SheetHero`: that
                component's focal is a large number, and there is no number
                that belongs at the top of this sheet. */}
            <Animated.View entering={enter()}>
              <Text variant="labelXs" tone="secondary" style={styles.eyebrow}>
                As determined by the United Nations
              </Text>
              <Text variant="title" style={{ color: colors.determination }} selectable>
                Genocide
              </Text>
              <Text variant="caption" tone="secondary" style={styles.since}>
                In {situation.name} · ongoing since {formatSince(situation.since)}
              </Text>
            </Animated.View>

            {/* Who said it, where, and when — the three fields that are the
                whole licence for the mark. Set as one block because they are
                one fact: a body without its document is a claim, a document
                without its date is undated, and either alone is not what this
                layer publishes. */}
            <Animated.View entering={enter()} style={styles.section}>
              <Text variant="labelSm">The finding</Text>
              <Text variant="bodyEmphasis" style={styles.body} selectable>
                {situation.body}
              </Text>
              <Text variant="caption" tone="secondary" style={styles.meta} selectable>
                {situation.document} · {formatFindingDate(situation.date)}
              </Text>
            </Animated.View>

            {/* The conclusion in the body's own terms, not ours. */}
            <Animated.View entering={enter()} style={styles.section}>
              <Text variant="body" selectable>
                {situation.summary}
              </Text>
            </Animated.View>

            {/* The bar. This is the educational core of the sheet: what the
                mark requires, and — just as important — what it excludes. A
                reader who understands that "risk" is a different statement
                from "determination" can read the absence of a mark correctly,
                which is most of what makes the presence of one mean anything. */}
            <Animated.View entering={enter()} style={styles.section}>
              <Text variant="labelSm">What this mark requires</Text>
              <Text variant="body" style={styles.body} selectable>
                A named UN body must have stated the conclusion that genocide is being or has been
                committed, in a document that can be read. Nothing else is drawn here.
              </Text>
              <Text variant="body" style={styles.body} selectable>
                UN bodies also warn of risk — of serious risk, of indicators — far more often than
                they make determinations. Those warnings are kept in the same record and are
                deliberately not marked, because they are a different statement. A finding by a
                state, a parliament, a court that is not a UN organ, or an advocacy organisation is
                also not drawn, which is not a judgement on its worth: this layer says "as
                determined by the UN", and a mark that quietly meant four different things would
                mean nothing.
              </Text>
            </Animated.View>

            {/* Why the mark never dims or disappears. The globe's other layers
                all fade with age, so a reader who has learned that vocabulary
                would otherwise reasonably read this one as merely very recent. */}
            <Animated.View entering={enter()} style={styles.section}>
              <Text variant="labelSm">Why it does not fade</Text>
              <Text variant="body" style={styles.body} selectable>
                Every other mark on the globe is an event, and dims as it recedes. This one is a
                condition. A determination does not become less true with time, so it is drawn at
                full strength, above everything else, until the record changes.
              </Text>
            </Animated.View>

            {flag && (
              <SheetFlagRow
                entering={enter()}
                flags={[flag]}
                borderColor={colors.rule}
                onPress={onCountryPress}
              />
            )}

            <SheetSourceFooter
              entering={enter()}
              source={situation.body}
              linkLabel="Read the finding →"
              linkAccessibilityLabel={`Read the finding from ${situation.body}`}
              onLinkPress={handleSourcePress}
            />
          </>
        )}
      </SheetScrollView>
    </SheetLayout>
  );
});

const styles = StyleSheet.create({
  eyebrow: {
    marginBottom: SPACING.xs,
  },
  since: {
    marginTop: SPACING.xxs,
  },
  body: {
    marginTop: SPACING.xs,
  },
  meta: {
    marginTop: SPACING.xxs,
  },
  // SPACING.lg between labelled sections, per DESIGN.md's two-tier sheet
  // rhythm — every block below the hero carries its own heading.
  section: {
    marginTop: SPACING.lg,
  },
});
