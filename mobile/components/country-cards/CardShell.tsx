import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SPACING } from '../../constants/theme';
import { Text } from '../primitives';

interface CardShellProps {
  /** Small-caps eyebrow at the top — "CLIMATE CHANGE", "TRADE ORIENTATION", etc. */
  eyebrow: string;
  /** Big headline number — "+0.9°C", "67%", "$1,478". */
  headline: string;
  /** One-line interpretation under the headline (caption tone). */
  subtitle: string;
  /** Footer note — source attribution, baseline period, etc. Rendered very small
   *  and right-aligned at the bottom so it functions as a citation, not a label. */
  source?: string;
  /** Chart slot. Optional — empty-state cards skip it. */
  children?: ReactNode;
}

export function CardShell({ eyebrow, headline, subtitle, source, children }: CardShellProps) {
  return (
    // Card padding mirrors the metric-row horizontal inset
    // (SPACING.screenPadding) so the eyebrow / headline / chart x-edges align
    // perfectly with the labels and values in the table beneath. The card
    // surface itself is borderless — proximity within does the grouping work,
    // and the carousel's bottom hairline bridges into the metric list below.
    <View style={styles.card}>
      <Text variant="labelXs" tone="secondary" numberOfLines={1}>
        {eyebrow}
      </Text>
      {/* Hero number at `title` (21pt semibold) — slightly larger than the
       *  17pt country name in the sheet handle so the card still has a
       *  focal point, but not so large it competes with the page title.
       *  Display (28pt) was a dashboard treatment; this reads as a single
       *  reading column. */}
      <Text variant="title" tone="emphasis" numberOfLines={1} style={styles.headline}>
        {headline}
      </Text>
      <Text variant="caption" numberOfLines={2} style={styles.subtitle}>
        {subtitle}
      </Text>
      {/* The chart breathes between the subtitle and the source line. */}
      <View>{children}</View>
      {/* Spacer absorbs any leftover vertical room so the source line
       *  stays glued to the bottom of the page — closes the gap between
       *  the chart attribution and the dot indicator below the carousel. */}
      <View style={styles.spacer} />
      {source ? (
        <Text variant="labelXs" tone="secondary" numberOfLines={1} style={styles.source}>
          {source}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    // Flex column fills the page height so the spacer between chartSlot
    // and source can absorb any leftover room and pin the source line to
    // the bottom of the card.
    flex: 1,
    width: '100%',
    paddingTop: SPACING.md,
    paddingBottom: SPACING.smPlus,
    // No horizontal padding — the card's parent (the carousel page) is
    // already sized to the bottom-sheet's content area, so the card edges
    // are already inset by `sheetStyles.content`'s 18px gutter. Adding
    // more padding here would push card content INWARD of the metric-row
    // content edges below, breaking the visual column.
    overflow: 'visible',
  },
  headline: {
    // Tight to the eyebrow above it (proximity = same idea-unit), generous
    // to the subtitle below to let the number read as the focal element.
    marginTop: SPACING.xxs,
    marginBottom: SPACING.xxs,
  },
  subtitle: {
    marginBottom: SPACING.md,
  },
  spacer: {
    // flex:1 spacer eats any remaining vertical space so source stays
    // pinned at the bottom of the card. Card height is fixed by the
    // carousel page; without this spacer, leftover room piles up below
    // the source line as a visible gap before the dot indicator.
    flex: 1,
    minHeight: 0,
  },
  source: {
    marginTop: SPACING.xs,
    textAlign: 'right',
  },
});
