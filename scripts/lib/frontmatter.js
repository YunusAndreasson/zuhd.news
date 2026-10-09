// Named import, not default: js-yaml 5's ESM build dropped the default export.
import { load } from 'js-yaml'

/**
 * Split an article file into its frontmatter and its prose.
 *
 * `meta` is annotated rather than inferred because js-yaml 5 types `load` as
 * returning `object`, where 4 returned `any` — so every `meta.category` and
 * `meta.sources` downstream became a typecheck error the moment the dependency
 * moved. The shape genuinely is open (the pipeline adds fields to frontmatter
 * without touching this function), so the honest annotation is an index
 * signature rather than a struct that would go stale.
 *
 * @param {string} content
 * @returns {{ meta: Record<string, any>, body: string }}
 */
export function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return { meta: {}, body: content }
  // Strip trailing commas after quoted values — Claude occasionally generates them
  const cleaned = match[1].replace(/",\s*$/gm, '"')
  // js-yaml 5 throws on an empty document where 4 returned undefined, so the
  // `?? {}` that used to cover an article with an empty `---\n---` block no
  // longer runs. Answering it here rather than with a try/catch keeps a real
  // syntax error loud: this pipeline writes articles from a model, and a
  // frontmatter block that does not parse is exactly the failure the build
  // must not swallow. (The one file in 7,320 that js-yaml 5 rejected was a URL
  // wrapped across two lines, which 4 had been folding into a trailing space
  // inside the published href — a live defect, now fixed in the article.)
  if (!cleaned.trim()) return { meta: {}, body: match[2].trim() }
  return { meta: load(cleaned) ?? {}, body: match[2].trim() }
}

/**
 * Replace the top-level `key:` block of an article's frontmatter — the key's
 * line and every indented or blank line under it — with `block`, leaving every
 * other line exactly as written. Text surgery, not a YAML round-trip, so a
 * stage that owns one key cannot reformat, reorder or re-quote the keys the
 * writer owns.
 *
 * `before` places the block ahead of the first line it matches (keeping
 * related keys together); otherwise, or when nothing matches, it goes last.
 * An absent key is simply added. A file with no frontmatter is returned as is.
 *
 * Two stages carried this loop line for line (`entities:` in
 * `extract-entities.js`, `sources:` in `extract-source-angles.js`).
 *
 * @param {string} raw
 * @param {string} key
 * @param {string[]} block lines, the first being `key: …`
 * @param {{ before?: RegExp }} [opts]
 */
export function replaceFrontmatterKey(raw, key, block, { before } = {}) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n/)
  if (!m) return raw
  const head = new RegExp(`^${key}:`)
  const kept = []
  let skipping = false
  for (const line of m[1].split('\n')) {
    if (skipping) {
      if (line.length === 0 || /^\s/.test(line)) continue // still inside the block
      skipping = false
    }
    if (head.test(line)) {
      skipping = true
      continue
    }
    kept.push(line)
  }
  const at = before ? kept.findIndex((l) => before.test(l)) : -1
  const fm = at >= 0
    ? [...kept.slice(0, at), ...block, ...kept.slice(at)].join('\n')
    : `${kept.join('\n').trimEnd()}\n${block.join('\n')}`
  return `---\n${fm.trimEnd()}\n---\n${raw.slice(m[0].length)}`
}

/**
 * Remove the top-level `key:` of an article's frontmatter: the key's line and
 * every indented line under it. Every other byte stays as written. A file
 * with no frontmatter, or without the key, is returned as it is.
 *
 * By lines, because a pattern over the whole block has to say what comes
 * after the key, and a key written last has nothing after it: the validator's
 * removal of a refused `chart:` was such a pattern, and left a chart on the
 * last line in the file while logging it as dropped.
 *
 * @param {string} raw
 * @param {string} key
 */
export function removeFrontmatterKey(raw, key) {
  const m = raw.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return raw
  const head = new RegExp(`^${key}:`)
  const kept = []
  let skipping = false
  for (const line of m[1].split('\n')) {
    if (skipping) {
      if (/^\s/.test(line)) continue // still under the key
      skipping = false
    }
    if (head.test(line)) {
      skipping = true
      continue
    }
    kept.push(line)
  }
  return `---\n${kept.join('\n')}\n---${raw.slice(m[0].length)}`
}

/**
 * Set the one-line top-level `key:` of a frontmatter block (the text between
 * the `---` lines) to `value`, a scalar the caller has already serialised.
 * The line is replaced where it stands; an absent key goes after the `after`
 * key's line, or last.
 *
 * The replacements are functions because `String.replace` reads `$1`, `$&`
 * and `` $` `` in a replacement *string*, and `value` is a headline. "Nvidia
 * Authorizes Record $150 Billion Share Buyback" pasted the `title:` line into
 * the middle of `socialTitle`, the block stopped parsing, the build died on
 * it and the cycle published nothing: five times from 2026-08-14 to
 * 2026-09-28, each on a dollar figure starting with 1.
 *
 * @param {string} block
 * @param {string} key
 * @param {string} value
 * @param {{ after?: string }} [opts]
 */
export function setFrontmatterLine(block, key, value, { after } = {}) {
  const line = `${key}: ${value}`
  const own = new RegExp(`^${key}:.*$`, 'm')
  if (own.test(block)) return block.replace(own, () => line)
  const anchor = after ? new RegExp(`^${after}:.*$`, 'm') : null
  if (anchor?.test(block)) return block.replace(anchor, (hit) => `${hit}\n${line}`)
  return `${block}\n${line}`
}
