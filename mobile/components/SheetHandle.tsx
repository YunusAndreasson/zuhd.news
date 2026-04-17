import { Ionicons } from '@expo/vector-icons';
import { memo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ICON, LAYOUT, RADIUS, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { HapticPressable } from './HapticPressable';

interface SheetHandleProps {
  /** String renders as a themed title; a ReactNode is rendered as-is (e.g. flag + name). */
  title?: ReactNode;
  /** If provided, a back chevron appears on the leading edge, vertically centered with the title. */
  onBack?: () => void;
}

export const SheetHandle = memo(function SheetHandle({ title, onBack }: SheetHandleProps) {
  const { colors, textStyles, typography } = useTheme();
  const a11yLabel = typeof title === 'string' ? `${title} sheet` : 'Sheet handle';
  // Tighten line-height to match glyph height so flex center + absolute center
  // align against the same reference (no 1–2px optical drift from line-leading).
  const tightTitle = { lineHeight: typography.sizeBase };
  return (
    <View
      style={styles.container}
      accessibilityRole="adjustable"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Swipe down to dismiss"
    >
      <View style={[styles.indicator, { backgroundColor: colors.rule }]} />
      {(title || onBack) && (
        <View style={styles.titleRow}>
          {onBack && (
            <HapticPressable
              onPress={onBack}
              haptic="tick"
              hitSlop={LAYOUT.hitSlop}
              style={styles.back}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Ionicons name="chevron-back" size={ICON.md} color={colors.text} />
            </HapticPressable>
          )}
          {typeof title === 'string' ? (
            <Text style={[textStyles.sheetTitle, tightTitle]}>{title}</Text>
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
});
