import { Ionicons } from '@expo/vector-icons';
import {
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { memo, useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import { SOURCES } from '../constants/sources';
import { EDITORIAL, LAYOUT, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import type { ArticleSource } from '../types';
import { SheetHandle } from './SheetHandle';

function SheetContainer({ children }: { children?: React.ReactNode }) {
  return <FullWindowOverlay>{children}</FullWindowOverlay>;
}

function useMaxSheetHeight() {
  return useWindowDimensions().height * LAYOUT.sheetMaxFraction;
}

function ccToFlag(cc: string): string {
  return cc
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65));
}

interface SourceSheetProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  sources: ArticleSource[];
  divergence: number | null;
  bottomInset: number;
  renderBackdrop: React.FC<BottomSheetBackdropProps>;
  onDismiss: () => void;
}

export const SourceSheet = memo(function SourceSheet({
  sheetRef,
  sources,
  divergence,
  bottomInset,
  renderBackdrop,
  onDismiss,
}: SourceSheetProps) {
  const { colors, font, typography, textStyles, sheetStyles } = useTheme();
  const MAX_SHEET_HEIGHT = useMaxSheetHeight();
  const [expandedSource, setExpandedSource] = useState<number | null>(null);

  const SourceHandle = useCallback(
    () => <SheetHandle title={sources.length === 1 ? 'source' : 'sources'} />,
    [sources.length],
  );

  const handleDismiss = useCallback(() => {
    setExpandedSource(null);
    onDismiss();
  }, [onDismiss]);

  return (
    <BottomSheetModal
      ref={sheetRef}
      enableDynamicSizing
      maxDynamicContentSize={MAX_SHEET_HEIGHT}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={sheetStyles.bg}
      handleComponent={SourceHandle}
      containerComponent={SheetContainer}
      onDismiss={handleDismiss}
    >
      <BottomSheetScrollView
        contentContainerStyle={[sheetStyles.content, { paddingBottom: bottomInset + SPACING.lg }]}
      >
        {sources.length > 0 ? (
          <>
            <Text
              style={[
                styles.coverageHeading,
                { fontFamily: font.regular, fontSize: typography.sizeSm, color: colors.accent },
              ]}
            >
              {divergence != null &&
              divergence >= EDITORIAL.divergenceModerate &&
              sources.length > 1
                ? divergence >= EDITORIAL.divergenceHigh
                  ? 'These sources frame this story very differently.'
                  : 'These sources frame this story differently.'
                : 'How this story is covered'}
            </Text>
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
                      : null;
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
                        {
                          fontFamily: font.semiBold,
                          fontSize: typography.sizeBase,
                          color: colors.text,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {flag ? `${flag} ` : ''}
                      {s.name}
                    </Text>
                    <View style={styles.sourceRowRight}>
                      {toneWord && (
                        <View
                          style={[
                            styles.tonePill,
                            tone === 'favorable' && { backgroundColor: colors.toneFavorable },
                            tone === 'unfavorable' && { backgroundColor: colors.toneUnfavorable },
                            tone === 'neutral' && { backgroundColor: colors.toneNeutral },
                          ]}
                        >
                          <Text
                            style={[
                              styles.tonePillText,
                              {
                                fontFamily: font.semiBold,
                                fontSize: typography.sizeXs,
                                color: colors.bg,
                                letterSpacing: typography.trackingCaps,
                              },
                            ]}
                          >
                            {toneWord}
                          </Text>
                        </View>
                      )}
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
                        style={[styles.sheetBody, textStyles.body, { color: colors.accent }]}
                      >
                        {info.description}
                      </Text>
                    </>
                  )}
                </Pressable>
              );
            })}
          </>
        ) : null}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  coverageHeading: {
    fontStyle: 'italic',
    marginBottom: SPACING.md,
  },
  sheetBody: {},
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
});
