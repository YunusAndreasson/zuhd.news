import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { memo, useCallback, useMemo } from 'react';
import { ActivityIndicator, Dimensions, StyleSheet, Text, View } from 'react-native';
import { COLORS, FONT, SPACING, TEXT_STYLES, TYPOGRAPHY } from '../constants/theme';
import { type BriefNode, parseContext } from '../lib/parse-context';
import type { ContextBrief } from '../types';
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

function renderNode(node: BriefNode, i: number, arr: BriefNode[]) {
  const isFirst = i === 0 || arr[i - 1]?.type === 'heading';

  switch (node.type) {
    case 'heading':
      return (
        <Text key={i} style={[styles.heading, i === 0 && styles.headingFirst]}>
          {node.text}
        </Text>
      );
    case 'entry':
      return (
        <View key={i} style={[styles.entry, isFirst && styles.entryFirst]}>
          <Text style={styles.entryYear}>{node.year}</Text>
          <Text style={styles.bodyText}>{node.text}</Text>
        </View>
      );
    case 'verse':
      return (
        <Text key={i} style={styles.verse}>
          {node.text}
        </Text>
      );
    default:
      return (
        <Text key={i} style={[styles.bodyText, styles.bodySpacing]}>
          {node.text}
        </Text>
      );
  }
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
  const nodes = useMemo(() => (brief ? parseContext(brief.brief) : []), [brief]);
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

        {nodes.map(renderNode)}
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
  heading: {
    ...TEXT_STYLES.smallCaps,
    color: COLORS.textEmphasis,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  headingFirst: {
    marginTop: 0,
  },
  entry: {
    marginBottom: SPACING.md,
  },
  entryFirst: {
    marginTop: 0,
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
