import type { ConflictEvent } from '@shared/types';
import { memo, useCallback, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import {
  displayConflictSource,
  FAMILY_EYEBROW,
  parseConflictHero,
  SUB_EVENT_LABEL,
} from '../lib/conflict';
import { relativeTime } from '../lib/date-format';
import { openExternal } from '../lib/open-link';
import { displayCountryName } from '../lib/place-names';
import { severityTint } from '../lib/severity';
import { makeStaggerEnter } from '../lib/stagger';
import { Text } from './primitives';
import {
  countryFlags,
  SheetFlagRow,
  SheetHero,
  SheetScrollView,
  SheetSourceFooter,
} from './SheetContent';
import { type BaseSheetProps, SheetLayout } from './SheetLayout';

interface ConflictBodyProps {
  event: ConflictEvent | null;
  /** Tap on the country chip — opens the CountrySheet for that country. */
  onCountryPress?: (countryName: string) => void;
}

/** The handle's title: what kind of event it was. */
export function conflictTitle(event: ConflictEvent | null): string {
  return event ? SUB_EVENT_LABEL[event.subEvent] : '';
}

type ConflictSheetProps = BaseSheetProps & ConflictBodyProps;

export const ConflictSheet = memo(function ConflictSheet({
  sheetRef,
  bottomInset,
  onDismiss,
  ...body
}: ConflictSheetProps) {
  return (
    <SheetLayout sheetRef={sheetRef} onDismiss={onDismiss} handleTitle={conflictTitle(body.event)}>
      <SheetScrollView bottomInset={bottomInset}>
        <ConflictBody {...body} />
      </SheetScrollView>
    </SheetLayout>
  );
});

/** The sheet's content without the sheet: the menu shows it as a page of its
 *  own, so a reader who came from a list can go back to it. */
export const ConflictBody = memo(function ConflictBody({
  event,
  onCountryPress,
}: ConflictBodyProps) {
  const { colors } = useTheme();
  // On `event`, not `event?.sourceUrl`: the compiler keeps a memo only on
  // what it reads, and on the narrower key this whole body skipped it.
  const handleSourcePress = useCallback(() => {
    if (event?.sourceUrl) openExternal(event.sourceUrl);
  }, [event]);

  // Focal tint: fatalities > 0 reads in the unfavorable tone (the "people
  // killed" framing earns the same visual weight as a Red GDACS alert);
  // a 0-fatality unrest event keeps the display variant's own colour, as a
  // lower-tier disaster does, so a peaceful protest doesn't read as a
  // casualty event. It used to fall back to `textEmphasis`, so the two event
  // sheets' quiet tiers were two different inks.
  const tint = severityTint(colors, { fatalities: event?.fatalities }, undefined);
  const hero = useMemo(() => (event ? parseConflictHero(event) : null), [event]);
  const flags = useMemo(() => countryFlags([event?.country]), [event]);

  // Actor line shape:
  //   • Two-sided (battles, non-state) → "Group A vs Group B"
  //   • One-sided (UCDP type 3, ACLED VAC) → "Group A" alone — the "vs Civilians"
  //     framing reads as a mutual fight, which is exactly wrong for an attack
  //     on civilians. The sub-event label (e.g. "Attack on civilians") in the
  //     hero secondary already conveys the relationship without the false
  //     symmetry. UCDP encodes one-sided victims as the literal string
  //     "Civilians" in side_b, so we suppress that token verbatim.
  const actorLine = event
    ? event.actor2 && event.actor2.toLowerCase() !== 'civilians'
      ? `${event.actor1} vs ${event.actor2}`
      : event.actor1
    : '';
  const locationLine = event
    ? [event.location, event.admin1, displayCountryName(event.country) ?? event.country]
        .filter((s): s is string => typeof s === 'string' && s.length > 0)
        .join(' · ')
    : '';

  const enter = makeStaggerEnter();

  return (
    <>
      {event && (
        <>
          {/* Hero — eyebrow (family) + focal (fatalities or sub-event) +
                supporting clause. Same cognitive shape as DisasterSheet's
                hero so the two sheets feel like one family. */}
          <SheetHero
            entering={enter()}
            eyebrow={FAMILY_EYEBROW[event.family]}
            focal={hero?.focal ?? ''}
            tint={tint}
            secondary={hero?.secondary}
          />

          {/* Actors — who's involved. The "vs" form is ACLED's
                convention; one-actor events (peaceful_protest by
                civilians, abductions where actor2 is unspecified)
                render with the single name only. */}
          {actorLine.length > 0 && (
            <Animated.View entering={enter()} style={styles.actorRow}>
              <Text variant="bodyEmphasis" tone="emphasis" selectable>
                {actorLine}
              </Text>
            </Animated.View>
          )}

          {/* Notes — the one-sentence summary from the data layer. */}
          {event.notes.length > 0 && (
            <Animated.View entering={enter()} style={styles.notesRow}>
              <Text variant="body" selectable>
                {event.notes}
              </Text>
            </Animated.View>
          )}

          {/* Meta — when + where, joined as one quiet caption. */}
          <Animated.View entering={enter()} style={styles.metaRow}>
            <Text variant="labelXs" tone="secondary">
              {[relativeTime(event.eventDate), locationLine]
                .filter((s) => s.length > 0)
                .join(' · ')}
            </Text>
          </Animated.View>

          {flags.length > 0 && (
            <SheetFlagRow entering={enter()} flags={flags} onPress={onCountryPress} />
          )}

          {/* Footer — source name + tappable URL when published.
                For prototype data this reads "Prototype data — not live
                ACLED" so nobody mistakes the fixture for journalism. */}
          <SheetSourceFooter
            entering={enter()}
            source={displayConflictSource(event.source)}
            linkLabel="source →"
            linkAccessibilityLabel="Open the source"
            onLinkPress={event.sourceUrl ? handleSourcePress : undefined}
          />
        </>
      )}
    </>
  );
});

const styles = StyleSheet.create({
  actorRow: {
    marginTop: SPACING.md,
  },
  notesRow: {
    marginTop: SPACING.md,
  },
  metaRow: {
    marginTop: SPACING.sm,
  },
});
