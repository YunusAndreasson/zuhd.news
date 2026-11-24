import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { HIT_SLOP, LAYOUT, SPACING } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { hapticError, hapticNotification, hapticTick } from '../lib/haptics';
import { isMeasurementOn, setMeasurementAnswer, subscribeMeasurement } from '../lib/measurement';
import { eraseLocalData } from '../lib/wipe';
import { MenuRow } from './MenuRow';
import { Pressable, Text } from './primitives';
import { type InfoSection, SheetInfoPage } from './SheetInfoPage';
import { Toggle } from './Toggle';

// Every sentence here has to survive someone reading the source. The page
// previously claimed "No device identifiers, IP addresses, or usage data are
// logged server-side" while a Pages middleware logged country + path on every
// app open; the middleware is gone, and the wording below is now scoped to
// what we actually control rather than to what a CDN does with a TCP
// connection. Anything added here must be checkable from the repo.
const SECTIONS: InfoSection[] = [
  {
    // Until 2026-09-25 this also said "No telemetry … No third-party
    // SDKs", and the next section "The app contacts one address". The
    // update check (expo-updates → u.expo.dev, with a per-install
    // `EAS-Client-ID`, every launch) and the push service (exp.host, only
    // with notifications on) made all three untrue. Named in plain words,
    // not by vendor: a reader has no idea what Expo is.
    body: 'No accounts. No ads in the app. One optional measure of our own advertising, on Android only.',
  },
  {
    heading: 'what the app contacts',
    body: 'Stories, map data and audio come from one address: zuhd-news.pages.dev. The app also checks for updates when it opens, which sends its version and a random number for this install — nothing about what you read. With notifications on, the service that delivers them is contacted too. Usage statistics go to Mixpanel and crash reports to Sentry. On Android, unless you turn off ad measurement below, Meta is contacted too. No other ad network, and no font, map or image service. Source links open in your browser only when you tap them.',
  },
  {
    // Shares its core sentence verbatim with SheetAboutPage's
    // NO_PROFILE_LINE and the store listing. Change it in all three.
    heading: 'what we know about you',
    body: 'There are no accounts. The app sends no identifier when it fetches the news, so the news server cannot tell readers apart, and it keeps no record of what anyone reads.',
  },
  {
    // Named, like Meta below: a reader has to know who receives it. Events and
    // their properties are `constants/analytics.ts`; what Sentry may send is
    // `lib/sentry.ts`. Neither has an off switch, so none is described.
    // The installation ID is `lib/install-id.ts` (an erase replaces it); the
    // Play Store's referrer goes only while ad measurement is on
    // (`lib/install-attribution.ts`).
    heading: 'usage and crashes',
    body: 'The app sends usage events to Mixpanel: when it is opened, which screen is opened, which tips were seen, whether an alert offer was viewed, your permission choice, whether publisher registration succeeded, whether the system reports a Home or Lock Screen widget, and a few actions, such as starting or finishing a briefing, opening, saving or sharing a story, and how many stories were read in a visit. They do not include which story. They carry a random ID for this installation, and on Android, unless ad measurement is off, one of them says which link or ad the Play Store reports brought the install. Each event also says the day the app was first opened and whether notifications are on. They are linked to a random ID created on this device, not to a name or account, and Mixpanel derives an approximate location from the IP address. Mixpanel stores them in the EU. Crash and error reports go to Sentry, in the US: the error, the device model, the operating system and the app version, with no screenshot and no web address. There is no setting to turn these off. Erasing local data below gives usage events a new random ID.',
  },
  {
    // Named, against the rule for vendors: what a reader can turn off has to
    // say who receives it. `lib/measurement.ts` is what makes each sentence true.
    heading: 'ad measurement',
    body: 'We advertise this app on Facebook and Instagram. On Android, the app tells Meta it was installed and opened and sends your phone’s advertising ID, so we can see which ads bring readers. Meta may combine this with what it already holds about you. The app sends it nothing about what you read. It also sends Mixpanel, once, which link or ad the Play Store says brought the install. Turn ad measurement off below and none of this runs. Its traffic is not in the data figure in Settings. The iPhone app does none of this.',
  },
  {
    heading: 'data used',
    // Measured 2026-09-25 on the built API: feed-lite 22 KB gzipped, the
    // feed plus the eleven snapshots ~112 KB brotli cold, and 304s after
    // (ETags). Briefings are 64 kbps and ran 7.5–10 minutes: 3.6–4.8 MB.
    // It said 15 KB and 3 MB, and Settings counts decoded bytes.
    body: 'The day’s stories are about 20 KB, compressed, and the map’s layers about 100 KB the first time; after that only what has changed is downloaded. There are no images to load. Audio briefings are the exception: about 4 MB each, downloaded only when you play one. Settings shows what the app has fetched since you opened it, the audio included, counted before compression, so it reads higher.',
  },
  {
    // Fragments, not a sentence. Six things joined by commas read as a
    // legal inventory; the same six as separate statements read as an
    // answer — and match the cadence of "No ads. No tracking." above.
    heading: 'on this device',
    // Every key `wipe.ts` erases, in words, and the once-per-install record
    // it keeps (`install-record.ts`); the installation ID leaves the device,
    // so it is under usage. `read-store` keeps which stories, not a count, and
    // the rating prompt keeps a count of swipes. Erase keeps display settings,
    // the notification and measurement choices and that record, so "all of
    // it" is not said.
    body: 'Saved stories. Which stories were already here last time, so the new ones can be marked. Which stories you have read. When you last left the app. Your place in a briefing and which edition was heard. Which tips you have seen. How many stories you have swiped through, and when the app last asked for a rating, so it asks at most once in three months. Whether you have read a story and played a briefing yet, so a usage event can say it is the first. Which once-per-install usage events have been sent, such as the first open, so none is sent twice. Your display settings. Your publisher alert choice, which invitation you saw, whether the service accepted the token and when the app last observed that state. Whether ad measurement is off. A dated opening report and a cached copy of the latest stories and map data, so they open without a connection and an unchanged file is not downloaded twice. The last briefing you listened to, once it has downloaded. The widget keeps dated market readings and the recording you finished so its chart and listening action can open offline.\n\nNone of it leaves the device. You can erase most of it below.',
  },
  {
    // Written to make opting in feel as safe as it actually is, because it
    // is safe: tokens.js stores `token:<token>` -> '1' with a 90-day TTL,
    // and push.js sends the same payload to every key under that prefix.
    // There is no segmentation to describe because there is none.
    // Deliberately does NOT restate "no way to tell readers apart" — the
    // section above owns that claim, and saying it twice within one page
    // is the kind of protesting-too-much that makes a privacy page read
    // like a disclaimer. This section carries only what is specific to
    // notifications.
    heading: 'notifications',
    body: 'If you turn them on, one thing is stored on our server: the token your phone issues for push delivery. Nothing is attached to it — no account, no email, no history. Everyone who turns notifications on receives the same alert. A registration expires after 90 days unless renewed. Turning alerts off requests deletion. If offline, the app retries when it reconnects.',
  },
  {
    heading: 'audio',
    // Since 2026-09-26 the pipeline's Gemini TTS reads the script, Cloud
    // text-to-speech only where a piece fails, and every piece is sent
    // back to Gemini to be transcribed — the check that no sentence was
    // skipped (`scripts/generate-briefing.js`). "Google Cloud
    // text-to-speech" alone had stopped being true, and the second trip
    // is Google's too.
    body: 'Briefing audio is read by Google’s speech models and hosted on our own infrastructure. Google receives the text to read aloud, and the recording back once, to check that no sentence was skipped. It receives nothing about you.',
  },
];

