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
}

export const SheetHandle = memo(function SheetHandle({ title, onBack }: SheetHandleProps) {
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
      {(title || onBack) && (
        // A title's height even without one: the back button is absolute, so
        // a page with no title (a card, which heads itself) had a 0pt row and
        // a back button of no size — nothing to tap.
        <View style={[styles.titleRow, { minHeight: typography.sizeBase }]}>
          {onBack && (
            <IconButton onPress={onBack} style={styles.back} accessibilityLabel="Back">
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
              style={[styles.textTitle, tightTitle]}
              numberOfLines={3}
              accessibilityRole="header"
              accessibilityLabel={title}
            >
              {title.toLocaleLowerCase()}
            </Text>
          ) : (
            title
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
  textTitle: {
    flexShrink: 1,
    // Both sides stay clear, keeping the heading centered without a long
    // event name running under Back.
    marginHorizontal: SPACING.screenPadding + LAYOUT.controlHeight,
    textAlign: 'center',
  },
});
