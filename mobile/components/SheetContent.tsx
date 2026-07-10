import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import type { ComponentProps } from 'react';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { HIT_SLOP, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { FlagChip } from './FlagChip';
import { Pressable, Text } from './primitives';

type EnteringAnimation = ComponentProps<typeof Animated.View>['entering'];

// ---------------------------------------------------------------------------
// SheetScrollView — every editorial sheet scrolls its content inside a
// BottomSheetScrollView padded with `sheetStyles.content` and a
// `bottomInset + SPACING.lg` safe-area tail. That recipe was copy-pasted into
// ten sheets; owning it here keeps the content rhythm in one place. Extra props
// (e.g. `indicatorStyle`) and additional `contentContainerStyle` pass through.
// ---------------------------------------------------------------------------

type ScrollViewProps = ComponentProps<typeof BottomSheetScrollView>;

interface SheetScrollViewProps extends Omit<ScrollViewProps, 'contentContainerStyle'> {
  bottomInset: number;
  contentContainerStyle?: ScrollViewProps['contentContainerStyle'];
}

export function SheetScrollView({
  bottomInset,
  contentContainerStyle,
  children,
  ...rest
}: SheetScrollViewProps) {
  const { sheetStyles } = useTheme();
  return (
    <BottomSheetScrollView
      contentContainerStyle={[
        sheetStyles.content,
        { paddingBottom: bottomInset + SPACING.lg },
        contentContainerStyle,
      ]}
      {...rest}
    >
      {children}
    </BottomSheetScrollView>
  );
}

// ---------------------------------------------------------------------------
// Hero / flags / source-footer — ConflictSheet and DisasterSheet are
// documented as "the same cognitive shape". These three pieces were their
// verbatim overlap: an eyebrow + tinted focal + supporting clause, an
// affected-country flag row, and a source-name + optional-link footer. Owning
// them here (with the shared style objects) means the two sheets — and any
// future event sheet — stay one family by construction.
// ---------------------------------------------------------------------------

interface SheetHeroProps {
  entering?: EnteringAnimation;
  eyebrow: string;
  focal: string;
  /** Focal color override; omit to keep the `display` variant's own color
   *  (used for lower-severity events that read monochrome). */
  tint?: string;
  secondary?: string;
}

/** Eyebrow + large focal value + supporting clause. The focal is the reader's
 *  pre-attentive "how bad?" cue, tinted only for the most urgent tier. */
export function SheetHero({ entering, eyebrow, focal, tint, secondary }: SheetHeroProps) {
  return (
    <Animated.View entering={entering}>
      <Text variant="labelXs" tone="secondary" style={styles.eyebrow}>
        {eyebrow}
      </Text>
      <Text
        variant="display"
        style={tint ? { color: tint } : undefined}
        numberOfLines={2}
        selectable
      >
        {focal}
      </Text>
      {secondary && secondary.length > 0 ? (
        <Text variant="caption" tone="secondary" style={styles.heroSecondary}>
          {secondary}
        </Text>
      ) : null}
    </Animated.View>
  );
}

interface SheetFlagRowProps {
  entering?: EnteringAnimation;
  flags: { name: string; flag: string }[];
  borderColor: string;
  onPress?: (countryName: string) => void;
}

/** Wrapping row of affected-country flag chips. Renders nothing when empty —
 *  callers gate the `entering` call on non-empty so stagger order is stable. */
export function SheetFlagRow({ entering, flags, borderColor, onPress }: SheetFlagRowProps) {
  if (flags.length === 0) return null;
  return (
    <Animated.View entering={entering} style={styles.flagsRow}>
      {flags.map((f) => (
        <FlagChip
          key={f.name}
          name={f.name}
          flag={f.flag}
          borderColor={borderColor}
          onPress={onPress}
        />
      ))}
    </Animated.View>
  );
}

interface SheetSourceFooterProps {
  entering?: EnteringAnimation;
  /** Spelled-out source name (no acronyms) — the trust signal. */
  source: string;
  /** Link affordance label, e.g. "Source →" / "GDACS report →". */
  linkLabel: string;
  linkAccessibilityLabel: string;
  /** Omit to render the source name alone (unpublished / prototype data). */
  onLinkPress?: () => void;
}

/** Baseline-aligned footer: source name on the left, optional tappable report
 *  link on the right, reading as one balanced last row. */
export function SheetSourceFooter({
  entering,
  source,
  linkLabel,
  linkAccessibilityLabel,
  onLinkPress,
}: SheetSourceFooterProps) {
  return (
    <Animated.View entering={entering} style={styles.sourceLine}>
      <Text variant="caption" tone="secondary">
        {source}
      </Text>
      {onLinkPress ? (
        <Pressable
          haptic="tick"
          onPress={onLinkPress}
          accessibilityRole="link"
          accessibilityLabel={linkAccessibilityLabel}
          hitSlop={HIT_SLOP}
        >
          <Text variant="caption" tone="accent">
            {linkLabel}
          </Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    marginBottom: SPACING.xs,
  },
  heroSecondary: {
    marginTop: SPACING.xxs,
  },
  flagsRow: {
    marginTop: SPACING.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  sourceLine: {
    marginTop: SPACING.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
});
