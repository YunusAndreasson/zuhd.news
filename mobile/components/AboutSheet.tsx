import {
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { memo, useCallback, useRef } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { PRESSED_STYLE, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { hapticTick } from '../lib/haptics';
import { SheetHandle } from './SheetHandle';
import { SheetContainer, useMaxSheetHeight } from './SheetPrimitives';

interface AboutSheetProps {
  sheetRef: React.RefObject<BottomSheetModal | null>;
  bottomInset: number;
  renderBackdrop: React.FC<BottomSheetBackdropProps>;
  onDismiss: () => void;
}

export const AboutSheet = memo(function AboutSheet({
  sheetRef,
  bottomInset,
  renderBackdrop,
  onDismiss,
}: AboutSheetProps) {
  const { colors, font, typography, textStyles, sheetStyles } = useTheme();
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

  const AboutHandle = useCallback(() => <SheetHandle title="about" />, []);

  return (
    <BottomSheetModal
      ref={sheetRef}
      enableDynamicSizing
      maxDynamicContentSize={MAX_SHEET_HEIGHT}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={sheetStyles.bg}
      handleComponent={AboutHandle}
      containerComponent={SheetContainer}
      onDismiss={handleDismiss}
    >
      <BottomSheetScrollView
        contentContainerStyle={[sheetStyles.content, { paddingBottom: bottomInset + SPACING.lg }]}
      >
        <Text
          style={{
            fontFamily: font.regular,
            fontSize: typography.sizeSm,
            color: colors.textSecondary,
            lineHeight: typography.sizeSm * 1.5,
          }}
        >
          What happened, why it matters, what comes next.
        </Text>

        <View style={[styles.divider, { backgroundColor: colors.rule }]} />

        {/* Contact */}
        <Text style={[textStyles.smallCapsXs, { color: colors.textSecondary }]}>contact</Text>
        <View style={styles.sectionBody}>
          <Pressable
            onPress={() => {
              hapticTick();
              Linking.openURL('mailto:contact@zuhd.news');
            }}
            hitSlop={12}
            style={({ pressed }) => pressed && PRESSED_STYLE}
            accessibilityRole="link"
            accessibilityLabel="Contact us by email"
          >
            <Text
              style={{
                fontFamily: font.semiBold,
                fontSize: typography.sizeSm,
                color: colors.accent,
              }}
            >
              contact@zuhd.news
            </Text>
          </Pressable>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.rule }]} />

        {/* Sources */}
        <Text style={[textStyles.smallCapsXs, { color: colors.textSecondary }]}>sources</Text>
        <View style={styles.sectionBody}>
          <Pressable
            onPress={() => {
              hapticTick();
              openUrl('https://zuhd.news/sources');
            }}
            hitSlop={12}
            style={({ pressed }) => pressed && PRESSED_STYLE}
            accessibilityRole="link"
            accessibilityLabel="View sources"
          >
            <Text
              style={{
                fontFamily: font.semiBold,
                fontSize: typography.sizeSm,
                color: colors.accent,
              }}
            >
              zuhd.news/sources
            </Text>
          </Pressable>
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
              onPress={() => openUrl('https://zuhd.news/privacy')}
              accessibilityRole="link"
              accessibilityLabel="Privacy policy"
              style={{ color: colors.accent }}
            >
              privacy
            </Text>
            {'  ·  '}
            <Text
              onPress={() => openUrl('https://zuhd.news/support')}
              accessibilityRole="link"
              accessibilityLabel="Support"
              style={{ color: colors.accent }}
            >
              support
            </Text>
          </Text>
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  sectionBody: {
    marginTop: SPACING.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: SPACING.md,
  },
});
