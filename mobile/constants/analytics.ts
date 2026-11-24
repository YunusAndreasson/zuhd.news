/**
 * Mixpanel's project token and the events the app may send it
 * (`lib/analytics.ts`). Without a token nothing is sent.
 *
 * The token is public. Like the Sentry DSN (`lib/sentry.ts`) it lives in
 * app.json's `extra.mixpanelToken`, which reaches a store build and an OTA
 * update alike; `lib/analytics.ts` reads it there at first use. This, from
 * `EXPO_PUBLIC_MIXPANEL_TOKEN`, overrides it.
 */
export const MIXPANEL_TOKEN = process.env.EXPO_PUBLIC_MIXPANEL_TOKEN;

/** The project keeps its data in the EU, so events go to Mixpanel's EU endpoint. */
export const MIXPANEL_SERVER_URL = 'https://api-eu.mixpanel.com';

/**
 * A handful of product events, and none may say what anyone read: no slug,
 * title, country or search goes in a property. Events stay on Mixpanel's
 * anonymous device id; the app sends no user id. What each carries is
 * `AnalyticsEventProperties`, below.
 */
export const ANALYTICS_EVENTS = {
  /** A route, a platform sheet or a page of the menu came into view. */
  SCREEN_VIEWED: 'Screen Viewed',
  /** The app came to the foreground: the active-user event. A launch in the
   *  background is not one until the reader brings the app up. */
  APP_OPENED: 'App Opened',
  /** Once per install, on the first launch of a build with it: `install_kind`
   *  says whether the install is new or one that updated into it
   *  (`lib/install-record.ts`). Count new installs by `install_kind: 'new'`. */
  FIRST_OPEN: 'First Open',
  PUBLISHER_SESSION_CHECKPOINT: 'First Session Checkpoint',
  FIRST_SESSION_CLOSED: 'First Session Closed',
  PUBLISHER_OFFER_VIEWED: 'Publisher Offer Viewed',
  PUBLISHER_SETTINGS_OPENED: 'Publisher Settings Opened',
  PUBLISHER_REGISTRATION_VERIFIED: 'Publisher Registration Verified',
  PUBLISHER_OPT_IN_OBSERVED: 'Publisher Opt In Observed',
  /** Android only, a new install, once, unless ad measurement is off on the
   *  privacy page: the Play Store's install referrer, which says which link or ad brought the
   *  install (`lib/install-attribution.ts`). */
  INSTALL_ATTRIBUTION: 'Install Attribution',
  /** A new install reached the activation moment, once (`ACTIVATION` in
   *  `lib/install-record.ts`). Nothing beyond the super properties. */
  ACTIVATED: 'Activated',
  /** A tip pill came up; once a session for each. */
  ONBOARDING_STEP_VIEWED: 'Onboarding Step Viewed',
  /** None of the three tips is waiting any more: learned, waved away or worn out. */
  ONBOARDING_COMPLETED: 'Onboarding Completed',
  /** A tip was waved away before its lesson was done. */
  ONBOARDING_SKIPPED: 'Onboarding Skipped',
  /** The app's own ask came up: the notification primer. Builds before
   *  2026-11-21 also sent it for Android's ad measurement question. */
  PERMISSION_PROMPT_SHOWN: 'Permission Prompt Shown',
  /** The answer to an ask: the primer's or the settings toggle's (and, before
   *  2026-11-21, Android's ad measurement question's). */
  PERMISSION_RESULT: 'Permission Result',
  /** The reader turned notifications off in settings. */
  NOTIFICATIONS_TURNED_OFF: 'Notifications Turned Off',
  /** A push was tapped. Never its story or its date. */
  NOTIFICATION_OPENED: 'Notification Opened',
  /** A story grew to the whole sheet. Which story is not sent. */
  STORY_OPENED: 'Story Opened',
  /** The 1st, 3rd and 10th story newly read in a visit: at most three a visit. */
  STORIES_READ: 'Stories Read',
  /** A briefing began to play from a fresh load, once it was heard playing. */
  BRIEFING_STARTED: 'Briefing Started',
  /** A briefing played to its end. */
  BRIEFING_COMPLETED: 'Briefing Completed',
  /** The reader closed the player. */
  BRIEFING_STOPPED: 'Briefing Stopped',
  /** The share sheet closed for a story. Which story, and where it went, are not sent. */
  STORY_SHARED: 'Story Shared',
  /** A story was saved. Which story is not sent. */
  STORY_SAVED: 'Story Saved',
  WIDGET_OFFER_VIEWED: 'Widget Offer Viewed',
  WIDGET_SETUP_STARTED: 'Widget Setup Started',
  WIDGET_PRESENCE_VERIFIED: 'Widget Presence Verified',
  WIDGET_OPENED: 'Widget Opened',
  /** The reader erased the local data: the last event under the old id. */
  LOCAL_DATA_ERASED: 'Local Data Erased',
} as const;

