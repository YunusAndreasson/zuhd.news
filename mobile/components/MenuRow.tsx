import { memo, type ReactNode } from 'react';
import { type AccessibilityRole, type AccessibilityState, StyleSheet, View } from 'react-native';
import { LAYOUT, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { Icon, Pressable, Text } from './primitives';

/**
 * The menu's one row grammar — the root, settings, the map key's entries and
 * About's data providers all speak it: a `rowTitle` in text ink, an optional
 * `caption` under it saying what the row is for, and at the trailing edge
 * what a press does.
 *
 * It replaced four row components in `MenuSheet` that set every title in
 * 17pt small caps. Small caps draw lowercase at x-height, so each title read
 * as ~12pt capitals in a column of identical capitals, and the descriptions
 * that would have told the rows apart were spoken to screen readers only. The
 * map key already set its entries this way; now every page of the menu does.
 */

/** What a press does, drawn at the row's trailing edge. */
export type RowTrailing =
  /** Opens a page or sheet inside the app: a chevron. */
  | 'push'
  /** Leaves the app — mail, the store, a browser: the open-outside glyph. */
  | 'leave'
  /** Does something in place (a toggle, an action): whatever is passed. */
  | ReactNode;

interface MenuRowProps {
  title: string;
  description?: string;
  /**
   * A live line in the caption's place — the menu root's data rows print
   * their group's first reading here, a subject and its move. `description`
   * stays the screen reader's hint; `detailLabel` is what the line says, and
   * joins the row's label, which is explicit and would otherwise skip it.
   */
  detail?: ReactNode;
  detailLabel?: string;
  /** A short figure before the trailing mark — a count, a size. */
  value?: string;
  trailing?: RowTrailing;
  /** Omit for a read-only row: it renders as one accessible fact, not a button. */
  onPress?: () => void;
  /** The first row of a group draws no rule above it. */
  first?: boolean;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
  /** Defaults to the title, then the value and the detail. */
  accessibilityLabel?: string;
}

export const MenuRow = memo(function MenuRow({
  title,
  description,
  detail,
  detailLabel,
  value,
  trailing,
  onPress,
  first,
  accessibilityRole = 'button',
  accessibilityState,
  accessibilityLabel,
}: MenuRowProps) {
  const { colors } = useTheme();
  const style = [styles.row, !first && { ...styles.ruled, borderTopColor: colors.rule }];
  const label = accessibilityLabel ?? [title, value, detailLabel].filter(Boolean).join(', ');
  const content = (
    <>
      <View style={styles.text}>
        <Text variant="rowTitle">{title}</Text>
        {detail ? (
          <View style={[styles.description, styles.detail]}>{detail}</View>
        ) : description ? (
          <Text variant="caption" style={styles.description}>
            {description}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="body" tone="secondary" style={styles.value}>
          {value}
        </Text>
      ) : null}
      {trailing === 'push' ? (
        <Icon name="chevron-forward" size="sm" tone="secondary" />
      ) : trailing === 'leave' ? (
        <Icon name="open-outline" size="sm" tone="secondary" />
      ) : (
        trailing
      )}
    </>
  );

  if (!onPress) {
    return (
      <View style={style} accessible accessibilityLabel={label} accessibilityHint={description}>
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
      accessibilityLabel={label}
      accessibilityHint={description}
    >
      {content}
    </Pressable>
  );
});

/** A setting whose control sits under its name — a segmented choice. */
export function MenuControlRow({
  title,
  description,
  first,
  children,
}: {
  title: string;
  description?: string;
  first?: boolean;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.block, !first && { ...styles.ruled, borderTopColor: colors.rule }]}>
      <Text variant="rowTitle" accessibilityElementsHidden importantForAccessibility="no">
        {title}
      </Text>
      {description ? (
        <Text variant="caption" style={styles.description}>
          {description}
        </Text>
      ) : null}
      <View style={styles.control}>{children}</View>
    </View>
  );
}

/**
 * Names a group of rows. `labelSm` — the section tier every sheet uses — and
 * the only small caps left in the menu's lists, so the one line that is a
 * heading is the one line that looks like one. It replaced a bare hairline
 * between the menu's two groups that drew exactly like the rules between its
 * rows, so the grouping it was there to show could not be seen.
 */
export function SectionLabel({ label, first }: { label: string; first?: boolean }) {
  return (
    <Text
      variant="labelSm"
      accessibilityRole="header"
      style={[styles.section, first && styles.sectionFirst]}
    >
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    minHeight: LAYOUT.rowMinHeight,
    paddingVertical: SPACING.smPlus,
  },
  ruled: { borderTopWidth: StyleSheet.hairlineWidth },
  text: { flex: 1, minWidth: 0 },
  description: { marginTop: SPACING.xxs },
  // A subject and a chip on one line, wrapping whole at large type.
  detail: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: SPACING.sm },
  value: { fontVariant: ['tabular-nums'] },
  block: { paddingVertical: SPACING.smPlus },
  control: { marginTop: SPACING.sm },
  section: { paddingTop: SPACING.lg, paddingBottom: SPACING.xs },
  sectionFirst: { paddingTop: 0 },
});
