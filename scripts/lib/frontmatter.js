// Named import, not default: js-yaml 5's ESM build dropped the default export.
import { AsyncLocalStorage } from 'node:async_hooks'
import { isDeepStrictEqual } from 'node:util'
import { load } from 'js-yaml'

// Last resort when even a withdrawal cannot be represented by a lossless
// field edit (for example, a shared YAML anchor). Preserve all editorial bytes.
const withdrawnHeader = '---\n# zuhd: starter review withdrawn\n'

// The publisher scopes its revision collector to this build. Other article
// readers, including a concurrent validation, never join that collection.
/** @type {AsyncLocalStorage<(article: { meta: Record<string, any>, body: string }) => void>} */
export const parsedArticles = new AsyncLocalStorage()

/**
 * The frontmatter block and the prose under it, as text: the split every
 * reader of an article has to agree on. The block ends at the first line that
 * is `---` and nothing else. A `---` inside a value is not that line.
 *
 * Three stages each cut the file their own way (`raw.replace(/^---[\s\S]*?---/`
 * twice, `split('---')` once) and stopped at the first `---` anywhere. A source
 * URL holding one (`…flydubai-FZ1073---HT-Immersive…`) left the rest of the
 * frontmatter counted as prose, and two sound five-block articles were
 * quarantined as "6 blocks" (2026-09-27, 2026-10-01).
 *
 * @param {string} content
 * @returns {{ yaml: string, body: string } | null} null when the file has no frontmatter; `body` is trimmed
 */
export function splitFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  return match ? { yaml: match[1], body: match[2].trim() } : null
}

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
  const split = splitFrontmatter(content)
  if (!split) return { meta: {}, body: content }
  // Strip trailing commas after quoted values — Claude occasionally generates them
  const cleaned = split.yaml.replace(/",\s*$/gm, '"')
  // js-yaml 5 throws on an empty document where 4 returned undefined, so the
  // `?? {}` that used to cover an article with an empty `---\n---` block no
  // longer runs. Answering it here rather than with a try/catch keeps a real
  // syntax error loud: this pipeline writes articles from a model, and a
  // frontmatter block that does not parse is exactly the failure the build
  // must not swallow. (The one file in 7,320 that js-yaml 5 rejected was a URL
  // wrapped across two lines, which 4 had been folding into a trailing space
  // inside the published href — a live defect, now fixed in the article.)
  if (!cleaned.trim()) return { meta: {}, body: split.body }
  const article = { meta: load(cleaned) ?? {}, body: split.body }
  if (content.startsWith(withdrawnHeader) && article.meta && typeof article.meta === 'object') {
    Object.assign(article.meta, { starterEligible: false })
    Reflect.deleteProperty(article.meta, 'starterReview')
  }
  parsedArticles.getStore()?.(article)
  return article
}

/**
 * A string as a YAML scalar: in double quotes, with whatever YAML would
 * misread inside them escaped. JSON's string is YAML's double-quoted one, so
 * this is `JSON.stringify` under the name of what it is used for.
 *
 * The stages that write a frontmatter block quoted in two ways. Three places
 * called `JSON.stringify`. Two wrapped the value in quotes and escaped only
 * the quotes inside it (`"${x.replace(/"/g, '\\"')}"`), which is the same
 * bytes for any value without a backslash or a line break in it, and a block
 * that does not parse for one with. One of those values is the `mention` a
 * model returns for a company, and the stage that writes it runs before the
 * validator: the article would be quarantined for it.
 *
 * @param {string} value
 */
export const yamlString = (value) => JSON.stringify(String(value))

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

// The onboarding fields may be quoted, escaped or indented. Check their edit
// against the parsed mapping so another field cannot be changed or an old
// approval hidden by an unfamiliar YAML spelling.
/**
 * @param {string} raw
 * @param {'starterReview'|'starterEligible'} key
 * @param {unknown} [value] omit to withdraw a review
 */
export function setStarterField(raw, key, value) {
  if (key === 'starterReview' && value && raw.startsWith(withdrawnHeader)) raw = `---\n${raw.slice(withdrawnHeader.length)}`
  return raw.replace(/^---\n([\s\S]*?)\n---(?=\n|$)/, (frontmatter, /** @type {string} */ yaml) => {
    const mapping = (/** @type {string} */ text) => {
      const parsed = text.trim() ? load(text.replace(/",\s*$/gm, '"')) : {}
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Expected frontmatter mapping')
      return /** @type {Record<string, unknown>} */ (parsed)
    }
    const original = mapping(yaml)
    if (value === undefined ? !Object.hasOwn(original, key) : isDeepStrictEqual(original[key], value)) return frontmatter
    const lines = yaml.split('\n')
    const indent = lines.find(line => line.trim() && !line.trimStart().startsWith('#'))?.match(/^ */)?.[0] ?? ''
    const start = lines.findIndex(line => {
      if (!line.startsWith(indent)) return false
      const match = line.slice(indent.length).match(/^(?:\?\s+)?("(?:\\.|[^"\\])*"|'(?:''|[^'])*'|[\w.-]+)[ \t]*(?::(?:\s|$)|$)/)
      return match && (/^["']/.test(match[1]) ? load(match[1]) : match[1]) === key
    })
    if (start >= 0) {
      let end = start + 1
      if (lines[start].slice(indent.length).startsWith('? ') && lines[end]?.startsWith(`${indent}:`)) end++
      while (end < lines.length && (lines[end].trim() === '' || lines[end].startsWith(`${indent} `) ||
        /^-(?:\s|$)/.test(lines[end].slice(indent.length)))) end++
      lines.splice(start, end - start)
    }
    /** @type {Record<string, unknown>} */
    const expected = { ...original }
    if (value === undefined) delete expected[key]
    else {
      const documentEnd = lines.findIndex(line => /^\.\.\.(?:\s|$)/.test(line))
      lines.splice(documentEnd < 0 ? lines.length : documentEnd, 0, `${indent}${key}: ${JSON.stringify(value)}`)
      expected[key] = value
    }
    const result = lines.join('\n')
    if (!isDeepStrictEqual({ ...mapping(result) }, expected)) throw new Error(`Cannot apply the edit to frontmatter key ${key} safely`)
    return `---\n${result}\n---`
  })
}

/** @param {string} raw @param {string} name @param {unknown} error */
export function withdrawStarter(raw, name, error) {
  console.warn(`Starter ineligible (${name}):`, error instanceof Error ? error.message : error)
  try {
    return setStarterField(setStarterField(raw, 'starterReview'), 'starterEligible', false)
  } catch (editError) {
    console.warn(`Starter withdrawal (${name}):`, editError instanceof Error ? editError.message : editError)
    return raw.startsWith(withdrawnHeader) ? raw : raw.replace(/^---\n/, withdrawnHeader)
  }
}
