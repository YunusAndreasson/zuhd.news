// Escaping, for the two markup languages this build emits.
//
// There were five names for these two functions — `escHtmlAttr` in
// `article-chain.js`, `escHtml` in both page builders under `build/`, `escXml`
// in `og-image.js` and a fourth, subtly different copy of it inline in
// `build.js` for the Atom feed. Every one of them was the same four or five
// `.replace()` calls in a different order, which is the sort of duplication
// that survives indefinitely because no single copy is ever wrong.
//
// Two functions, because there really are two: HTML has four predefined
// entities that matter here, XML has five.

/**
 * HTML-escape, for both text and attribute positions.
 *
 * `?? ''` rather than `String(s)`: the `article-chain.js` copy printed the word
 * `undefined` into the page for a missing source name, which is a worse failure
 * than an empty string in every case a caller can reach.
 */
export const escHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/**
 * XML-escape — the Atom feed and the SVG the share cards are rasterised from.
 *
 * `'` is escaped too. It is one of XML 1.0's five predefined entities and HTML's
 * `&apos;` is not universally safe in older parsers, which is the whole reason
 * these are two functions rather than one with the superset applied everywhere.
 */
export const escXml = (s) => escHtml(s).replace(/'/g, '&apos;')
