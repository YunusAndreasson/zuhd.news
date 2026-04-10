import {
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import Constants from 'expo-constants';
import * as StoreReview from 'expo-store-review';
import * as WebBrowser from 'expo-web-browser';
import { memo, useCallback, useRef } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  type AppearanceMode,
  type FontFamily,
  type FontSize,
  PRESSED_STYLE,
  SPACING,
} from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { hapticTick } from '../lib/haptics';
import { SheetHandle } from './SheetHandle';
import { SheetContainer, useMaxSheetHeight } from './SheetPrimitives';

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
          hitSlop={12}
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

  const pendingUrl = useRef<string | null>(null);

  const openUrl = useCallback(
    (url: string) => {
      pendingUrl.current = url;
      sheetRef.current?.dismiss();
    },
    [sheetRef],
  );

  const handleDismiss = useCallback(() => {
    const url = pendingUrl.current;
    pendingUrl.current = null;
    if (url) WebBrowser.openBrowserAsync(url);
    onDismiss();
  }, [onDismiss]);

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
      onDismiss={handleDismiss}
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

        {/* Haptics */}
        <Text style={[textStyles.smallCapsXs, { color: colors.textSecondary }]}>haptics</Text>
        <View style={styles.sectionBody}>
          <OptionRow
            options={ON_OFF_OPTIONS}
            selected={preferences.haptics ? 'on' : 'off'}
            onSelect={(v) => setHaptics(v === 'on')}
            textColor={colors.text}
            dimColor={colors.textSecondary}
            fontFamily={font.semiBold}
            fontSize={typography.sizeSm}
          />
        </View>

        <View style={[styles.divider, { backgroundColor: colors.rule }]} />

        {/* Daily briefing notification */}
        <Text style={[textStyles.smallCapsXs, { color: colors.textSecondary }]}>notifications</Text>
        <View style={styles.sectionBody}>
          <OptionRow
            options={ON_OFF_OPTIONS}
            selected={preferences.notifications ? 'on' : 'off'}
            onSelect={(v) => setNotifications(v === 'on')}
            textColor={colors.text}
            dimColor={colors.textSecondary}
            fontFamily={font.semiBold}
            fontSize={typography.sizeSm}
          />
        </View>

        <View style={[styles.divider, { backgroundColor: colors.rule }]} />

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
              onPress={() => { hapticTick(); openUrl('https://zuhd.news/about'); }}
              accessibilityRole="link"
              accessibilityLabel="About zuhd.news"
              style={{ color: colors.accent }}
            >
              about
            </Text>
            {'  ·  '}
            <Text
              onPress={() => { hapticTick(); Linking.openURL('mailto:yunus@edenmind.com'); }}
              accessibilityRole="link"
              accessibilityLabel="Contact us by email"
              style={{ color: colors.accent }}
            >
              contact
            </Text>
            {'  ·  '}
            <Text
              onPress={() => { hapticTick(); openUrl('https://zuhd.news/privacy'); }}
              accessibilityRole="link"
              accessibilityLabel="Privacy policy"
              style={{ color: colors.accent }}
            >
              privacy
            </Text>
            {'  ·  '}
            <Text
              onPress={() => { hapticTick(); StoreReview.requestReview(); }}
              accessibilityRole="link"
              accessibilityLabel="Rate this app"
              style={{ color: colors.accent }}
            >
              rate
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
