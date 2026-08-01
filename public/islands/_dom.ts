// The one element constructor the framework-free islands build everything from.
//
// There were five copies — `_chart.ts`, `_disclosure.ts`, `_share.ts`,
// `_map/sheet.ts` and `_map/markets.ts` — because each of those modules was
// written to be independent of the Preact runtime and each needed the same four
// lines. Four of them were byte-identical; the fifth, in `markets.ts`, took
// `tag: string` and so returned a bare `HTMLElement`, which is the version of
// this helper that quietly gives up every property lookup a caller might have
// wanted checked.
//
// esbuild tree-shakes ES modules, so importing from here costs nothing a local
// copy did not: an island that uses `el` and not `svgEl` ships only `el`.

/**
 * `document.createElement`, with the class and the text it almost always gets
 * given straight away.
 *
 * `textContent`, never `innerHTML` — everything on these surfaces comes from a
 * JSON payload the build wrote, and the moment one of them is set as markup the
 * map's `default-src 'none'` claim is doing work it should never have to.
 * `text != null` rather than a truthiness check, so `el('span', 'count', '0')`
 * and `el('span', 'count', '')` both mean what they say.
 */
export const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text != null) node.textContent = text
  return node
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * The same for SVG, which needs the namespace and takes arbitrary attributes
 * rather than a class and a string — an SVG element's `className` is an
 * `SVGAnimatedString` and assigning to it does nothing.
 */
export const svgEl = <K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] => {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v))
  return node
}
