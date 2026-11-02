import Storage from 'expo-sqlite/kv-store';
import { LogBox, Platform } from 'react-native';
import { createListeners } from './store-plumbing';

/**
 * Ad measurement: Meta's SDK, on Android, once the reader has said yes.
 *
 * Nothing else starts it. The manifest turns off auto-init, auto-logging and
 * advertising ID collection (`plugins/with-meta-android.js`), and until
 * `initializeSDK` runs no request of the SDK's gets a response. The iOS build
 * does not contain the SDK (`expo.autolinking.ios.exclude`).
 *
 * The reader's answer is the only input. The app logs no event of its own: what
 * Meta receives is the SDK's own install and open, so nothing here can say what
 * anyone read. Don't add `logEvent`, `setUserID` or `setUserData`. Meta's SDK 19
 * adds a screen's title to every event, so the Android SDK stays on 18 until
 * `AutoLogMetaDataEnabled` is turned off in the manifest.
 *
 * The SDK's settings persist natively, which is what makes a withdrawal last. A
 * process that started the SDK cannot wholly undo it, so `stop` also holds the
 * queue: what is held goes out only if the reader says yes again, and a later
 * launch delivers nothing, because nothing initializes the SDK.
 */

const CONSENT_KEY = 'zuhd_measurement_consent_v1';
/** Bump with the wording: a stored answer to other words counts as no answer. */
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

/** Yes, no, or `null` for not asked. A reader on iOS is never asked. */
export function getMeasurementAnswer(): boolean | null {
  if (answer === undefined) answer = readAnswer();
  return answer;
}

export const subscribeMeasurement = listeners.subscribe;

/** Asked once, at a new reader's first launch: an existing reader's install is
 *  long past measuring, and has the row on the privacy page. */
export function shouldAskForMeasurement(storiesSwiped: number): boolean {
  return Platform.OS === 'android' && storiesSwiped === 0 && getMeasurementAnswer() === null;
}

// Each loads only its own module: the package's index evaluates every export,
// the login tracker among them. Loaded on first use, after consent, so a reader
// who says no never touches the native SDK from here.
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

/** Switch the SDK on, if the reader has said yes. Called at launch and on a yes. */
export function startMeasurement(): void {
  if (Platform.OS !== 'android' || started || getMeasurementAnswer() !== true) return;
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

/** Record the reader's answer, and act on it. In force from this call, whether
 *  or not the write lands; a failed write asks again, the safe way round. */
export function setMeasurementAnswer(allowed: boolean): void {
  const hadYes = getMeasurementAnswer() === true;
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
  // A "no" on a phone that never said yes makes no call to the SDK at all.
  else if (hadYes) stopMeasurement();
  listeners.emit();
}
