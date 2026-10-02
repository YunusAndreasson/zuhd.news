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
