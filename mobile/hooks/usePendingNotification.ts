import type { Category, FeedResponse, GroupedArticles } from '@shared/types';
import * as Notifications from 'expo-notifications';
import { useEffect, useEffectEvent, useRef } from 'react';
import { ANALYTICS_EVENTS } from '../constants/analytics';
import { CATEGORIES } from '../constants/theme';
import { analytics } from '../lib/analytics';
import { getSnapshot as getBookmarks } from '../lib/bookmark-store';
import { isIsoDate } from '../lib/data-freshness';

interface BriefingTap {
  verify: () => Promise<FeedResponse>;
  generated: string | null;
  play: (audio: NonNullable<FeedResponse['briefing']>) => void;
  unavailable: () => void;
}

/** A briefing alert addresses the publisher’s UTC edition. The clock used to
 * paint the splash and the cached feed cannot decide the fate of that tap. */
export function usePendingNotification(
  loading: boolean,
  grouped: GroupedArticles,
  onSelectArticle: (slug: string, category: Category) => void,
  briefing?: BriefingTap,
): void {
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<typeof response>(null);
  const undated = useRef<{ response: typeof response; day: string | null } | null>(null);
  const verify = briefing?.verify;
  const generated = briefing?.generated;
  const deliver = useEffectEvent((audio: FeedResponse['briefing']) => {
    if (audio) briefing?.play(audio);
    else briefing?.unavailable();
  });

  useEffect(() => {
    if (!response || handled.current === response || !verify) return;
    const data = response.notification.request.content.data;
    if (data?.kind !== 'briefing') return;
    let day = data.date;
    if (day === undefined) {
      if (undated.current?.response !== response) {
        // Expo supplies delivery time in seconds on iOS and milliseconds on
        // Android. Older responses can have only the edition visible at the tap.
        const stamp = response.notification.date;
        const delivered = new Date(stamp < 1e12 ? stamp * 1000 : stamp);
        const deliveredDay =
          stamp > 0 && Number.isFinite(delivered.getTime())
            ? delivered.toISOString().slice(0, 10)
            : null;
        undated.current = { response, day: deliveredDay ?? generated?.slice(0, 10) ?? null };
      }
      day = undated.current.day;
    }
    let current = true;
    let timer: ReturnType<typeof setTimeout>;
    let delay = 5000;
    const resolve = async () => {
      try {
        const feed = await verify();
        if (!current || handled.current === response) return;
        if (generated && Date.parse(feed.generated) < Date.parse(generated)) {
          throw new Error('An older feed cannot resolve this notification');
        }
        const edition = feed.generated.slice(0, 10);
        const audio = feed.briefing;
        const matches = audio?.available && day === audio.date;
        if (
          matches ||
          typeof day !== 'string' ||
          day <= edition ||
          day.length !== 10 ||
          !isIsoDate(day)
        ) {
          handled.current = response;
          void analytics.track(ANALYTICS_EVENTS.NOTIFICATION_OPENED, { type: 'briefing' });
          deliver(matches ? audio : null);
          Notifications.clearLastNotificationResponse();
          return;
        }
      } catch {
        // Network failure leaves the addressed response pending.
      }
      if (current) {
        timer = setTimeout(resolve, delay);
        delay = Math.min(60000, delay * 2);
      }
    };
    void resolve();
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [response, verify, generated]);

  useEffect(() => {
    if (loading || !response || handled.current === response) return;
    const data = response.notification.request.content.data;
    if (data?.kind === 'briefing') return;
    const slug = typeof data?.slug === 'string' ? data.slug : null;
    if (slug) {
      handled.current = response;
      void analytics.track(ANALYTICS_EVENTS.NOTIFICATION_OPENED, { type: 'breaking' });
      onSelectArticle(slug, categoryOf(slug, grouped) ?? 'politics');
      Notifications.clearLastNotificationResponse();
    } else {
      handled.current = response;
      void analytics.track(ANALYTICS_EVENTS.NOTIFICATION_OPENED, { type: 'other' });
      // The response is not routable by this app; consume it so it cannot be
      // replayed on a later launch.
      Notifications.clearLastNotificationResponse();
    }
  }, [loading, grouped, onSelectArticle, response]);
}

/** The live feed's category for `slug`, else a saved story's, else null.
 *  Try the live feed first; if the article rotated out, fall back to the
 *  bookmark store (which carries its own category and lets `onSelectArticle`
 *  inject it). Without this fallback, taps on older breaking-news pushes
 *  silently did nothing once the article scrolled out of the feed window. */
export function categoryOf(slug: string, grouped: GroupedArticles): Category | null {
  for (const cat of CATEGORIES) {
    if (grouped[cat].some((a) => a.slug === slug)) return cat;
  }
  return getBookmarks().find((b) => b.article.slug === slug)?.category ?? null;
}
