// Where this site is, and where it can be passed on to.
//
// These strings were spread across four templates, `get.html`, two islands and
// the build script, which is fine right up until one of them moves. The X
// account has already been renamed once (`@zuhd_news`), the Instagram handle is
// a placeholder that is expected to change, and the App Store id appears in
// three different link shapes. So: declared once, imported by the SSG through
// `loadShared()` and by the islands through `@shared/share`.
//
// The share targets in particular have to agree across two renderings of the
// same row — the article page emits them server-side as plain `<a href>`s that
// work with no JavaScript, and `_share.ts` re-renders them client-side once it
// knows what the device can do. Two definitions would be two different shares
// of the same story.

export const SITE_URL = 'https://zuhd.news'

/** The store listings, and the pieces other people's metadata asks for. */
export const APP_STORE_ID = '6760964753'
export const ANDROID_PACKAGE = 'news.zuhd.app'
export const APP_IOS = `https://apps.apple.com/us/app/zuhd-news/id${APP_STORE_ID}`
export const APP_ANDROID = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`
/** The app's custom scheme (`mobile/app.json` → `expo.scheme`). */
export const APP_SCHEME = 'zuhd-news'

/** The masthead's own accounts — not the maker's, which are separate. */
export const X_HANDLE = 'zuhd_news'
export const SOCIAL_X = `https://x.com/${X_HANDLE}`
export const SOCIAL_INSTAGRAM = 'https://www.instagram.com/zuhdnews/'

/**
 * Everywhere a search engine or a social platform can be told that these
 * accounts and listings are the same organisation as this domain. This is the
 * property `sameAs` wants in schema.org — it is what lets a knowledge panel
 * connect the site to the feeds, rather than treating them as four strangers
 * that happen to use the same word.
 */
export const ORG_SAME_AS = [SOCIAL_X, SOCIAL_INSTAGRAM, APP_IOS, APP_ANDROID]

export interface ShareTarget {
  /** Canonical URL. Absolute — a share is read somewhere else. */
  url: string
  title: string
}

/**
 * Where a shared story lands: the map, with that story's card open.
 *
 * A link used to point at `/a/{slug}`, and the note in `_share.ts` argued for it
 * — that page carries the generated OG card, and the map's own URL is `/` no
 * matter what is open, so the address bar is the one thing a reader must not
 * copy. Both halves of that are still true. What was wrong was the conclusion:
 * this site's front door is the map, and a link that opens the reader page shows
 * a stranger the one surface that is *not* the thing being built. So the share
 * URL is its own route, and the reader page stays canonical underneath it.
 *
 * `/s/{slug}` is served by `functions/s/[slug].js`, which hands back the map
 * shell carrying that story's OG meta lifted from `/a/{slug}` and a
 * `<link rel="canonical">` pointing at it. Three things therefore stay true:
 * what arrives in a timeline is still the headline over its own patch of globe,
 * a crawler is still sent to the article, and a reader with no JavaScript still
 * gets somewhere real.
 *
 * Deliberately *not* `/?story={slug}`. A query on `/` would put a Function in
 * front of the homepage for every visitor, and the homepage is the one path on
 * this site that must stay a static file served straight off the edge.
 */
export const shareUrl = (slug: string): string => `${SITE_URL}/s/${slug}`

/** The canonical article URL — crawlers, modified clicks, and the no-JS route. */
export const articleUrl = (slug: string): string => `${SITE_URL}/a/${slug}`

/**
 * The share targets, in the order a reader is most likely to want them.
 *
 * `via` puts the masthead's account in the post rather than leaving the story
 * unattributed, which is the one piece of promotion a share can carry without
 * costing the reader anything.
 */
export const shareLinks = (
  t: ShareTarget,
): Array<{ label: string; href: string; aria: string }> => [
  {
    label: 'x',
    // The visible label is one lowercase word, in the footnote register the
    // rest of the row uses. `aria` is the same link said properly — a screen
    // reader announcing "link, x" has told the listener nothing.
    aria: 'Share on X',
    href: `https://x.com/intent/post?text=${encodeURIComponent(t.title)}&url=${encodeURIComponent(t.url)}&via=${X_HANDLE}`,
  },
  {
    label: 'whatsapp',
    aria: 'Share on WhatsApp',
    href: `https://wa.me/?text=${encodeURIComponent(`${t.title} ${t.url}`)}`,
  },
  {
    label: 'email',
    aria: 'Share by email',
    href: `mailto:?subject=${encodeURIComponent(t.title)}&body=${encodeURIComponent(`${t.title}\n\n${t.url}`)}`,
  },
]
