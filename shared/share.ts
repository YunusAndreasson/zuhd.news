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
