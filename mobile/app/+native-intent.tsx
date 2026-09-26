/**
 * Every link into the app lands on the one screen there is.
 *
 * There is a single route (`index`), so any path Expo Router was handed —
 * `zuhd-news://a/{slug}`, a stale path from an older build, a typo — used to
 * render its development "Unmatched Route" page, with a `Sitemap` link, to a
 * reader. A story path (`/a/{slug}`, `/s/{slug}`, the website's two) becomes
 * `/?story={slug}`, which the map screen opens; anything else is the map.
 */

const STORY_PATH = /^\/?(?:a|s)\/([a-z0-9][a-z0-9-]*)\/?$/i;

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    // `zuhd-news://a/x` arrives with `a` as the URL's host; strip the scheme
    // and the slashes so both that and a bare `/a/x` read as `a/x`.
    const bare = path.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[?#]/)[0] ?? '';
    const match = STORY_PATH.exec(bare.startsWith('/') ? bare : `/${bare}`);
    return match ? `/?story=${match[1]}` : '/';
  } catch {
    return '/';
  }
}