/**
 * The events Mixpanel may receive. `analytics.track` takes this rather than
 * `string`, so an ad-hoc name is a compile error, not a row no dashboard reads.
 */
export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/** The three tips, in the order they are taught (`eligibleHint`). */
export type OnboardingStep = 'swipe' | 'globe' | 'masthead';
/** How long the app was away before a warm open. */
export type AwayBucket = '5m-1h' | '1-6h' | '6-24h' | '1d+';
export type PermissionKind = 'notifications' | 'ad_measurement';
/** The moment the notification primer came up at. */
export type PrimerSource =
  | 'opened_report'
  | 'paused_briefing'
  | 'finished_briefing'
  | 'later_briefing';
export type PermissionOutcome = 'granted' | 'denied' | 'dismissed' | 'unknown';
export type RegistrationStatus = 'removed' | 'pending' | 'failed' | 'accepted';
export type RegistrationReason =
  | 'enable'
  | 'reconnect'
  | 'rotation'
  | 'refresh'
  | 'disable'
  | 'retry';
export interface PublisherObservation {
  consent: boolean;
  briefing: boolean;
  breaking: boolean;
  registration: RegistrationStatus;
  effective: boolean;
  observed_at: number;
}
/** How a story came to be opened: on the map itself, from a push, a link or the menu. */
export type StoryOpenVia = 'card' | 'notification' | 'link' | 'menu';
export type NotificationType = 'briefing' | 'breaking' | 'other';
/** The share of a briefing heard when it was closed, in whole quarters. */
export type HeardPct = 0 | 25 | 50 | 75;
export type StoriesReadCount = 1 | 3 | 10;
/** `new`: this install began on a build with `First Open`. `existing`: it updated into one. */
export type InstallKind = 'new' | 'existing';
/** The raw referrer in 200-character parts, `referrer_0` first (Mixpanel cuts a string at 255 bytes). */
export type ReferrerParts = { [part: `referrer_${number}`]: string };

/**
 * What each event carries: closed sets and flags, and a screen's pattern.
 * `undefined` is an event with nothing. An event missing here fails the
 * typecheck at `analytics.track`.
 */
