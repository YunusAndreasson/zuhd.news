import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { memo, useCallback, useMemo } from 'react';
import { ActivityIndicator, Dimensions, StyleSheet, Text, View } from 'react-native';
import { COLORS, FONT, SPACING, TEXT_STYLES, TYPOGRAPHY } from '../constants/theme';
import type { ContextBrief, TimelineEntry } from '../types';
import { SheetHandle } from './SheetHandle';

const MAX_SHEET_HEIGHT = Dimensions.get('window').height * 0.7;

interface ContextSheetProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  brief: ContextBrief | null;
  loading: boolean;
  threadLabel?: string;
  bottomInset: number;
  renderBackdrop: any;
  onDismiss: () => void;
}

interface SectionGroup {
  heading: string;
  entries: TimelineEntry[];
}

function groupBySection(timeline: TimelineEntry[]): SectionGroup[] {
  const groups: SectionGroup[] = [];
  for (const entry of timeline) {
    const last = groups[groups.length - 1];
    if (last && last.heading === entry.section) {
      last.entries.push(entry);
    } else {
      groups.push({ heading: entry.section, entries: [entry] });
    }
  }
  return groups;
}

function renderEntry(entry: TimelineEntry, i: number, arr: TimelineEntry[]) {
  if (entry.verse) {
    return (
      <Text key={i} style={styles.verse}>
        {entry.body}
      </Text>
    );
  }
  if (!entry.year) {
    return (
      <Text key={i} style={[styles.bodyText, styles.bodySpacing]}>
        {entry.body}
      </Text>
    );
  }
  const nextHasYear = arr[i + 1]?.year != null;
  return (
    <View key={i} style={[styles.entry, nextHasYear && styles.entryLine]}>
      <View style={styles.dot} />
      <View style={styles.entryContent}>
        <Text style={styles.entryYear}>{entry.year}</Text>
        <Text style={styles.bodyText}>{entry.body}</Text>
      </View>
    </View>
  );
}

export const ContextSheet = memo(function ContextSheet({
  sheetRef,
  brief,
  loading,
  threadLabel,
  bottomInset,
  renderBackdrop,
  onDismiss,
}: ContextSheetProps) {
  const sections = useMemo(
    () => (brief?.timeline ? groupBySection(brief.timeline) : []),
    [brief],
  );
  const label = brief?.label ?? threadLabel;
  const ContextHandle = useCallback(() => <SheetHandle title="context" />, []);

  return (
    <BottomSheetModal
      ref={sheetRef}
      enableDynamicSizing
      maxDynamicContentSize={MAX_SHEET_HEIGHT}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheetBg}
      handleComponent={ContextHandle}
      onDismiss={onDismiss}
    >
      <BottomSheetScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomInset + SPACING.xl }]}
      >
        {label && <Text style={styles.title}>{label}</Text>}
        {brief && (
          <Text style={styles.meta}>
            {brief.articleCount} article{brief.articleCount === 1 ? '' : 's'} in this thread
          </Text>
        )}
        <View style={styles.divider} />

        {loading && !brief && <ActivityIndicator color={COLORS.accent} style={styles.loader} />}

        {sections.map((section, si) => (
          <View key={si} style={si === 0 ? undefined : styles.sectionSpacing}>
            <Text style={styles.heading}>
              {section.heading}
            </Text>
            {section.entries.map(renderEntry)}
          </View>
        ))}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: COLORS.sheetBg,
  },
  content: {
    padding: SPACING.screenPadding,
  },
  title: {
    fontFamily: FONT.bold,
    fontSize: TYPOGRAPHY.sizeBase,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  meta: {
    ...TEXT_STYLES.smallCapsXs,
    color: COLORS.textSecondary,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.rule,
    marginVertical: SPACING.md,
  },
  loader: {
    marginTop: SPACING.lg,
  },
  sectionSpacing: {
    marginTop: SPACING.lg,
  },
  heading: {
    ...TEXT_STYLES.smallCaps,
    color: COLORS.textEmphasis,
    marginBottom: SPACING.sm,
  },
  entry: {
    flexDirection: 'row',
    paddingLeft: SPACING.sm,
    marginBottom: SPACING.md,
  },
  entryLine: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: COLORS.rule,
  },
  dot: {
    position: 'absolute',
    left: -3,
    top: 6,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: COLORS.accent,
  },
  entryContent: {
    flex: 1,
    paddingLeft: SPACING.sm,
  },
  entryYear: {
    fontFamily: FONT.semiBold,
    fontSize: TYPOGRAPHY.sizeXs,
    color: COLORS.accent,
    letterSpacing: TYPOGRAPHY.trackingCaps,
    marginBottom: 2,
  },
  bodyText: {
    ...TEXT_STYLES.body,
  },
  bodySpacing: {
    marginBottom: SPACING.sm,
  },
  verse: {
    ...TEXT_STYLES.body,
    fontStyle: 'italic',
    color: COLORS.dome,
    marginBottom: SPACING.xs,
  },
});
