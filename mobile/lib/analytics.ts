import type * as MixpanelModule from 'mixpanel-react-native';
import {
  type AnalyticsEventName,
  type AnalyticsEventProperties,
  MIXPANEL_SERVER_URL,
  MIXPANEL_TOKEN,
  type SuperProperties,
} from '../constants/analytics';
import { getInstallId } from './install-id';

/**
 * Product analytics through Mixpanel. Never throws: an analytics failure must
 * not reach a reader. No token (dev, tests) is a silent no-op.
 *
 * Anonymous by design: no `identify`, no people profile, no user id in a
 * property, so events stay on Mixpanel's anonymous device id. Mixpanel's own
 * IP geolocation (city, region, country) is left on. Automatic events are off;
 * only `ANALYTICS_EVENTS` are sent, each with its own properties
 * (`AnalyticsEventProperties`).
 *
 * Every event carries `install_id` (`install-id.ts`): it is registered as
 * Mixpanel starts, before any event can go out, and put back after a reset.
 */

/** The event's properties, or nothing for an event that has none. */
type PropertiesArg<E extends AnalyticsEventName> = AnalyticsEventProperties[E] extends undefined
  ? []
  : [properties: AnalyticsEventProperties[E]];

let mixpanelInstance: MixpanelModule.Mixpanel | null = null;

/**
 * The super properties this run has registered. A reset wipes Mixpanel's
 * copy, and a register before Mixpanel has started has nowhere to go yet, so
 * these are what both put back.
 */
const registered: SuperProperties = {};
const registeredOnce: SuperProperties = {};

function applySuperProperties(instance: MixpanelModule.Mixpanel): void {
  // Read each time: an erase replaces it just before its reset.
  const installId = getInstallId();
  if (installId) registered.install_id = installId;
  if (Object.keys(registeredOnce).length > 0) {
    instance.registerSuperPropertiesOnce({ ...registeredOnce });
  }
  if (Object.keys(registered).length > 0) instance.registerSuperProperties({ ...registered });
}

async function startMixpanel(token: string): Promise<void> {
  // Loaded on first use, so a build or test without the token never touches
  // the native module.
  const { Mixpanel } = require('mixpanel-react-native') as typeof MixpanelModule;
  const trackAutomaticEvents = false;
  const instance = new Mixpanel(token.trim(), trackAutomaticEvents);
  const optOutTrackingDefault = false;
  await instance.init(optOutTrackingDefault, {}, MIXPANEL_SERVER_URL);
  // Before it is published, so no event goes out without them.
  applySuperProperties(instance);
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
  async track<E extends AnalyticsEventName>(event: E, ...args: PropertiesArg<E>): Promise<void> {
    try {
      await initializeMixpanel();
      mixpanelInstance?.track(event, args[0]);
    } catch {
      // Analytics is never worth surfacing to a reader.
    }
  },

  /** Send these with every event from now on, replacing what they were. */
  async register(properties: SuperProperties): Promise<void> {
    Object.assign(registered, properties);
    try {
      await initializeMixpanel();
      mixpanelInstance?.registerSuperProperties({ ...properties });
    } catch {
      // As above.
    }
  },

  /** As `register`, but a property already set keeps its value. */
  async registerOnce(properties: SuperProperties): Promise<void> {
    Object.assign(registeredOnce, { ...properties, ...registeredOnce });
    try {
      await initializeMixpanel();
      mixpanelInstance?.registerSuperPropertiesOnce({ ...properties });
    } catch {
      // As above.
    }
  },

  /**
   * Start a new anonymous id. For an erase of the reader's data. What was
   * queued goes first, under the id it was recorded with, and the super
   * properties are put back: they say how the app is set up, not who read.
   */
  async reset(): Promise<void> {
    try {
      await initializeMixpanel();
      const instance = mixpanelInstance;
      if (!instance) return;
      instance.flush();
      instance.reset();
      applySuperProperties(instance);
    } catch {
      // As above.
    }
  },
};