export interface AnalyticsEventProperties {
  /** `/` for the route, `/sheet/<sheet>`, `/menu/<page>`; never a country or a card's name. */
  [ANALYTICS_EVENTS.SCREEN_VIEWED]: { screen: `/${string}` };
  [ANALYTICS_EVENTS.APP_OPENED]: { launch: 'cold' } | { launch: 'warm'; away: AwayBucket };
  [ANALYTICS_EVENTS.FIRST_OPEN]: {
    install_kind: InstallKind;
    genuine_first_open?: boolean;
    flow_version?: number;
  };
  [ANALYTICS_EVENTS.PUBLISHER_SESSION_CHECKPOINT]: PublisherObservation & {
    active: boolean;
    away_since: number | null;
  };
  [ANALYTICS_EVENTS.FIRST_SESSION_CLOSED]: PublisherObservation & { closed_at: number };
  [ANALYTICS_EVENTS.PUBLISHER_OFFER_VIEWED]: { source: PrimerSource; stage: 'first' | 'later' };
  [ANALYTICS_EVENTS.PUBLISHER_SETTINGS_OPENED]: { source: PrimerSource };
  [ANALYTICS_EVENTS.PUBLISHER_REGISTRATION_VERIFIED]: {
    status: RegistrationStatus;
    reason: RegistrationReason;
    observed_at: number;
  };
  [ANALYTICS_EVENTS.PUBLISHER_OPT_IN_OBSERVED]: PublisherObservation;
  /** Never decoded or parsed: marketer reads the parts joined. */
  [ANALYTICS_EVENTS.INSTALL_ATTRIBUTION]: ReferrerParts;
  [ANALYTICS_EVENTS.ACTIVATED]: undefined;
  /** `index` is the step's place in the order, from 0. */
  [ANALYTICS_EVENTS.ONBOARDING_STEP_VIEWED]: { step: OnboardingStep; index: number };
  [ANALYTICS_EVENTS.ONBOARDING_COMPLETED]: undefined;
  /** `tap`: the pill itself was tapped away. `swipe`: the reader moved on under it. */
  [ANALYTICS_EVENTS.ONBOARDING_SKIPPED]: { at_step: OnboardingStep; how: 'tap' | 'swipe' };
  [ANALYTICS_EVENTS.PERMISSION_PROMPT_SHOWN]: {
    permission: PermissionKind;
    primed: boolean;
    source?: PrimerSource;
  };
  /** `primed`: the app's own ask came first. `os_prompt`: the system's dialog
   *  could appear, so `granted` answered it. `source` is the primer's only. */
  [ANALYTICS_EVENTS.PERMISSION_RESULT]: {
    permission: PermissionKind;
    granted: boolean;
    primed: boolean;
    os_prompt: boolean;
    outcome?: PermissionOutcome;
    source?: PrimerSource;
  };
  [ANALYTICS_EVENTS.NOTIFICATIONS_TURNED_OFF]: undefined;
  [ANALYTICS_EVENTS.NOTIFICATION_OPENED]: { type: NotificationType };
  [ANALYTICS_EVENTS.STORY_OPENED]: { via: StoryOpenVia };
  /** `first_time`: the first visit in which this install read a story. */
  [ANALYTICS_EVENTS.STORIES_READ]: { count: StoriesReadCount; first_time: boolean };
  /** `resumed`: from a place saved in an earlier play. `first_time`: this install's first. */
  [ANALYTICS_EVENTS.BRIEFING_STARTED]: {
    resumed: boolean;
    first_time: boolean;
    source?: BriefingOpenSource;
  };
  [ANALYTICS_EVENTS.BRIEFING_COMPLETED]: undefined;
  [ANALYTICS_EVENTS.BRIEFING_STOPPED]: { heard_pct: HeardPct };
  /** Android reports every close of its share sheet as shared. */
  [ANALYTICS_EVENTS.STORY_SHARED]: { completed: boolean };
  [ANALYTICS_EVENTS.STORY_SAVED]: undefined;
  [ANALYTICS_EVENTS.WIDGET_OFFER_VIEWED]: { source: 'menu' };
  [ANALYTICS_EVENTS.WIDGET_SETUP_STARTED]: {
    source: 'menu';
    method: 'ios_guide' | 'android_guide' | 'android_pin';
  };
  [ANALYTICS_EVENTS.WIDGET_PRESENCE_VERIFIED]: {
    state: 'present' | 'absent' | 'unknown';
    accessory: 'present' | 'absent' | 'unknown';
    via: 'ios_configurations' | 'android_provider_ids';
    observed_at: number;
    sequence: number;
  };
  [ANALYTICS_EVENTS.WIDGET_OPENED]: { target: 'briefing' | 'edition' | 'open' };
  [ANALYTICS_EVENTS.LOCAL_DATA_ERASED]: undefined;
}

/**
 * Super properties: sent with every event, so retention can be split by them
 * on Mixpanel's free plan. `lib/analytics.ts` keeps them and puts them back
 * after a reset, which wipes them.
 */
export type SuperProperties = {
  /**
   * A random UUID made once per install (`lib/install-id.ts`), the one join
   * between an install's events. `lib/analytics.ts` registers it before the
   * first event of a launch and again after a reset. Mixpanel only: never
   * Meta, Sentry or zuhd's own server. An erase replaces it (`wipe.ts`).
   */
  install_id?: string;
  /** The day this install was first opened, `YYYY-MM-DD` in UTC. */
  install_date?: string;
  /** Notifications on in the app and allowed by the OS: whether a push can reach this reader. */
  notifications_enabled?: boolean;
  /** Android only: ad measurement is on (it is unless turned off on the privacy page). */
  ad_measurement?: boolean;
};

export type BriefingOpenSource = 'briefing_push' | 'widget' | 'widget_preview';
