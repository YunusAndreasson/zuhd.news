import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

/**
 * Crash and error reporting. Imported first, from `index.js`, so a throw while
 * Router evaluates the screens is caught too.
 *
 * Off without a DSN and in development: a dev build reports to the same project
 * as the store build, and a Fast Refresh artifact would read like a reader's
 * crash. Nothing here may say what anyone read: no screenshot, no view
 * hierarchy, no console or request breadcrumbs, and no request URL, which can
 * carry a story's slug. Native crashes are stored and sent on the next launch.
 */
// The DSN is public. It lives in app.json's `extra`, which reaches a store build
// and an OTA update alike; eas.json's build env would not reach `eas update`.
// `EXPO_PUBLIC_SENTRY_DSN` overrides it.
const configuredDsn: unknown = Constants.expoConfig?.extra?.sentryDsn;
const dsn =
  process.env.EXPO_PUBLIC_SENTRY_DSN ||
  (typeof configuredDsn === 'string' ? configuredDsn : undefined);
export const sentryEnabled = Boolean(dsn && !__DEV__);

/** Registered against the Router's container in `app/_layout.tsx`. */
export const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: false,
});

if (sentryEnabled) {
  Sentry.init({
    dsn,
    environment: Updates.channel || 'production',
    // `sendDefaultPii` and `dataCollection` both unset keep the SDK on its
    // no-PII mapping; setting `dataCollection` at all starts from
    // collect-everything defaults.
    enableNative: true,
    enableNativeCrashHandling: true,
    enableWatchdogTerminationTracking: true,
    attachScreenshot: false,
    attachViewHierarchy: false,
    enableLogs: false,
    enableUserInteractionTracing: false,
    enableNetworkBreadcrumbs: false,
    enableAutoBreadcrumbTracking: false,
    enableCaptureFailedRequests: false,
    tracesSampleRate: 0.1,
    // No trace headers on the news requests: the server is not ours to correlate.
    tracePropagationTargets: [],
    integrations: [
      navigationIntegration,
      Sentry.breadcrumbsIntegration({
        console: false,
        fetch: false,
        xhr: false,
        dom: false,
        history: false,
        sentry: false,
      }),
    ],
    // Route changes only: the app has one route, so they name no story.
    beforeBreadcrumb: (breadcrumb) => (breadcrumb.category === 'navigation' ? breadcrumb : null),
    beforeSend: (event) => {
      delete event.user;
      delete event.request;
      delete event.extra;
      return event;
    },
    // A request span carries its URL, and a story's URL names the story.
    beforeSendTransaction: (event) => {
      event.spans = event.spans?.filter((span) => !span.op?.startsWith('http'));
      return event;
    },
  });
  Sentry.setTags({
    app: 'zuhd-news',
    expo_update_id: Updates.updateId ?? 'embedded',
    expo_runtime_version: Updates.runtimeVersion ?? 'unknown',
    expo_is_embedded: String(Updates.isEmbeddedLaunch),
  });
}
