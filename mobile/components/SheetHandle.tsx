import type { ComponentProps } from 'react';
import { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { LAYOUT, RADIUS, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { Icon, IconButton, Text } from './primitives';

interface SheetHandleProps {
  /** String renders as a themed title; a ReactNode is rendered as-is (e.g. flag + name). */
  title?: ReactNode;
  /** If provided, a back chevron appears on the leading edge, vertically centered with the title. */
  onBack?: () => void;
  /** One control on the trailing edge, mirroring `onBack`. */
  action?: SheetHandleAction;
}

export interface SheetHandleAction {
  icon: ComponentProps<typeof Icon>['name'];
  label: string;
  onPress: () => void;
}

export const SheetHandle = memo(function SheetHandle({ title, onBack, action }: SheetHandleProps) {
  const { colors, typography } = useTheme();
  // Tighten line-height to match glyph height so flex center + absolute center
  // align against the same reference (no 1–2px optical drift from line-leading).
  const tightTitle = { lineHeight: typography.sizeBase };
  // The title is the sheet's heading, and nothing else here is an element of
  // its own. The row used to claim `adjustable` with no actions — a control
  // that promised to move and could not — and the indicator is a picture of a
  // drag the platform's own dismiss gesture already provides.
  return (
    <View style={styles.container}>
      <View
        style={[styles.indicator, { backgroundColor: colors.rule }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      {(title || onBack || action) && (
        <View style={styles.titleRow}>
          {onBack && (
            <IconButton
              onPress={onBack}
              haptic="tick"
              style={styles.back}
              accessibilityLabel="Back"
            >
              <Icon name="chevron-back" tone="default" />
            </IconButton>
          )}
          {typeof title === 'string' ? (
            // Lowercase on screen, as it was written in the spoken label: small
            // caps draw a capital at full height, so a title that arrives in
            // data case — a GDACS event name, "Attack on civilians" — read as a
            // different tier from every lowercase title beside it.
            <Text
              variant="label"
              style={tightTitle}
              accessibilityRole="header"
              accessibilityLabel={title}
            >
              {title.toLocaleLowerCase()}
            </Text>
          ) : (
            title
          )}
          {action && (
            <IconButton
              onPress={action.onPress}
              haptic="tick"
              style={styles.action}
              accessibilityLabel={action.label}
            >
              <Icon name={action.icon} tone="secondary" />
            </IconButton>
          )}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  indicator: {
    width: LAYOUT.handleWidth,
    height: LAYOUT.handleHeight,
    borderRadius: RADIUS.handle,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: SPACING.sm,
  },
  back: {
    position: 'absolute',
    left: SPACING.screenPadding,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  action: {
    position: 'absolute',
    right: SPACING.screenPadding,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
});
