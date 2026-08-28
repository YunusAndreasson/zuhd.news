import { memo, useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { HIT_SLOP, RADIUS, SPACING } from '../constants/theme';
import { useSheetSnaps } from '../hooks/useSheetSnaps';
import { usePreferences, useTheme } from '../hooks/useTheme';
import {
  getSnapshot as getOnboarding,
  markOsPromptSpent,
  setPrimerStatus,
} from '../lib/onboarding-store';
import { Pressable, Text } from './primitives';
import { SheetScrollView } from './SheetContent';
import { type BaseSheetProps, SheetLayout } from './SheetLayout';

interface NotificationPrimerSheetProps extends BaseSheetProps {
  onToast: (message: string) => void;
}

/** The one-time notification primer. Presented by HomeScreen at the reader's
 *  first "caught up" moment (structurally session 2+, never on a cold first
 *  launch) — a soft ask before the once-ever OS dialog, led by the frequency
 *  cap. Any dismissal counts as "not now"; there is no re-ask — the MenuSheet
 *  settings toggle remains the permanent path. */
export const NotificationPrimerSheet = memo(function NotificationPrimerSheet({
  sheetRef,
  bottomInset,
  onDismiss,
  onToast,
}: NotificationPrimerSheetProps) {
  const { colors } = useTheme();
  const { setNotifications } = usePreferences();
  const snapProps = useSheetSnaps(false);
  const busyRef = useRef(false);

  const handleEnable = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      // Record the spend first — insurance so an OTA rollback to the old
      // cold-prompt code can never fire a second OS ask.
      await markOsPromptSpent();
      const granted = await setNotifications(true);
      setPrimerStatus(granted ? 'accepted' : 'declined');
      sheetRef.current?.dismiss();
      if (granted) onToast('Briefings on');
    } finally {
      busyRef.current = false;
    }
  }, [setNotifications, onToast, sheetRef]);

  const handleNotNow = useCallback(() => {
    setPrimerStatus('declined');
    sheetRef.current?.dismiss();
  }, [sheetRef]);

  const handleDismiss = useCallback(() => {
    // Pan-down / backdrop dismissal counts as "not now" — but only when no
    // explicit choice landed first (Enable dismisses after setting status).
    if (getOnboarding().primer.status === 'pending') setPrimerStatus('declined');
    onDismiss();
  }, [onDismiss]);

  return (
    <SheetLayout
      sheetRef={sheetRef}
      {...snapProps}
      onDismiss={handleDismiss}
      handleTitle="briefings"
    >
      <SheetScrollView bottomInset={bottomInset}>
        <Text variant="label">two briefings a day</Text>
        <Text variant="body" style={styles.body}>
          A morning and an evening briefing — the day’s stories, said once. Breaking news only when
          it matters.
        </Text>
        <View style={styles.actions}>
          <Pressable
            onPress={handleEnable}
            haptic="impact"
            style={[
              styles.enablePill,
              { backgroundColor: colors.pillBg, borderColor: colors.rule },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Enable briefings"
            accessibilityHint="Asks the system for notification permission"
          >
            <Text variant="label" tone="emphasis">
              enable briefings
            </Text>
          </Pressable>
          <Pressable
            onPress={handleNotNow}
            haptic="tick"
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Not now"
            accessibilityHint="Closes without enabling notifications"
          >
            <Text variant="labelSm" tone="secondary">
              not now
            </Text>
          </Pressable>
        </View>
      </SheetScrollView>
    </SheetLayout>
  );
});

const styles = StyleSheet.create({
  body: {
    marginTop: SPACING.sm,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
    marginTop: SPACING.lg,
  },
  enablePill: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.floating,
    // Hairline definition over the sheet bg — same recipe as the action pills.
    borderWidth: StyleSheet.hairlineWidth,
  },
});
