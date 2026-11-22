import { memo, useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { ANALYTICS_EVENTS, type PrimerSource } from '../constants/analytics';
import { IS_ANDROID } from '../constants/platform';
import { HIT_SLOP, RADIUS, SPACING } from '../constants/theme';
import { usePreferences, useTheme } from '../hooks/useTheme';
import { analytics } from '../lib/analytics';
import { markOsPromptSpent } from '../lib/notification-prompt';
import { getSnapshot as getOnboarding, setPrimerStatus } from '../lib/onboarding-store';
import { Pressable, Text } from './primitives';
import { SheetScrollView } from './SheetContent';
import { type BaseSheetProps, SheetLayout } from './SheetLayout';

interface NotificationPrimerSheetProps extends BaseSheetProps {
  onToast: (message: string) => void;
  /** The moment it was presented at, for its `Permission Result`. */
  source: PrimerSource;
}

/** The reader said no to the primer itself: the OS was never asked. */
function trackDeclined(source: PrimerSource): void {
  void analytics.track(ANALYTICS_EVENTS.PERMISSION_RESULT, {
    permission: 'notifications',
    granted: false,
    primed: true,
    os_prompt: false,
    source,
  });
}

/** The one-time notification primer. Presented by HomeScreen at the first of
 *  its moments: a first briefing heard to the end, the fifth story read in a
 *  visit, or "caught up" (a swipe onto a story already seen) — a soft ask
 *  before the once-ever OS dialog, led by the frequency cap. Any dismissal
 *  counts as "not now"; there is no re-ask — the MenuSheet settings toggle
 *  remains the permanent path. */
export const NotificationPrimerSheet = memo(function NotificationPrimerSheet({
  sheetRef,
  bottomInset,
  onDismiss,
  onToast,
  source,
}: NotificationPrimerSheetProps) {
  const { colors } = useTheme();
  const { setNotifications } = usePreferences();
  const busyRef = useRef(false);

  const handleEnable = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      // iOS keeps its legacy cold-prompt marker. Android records every OS
      // request in enableNotifications, including one made from Settings.
      if (!IS_ANDROID) await markOsPromptSpent();
      const granted = await setNotifications(true, { primed: true, source });
      setPrimerStatus(granted ? 'accepted' : 'declined');
      sheetRef.current?.dismiss();
      if (granted) onToast('Briefings on');
    } finally {
      busyRef.current = false;
    }
  }, [setNotifications, onToast, sheetRef, source]);

  const handleNotNow = useCallback(() => {
    setPrimerStatus('declined');
    trackDeclined(source);
    sheetRef.current?.dismiss();
  }, [sheetRef, source]);

  const handleDismiss = useCallback(() => {
    // Pan-down / backdrop dismissal counts as "not now" — but only when no
    // explicit choice landed first (Enable dismisses after setting status).
    if (getOnboarding().primer.status === 'pending') {
      setPrimerStatus('declined');
      trackDeclined(source);
    }
    onDismiss();
  }, [onDismiss, source]);

  return (
    // One briefing a day, on the 05:00 UTC cycle, and one push for it. This
    // promised a morning and an evening one long after the evening one was
    // gone; the pipeline said so in its own comment (2026-09-25).
    <SheetLayout sheetRef={sheetRef} onDismiss={handleDismiss} handleTitle="one briefing a day">
      <SheetScrollView bottomInset={bottomInset}>
        <Text variant="body">
          The day’s stories, said once. Breaking news only when it matters.
        </Text>
        <View style={styles.actions}>
          <Pressable
            onPress={handleEnable}
            hitSlop={HIT_SLOP}
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
