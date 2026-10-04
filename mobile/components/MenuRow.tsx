import { memo, type ReactNode } from 'react';
import { type AccessibilityRole, type AccessibilityState, StyleSheet, View } from 'react-native';
import { SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { ListRow } from './ListRow';
import { Icon, Text } from './primitives';

/**
 * The menu's row — the root, settings and About's data providers speak it:
 * `ListRow` with one `caption` line under the title, a quiet figure, and at
 * the trailing edge what a press does.
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
  /** What the row is for, under its title. */
  description?: string;
  /** Spoken, never printed: for a row whose name says enough to the eye.
   *  Defaults to the description. */
  hint?: string;
  /** A live line in the description's place: what leads the list the row
   *  opens. It joins the row's spoken label. */
  teaser?: string;
  teaserLines?: number;
  /** Spoken in the teaser's place, where the line needs its context. */
  teaserLabel?: string;
  /** A short figure before the trailing mark — a count, a size. */
  value?: string;
  /** In the value's place, a figure that is not plain text: a group's week
   *  as a coloured chip. Its words are `figureLabel`. */
  figure?: ReactNode;
  figureLabel?: string;
  trailing?: RowTrailing;
  /** Omit for a read-only row: it renders as one accessible fact, not a button. */
  onPress?: () => void;
  /** The first row of a group draws no rule above it. */
  first?: boolean;
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: AccessibilityState;
  /** Defaults to the title, then the value, the figure and the teaser. */
  accessibilityLabel?: string;
}

export const MenuRow = memo(function MenuRow({
  title,
  description,
  hint,
  teaser,
  teaserLines,
  teaserLabel,
  value,
  figure,
  figureLabel,
  trailing,
  onPress,
  first,
  accessibilityRole,
  accessibilityState,
  accessibilityLabel,
}: MenuRowProps) {
  const line = teaser || description;
  return (
    <ListRow
      title={title}
      first={first}
      onPress={onPress}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      accessibilityLabel={
        accessibilityLabel ??
        [title, value, figureLabel, teaserLabel ?? teaser].filter(Boolean).join(', ')
      }
      accessibilityHint={hint ?? description}
      trailing={
        <>
          {figure ??
            (value ? (
              <Text variant="body" tone="secondary" style={styles.value}>
                {value}
              </Text>
            ) : null)}
          {trailing === 'push' || trailing === 'leave' ? (
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Icon
                name={trailing === 'push' ? 'chevron-forward' : 'open-outline'}
                size="sm"
                tone="secondary"
              />
            </View>
          ) : (
            trailing
          )}
        </>
      }
    >
      {line ? (
        <Text variant="caption" numberOfLines={teaser ? teaserLines : undefined}>
          {line}
        </Text>
      ) : null}
    </ListRow>
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
  ruled: { borderTopWidth: StyleSheet.hairlineWidth },
  description: { marginTop: SPACING.xxs },
  value: { fontVariant: ['tabular-nums'] },
  block: { paddingVertical: SPACING.smPlus },
  control: { marginTop: SPACING.sm },
  section: { paddingTop: SPACING.lg, paddingBottom: SPACING.xs },
  sectionFirst: { paddingTop: 0 },
});
