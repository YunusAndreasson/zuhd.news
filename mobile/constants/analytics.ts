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
 * anonymous device id; the app sends no user id.
 */
export const ANALYTICS_EVENTS = {
  /** A route came into view. `screen` is the route's pattern, never its params. */
  SCREEN_VIEWED: 'Screen Viewed',
  /** A briefing began to play from a fresh load. */
  BRIEFING_STARTED: 'Briefing Started',
  /** The share sheet was opened for a story. Which story is not sent. */
  STORY_SHARED: 'Story Shared',
  /** The answer to the notification permission ask. `granted` is the answer. */
  NOTIFICATIONS_ANSWERED: 'Notifications Answered',
} as const;

/**
 * The events Mixpanel may receive. `analytics.track` takes this rather than
 * `string`, so an ad-hoc name is a compile error, not a row no dashboard reads.
 */
export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
