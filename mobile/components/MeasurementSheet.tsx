import { memo, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { ANALYTICS_EVENTS } from '../constants/analytics';
import { HIT_SLOP, RADIUS, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { analytics } from '../lib/analytics';
import { getMeasurementAnswer, setMeasurementAnswer } from '../lib/measurement';
import { Pressable, Text } from './primitives';
import { SheetScrollView } from './SheetContent';
import { type BaseSheetProps, SheetLayout } from './SheetLayout';

/** The two answers look the same, so saying no is never quieter than yes. */
function Answer({ label, hint, onPress }: { label: string; hint: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={HIT_SLOP}
      style={[styles.answer, { backgroundColor: colors.pillBg, borderColor: colors.rule }]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
    >
      <Text variant="label" tone="emphasis">
        {label}
      </Text>
    </Pressable>
  );
}

/** The sheet is the app's own ask, and there is no system dialog behind it. */
function trackAnswer(allowed: boolean): void {
  void analytics.track(ANALYTICS_EVENTS.PERMISSION_RESULT, {
    permission: 'ad_measurement',
    granted: allowed,
    primed: true,
    os_prompt: false,
  });
}

/** Asked once, on Android, at a new reader's first launch. Any dismissal is a
 *  no, and there is no re-ask: the row on the privacy page is the way back. */
export const MeasurementSheet = memo(function MeasurementSheet({
  sheetRef,
  bottomInset,
  onDismiss,
}: BaseSheetProps) {
  const answer = useCallback(
    (allowed: boolean) => {
      setMeasurementAnswer(allowed);
      trackAnswer(allowed);
      sheetRef.current?.dismiss();
    },
    [sheetRef],
  );

  const handleDismiss = useCallback(() => {
    if (getMeasurementAnswer() === null) {
      setMeasurementAnswer(false);
      trackAnswer(false);
    }
    onDismiss();
  }, [onDismiss]);

  return (
    <SheetLayout sheetRef={sheetRef} onDismiss={handleDismiss} handleTitle="measure our ads?">
      <SheetScrollView bottomInset={bottomInset}>
        <Text variant="body">
          We advertise this app on Facebook and Instagram. If you say yes, this phone tells Meta the
          app was installed and opened, with its advertising ID, so we can see which ads bring
          readers. Meta may combine that with what it already holds about you. The app sends it
          nothing about what you read.
        </Text>
        <Text variant="body" style={styles.note}>
          You can change this in settings, under privacy.
        </Text>
        <View style={styles.actions}>
          <Answer label="yes" hint="Allows ad measurement" onPress={() => answer(true)} />
          <Answer label="no" hint="Nothing is sent to Meta" onPress={() => answer(false)} />
        </View>
      </SheetScrollView>
    </SheetLayout>
  );
});

const styles = StyleSheet.create({
  note: {
    marginTop: SPACING.md,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.lg,
  },
  answer: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.floating,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
