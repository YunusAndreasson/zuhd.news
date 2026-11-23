import { COUNTRY_DATA } from '@shared/countries/country-data';
import { codeFromTopojsonName } from '@shared/countries/iso';
import { displayCountryName } from '@shared/place-names';
import { SITE_URL, shareUrl } from '@shared/share';
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
  return pageShare(story.title, shareUrl(story.slug), os);
}

/** The website publishes a profile for each country with both data and a route. */
export function countryShare(name: string, os: PlatformOSType) {
  const code = codeFromTopojsonName(name);
  if (!code || !Object.hasOwn(COUNTRY_DATA, name)) return null;
  return pageShare(displayCountryName(name) ?? name, `${SITE_URL}/country/${code}`, os);
}

function pageShare(
  title: string,
  url: string,
  os: PlatformOSType,
): {
  content: ShareContent;
  options: ShareOptions;
} {
  return os === 'ios'
    ? { content: { url, title }, options: { subject: `${title} — zuhd.news` } }
    : { content: { message: `${title}\n${url}`, title }, options: { dialogTitle: 'Share' } };
}
