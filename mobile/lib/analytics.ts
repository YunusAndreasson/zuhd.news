import type * as MixpanelModule from 'mixpanel-react-native';
import {
  type AnalyticsEventName,
  MIXPANEL_SERVER_URL,
  MIXPANEL_TOKEN,
} from '../constants/analytics';

/**
 * Product analytics through Mixpanel. Never throws: an analytics failure must
 * not reach a reader. No token (dev, tests) is a silent no-op.
 *
 * Anonymous by design: no `identify`, no people profile, no user id in a
 * property, so events stay on Mixpanel's anonymous device id. Mixpanel's own
 * IP geolocation (city, region, country) is left on. Automatic events are off;
 * only `ANALYTICS_EVENTS` are sent.
 */

type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

let mixpanelInstance: MixpanelModule.Mixpanel | null = null;

async function startMixpanel(token: string): Promise<void> {
  // Loaded on first use, so a build or test without the token never touches
  // the native module.
  const { Mixpanel } = require('mixpanel-react-native') as typeof MixpanelModule;
  const trackAutomaticEvents = false;
  const instance = new Mixpanel(token.trim(), trackAutomaticEvents);
  const optOutTrackingDefault = false;
  await instance.init(optOutTrackingDefault, {}, MIXPANEL_SERVER_URL);
  // Published only once initialized.
  mixpanelInstance = instance;
}

/**
 * The one initialization in flight or done. A promise, not a flag: concurrent
 * first calls would each see an unset flag and start their own instance.
 */
let initialization: Promise<void> | null = null;

/** The env override, else app.json's `extra.mixpanelToken` (`constants/analytics.ts`). */
function resolveToken(): string | undefined {
  if (MIXPANEL_TOKEN) return MIXPANEL_TOKEN;
  try {
    // Loaded on first use, like the SDK: the module is native-backed.
    const Constants = (require('expo-constants') as typeof import('expo-constants')).default;
    const token: unknown = Constants.expoConfig?.extra?.mixpanelToken;
    return typeof token === 'string' && token ? token : undefined;
  } catch {
    return undefined;
  }
}

function initializeMixpanel(): Promise<void> {
  if (initialization) return initialization;
  const token = resolveToken();
  if (!token) return Promise.resolve();
  initialization = startMixpanel(token).catch(() => {
    // Forgotten, so a later call tries again.
    initialization = null;
  });
  return initialization;
}

export const analytics = {
  /** Send one of `ANALYTICS_EVENTS`. Resolves whatever happens. */
  async track(event: AnalyticsEventName, properties?: AnalyticsProperties): Promise<void> {
    try {
      await initializeMixpanel();
      mixpanelInstance?.track(event, properties);
    } catch {
      // Analytics is never worth surfacing to a reader.
    }
  },

  /** Start a new anonymous id. For an erase of the reader's data. */
  async reset(): Promise<void> {
    try {
      await initializeMixpanel();
      mixpanelInstance?.reset();
    } catch {
      // As above.
    }
  },
};