/** The off switch for ad measurement, on unless turned off. Android only: the
 *  iPhone build has nothing to measure with. */
function MeasurementRow() {
  const allowed = useSyncExternalStore(subscribeMeasurement, isMeasurementOn);
  return (
    <MenuRow
      first
      title="ad measurement"
      description="Tell Meta when the app is installed and opened"
      trailing={<Toggle value={allowed} />}
      accessibilityRole="switch"
      accessibilityState={{ checked: allowed }}
      onPress={() => {
        hapticTick();
        setMeasurementAnswer(!allowed);
      }}
    />
  );
}

/**
 * Erase control for the privacy page. Two taps, not a native Alert: the app
 * has no other modal chrome and a system dialog would be the one piece of
 * borrowed UI in it. The armed state disarms itself after a few seconds so an
 * abandoned first tap can't be completed by a stray second one later.
 */
function EraseControl({ onDone }: { onDone?: (message: string) => void }) {
  const { colors } = useTheme();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);

  const handlePress = useCallback(() => {
    if (busy) return;
    if (!armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    setArmed(false);
    eraseLocalData()
      .then(() => {
        hapticNotification();
        onDone?.('Erased');
      })
      .catch(() => {
        hapticError();
        onDone?.('Could not erase');
      })
      .finally(() => setBusy(false));
  }, [armed, busy, onDone]);

  return (
    <>
      <Text variant="labelSm" accessibilityRole="header" style={styles.eraseHeading}>
        erase local data
      </Text>
      <Text selectable variant="body">
        Removes your saved stories, which stories you have read, your place in a briefing and its
        audio, the tips you have seen, the rating count, and the cached stories and map data.
        Display settings and your notification and ad measurement choices stay.
      </Text>
      <Pressable
        onPress={handlePress}
        hitSlop={HIT_SLOP}
        style={[styles.erasePill, { borderColor: colors.accent }]}
        accessibilityRole="button"
        accessibilityLabel={armed ? 'Confirm erase local data' : 'Erase local data'}
        accessibilityHint={armed ? undefined : 'Asks for confirmation before erasing'}
      >
        <Text variant="bodyEmphasis" tone={armed ? 'unfavorable' : 'default'}>
          {busy ? 'erasing…' : armed ? 'tap again to erase' : 'erase'}
        </Text>
      </Pressable>
    </>
  );
}

/** The privacy page: what the app contacts and keeps, and the control that
 *  erases what it keeps. */
export function SheetPrivacyPage({ onToast }: { onToast?: (message: string) => void }) {
  return (
    <SheetInfoPage
      sections={SECTIONS}
      footer={
        <>
          {Platform.OS === 'android' && <MeasurementRow />}
          <EraseControl onDone={onToast} />
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  eraseHeading: {
    marginBottom: SPACING.xs,
  },
  erasePill: {
    marginTop: SPACING.md,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: LAYOUT.controlHeight,
    paddingHorizontal: SPACING.lg,
    borderRadius: LAYOUT.controlHeight / 2,
    // Outlined, not filled: a destructive control should read as deliberate
    // rather than inviting.
    borderWidth: StyleSheet.hairlineWidth,
  },
});
