import { memo, useRef } from 'react';
import { AccessibilityInfo, Image, StyleSheet, View } from 'react-native';
import { RADIUS, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { afterwards } from '../lib/afterwards';
import { Pressable, Text } from './primitives';
import { SheetScrollView } from './SheetContent';
import { type BaseSheetProps, SheetLayout } from './SheetLayout';

export const NotificationPrimerSheet = memo(function NotificationPrimerSheet({
  sheetRef,
  bottomInset,
  onDismiss,
  onContinue,
}: BaseSheetProps & { onContinue: () => Promise<void> }) {
  const { colors } = useTheme();
  const busy = useRef(false);
  const heading = useRef<React.ComponentRef<typeof View>>(null);
  const focusHeading = () => {
    if (heading.current) AccessibilityInfo.sendAccessibilityEvent(heading.current, 'focus');
  };
  return (
    <SheetLayout sheetRef={sheetRef} onDismiss={onDismiss} handle={<View />}>
      <SheetScrollView bottomInset={bottomInset} contentContainerStyle={styles.content}>
        <View ref={heading} accessible accessibilityRole="header" onLayout={focusHeading}>
          <Text variant="title" tone="emphasis" maxFontSizeMultiplier={0}>
            When the briefing is ready
          </Text>
        </View>
        <Text variant="body" maxFontSizeMultiplier={0}>
          One alert when the day’s audio is published. You’ll also get breaking news as it happens.
        </Text>
        <Text variant="labelXs" tone="secondary" maxFontSizeMultiplier={0} style={styles.caption}>
          Notification preview · example
        </Text>
        <View
          style={[styles.preview, { backgroundColor: colors.pillBg, borderColor: colors.rule }]}
        >
          <Image accessible={false} source={require('../assets/icon.png')} style={styles.icon} />
          <View style={styles.sample}>
            <Text variant="caption" tone="secondary" maxFontSizeMultiplier={0}>
              zuhd.news
            </Text>
            <Text variant="body" tone="emphasis" maxFontSizeMultiplier={0}>
              Today's Briefing
            </Text>
            <Text variant="body" maxFontSizeMultiplier={0}>
              Fed raises rates · Hormuz traffic dips
            </Text>
          </View>
        </View>
        <Text variant="caption" tone="secondary" maxFontSizeMultiplier={0}>
          Tap a briefing alert to listen.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Continue"
          accessibilityHint="Asks the system for notification permission"
          style={[styles.button, { backgroundColor: colors.textEmphasis }]}
          onPress={async () => {
            if (busy.current) return;
            busy.current = true;
            await afterwards(onContinue, () => {
              busy.current = false;
              sheetRef.current?.dismiss();
            });
          }}
        >
          <Text variant="body" tone="inverse" maxFontSizeMultiplier={0}>
            Continue
          </Text>
        </Pressable>
      </SheetScrollView>
    </SheetLayout>
  );
});
const styles = StyleSheet.create({
  content: { gap: SPACING.sm, paddingTop: SPACING.lg },
  caption: { marginTop: SPACING.md },
  preview: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.smPlus,
    borderRadius: RADIUS.floating,
    borderWidth: StyleSheet.hairlineWidth,
    padding: SPACING.articlePadding,
  },
  icon: {
    width: SPACING.xl + SPACING.sm,
    height: SPACING.xl + SPACING.sm,
    borderRadius: SPACING.sm,
  },
  sample: { flex: 1 },
  button: {
    minHeight: SPACING.xxl,
    marginTop: SPACING.sm,
    borderRadius: RADIUS.floating,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
