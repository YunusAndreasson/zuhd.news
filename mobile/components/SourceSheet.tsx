import { Ionicons } from '@expo/vector-icons';
import { type BottomSheetBackdropProps, BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { memo, useCallback, useState } from 'react';
import { Dimensions, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import { SOURCES } from '../constants/sources';
import { COLORS, EDITORIAL, FONT, LAYOUT, SHEET_STYLES, SPACING, TEXT_STYLES, TYPOGRAPHY } from '../constants/theme';
import type { ArticleSource } from '../types';
import { SheetHandle } from './SheetHandle';

function SheetContainer({ children }: { children?: React.ReactNode }) {
  return <FullWindowOverlay>{children}</FullWindowOverlay>;
}

const MAX_SHEET_HEIGHT = Dimensions.get('window').height * LAYOUT.sheetMaxFraction;

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
      backgroundStyle={SHEET_STYLES.bg}
      handleComponent={SourceHandle}
      containerComponent={SheetContainer}
      onDismiss={handleDismiss}
    >
      <BottomSheetScrollView
        contentContainerStyle={[SHEET_STYLES.content, { paddingBottom: bottomInset + SPACING.lg }]}
      >
        {sources.length > 0 ? (
          <>
            <Text style={styles.coverageHeading}>
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
                  key={i}
                  style={styles.sourceRow}
                  onPress={() => setExpandedSource(isExpanded ? null : i)}
                  accessibilityRole="button"
                  accessibilityLabel={s.name}
                  accessibilityState={{ expanded: isExpanded }}
                >
                  <View style={styles.sourceRowHeader}>
                    <Text style={styles.sourceName} numberOfLines={1}>
                      {flag ? `${flag} ` : ''}
                      {s.name}
                    </Text>
                    <View style={styles.sourceRowRight}>
                      {toneWord && (
                        <View
                          style={[
                            styles.tonePill,
                            tone === 'favorable' && styles.pillFavorable,
                            tone === 'unfavorable' && styles.pillUnfavorable,
                            tone === 'neutral' && styles.pillNeutral,
                          ]}
                        >
                          <Text style={styles.tonePillText}>{toneWord}</Text>
                        </View>
                      )}
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={LAYOUT.iconSm}
                        color={COLORS.accent}
                      />
                    </View>
                  </View>
                  {isExpanded && info && (
                    <>
                      <Text selectable style={styles.sourceType}>
                        {info.type} · {info.location}
                      </Text>
                      <Text selectable style={styles.sheetBody}>{info.description}</Text>
                    </>
                  )}
                </Pressable>
              );
            })}
            <Text
              style={styles.correctionLink}
              onPress={() => Linking.openURL('mailto:yunus@edenmind.com?subject=Correction')}
              accessibilityRole="link"
              accessibilityLabel="Submit a correction"
            >
              Submit a correction
            </Text>
          </>
        ) : null}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  coverageHeading: {
    fontFamily: FONT.regular,
    fontSize: TYPOGRAPHY.sizeSm,
    fontStyle: 'italic',
    color: COLORS.accent,
    marginBottom: SPACING.md,
  },
  correctionLink: {
    ...TEXT_STYLES.smallCapsXs,
    color: COLORS.textSecondary,
    marginTop: SPACING.lg,
    textDecorationLine: 'underline',
  },
  sheetBody: {
    ...TEXT_STYLES.body,
    color: COLORS.accent,
  },
  sourceRow: {
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.rule,
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
    fontFamily: FONT.semiBold,
    fontSize: TYPOGRAPHY.sizeBase,
    color: COLORS.text,
    flex: 1,
  },
  tonePill: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: LAYOUT.pillPaddingV,
    borderRadius: LAYOUT.pillRadius,
  },
  tonePillText: {
    fontFamily: FONT.semiBold,
    fontSize: TYPOGRAPHY.sizeXs,
    color: COLORS.bg,
    letterSpacing: TYPOGRAPHY.trackingCaps,
  },
  pillFavorable: {
    backgroundColor: COLORS.toneFavorable,
  },
  pillUnfavorable: {
    backgroundColor: COLORS.toneUnfavorable,
  },
  pillNeutral: {
    backgroundColor: COLORS.toneNeutral,
  },
  sourceType: {
    ...TEXT_STYLES.smallCapsXs,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
});
