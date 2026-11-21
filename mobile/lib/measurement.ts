import Storage from 'expo-sqlite/kv-store';
import { LogBox, Platform } from 'react-native';
import { createListeners } from './store-plumbing';

/**
 * Ad measurement: Meta's SDK, on Android, unless the reader has turned it off
 * on the privacy page. Nothing asks: the owner's call (2026-11-21), as Open
 * Arabic does.
 *
 * Only `startMeasurement` starts it. The manifest turns off auto-init,
 * auto-logging and advertising ID collection (`plugins/with-meta-android.js`),
 * and until `initializeSDK` runs no request of the SDK's gets a response. The
 * iOS build does not contain the SDK (`expo.autolinking.ios.exclude`).
 *
 * The stored answer is the only input: none is on, a no is off. Builds before
 * 2026-11-21 asked at first launch and stored a dismissal as a no; those stay
 * off. The app logs no event of its own: what
 * Meta receives is the SDK's own install and open, so nothing here can say what
 * anyone read. Don't add `logEvent`, `setUserID` or `setUserData`. Meta's SDK 19
 * adds a screen's title to every event, so the Android SDK stays on 18 until
 * `AutoLogMetaDataEnabled` is turned off in the manifest.
 *
 * The SDK's settings persist natively, which is what makes a withdrawal last. A
 * process that started the SDK cannot wholly undo it, so `stop` also holds the
 * queue: what is held goes out only if the reader turns it on again, and a
 * later launch delivers nothing, because nothing initializes the SDK.
 */

const CONSENT_KEY = 'zuhd_measurement_consent_v1';
/** Never bump: a stored answer to other words counts as none, and none is on,
 *  so a bump would turn every reader's off back on. */
const CONSENT_VERSION = 1;

interface MetaSettings {
  initializeSDK(): void;
  setAutoLogAppEventsEnabled(enabled: boolean): void;
  setAdvertiserIDCollectionEnabled(enabled: boolean): void;
}

interface MetaLogger {
  setFlushBehavior(behavior: 'auto' | 'explicit_only'): void;
  flush(): void;
}

// react-native-fbsdk-next reads a native constant as this module loads, and that
// throws if the SDK has not settled. The throw is caught below, but Android also
// reports it to LogBox, as a full red screen in development.
LogBox.ignoreLogs(["Exception in HostObject::get for prop 'FBAppEventsLogger'"]);

const listeners = createListeners();
let answer: boolean | null | undefined;
let started = false;
let queueHeld = false;

/** Whatever cannot be read as an answer to these words is no answer. */
function readAnswer(): boolean | null {
  try {
    const raw = Storage.getItemSync(CONSENT_KEY);
    if (raw === null) return null;
    const stored = JSON.parse(raw) as { allowed?: unknown; version?: unknown };
    return stored.version === CONSENT_VERSION && typeof stored.allowed === 'boolean'
      ? stored.allowed
      : null;
  } catch {
    return null;
  }
}

/** On, off, or `null` for never set: what the privacy page's switch stored. */
export function getMeasurementAnswer(): boolean | null {
  if (answer === undefined) answer = readAnswer();
  return answer;
}

/** Whether Meta's SDK may run: Android, unless the reader turned it off. */
export function isMeasurementOn(): boolean {
  return Platform.OS === 'android' && getMeasurementAnswer() !== false;
}

export const subscribeMeasurement = listeners.subscribe;

// Each loads only its own module: the package's index evaluates every export,
// the login tracker among them. Loaded on first use, so a reader who turned it
// off never touches the native SDK from here.
function loadSettings(): MetaSettings {
  return require('react-native-fbsdk-next/lib/commonjs/FBSettings').default as MetaSettings;
}

function loadLogger(): MetaLogger | null {
  try {
    return require('react-native-fbsdk-next/lib/commonjs/FBAppEventsLogger').default as MetaLogger;
  } catch {
    return null;
  }
}

/** Switch the SDK on, unless the reader turned it off. Called at launch and
 *  when the switch goes on. */
export function startMeasurement(): void {
  if (started || !isMeasurementOn()) return;
  // Before the work: a throw must not retry on every launch path.
  started = true;
  try {
    const settings = loadSettings();
    // Set first: the next flush after `initializeSDK` may already be sending.
    settings.setAutoLogAppEventsEnabled(true);
    settings.setAdvertiserIDCollectionEnabled(true);
    settings.initializeSDK();
    const logger = loadLogger();
    if (queueHeld) {
      queueHeld = false;
      logger?.setFlushBehavior('auto');
    }
    // The launch was logged natively before JS came up, and went back to disk.
    // A reader who only reads raises nothing else that would send it.
    logger?.flush();
  } catch {
    // Not linked (Jest, a build without the plugin). Measurement is never worth
    // surfacing to a reader.
  }
}

function stopMeasurement(): void {
  if (Platform.OS !== 'android') return;
  const wasStarted = started;
  started = false;
  try {
    const settings = loadSettings();
    settings.setAutoLogAppEventsEnabled(false);
    settings.setAdvertiserIDCollectionEnabled(false);
    if (wasStarted) {
      queueHeld = true;
      loadLogger()?.setFlushBehavior('explicit_only');
    }
  } catch {
    // Not linked: nothing is running to stop.
  }
}

/** Record the switch, and act on it. In force from this call, whether or not
 *  the write lands; a failed write of an off holds for this launch only. */
export function setMeasurementAnswer(allowed: boolean): void {
  const wasOn = isMeasurementOn();
  answer = allowed;
  try {
    Storage.setItemSync(
      CONSENT_KEY,
      JSON.stringify({ allowed, version: CONSENT_VERSION, decidedAt: new Date().toISOString() }),
    );
  } catch {
    // Held in memory for this launch.
  }
  if (allowed) startMeasurement();
  // An off on a phone where it was never on makes no call to the SDK at all.
  else if (wasOn) stopMeasurement();
  listeners.emit();
}
