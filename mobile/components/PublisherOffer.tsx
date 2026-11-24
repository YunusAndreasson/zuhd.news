import {
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { AccessibilityInfo, AppState, StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  ANALYTICS_EVENTS,
  type PermissionOutcome,
  type PrimerSource,
} from '../constants/analytics';
import { SPACING } from '../constants/theme';
import { useOffline } from '../hooks/useOffline';
import { usePreferences, useTheme } from '../hooks/useTheme';
import { analytics } from '../lib/analytics';
import { announce } from '../lib/announce';
import {
  notificationPermissionUndetermined,
  openNotificationSettings,
  publisherDelivery,
  registerPushToken,
} from '../lib/notifications';
import { getSnapshot, subscribe as onboardingChanges } from '../lib/onboarding-store';
import {
  beginPublisherSettings,
  cancelPublisherSettings,
  historyChanges,
  localDay,
  offerHistory,
  publisherVisit,
  saveOffer,
} from '../lib/publisher-history';
import { type OfferEntry, offerEdition, offerStage, resultText } from '../lib/publisher-offer';
import { publisherChanges, publisherEnabled, publisherSnapshot } from '../lib/publisher-state';
import { Icon, Pressable, Text } from './primitives';

export interface PrimerAction {
  source: PrimerSource;
  enable: () => Promise<void>;
  restore: () => void;
}
export const OfferContext = createContext<{
  present: (action: PrimerAction) => void;
  edition: string;
  obscured: boolean;
  storyTop: number;
  storyBottom: number;
} | null>(null);

const SCOPE = 'One alert per briefing, plus breaking news as it happens.';

export function PublisherOffer(entry: OfferEntry) {
  const { source } = entry;
  const host = use(OfferContext);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { colors } = useTheme();
  const { preferences, setNotifications } = usePreferences();
  const consent = preferences.notifications;
  const state = useSyncExternalStore(publisherChanges.subscribe, publisherSnapshot);
  const offline = useOffline();
  const target = useRef<React.ComponentRef<typeof View>>(null);
  const actionTarget = useRef<React.ComponentRef<typeof View>>(null);
  const [stage, setStage] = useState<'first' | 'later' | null>(null);
  const [mode, setMode] = useState<'prompt' | 'direct' | 'blocked' | null>(null);
  const [answer, setAnswer] = useState<PermissionOutcome>();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [settingsVisited, setSettingsVisited] = useState(false);
  const [settingsError, setSettingsError] = useState(false);
  const edition = offerEdition(entry, host?.edition ?? '');
  const history = useSyncExternalStore(historyChanges.subscribe, offerHistory);
  const candidate = offerStage(history, source, edition, localDay(), publisherVisit(), consent);
  const onboarding = useSyncExternalStore(onboardingChanges, getSnapshot);
  const enrolled = onboarding.publisherCohort === true;
  const visibleStage = enrolled && !history.disabled ? (stage ?? candidate) : null;
  const later = visibleStage === 'later';
  const origin = later ? 'later_briefing' : source;
  useEffect(() => {
    if (!visibleStage || offline) return;
    let live = true;
    const resolve = async () => {
      const prompt = await notificationPermissionUndetermined();
      const delivery = await publisherDelivery();
      if (live)
        setMode(prompt ? 'prompt' : delivery.briefing || delivery.breaking ? 'direct' : 'blocked');
    };
    void resolve();
    const sub = AppState.addEventListener('change', (value) => {
      if (value === 'active') void resolve();
    });
    return () => {
      live = false;
      sub.remove();
    };
  }, [visibleStage, offline]);

  const claim = useCallback(() => {
    if (!enrolled) return false;
    if (stage) return true;
    const next = offerStage(offerHistory(), source, edition, localDay(), publisherVisit(), consent);
    if (!next) return false;
    saveOffer(next === 'later' ? { laterShown: true } : { shown: true });
    setStage(next);
    void analytics.track(ANALYTICS_EVENTS.PUBLISHER_OFFER_VIEWED, {
      source: next === 'later' ? 'later_briefing' : source,
      stage: next,
    });
    return true;
  }, [consent, edition, enrolled, source, stage]);

  // A deck neighbour, an offscreen row at large type and a background finish
  // cannot spend the install's invitation. Stop measuring once it was seen.
  useEffect(() => {
    if (!host || host.obscured || !visibleStage || stage || !mode || offline) return;
    let live = true;
    const measure = () =>
      target.current?.measureInWindow((x, y, width, height) => {
        const story = source === 'opened_report';
        if (
          live &&
          AppState.currentState === 'active' &&
          x < screenWidth &&
          x + width > 0 &&
          y < screenHeight &&
          y + height > 0 &&
          width > 0 &&
          height > 0 &&
          (!story || (y + height > host.storyTop && y < host.storyBottom))
        ) {
          live = false;
          claim();
        }
      });
    measure();
    const timer = setInterval(measure, 350);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [host, visibleStage, stage, mode, offline, source, claim, screenWidth, screenHeight]);

  const enable = async (primed: boolean) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await setNotifications(true, {
        primed,
        source: origin,
        onAnswer: (result) => {
          setAnswer(result);
          if (result === 'denied')
            saveOffer({ refusal: { edition, day: localDay(), visit: publisherVisit() } });
        },
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const restore = () => {
    const node = actionTarget.current ?? target.current;
    if (node) AccessibilityInfo.sendAccessibilityEvent(node, 'focus');
  };
  const press = () => {
    if (busyRef.current || !claim()) return;
    if (later || mode === 'blocked') {
      const trip = beginPublisherSettings(origin);
      void analytics.track(ANALYTICS_EVENTS.PUBLISHER_SETTINGS_OPENED, { source: origin });
      setSettingsVisited(true);
      void openNotificationSettings().catch(() => {
        setSettingsVisited(false);
        cancelPublisherSettings(trip);
        setSettingsError(true);
      });
    } else if (mode === 'direct') void enable(false);
    else host?.present({ source: origin, enable: () => enable(true), restore });
  };
  let label: string | null = null;
  let note: string | null = null;
  let action: (() => void) | undefined;
  const recovering =
    enrolled && consent && source === history.origin && state.status !== 'accepted';
  if ((visibleStage || recovering) && host) {
    if (consent || answer === 'granted') {
      if (publisherEnabled(consent, state)) {
        note =
          state.delivery.breaking && state.delivery.briefing
            ? 'Publisher alerts on'
            : state.delivery.briefing
              ? 'Briefing alerts on'
              : 'Breaking news alerts on';
      } else if (state.deliveryChecked && !state.delivery.briefing && !state.delivery.breaking) {
        note = 'News alerts off';
      } else if (state.status === 'failed') {
        note = 'Couldn’t enable alerts.';
        label = 'Try again';
        action = () => {
          void registerPushToken(undefined, 'retry', offerHistory().generation);
        };
      } else if (state.status === 'accepted') note = 'News alerts off';
      else note = 'Turning on alerts. We’ll retry automatically.';
    } else if (settingsVisited) note = 'News alerts off';
    else if (answer) note = resultText(answer);
    else if (offline) note = 'Publisher alerts are available when you’re online.';
    else if (mode) {
      note = settingsError
        ? 'Couldn’t open notification settings.'
        : later || mode !== 'prompt'
          ? SCOPE
          : null;
      label = later || mode === 'blocked' ? 'Review notification settings' : 'Get news alerts';
      action = press;
    }
  }
  useEffect(() => {
    if (answer && note) announce(note, { queue: true, liveRegion: true });
  }, [answer, note]);
  if (!label && !note) return null;
  return (
    <View
      ref={target}
      collapsable={false}
      style={[styles.frame, { borderColor: colors.rule }]}
      accessible={!label}
      accessibilityLiveRegion="polite"
    >
      {later && !consent && !settingsVisited ? (
        <Text variant="labelXs" tone="secondary">
          News alerts off
        </Text>
      ) : null}
      {note ? (
        <Text variant="body" tone="secondary" maxFontSizeMultiplier={0}>
          {note}
        </Text>
      ) : null}
      {label && action ? (
        <Pressable
          ref={actionTarget}
          onPress={action}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityHint={note ?? undefined}
          style={styles.row}
        >
          <Text
            variant="bodyEmphasis"
            tone="emphasis"
            maxFontSizeMultiplier={0}
            style={styles.word}
          >
            {label}
          </Text>
          <Icon name="chevron-forward" size="sm" tone="secondary" />
        </Pressable>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  frame: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: SPACING.xxl,
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  row: { minHeight: SPACING.xxl, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  word: { flex: 1 },
});
