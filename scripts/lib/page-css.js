// The site's one stylesheet, cut down for the pages that are not the map.

/**
 * Classes the map's rules style that another page's island also puts on the
 * page: `entity-strip` borrows the map card's loading state.
 */
export const KEPT_MAP_CLASSES = ['map-popup-loading']

/** Index of the `}` closing the `{` at `open`, past strings. */
const closingBrace = (css, open) => {
  let depth = 0
  for (let i = open; i < css.length; i++) {
    const c = css[i]
    if (c === '"' || c === "'") {
      for (i++; css[i] !== c; i++) if (css[i] === '\\') i++
    } else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return i
  }
  return css.length - 1
}

/** A selector list, split at its top-level commas. */
const selectors = (list) => {
  const out = []
  let depth = 0
  let from = 0
  for (let i = 0; i < list.length; i++) {
    if (list[i] === '(') depth++
    else if (list[i] === ')') depth--
    else if (list[i] === ',' && depth === 0) {
      out.push(list.slice(from, i))
      from = i + 1
    }
  }
  return [...out, list.slice(from)]
}

/**
 * `css` without the rules no element can match unless it has a class `pattern`
 * names. A selector inside `:not()`, `:is()` or `:where()` is not a requirement,
 * so a rule mentioning one is kept. `@media` and `@supports` are walked into and
 * dropped when nothing is left.
 *
 * Takes esbuild's minified output: no comments, and every rule a block.
 *
 * @param {string} css
 * @param {RegExp} pattern
 * @param {string[]} kept classes that do appear elsewhere; a rule naming one stays
 * @returns {string}
 */
export function dropRulesNeedingClass(css, pattern, kept = []) {
  const needed = (selector) => {
    if (/:(not|is|where|has)\(/.test(selector)) return false
    if (kept.some((k) => selector.includes(`.${k}`))) return false
    return pattern.test(selector)
  }
  let out = ''
  let i = 0
  while (i < css.length) {
    const open = css.indexOf('{', i)
    const semi = css.indexOf(';', i)
    // `@charset`, `@layer a,b;` and the like carry no block.
    if (semi !== -1 && (open === -1 || semi < open)) {
      out += css.slice(i, semi + 1)
      i = semi + 1
      continue
    }
    if (open === -1) {
      out += css.slice(i)
      break
    }
    const prelude = css.slice(i, open)
    const close = closingBrace(css, open)
    const block = css.slice(open + 1, close)
    if (/^@(media|supports|layer|container)\b/.test(prelude)) {
      const inner = dropRulesNeedingClass(block, pattern, kept)
      if (inner) out += `${prelude}{${inner}}`
    } else if (prelude.startsWith('@') || !selectors(prelude).every(needed)) {
      out += css.slice(i, close + 1)
    }
    i = close + 1
  }
  return out
}
