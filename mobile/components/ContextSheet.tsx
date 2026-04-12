import { Ionicons } from '@expo/vector-icons';
import {
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SOURCES } from '../constants/sources';
import { EDITORIAL, LAYOUT, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import type { ArticleSource, ContextBrief, TimelineEntry } from '../types';
import { SheetHandle } from './SheetHandle';
import { SheetContainer, useMaxSheetHeight } from './SheetPrimitives';

function ccToFlag(cc: string): string {
  return cc
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65));
}

const MoreHandle = () => <SheetHandle title="more" />;

// ---------------------------------------------------------------------------
// Main sheet
// ---------------------------------------------------------------------------

interface ContextSheetProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  sources: ArticleSource[];
  eventCoverage: number | null;
  brief: ContextBrief | null;
  loading: boolean;
  threadLabel?: string;
  bottomInset: number;
  renderBackdrop: React.FC<BottomSheetBackdropProps>;
  onDismiss: () => void;
}

export const ContextSheet = memo(function ContextSheet({
  sheetRef,
  sources,
  eventCoverage,
  brief,
  loading,
  threadLabel,
  bottomInset,
  renderBackdrop,
  onDismiss,
}: ContextSheetProps) {
  const { colors, font, typography, textStyles, sheetStyles } = useTheme();
  const MAX_SHEET_HEIGHT = useMaxSheetHeight();
  const timeline = brief?.timeline ?? [];
  const hasSources = sources.length > 0;
  const hasThread = !!threadLabel;
  const hasContent = brief != null || hasSources;

  const [expandedSource, setExpandedSource] = useState<number | null>(null);

  const wasLoading = useRef(false);
  useEffect(() => {
    if (wasLoading.current && !loading && brief) {
      const count = brief.timeline.length;
      AccessibilityInfo.announceForAccessibility(
        `Context loaded, ${count} entr${count === 1 ? 'y' : 'ies'}`,
      );
    }
    wasLoading.current = loading;
  }, [loading, brief]);

  const handleDismiss = useCallback(() => {
    setExpandedSource(null);
    onDismiss();
  }, [onDismiss]);

  const loadingSnap = useMemo(() => ['40%'], []);

  const renderTimelineEntry = (entry: TimelineEntry, i: number, arr: TimelineEntry[]) => {
    if (!entry.year) {
      return (
        <View key={i}>
          {entry.heading && (
            <Text style={[styles.eduHeading, textStyles.smallCaps]}>
              {entry.heading}
            </Text>
          )}
          <Text selectable style={[styles.bodyText, textStyles.body, styles.bodySpacing]}>
            {entry.body}
          </Text>
        </View>
      );
    }
    const nextHasYear = arr[i + 1]?.year != null;
    return (
      <View
        key={i}
        style={[styles.entry, nextHasYear && [styles.entryLine, { borderLeftColor: colors.rule }]]}
      >
        <View
          style={[styles.dot, { top: typography.sizeXs * 0.55, backgroundColor: colors.accent }]}
        />
        <View style={styles.entryContent}>
          <Text
            selectable
            style={[
              styles.entryYear,
              {
                ...font.semiBold,
                fontSize: typography.sizeXs,
                color: colors.accent,
                letterSpacing: typography.trackingCaps,
              },
            ]}
          >
            {entry.year}
          </Text>
          <Text selectable style={[styles.bodyText, textStyles.body]}>
            {entry.body}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <BottomSheetModal
      ref={sheetRef}
      {...(hasContent
        ? { enableDynamicSizing: true, maxDynamicContentSize: MAX_SHEET_HEIGHT }
        : { snapPoints: loadingSnap, enableDynamicSizing: false })}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={sheetStyles.bg}
      handleComponent={MoreHandle}
      containerComponent={SheetContainer}
      onDismiss={handleDismiss}
    >
      <BottomSheetScrollView
        contentContainerStyle={[sheetStyles.content, { paddingBottom: bottomInset + SPACING.lg }]}
      >
        {/* ── Sources ── */}
        {hasSources && (
          <>
            <Text style={[styles.sectionLabel, textStyles.smallCapsXs]}>
              {sources.length === 1 ? 'source' : 'sources'}
            </Text>
            {eventCoverage != null && eventCoverage > sources.length && (
              <Text style={[styles.sectionSubtitle, textStyles.sectionHeading]}>
                {eventCoverage}+ sources covering this story
              </Text>
            )}
            {sources.map((s, i) => {
              const info = SOURCES[s.name];
              const cc = s.country?.toUpperCase();
              const flag = cc ? ccToFlag(cc) : null;
              const tone =
                s.sentiment != null
                  ? s.sentiment > EDITORIAL.sentimentPositive
                    ? 'favorable'
                    : s.sentiment < EDITORIAL.sentimentNegative
                      ? 'unfavorable'
                      : 'neutral'
                  : null;
              const toneWord =
                tone === 'favorable'
                  ? 'favorably'
                  : tone === 'unfavorable'
                    ? 'critically'
                    : tone === 'neutral'
                      ? 'neutral'
                      : 'unknown';
              const isExpanded = expandedSource === i;
              return (
                <Pressable
                  key={s.name}
                  style={[styles.sourceRow, { borderBottomColor: colors.rule }]}
                  onPress={() => setExpandedSource(isExpanded ? null : i)}
                  accessibilityRole="button"
                  accessibilityLabel={s.name}
                  accessibilityState={{ expanded: isExpanded }}
                >
                  <View style={styles.sourceRowHeader}>
                    <Text
                      style={[
                        styles.sourceName,
                        { ...font.semiBold, fontSize: typography.sizeBase, color: colors.text },
                      ]}
                      numberOfLines={1}
                    >
                      {flag ? `${flag} ` : ''}
                      {s.name}
                    </Text>
                    <View style={styles.sourceRowRight}>
                      <View
                        style={[
                          styles.tonePill,
                          {
                            backgroundColor:
                              tone === 'favorable' ? colors.toneFavorable
                              : tone === 'unfavorable' ? colors.toneUnfavorable
                              : tone === 'neutral' ? colors.toneNeutral
                              : colors.textSecondary,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.tonePillText,
                            {
                              ...font.semiBold,
                              fontSize: typography.sizeXs,
                              color: colors.bg,
                              letterSpacing: typography.trackingCaps,
                            },
                          ]}
                        >
                          {toneWord}
                        </Text>
                      </View>
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={LAYOUT.iconSm}
                        color={colors.accent}
                      />
                    </View>
                  </View>
                  {isExpanded && info && (
                    <>
                      <Text selectable style={[styles.sourceType, textStyles.smallCapsXs]}>
                        {info.type} · {info.location}
                      </Text>
                      <Text
                        selectable
                        style={[styles.bodyText, textStyles.body, { color: colors.accent }]}
                      >
                        {info.description}
                      </Text>
                    </>
                  )}
                </Pressable>
              );
            })}
          </>
        )}

        {/* ── Context ── */}
        {hasThread && (
          <>
            {hasSources && (
              <View style={[styles.sectionDivider, { backgroundColor: colors.rule }]} />
            )}
            <Text style={[styles.sectionLabel, textStyles.smallCapsXs]}>context</Text>
            <Text style={[styles.contextHeading, textStyles.sectionHeading]} numberOfLines={2}>
              {threadLabel}
            </Text>
            {loading && !brief && <ActivityIndicator color={colors.accent} style={styles.loader} />}
            {timeline.map(renderTimelineEntry)}
          </>
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  /* ── Sources ── */
  sectionLabel: {
    marginBottom: SPACING.sm,
  },
  sectionSubtitle: {
    marginBottom: SPACING.sm,
  },
  sourceRow: {
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sourceRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  sourceRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  sourceName: {
    flex: 1,
  },
  tonePill: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: LAYOUT.pillPaddingV,
    borderRadius: LAYOUT.pillRadius,
  },
  tonePillText: {},
  sourceType: {
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  /* ── Context ── */
  contextHeading: {
    marginBottom: SPACING.md,
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: SPACING.lg,
  },
  loader: {
    marginTop: SPACING.lg,
  },
  /* ── Timeline ── */
  entry: {
    flexDirection: 'row',
    paddingLeft: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  entryLine: {
    borderLeftWidth: LAYOUT.timelineLineWidth,
  },
  dot: {
    position: 'absolute',
    left: -(LAYOUT.timelineDot / 2) - LAYOUT.timelineLineWidth / 2,
    width: LAYOUT.timelineDot,
    height: LAYOUT.timelineDot,
    borderRadius: LAYOUT.timelineDot / 2,
  },
  entryContent: {
    flex: 1,
    paddingLeft: SPACING.sm,
  },
  entryYear: {
    marginBottom: SPACING.xxs,
  },
  bodyText: {},
  bodySpacing: {
    marginBottom: SPACING.sm,
  },
  eduHeading: {
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
});
