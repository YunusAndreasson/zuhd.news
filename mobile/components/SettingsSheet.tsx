import {
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import Constants from 'expo-constants';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  type AppearanceMode,
  type FontFamily,
  type FontSize,
  LAYOUT,
  PRESSED_STYLE,
  SPACING,
} from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { hapticTick } from '../lib/haptics';
import { SheetHandle } from './SheetHandle';
import { SheetContainer, useMaxSheetHeight } from './SheetPrimitives';

const SettingsHandle = () => <SheetHandle title="settings" />;

// ---------------------------------------------------------------------------
// Option row — plain text selectors, zuhd-style
// ---------------------------------------------------------------------------

interface OptionRowProps<T extends string> {
  label: string;
  options: { value: T; label: string }[];
  selected: T;
  onSelect: (v: T) => void;
}

function OptionRow<T extends string>({
  label,
  options,
  selected,
  onSelect,
  hint,
}: OptionRowProps<T> & { hint?: string }) {
  const { colors, font, typography, textStyles } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text style={textStyles.smallCapsXs}>{label}</Text>
      {hint && (
        <Text
          style={{
            ...font.regular,
            fontSize: typography.sizeXs,
            color: colors.textSecondary,
            marginTop: SPACING.xxs,
          }}
        >
          {hint}
        </Text>
      )}

      <View style={styles.optionRow}>
        {options.map((opt) => {
          const active = opt.value === selected;
          return (
            <Pressable
              key={opt.value}
              onPress={() => {
                if (!active) {
                  hapticTick();
                  onSelect(opt.value);
                }
              }}
              hitSlop={12}
              style={({ pressed }) => pressed && PRESSED_STYLE}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={opt.label}
            >
              <Text
                style={{
                  ...font.semiBold,
                  fontSize: typography.sizeSm,
                  color: active ? colors.text : colors.textSecondary,
                }}
              >
                {opt.label}
              </Text>
              {active && (
                <View style={[styles.activeIndicator, { backgroundColor: colors.text }]} />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Settings sheet
// ---------------------------------------------------------------------------

interface SettingsSheetProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  bottomInset: number;
  renderBackdrop: React.FC<BottomSheetBackdropProps>;
  onDismiss: () => void;
}

const FONT_SIZE_OPTIONS: { value: FontSize; label: string }[] = [
  { value: 'small', label: 'small' },
  { value: 'default', label: 'default' },
  { value: 'large', label: 'large' },
];

const FONT_FAMILY_OPTIONS: { value: FontFamily; label: string }[] = [
  { value: 'source', label: 'source sans' },
  { value: 'system', label: 'system' },
];

const ON_OFF_OPTIONS: { value: 'on' | 'off'; label: string }[] = [
  { value: 'on', label: 'on' },
  { value: 'off', label: 'off' },
];

const APPEARANCE_OPTIONS: { value: AppearanceMode; label: string }[] = [
  { value: 'dark', label: 'dark' },
  { value: 'system', label: 'system' },
  { value: 'light', label: 'light' },
];

export const SettingsSheet = memo(function SettingsSheet({
  sheetRef,
  bottomInset,
  renderBackdrop,
  onDismiss,
}: SettingsSheetProps) {
  const {
    colors,
    font,
    typography,
    textStyles,
    sheetStyles,
    preferences,
    setFontSize,
    setFontFamily,
    setAppearance,
    setHaptics,
    setNotifications,
  } = useTheme();
  const MAX_SHEET_HEIGHT = useMaxSheetHeight();

  return (
    <BottomSheetModal
      ref={sheetRef}
      enableDynamicSizing
      maxDynamicContentSize={MAX_SHEET_HEIGHT}
      enablePanDownToClose
      enableOverDrag={false}
      backdropComponent={renderBackdrop}
      backgroundStyle={sheetStyles.bg}
      handleComponent={SettingsHandle}
      containerComponent={SheetContainer}
      onDismiss={onDismiss}
    >
      <BottomSheetScrollView
        contentContainerStyle={[sheetStyles.content, { paddingBottom: bottomInset + SPACING.xxl }]}
      >
        <OptionRow
          label="size"
          options={FONT_SIZE_OPTIONS}
          selected={preferences.fontSize}
          onSelect={setFontSize}
        />
        <View style={[styles.divider, { backgroundColor: colors.rule }]} />

        <OptionRow
          label="font"
          options={FONT_FAMILY_OPTIONS}
          selected={preferences.fontFamily}
          onSelect={setFontFamily}
        />
        <View style={[styles.divider, { backgroundColor: colors.rule }]} />

        <OptionRow
          label="appearance"
          options={APPEARANCE_OPTIONS}
          selected={preferences.appearance}
          onSelect={setAppearance}
        />
        <View style={[styles.divider, { backgroundColor: colors.rule }]} />

        <OptionRow
          label="haptics"
          options={ON_OFF_OPTIONS}
          selected={preferences.haptics ? 'on' : 'off'}
          onSelect={(v) => setHaptics(v === 'on')}
        />
        <View style={[styles.divider, { backgroundColor: colors.rule }]} />

        <OptionRow
          label="notifications"
          hint="Daily briefing reminder and breaking news alerts"
          options={ON_OFF_OPTIONS}
          selected={preferences.notifications ? 'on' : 'off'}
          onSelect={(v) => setNotifications(v === 'on')}
        />
        <Text
          style={{
            ...font.regular,
            fontSize: typography.sizeXs,
            color: colors.textSecondary,
            opacity: 0.5,
            marginTop: SPACING.xl,
            textAlign: 'center',
          }}
        >
          zuhd.news · {Constants.expoConfig?.version ?? ''}
        </Text>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  optionRow: {
    flexDirection: 'row',
    gap: SPACING.lg,
    marginTop: SPACING.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: SPACING.md,
  },
  activeIndicator: {
    height: LAYOUT.activeIndicatorHeight,
    borderRadius: LAYOUT.activeIndicatorRadius,
    marginTop: SPACING.xxs,
  },
});
