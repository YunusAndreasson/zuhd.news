import { File, Paths } from 'expo-file-system';
import Storage from 'expo-sqlite/kv-store';
import { ANALYTICS_EVENTS } from '../constants/analytics';
import { analytics } from './analytics';
import { cancelArrivals } from './arrival';
import { clearBookmarks } from './bookmark-store';
import { deleteBriefingAudio } from './briefing-audio';
import { clearBriefingProgress } from './briefing-progress';
import { resetDataUsage } from './data-usage';
import { feedCache } from './feed-source';
import { clearFirsts } from './firsts';
import { clearKnown } from './fresh-store';
import { rotateInstallId } from './install-id';
import { deleteLegacy, type LegacyCopy } from './legacy-store';
import { resetOnboarding } from './onboarding-store';
import { erasePublisherSession } from './publisher-session';
import { persister, queryClient } from './query-client';
import { clearRead } from './read-store';
import { orderStorageWork } from './store-plumbing';
import { resetReviewState } from './store-review';
import { eraseWidget } from './widget-store';

/**
 * Erase everything the app has stored about this reader's use of it.
 *
 * The privacy page tells the reader that all of it lives on their device and
 * none of it is uploaded. This is the control that makes that inspectable
 * rather than merely stated: they can empty it and watch the app start over.
 *
 * Deliberately NOT erased: display preferences (appearance, text size,
 * haptics) and the notification and measurement answers. Those are the reader's choices about
 * how the app should look and behave, not a record of what they read — and
 * silently resetting someone's text size is a hostile way to honour a privacy
 * request. The copy on the erase control says so.
 *
 * Every key listed here is also documented in the privacy page's "on this
 * device" section. If you add persistent state, add it to both.
 */
const KEYS = [
  'zuhd_last_seen', // when the app was last left; only a pre-`zuhd_known_v1` install reads it
  'zuhd_snapshot_etags_v1', // obsolete standalone snapshot tags
  'zuhd_known_v1', // which stories were already here, so new ones are marked new
  'zuhd_found_v1', // which stories were opened, from before the globe followed what was read
  'zuhd_review_count', // article snaps since the last rating prompt
  'zuhd_review_prompted', // when the rating prompt was last shown
  'zuhd_card_history_v1', // viewed-card history, written only by older builds
  'zuhd_firsts_v1', // whether a story was read and a briefing played yet (`firsts.ts`)
];

/**
 * Where builds before the kv store kept the same records: document files, and
 * the encrypted store, mostly under the kv keys' own names. Their migrations
 * delete each copy as they move it (`legacy-store.ts`), but one an older build
 * moved and left behind was moved straight back on the launch after an erase
 * — the review counters, the briefing's place and the last-seen time came
 * back that way until 2026-10-02. Never the preferences' or the notification
 * prompt's: the erase leaves those, as above.
 */
const LEGACY_COPIES: LegacyCopy[] = [
  { file: new File(Paths.document, 'zuhd-last-seen'), secureKey: 'zuhd_lastSeenAt' },
  { file: new File(Paths.document, 'zuhd-bookmarks.json') },
  { file: new File(Paths.document, 'zuhd-onboarding.json') },
  { file: new File(Paths.cache, 'query-cache.json') },
  { file: new File(Paths.cache, 'zuhd-opener.json') },
  { secureKey: 'zuhd_review_count' },
  { secureKey: 'zuhd_review_prompted' },
  { secureKey: 'zuhd_briefing_pos' },
  { secureKey: 'zuhd_briefing_date' },
];

export async function eraseLocalData(): Promise<void> {
  // In-memory stores first, so nothing flushes itself back over the cleared
  // keys afterwards.
  cancelArrivals();
  const widgetErased = eraseWidget();
  const cleared = [
    erasePublisherSession(),
    clearBookmarks(),
    clearKnown(),
    clearRead(),
    resetOnboarding(),
  ];
  clearFirsts();
  resetReviewState();
  resetDataUsage();
  queryClient.clear();
  // The briefing's downloaded audio, which the privacy page counts among
  // what nothing downloaded outlives.
  deleteBriefingAudio({ partials: true });

  await Promise.all([
    widgetErased,
    clearBriefingProgress(),
    persister.removeClient(),
    feedCache.clear(),
    orderStorageWork(async () => {
      const removed = await Promise.allSettled([
        ...KEYS.map((key) => Storage.removeItem(key)),
        ...LEGACY_COPIES.map((copy) => deleteLegacy(copy, true)),
      ]);
      const failed = removed.find((entry) => entry.status === 'rejected');
      if (failed) throw failed.reason;
    }),
  ]);
  if (cleared.some((success) => !success)) throw new Error('Could not erase all local data');
  // Analytics starts again under a new anonymous id and a new `install_id`,
  // the erase being the last event under the old ones. The install's record
  // of what it sent once (`install-record.ts`) stays: an erased install is
  // not a new one.
  void analytics.track(ANALYTICS_EVENTS.LOCAL_DATA_ERASED).then(() => {
    rotateInstallId();
    return analytics.reset();
  });
}
