import { memo, type ReactNode } from 'react';
import {
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
  type AccessibilityRole,
  type AccessibilityState,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { LAYOUT, SPACING, type TextTone } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { Pressable, Text } from './primitives';

/**
 * The one row every list in a sheet is built from: an optional mark, a
 * `rowTitle` over its `caption` lines, and what stands at the trailing edge.
 * `MenuRow`, `InstrumentRow`, `MarkRow`, a ranking's row and the map key's
 * are this row with their own content.
 *
 * The mark sits on the title's first line, whatever the row's height: the
 * title and the mark are one block, centred against the trailing figures
 * together.
 */

/** The slot a row's mark is centred in — a flag or a globe glyph — so the
 *  names in every list start on one vertical. */
export const ROW_LEADING = 28;

interface ListRowProps {
  title: string;
  titleLines?: number;
  titleTone?: TextTone;
  /** Before the name: a flag, a glyph, a rank. `null` holds the slot for a
   *  row that has none, in a list whose other rows do. */
  leading?: ReactNode;
  leadingWidth?: number;
  /** The lines under the title. */
  children?: ReactNode;
  /** At the trailing edge: a reading, a count, what a press does. */
  trailing?: ReactNode;
  /** The first row of a group draws no rule above it. */
  first?: boolean;
  /** The row the page is about: `pillBg`, edge to edge. */
  current?: boolean;
  /** A fixed height, for a list that scrolls to a row by arithmetic. */
  height?: number;
  /** Omit for a read-only row: one accessible fact, not a button. */
  onPress?: () => void;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
  accessibilityLabel: string;
  accessibilityHint?: string;
  /** What else the row does, by a gesture its owner draws: a screen reader's
   *  only way to it. */
  accessibilityActions?: readonly AccessibilityActionInfo[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
}

export const ListRow = memo(function ListRow({
  title,
  titleLines,
  titleTone,
  leading,
  leadingWidth = ROW_LEADING,
  children,
  trailing,
  first,
  current,
  height,
  onPress,
  accessibilityRole = 'button',
  accessibilityState,
  accessibilityLabel,
  accessibilityHint,
  accessibilityActions,
  onAccessibilityAction,
}: ListRowProps) {
  const { colors } = useTheme();
  const style: StyleProp<ViewStyle> = [
    styles.row,
    !first && { ...styles.ruled, borderTopColor: colors.rule },
    height !== undefined && { ...styles.fixed, height },
    current && { ...styles.current, backgroundColor: colors.pillBg },
  ];
  const content = (
    <>
      <View style={styles.subject}>
        {leading !== undefined ? (
          <View style={[styles.leading, { width: leadingWidth }]}>
            {/* A strut: the title's line at any text size, so the mark
                centres on the name and not on the row. */}
            <Text variant="rowTitle" accessibilityElementsHidden importantForAccessibility="no">
              {'​'}
            </Text>
            <View style={styles.mark}>{leading}</View>
          </View>
        ) : null}
        <View style={styles.text}>
          <Text variant="rowTitle" tone={titleTone} numberOfLines={titleLines}>
            {title}
          </Text>
          {children}
        </View>
      </View>
      {trailing}
    </>
  );

  if (!onPress) {
    return (
      <View
        style={style}
        accessible
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
      >
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      style={style}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
    >
      {content}
    </Pressable>
  );
});

/** The figure a row is for, digit under digit down the list. */
export function RowReading({ children }: { children: string }) {
  return (
    <Text variant="bodyEmphasis" style={styles.reading}>
      {children}
    </Text>
  );
}

/**
 * The line over a list: what its rows share (a unit, a window, a source),
 * said once, and the list's own figure at the trailing edge. Anything under
 * it — a filter, a source link — is its children.
 */
export function ListIntro({
  note,
  figure,
  children,
  style,
}: {
  note?: string;
  figure?: ReactNode;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  if (!note && !figure && !children) return null;
  return (
    <View style={[styles.intro, style]}>
      {note || figure ? (
        <View style={styles.introLine}>
          <Text variant="caption" style={styles.introNote}>
            {note}
          </Text>
          {figure}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** A list's rows and its intro share the sheet's gutter. */
export const listStyles = StyleSheet.create({
  content: { paddingHorizontal: SPACING.screenPadding },
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    minHeight: LAYOUT.rowMinHeight,
    paddingVertical: SPACING.smPlus,
  },
  ruled: { borderTopWidth: StyleSheet.hairlineWidth },
  fixed: { minHeight: 0, paddingVertical: 0 },
  // Out to the sheet's edges, through the list's gutter.
  current: {
    marginHorizontal: -SPACING.screenPadding,
    paddingHorizontal: SPACING.screenPadding,
  },
  subject: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
  },
  leading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  // No height of its own: a glyph taller than the title's line overflows it
  // evenly, and the line stays the title's.
  mark: { height: 0, justifyContent: 'center', alignItems: 'center' },
  text: { flex: 1, minWidth: 0, gap: SPACING.xxs },
  reading: { fontVariant: ['tabular-nums'] },
  intro: { gap: SPACING.xs, paddingBottom: SPACING.md },
  // The note wraps beside the figure; the figure is never pushed under it.
  introLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  introNote: { flexShrink: 1 },
});
