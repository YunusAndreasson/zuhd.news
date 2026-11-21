import { Platform } from 'react-native';
import { ANALYTICS_EVENTS, type ReferrerParts } from '../constants/analytics';
import { analytics } from './analytics';
import { attributionDue, noteReferrerFailure, settleAttribution } from './install-record';
import { isMeasurementOn } from './measurement';

/**
 * `Install Attribution`: which link or ad brought a new Android install, as the
 * Play Store's install referrer reports it, sent to Mixpanel once. A Meta ad
 * puts an encrypted ad id in it, a marketer link a `utm_campaign`; the app
 * sends the raw string and never reads it.
 *
 * Linking an install to an ad is ad measurement, so it follows the privacy
 * page's switch (`isMeasurementOn`): sent at launch, never while the switch is
 * off, and when it is turned back on. iOS has no referrer and sends nothing.
 *
 * It goes to Mixpanel alone, with the super properties (`install_id` among
 * them). Meta's SDK gets nothing from here: it reads its own referrer.
 *
 * A failed or timed-out read is tried on a later launch, `MAX_REFERRER_READS`
 * in all. An empty referrer is an answer: nothing to attribute, now or later.
 */

/** Mixpanel cuts a string property at 255 bytes; the contract is 200 characters a part. */
const REFERRER_PART_LENGTH = 200;
/** The read goes to the Play Store, over a service connection. */
const REFERRER_READ_TIMEOUT_MS = 10_000;
const MAX_REFERRER_READS = 3;

/** One read a launch: a later launch is the retry, not a toggled answer. */
let attempted = false;
let inFlight: Promise<void> | null = null;

/** `referrer_0`, `referrer_1`, …: the raw string, neither decoded nor parsed. */
export function splitReferrer(referrer: string): ReferrerParts {
  const parts: ReferrerParts = {};
  for (let start = 0; start < referrer.length; start += REFERRER_PART_LENGTH) {
    parts[`referrer_${start / REFERRER_PART_LENGTH}`] = referrer.slice(
      start,
      start + REFERRER_PART_LENGTH,
    );
  }
  return parts;
}

/** Loaded on first use, on Android only: iOS and Jest never touch the module. */
function readReferrer(): Promise<string> {
  const Application = require('expo-application') as typeof import('expo-application');
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('The install referrer did not answer')),
      REFERRER_READ_TIMEOUT_MS,
    );
    Application.getInstallReferrerAsync().then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function attempt(): Promise<void> {
  let referrer: string;
  try {
    referrer = await readReferrer();
  } catch {
    noteReferrerFailure(MAX_REFERRER_READS);
    return;
  }
  // The reader may have turned it off while the Play Store answered.
  if (!isMeasurementOn()) {
    attempted = false;
    return;
  }
  // expo-application stringifies a null referrer, so that arrives as the word.
  const hasReferrer = referrer !== '' && referrer !== 'null';
  if (settleAttribution() && hasReferrer) {
    void analytics.track(ANALYTICS_EVENTS.INSTALL_ATTRIBUTION, splitReferrer(referrer));
  }
}

/**
 * Send `Install Attribution` if it is due and measurement is on. Called at
 * launch and whenever the switch changes. Never throws.
 */
export function sendInstallAttribution(): Promise<void> {
  if (Platform.OS !== 'android' || !isMeasurementOn()) return Promise.resolve();
  if (inFlight) return inFlight;
  if (attempted || !attributionDue()) return Promise.resolve();
  attempted = true;
  inFlight = attempt()
    .catch(() => {
      // Never worth surfacing to a reader.
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
