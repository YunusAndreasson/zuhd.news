// The furniture every page wears: the wordmark, the archetype header, the
// footer's status line, and the footer's three navs.
//
// This was six copies. `templates/{index,article,country,static-page}.html` each
// carried the footer verbatim, `scripts/build.js` carried a fifth inside the
// category-page template literal, and `scripts/build/entity-pages.js` a sixth —
// and by the time they were counted, two of them had already drifted:
//
//   · the entity page's document links had no `data-island="doc-sheet"` and no
//     `/mcp` at all, so on `/e/{id}` — and only there — "about" navigated away
//     instead of opening over the page, and the MCP endpoint had no route from
//     the footer;
//   · it also carried a second row of maker links (`footer-other-apps`) that
//     five of the six did not, styled by nothing: the class has no rule in
//     `style.css`, so it rendered as a duplicate `.footer-maker-links`.
//
// That is exactly the failure `shared/share.ts` exists to prevent, one layer up:
// the store URLs were already declared once and the markup around them was not.
// So the markup is declared once too, and takes the URLs from that file rather
// than restating them — `siteFooter` is passed the loaded `share.ts` module
// because the SSG reaches it through `loadShared()` and cannot import TypeScript
// directly.
//
// `share-surface.test.js` walks this file for the same store and account links
// it walks the templates for; it is where most of them now live.

import { escHtml } from './html.js'

/** The masthead, as it is set everywhere it appears. */
export const WORDMARK =
  '<a href="/" class="wordmark">zuhd<span class="wordmark-dot">.</span><span class="wordmark-tld">news</span></a>'

/**
 * The header the four archetype pages share — article, country, category,
 * entity. The map and the document pages have their own (a map reset and a
 * `← map` link respectively), so they are deliberately not built from this.
 */
export const ARCHETYPE_HEADER = `<header class="article-page-header">
    ${WORDMARK}
    <a href="/" class="article-back-link" aria-label="All stories">All stories</a>
  </header>`

/**
 * The maker's own accounts. Distinct from the masthead's, which live in
 * `shared/share.ts` because the app and the islands need them too; these appear
 * only in HTML this repo generates, so they stop here.
 *
 * They are also the `sameAs` list on the Person node in the homepage's JSON-LD.
 * That copy is still written out by hand in `templates/index.html` — it is one
 * literal inside a much larger graph, and templating the graph is a separate
 * change from de-duplicating the footer.
 */
const MAKER_URL = 'https://andreassonphoto.com/about'
const MAKER_LINKS = [
  ['github', 'https://github.com/YunusAndreasson'],
  ['x', 'https://x.com/YunusAndreasson'],
  ['instagram', 'https://www.instagram.com/andreasson.photo/'],
  ['linkedin', 'https://www.linkedin.com/in/yunusandreasson/'],
]

/**
 * The document links.
 *
 * The `href` stays real: it is the canonical URL, it is what a crawler and a
 * JS-less browser follow, and `island-loader.js` lets Cmd-click, middle-click
 * and right-click through untouched. A plain left-click opens the prose over the
 * page instead — on the map because leaving it to read two paragraphs throws
 * away the view the reader built, and on every other page for the same reason in
 * miniature.
 */
const DOCS = [
  ['about', 'about'],
  ['contact', 'contact'],
  ['mcp', 'mcp'],
  ['privacy', 'privacy'],
]

/**
 * The footer's one line of "how current is this", in one shape everywhere it
 * appears: named sources (if any), then a labelled date (if any), joined by
 * the same middot the rest of the chrome uses. A page with neither prints
 * nothing — category, homepage and the static pages have no single fact to
 * state here, and a blank line is honester than a fabricated one.
 *
 * This used to be four independent vocabularies — an absolute `<time>` on the
 * article, a hardcoded provenance sentence with no date on the country page,
 * a prose-prefixed `As of {date}` on the entity page — so a reader who
 * learned what this line meant on one page type had to relearn it on the
 * next. The *content* still differs per page (a country has sources but no
 * single vintage date; an article has a date and no separate source list);
 * only the sentence shape is now shared.
 *
 * @param {{ sources?: string, dateLabel?: string, dateHtml?: string }} opts
 */
export const footerStatusLine = ({ sources, dateLabel = 'Updated', dateHtml } = {}) => {
  const parts = []
  if (sources) parts.push(`Sources: ${escHtml(sources)}`)
  if (dateHtml) parts.push(`${escHtml(dateLabel)} ${dateHtml}`)
  return parts.join(' · ')
}

/**
 * The footer's three navs: documents, the masthead's own channels, the maker.
 *
 * The `<footer>` element stays in each template; the status line above these
 * is `footerStatusLine()`, called per page with whatever it has to state.
 *
 * @param {{ SOCIAL_X: string, SOCIAL_INSTAGRAM: string, APP_IOS: string,
 *           APP_ANDROID: string }} share  the loaded `shared/share.ts`
 */
export const siteFooter = (share) => {
  const docs = DOCS.map(
    ([label, doc]) => `<a href="/${doc}" data-island="doc-sheet" data-doc="${doc}">${label}</a>`,
  ).join('\n      ')
  const social = [
    ['x', share.SOCIAL_X],
    ['instagram', share.SOCIAL_INSTAGRAM],
    ['iphone', share.APP_IOS],
    ['android', share.APP_ANDROID],
  ]
    .map(
      ([label, href], i) =>
        // `rel="me"` claims the masthead's own profiles; the store listings are
        // not identities, so they get `noopener` alone.
        `<a href="${href}" rel="${i < 2 ? 'me noopener' : 'noopener'}" target="_blank">${label}</a>`,
    )
    .join('\n      ')
  const maker = MAKER_LINKS.map(
    ([label, href]) =>
      `<a href="${href}" target="_blank" rel="me noopener noreferrer">${label}</a>`,
  ).join('\n        ')

  return `<nav class="footer-links">
      ${docs}
    </nav>
    <nav class="footer-social" aria-label="Follow and download">
      ${social}
    </nav>
    <nav class="footer-maker" aria-label="Maker">
      <a class="footer-byline" href="${MAKER_URL}" target="_blank" rel="me noopener noreferrer">made by yunus andreasson</a>
      <span class="footer-maker-links">
        ${maker}
      </span>
    </nav>`
}
