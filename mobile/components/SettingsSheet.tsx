import {
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import Constants from 'expo-constants';
import { memo, useCallback } from 'react';
import { Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
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

function SheetContainer({ children }: { children?: React.ReactNode }) {
  return <FullWindowOverlay>{children}</FullWindowOverlay>;
}

function useMaxSheetHeight() {
  return useWindowDimensions().height * LAYOUT.sheetMaxFraction;
}

// ---------------------------------------------------------------------------
// Option row — plain text selectors, zuhd-style
// ---------------------------------------------------------------------------

interface OptionRowProps<T extends string> {
  options: { value: T; label: string }[];
  selected: T;
  onSelect: (v: T) => void;
  textColor: string;
  dimColor: string;
  fontFamily: string | undefined;
  fontSize: number;
}

function OptionRow<T extends string>({
  options,
  selected,
  onSelect,
  textColor,
  dimColor,
  fontFamily,
  fontSize,
}: OptionRowProps<T>) {
  return (
    <View style={styles.optionRow}>
      {options.map((opt) => (
        <Pressable
          key={opt.value}
          onPress={() => {
            if (opt.value !== selected) {
              hapticTick();
              onSelect(opt.value);
            }
          }}
          hitSlop={8}
          style={({ pressed }) => pressed && PRESSED_STYLE}
          accessibilityRole="radio"
          accessibilityState={{ selected: opt.value === selected }}
          accessibilityLabel={opt.label}
        >
          <Text
            style={{
              fontFamily,
              fontSize,
              color: opt.value === selected ? textColor : dimColor,
            }}
          >
            {opt.label}
          </Text>
        </Pressable>
      ))}
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
  } = useTheme();
  const MAX_SHEET_HEIGHT = useMaxSheetHeight();

  const SettingsHandle = useCallback(() => <SheetHandle title="settings" />, []);

  return (
    <BottomSheetModal
      ref={sheetRef}
      enableDynamicSizing
      maxDynamicContentSize={MAX_SHEET_HEIGHT}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={sheetStyles.bg}
      handleComponent={SettingsHandle}
      containerComponent={SheetContainer}
      onDismiss={onDismiss}
    >
      <BottomSheetScrollView
        contentContainerStyle={[sheetStyles.content, { paddingBottom: bottomInset + SPACING.lg }]}
      >
        {/* Font size */}
        <Text style={[textStyles.smallCapsXs, { color: colors.textSecondary }]}>size</Text>
        <View style={styles.sectionBody}>
          <OptionRow
            options={FONT_SIZE_OPTIONS}
            selected={preferences.fontSize}
            onSelect={setFontSize}
            textColor={colors.text}
            dimColor={colors.textSecondary}
            fontFamily={font.semiBold}
            fontSize={typography.sizeSm}
          />
        </View>

        <View style={[styles.divider, { backgroundColor: colors.rule }]} />

        {/* Font family */}
        <Text style={[textStyles.smallCapsXs, { color: colors.textSecondary }]}>font</Text>
        <View style={styles.sectionBody}>
          <OptionRow
            options={FONT_FAMILY_OPTIONS}
            selected={preferences.fontFamily}
            onSelect={setFontFamily}
            textColor={colors.text}
            dimColor={colors.textSecondary}
            fontFamily={font.semiBold}
            fontSize={typography.sizeSm}
          />
        </View>

        <View style={[styles.divider, { backgroundColor: colors.rule }]} />

        {/* Appearance */}
        <Text style={[textStyles.smallCapsXs, { color: colors.textSecondary }]}>appearance</Text>
        <View style={styles.sectionBody}>
          <OptionRow
            options={APPEARANCE_OPTIONS}
            selected={preferences.appearance}
            onSelect={setAppearance}
            textColor={colors.text}
            dimColor={colors.textSecondary}
            fontFamily={font.semiBold}
            fontSize={typography.sizeSm}
          />
        </View>

        <View style={[styles.divider, { backgroundColor: colors.rule }]} />

        {/* About */}
        <Text style={[textStyles.smallCapsXs, { color: colors.textSecondary }]}>about</Text>
        <View style={styles.sectionBody}>
          <Text
            style={{
              fontFamily: font.regular,
              fontSize: typography.sizeXs,
              color: colors.textSecondary,
            }}
          >
            zuhd.news · {Constants.expoConfig?.version ?? ''}
          </Text>
          <Text
            style={{
              fontFamily: font.regular,
              fontSize: typography.sizeXs,
              color: colors.textSecondary,
              marginTop: SPACING.xs,
            }}
          >
            <Text
              onPress={() => Linking.openURL('mailto:yunus@edenmind.com')}
              accessibilityRole="link"
              accessibilityLabel="Contact us by email"
              style={{ color: colors.accent }}
            >
              contact
            </Text>
            {'  ·  '}
            <Text
              onPress={() => Linking.openURL('https://zuhd.news/privacy')}
              accessibilityRole="link"
              accessibilityLabel="Privacy policy"
              style={{ color: colors.accent }}
            >
              privacy
            </Text>
          </Text>
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  optionRow: {
    flexDirection: 'row',
    gap: SPACING.lg,
  },
  sectionBody: {
    marginTop: SPACING.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: SPACING.md,
  },
});
