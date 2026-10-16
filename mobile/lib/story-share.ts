import { shareUrl } from '@shared/share';
import type { PlatformOSType, ShareContent, ShareOptions } from 'react-native';

/**
 * What Share hands the system for a story. The link is the website's own
 * share link (`shareUrl`, `/s/{slug}`), so a story shared from the app
 * unfurls and lands as one shared from the site does: the headline over its
 * own patch of globe, and for a reader without the app, the map with that
 * story open. The app claims the link, so with the app it opens the story.
 *
 * iOS takes the URL and the title apart and puts the title in a mail's
 * subject; Android's share sheet takes one message.
 */
export function storyShare(
  story: { slug: string; title: string },
  os: PlatformOSType,
): { content: ShareContent; options: ShareOptions } {
  const url = shareUrl(story.slug);
  const { title } = story;
  return os === 'ios'
    ? { content: { url, title }, options: { subject: `${title} — zuhd.news` } }
    : { content: { message: `${title}\n${url}`, title }, options: { dialogTitle: 'Share' } };
}
